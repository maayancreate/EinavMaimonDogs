/* ---------------------------------------------------------------------------
 *  Publish proxy — Cloudflare Worker.
 *
 *  WHY THIS EXISTS. GitHub Pages is static hosting: it serves bytes and accepts
 *  no writes. For the editor to publish, something has to commit to the repo.
 *  Doing that from the browser would mean a GitHub token sitting in Einav's
 *  localStorage — readable by anything running on that machine, impossible for
 *  her to rotate, and expiring on a schedule that becomes someone else's
 *  problem. So the token lives HERE instead, as a Worker secret. She needs a
 *  password and nothing else: no GitHub account, no token, nothing to leak.
 *
 *  It commits content/site.json and any uploaded photos through the GitHub
 *  Contents API. Every publish is an ordinary commit, so the whole history is
 *  diffable and revertible. Pages then rebuilds, which takes about a minute.
 *
 *  DEPLOY
 *    npm i -g wrangler && wrangler login
 *    cd worker && wrangler deploy
 *    wrangler secret put GITHUB_TOKEN     # fine-grained PAT, see below
 *    wrangler secret put PUBLISH_PASSWORD # what you give Einav
 *    wrangler secret put ALLOWED_ORIGIN   # https://maayancreate.github.io
 *
 *  THE TOKEN must be a fine-grained personal access token scoped to this ONE
 *  repository with "Contents: Read and write" and nothing else. It cannot touch
 *  any other repo, cannot act on the account, and revoking it disables
 *  publishing without affecting anything else.
 *
 *  Then point the editor at it by adding this to site/edit.html, above the
 *  editor.js tag:
 *      <script>window.PUBLISH_ENDPOINT = 'https://einav-publish.<you>.workers.dev';</script>
 * ------------------------------------------------------------------------- */

const REPO = 'maayancreate/EinavMaimonDogs';
const BRANCH = 'main';
const CONTENT_PATH = 'content/site.json';
const API = 'https://api.github.com';

/* Uploads may only land in uploads/, under a plain filename. Anything else is
   rejected outright rather than sanitised — the editor has no legitimate reason
   to send a path that climbs out, so one means something is wrong. */
const SAFE_UPLOAD = /^uploads\/[\w.-]+\.(png|jpe?g|webp)$/i;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 30 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (code, body) => new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status: code, headers: { ...cors, 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' } }
    );

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, 'POST only');

    if (!env.GITHUB_TOKEN || !env.PUBLISH_PASSWORD) {
      return reply(500, 'worker is not configured: set GITHUB_TOKEN and PUBLISH_PASSWORD');
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, 'too large');

    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, 'bad json'); }

    /* Constant-time-ish compare so the password cannot be probed a character at
       a time by timing the response. */
    if (!safeEqual(String(body.password || ''), env.PUBLISH_PASSWORD)) {
      return reply(401, 'bad password');
    }
    if (!body.content || typeof body.content !== 'object') return reply(400, 'no content');

    const gh = (path, init = {}) => fetch(API + path, {
      ...init,
      headers: {
        'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'einav-publish-worker',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    /* Commit a single file. GitHub needs the blob sha of what is being replaced,
       so an existing file is looked up first; a new one simply has no sha. */
    async function put(path, base64, message) {
      let sha;
      const head = await gh(`/repos/${REPO}/contents/${encodeURI(path)}?ref=${BRANCH}`);
      if (head.ok) sha = (await head.json()).sha;
      else if (head.status !== 404) return { ok: false, status: head.status, text: await head.text() };

      const res = await gh(`/repos/${REPO}/contents/${encodeURI(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: base64, branch: BRANCH, ...(sha ? { sha } : {}) }),
      });
      return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text() };
    }

    try {
      /* Photos first. If one fails the content file is never written, so the
         site can't end up pointing at an image that was not committed. */
      const uploads = Array.isArray(body.uploads) ? body.uploads : [];
      for (const up of uploads) {
        const p = String(up.path || '');
        if (!SAFE_UPLOAD.test(p)) return reply(400, 'bad upload path: ' + p);
        const b64 = String(up.base64 || '');
        if (!b64 || b64.length * 0.75 > MAX_UPLOAD_BYTES) return reply(400, 'upload too large: ' + p);
        const r = await put(p, b64, 'Add photo ' + p.replace('uploads/', '') + ' from the editor');
        if (!r.ok) return reply(502, `github rejected ${p} (${r.status}): ${r.text.slice(0, 300)}`);
      }

      const json = JSON.stringify(body.content, null, 2) + '\n';
      const r = await put(CONTENT_PATH, b64encode(json), 'Update site content from the editor');
      if (!r.ok) return reply(502, `github rejected the content (${r.status}): ${r.text.slice(0, 300)}`);

      return reply(200, { ok: true, uploaded: uploads.length });
    } catch (e) {
      return reply(500, 'publish failed: ' + (e && e.message));
    }
  },
};

/* btoa is byte-oriented; the content is Hebrew, so it has to be encoded to
   UTF-8 bytes first or every non-ASCII character is mangled. */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
