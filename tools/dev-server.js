/* ---------------------------------------------------------------------------
 * Local dev server. Serves the repo and accepts the editor's publish request,
 * writing straight to disk instead of committing to GitHub.
 *
 *   node tools/dev-server.js [port]
 *
 * This exists so the editor can be driven end to end — edit, preview, publish,
 * reload — without deploying the Worker or handing anyone a GitHub token. It
 * binds to 127.0.0.1 only and is not a production server.
 * ------------------------------------------------------------------------- */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8139);
/* Matches the Worker's default so the same password works in both places. */
const PASSWORD = process.env.EINAV_PUBLISH_PW || 'dev';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const send = (res, code, body, type) =>
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' }).end(body);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);

  /* ---- publish ---- */
  if (req.method === 'POST' && pathname.endsWith('/publish')) {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 32e6) req.destroy(); });
    await new Promise(r => req.on('end', r));

    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, 'bad json'); }
    if (body.password !== PASSWORD) return send(res, 401, 'bad password');
    if (!body.content || typeof body.content !== 'object') return send(res, 400, 'no content');

    try {
      for (const up of body.uploads || []) {
        /* Uploads are written inside uploads/ and nowhere else — a path that
           climbs out of it is rejected rather than sanitised, because there is
           no legitimate reason for the editor to send one. */
        const rel = String(up.path || '');
        if (!/^uploads\/[\w.-]+$/.test(rel)) return send(res, 400, 'bad upload path: ' + rel);
        fs.mkdirSync(path.join(ROOT, 'uploads'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, rel), Buffer.from(up.base64, 'base64'));
        console.log('  wrote ' + rel + ' (' + Math.round(up.base64.length * 0.75 / 1024) + ' kB)');
      }
      const out = path.join(ROOT, 'content', 'site.json');
      fs.writeFileSync(out, JSON.stringify(body.content, null, 2) + '\n', 'utf8');
      console.log('published content/site.json at ' + new Date().toISOString());
      return send(res, 200, JSON.stringify({ ok: true, local: true }), TYPES['.json']);
    } catch (e) {
      console.error(e);
      return send(res, 500, 'write failed: ' + e.message);
    }
  }

  /* ---- static ---- */
  let rel = pathname === '/' ? '/site/index.html' : pathname;
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');

  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, '404 ' + rel);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('serving ' + ROOT);
  console.log('  site   http://127.0.0.1:' + PORT + '/site/index.html');
  console.log('  editor http://127.0.0.1:' + PORT + '/site/edit.html');
  console.log('  publish password: ' + PASSWORD + '   (set EINAV_PUBLISH_PW to change)');
});
