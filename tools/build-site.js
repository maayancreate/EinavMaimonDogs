/* ---------------------------------------------------------------------------
 * Turns the design prototype into the real site.
 *
 *   node tools/build-site.js        →  site/index.html + site/styles.css
 *
 * The prototype is a Claude Design export: its markup is wrapped in <x-dc>, its
 * styles live in a <helmet>, its pseudo-states are style-hover / style-focus
 * attributes, and its handlers are {{ }} bindings resolved by support.js. None
 * of that survives here — support.js is vendor code that must not be ported, so
 * this converts each construct to its plain-HTML equivalent:
 *
 *   <helmet><style>      → styles.css
 *   style-hover="…"      → a generated class with a real :hover rule
 *   style-focus="…"      → a real :focus rule
 *   <sc-if value="{{ splash }}">  → <div id="splash" hidden>, shown by app.js
 *   onClick="{{ fn }}"   → a real id that app.js binds a listener to
 *   data-t / data-en     → data-k, the key its text comes from in site.json
 *
 * The Hebrew stays in the markup as written. It is the fallback: if site.json
 * fails to load, or a key is missing from it, the page still renders the copy
 * it was built with rather than going blank.
 *
 * Re-runnable and idempotent — it always rebuilds from the prototype.
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const MAP = require('./keymap');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'project', 'קונספט דף נחיתה - עינב מימון.dc.html');
const OUTDIR = path.join(ROOT, 'site');

const STYLE_FROM = 16, STYLE_TO = 433;     // inside <helmet><style>
const BODY_FROM = 437, BODY_TO = 873;      // inside <x-dc>, the .pagewrap div

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const problems = [];
const fail = m => problems.push(m);

/* --- stamping keys onto the markup --------------------------------------- *
 *  All of this runs while the line numbers still match the prototype, before
 *  anything is sliced or rewritten.
 * ----------------------------------------------------------------------- */

/* Replace the nth data-t/data-en pair on a line with a single data-k. */
function stampPair(line, attr, value, spec) {
  const i = line - 1;
  const nth = spec.nth || 0;
  let seen = 0, done = false;
  lines[i] = lines[i].replace(/data-t="([^"]*)"\s+data-en="([^"]*)"/g, (m, he) => {
    if (seen++ !== nth) return m;
    done = true;
    if (spec.expect && !decode(he).startsWith(spec.expect)) {
      fail(`line ${line}: expected HE "${spec.expect}", got "${decode(he).slice(0, 40)}"`);
    }
    return `${attr}="${value}"`;
  });
  if (!done) fail(`line ${line}: no data-t/data-en pair #${nth} to stamp ${value}`);
}

/* Add an attribute to the element that owns the nth bare text node on a line. */
function stampPlain(line, attr, value, spec) {
  const i = line - 1;
  const nth = spec.nth || 0;
  const l = lines[i];
  const hits = [...l.matchAll(/>([^<>]+)</g)].filter(m => m[1].trim());
  const m = hits[nth];
  if (!m) { fail(`line ${line}: no text node #${nth} to stamp ${value}`); return; }
  if (spec.expect && !decode(m[1].trim()).startsWith(spec.expect)) {
    fail(`line ${line}: expected text "${spec.expect}", got "${decode(m[1].trim()).slice(0, 40)}"`);
  }
  // walk back to the '<' that opens this text node's element
  const open = l.lastIndexOf('<', m.index);
  if (open < 0) { fail(`line ${line}: no opening tag before text #${nth}`); return; }
  const tagEnd = open + l.slice(open).search(/[\s>]/);
  lines[i] = l.slice(0, tagEnd) + ` ${attr}="${value}"` + l.slice(tagEnd);
}

/* Add an attribute to the tag matching `re` on a line. */
function stampTag(line, re, attr, value, what) {
  const i = line - 1;
  const m = lines[i].match(re);
  if (!m) { fail(`line ${line}: no ${what} to stamp ${value}`); return; }
  const at = m.index + m[0].length;
  lines[i] = lines[i].slice(0, at) + ` ${attr}="${value}"` + lines[i].slice(at);
}

const decode = s => s.replace(/&#10;/g, '\n').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

function stamp(spec, attr, value) {
  if (spec.kind === 'img')   return stampTag(spec.line, /<img\b/, attr, value, '<img>');
  if (spec.kind === 'href')  return stampTag(spec.line, /<a\b/, attr, value, '<a>');
  if (spec.kind === 'plain') return stampPlain(spec.line, attr, value, spec);
  return stampPair(spec.line, attr, value, spec);
}

/* fixed copy, and the second nodes that show the same string */
for (const [key, spec] of Object.entries(MAP.text)) stamp(spec, 'data-k', key);
for (const a of MAP.aliases) stampPair(a.line, 'data-k', a.key, a);

/* repeating blocks: the container gets data-list, every field gets data-f.
   Fields are stamped on EVERY existing item, not just the first, so that with
   JavaScript disabled the page still shows the copy it was built with. */
for (const [name, list] of Object.entries(MAP.lists)) {
  stampTag(list.container.line, /<(?:div|select)\b/, 'data-list', name, 'container');
  if (list.alt) stampTag(list.alt.line, /<div\b/, 'data-list', name + ':alt', 'alt container');
  list.items.forEach(item => {
    for (const [field, spec] of Object.entries(item)) stamp(spec, 'data-f', field);
  });
  /* the marquee's duplicated run carries the same field marker */
  (list.altItems || []).forEach(line => stampPair(line, 'data-f', 'text', {}));
}

/* Numbers the design draws but nobody should have to type. The list renderer
   recomputes these per item, so adding a fifth service or a fourth step
   numbers itself instead of repeating whichever card it was cloned from.
   dogCount is the big "3" on the hero stat card — it follows the dogs list, so
   adding a dog updates the headline figure with it. */
const AUTO = [
  { line: 538, re: /<div\b/,  name: 'dogCount' },
  { line: 604, re: /<div\b/,  name: 'index' },    // service card badges 1..4
  { line: 609, re: /<div\b/,  name: 'index' },
  { line: 614, re: /<div\b/,  name: 'index' },
  { line: 619, re: /<div\b/,  name: 'index' },
  { line: 685, re: /<span\b/, name: 'index2' },   // session steps 01..03
  { line: 690, re: /<span\b/, name: 'index2' },
  { line: 695, re: /<span\b/, name: 'index2' },
];
for (const a of AUTO) stampTag(a.line, a.re, 'data-auto', a.name, 'auto-number');

/* Rails that should NOT become a horizontal swipe on mobile. Everything with
   class="rail" turns into a snap-scrolling row under 820px with a dot row
   underneath; these two stack instead, so every card is visible by scrolling
   the page normally rather than hidden behind a sideways gesture. */
const NO_SCROLL = [
  { line: 602, what: 'services' },
  { line: 757, what: 'testimonials' },
];
for (const n of NO_SCROLL) stampTag(n.line, /<div\b/, 'data-stack', '1', n.what + ' rail');

/* images and the phone */
for (const [key, spec] of Object.entries(MAP.media)) stamp(spec, 'data-m', key);
stamp(MAP.contact.phone, 'data-c', 'phone');
stampTag(MAP.contact.phoneTel.line, /<a\b/, 'data-c-tel', 'phoneTel', '<a>');

/* --- slice, then rewrite the runtime constructs --------------------------- */

let css = lines.slice(STYLE_FROM - 1, STYLE_TO).join('\n');
let body = lines.slice(BODY_FROM - 1, BODY_TO).join('\n');

/* The splash curtain. sc-if is the prototype's conditional; here the markup is
   always present and app.js decides whether to show it — which it must, because
   the footer's replay button needs to bring it back on demand. */
body = body
  .replace(/<sc-if value="\{\{ splash \}\}"[^>]*>/, '<div id="splash" hidden>')
  .replace(/<\/sc-if>/, '</div>');
if (body.includes('<sc-if')) fail('an <sc-if> survived the rewrite');

/* The prototype sits next to uploads/; the built page sits one level down in
   site/. Rewriting the paths here rather than leaving it to app.js means the
   images are already correct in the static HTML — no 404 flash before the
   script runs, and they still load if the script never does. app.js resolves
   content paths to the same place. */
body = body.replace(/(\ssrc=")uploads\//g, '$1../uploads/');

/* Handlers: a binding becomes an id, and app.js attaches the listener. */
const BINDINGS = [
  [/onClick="\{\{ toggleLang \}\}"/,   'id="langBtn" type="button"'],
  [/onClick="\{\{ toggleMenu \}\}"/,   'id="menuBtn" type="button"'],
  [/onClick="\{\{ submit \}\}"/,       'id="submitBtn" type="button"'],
  [/onClick="\{\{ replaySplash \}\}"/, 'id="replayBtn" type="button"'],
  [/\{\{ langLabel \}\}/,              ''],
  [/\{\{ submitLabel \}\}/,            ''],
];
for (const [re, to] of BINDINGS) {
  if (!re.test(body)) fail('binding not found: ' + re);
  body = body.replace(re, to);
}
if (/\{\{/.test(body)) fail('an unresolved {{ binding }} survived: ' +
  (body.match(/\{\{[^}]*\}\}/) || [])[0]);

/* Pseudo-states. Everything in the prototype is an inline style, so hover and
   focus had to be attributes; here they become real rules. Identical
   declarations share one class so the sheet does not repeat itself. */
const rules = new Map();
function pseudo(attr, pseudoName) {
  const re = new RegExp('\\s' + attr + '="([^"]*)"', 'g');
  body = body.replace(re, (m, decls) => {
    const d = decls.trim().replace(/;?$/, ';');
    const sig = pseudoName + '|' + d;
    if (!rules.has(sig)) rules.set(sig, `${pseudoName.slice(1)}-${rules.size + 1}`);
    return ` data-x="${rules.get(sig)}"`;
  });
}
pseudo('style-hover', ':hover');
pseudo('style-focus', ':focus');

/* Several elements can take both a hover and a focus class; merge the two
   data-x attributes that leaves behind into one space-separated list. */
body = body.replace(/ data-x="([^"]*)" data-x="([^"]*)"/g, ' data-x="$1 $2"');

let generated = '\n/* ---- generated from style-hover / style-focus ---- */\n';
for (const [sig, cls] of rules) {
  const [p, d] = [sig.slice(0, sig.indexOf('|')), sig.slice(sig.indexOf('|') + 1)];
  generated += `[data-x~="${cls}"]${p} { ${d} }\n`;
}
/* The reveal animation sets opacity inline; hover transforms must not fight it
   before the element has been revealed. */
generated += `[data-x]:hover { transition: transform .25s ease, box-shadow .25s ease, background .15s ease, color .15s ease, border-color .15s ease; }\n`;

/* Rails opted out of the mobile swipe. The base rule uses !important to force
   the flex row, so undoing it needs the same. */
generated += `
/* ---- rails that stack instead of scrolling sideways ---- */
@media (max-width:820px){
  .rail[data-stack]{ display:grid !important; grid-template-columns:1fr !important;
    overflow-x:visible !important; scroll-snap-type:none !important;
    margin-inline:0 !important; padding-block:0 !important; }
  .rail[data-stack] > *{ flex:none !important; width:auto !important;
    scroll-snap-align:none !important; }
  .rail[data-stack] + .raildots{ display:none !important; }
}
`;

if (problems.length) {
  console.error('Build failed — the prototype does not match tools/keymap.js:\n');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

/* --- emit ---------------------------------------------------------------- */

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>עינב מימון — כלבנות טיפולית ואילוף</title>
<meta name="description" content="מפגשים קבוצתיים ואישיים לילדים, למשפחות ולמבוגרים — ואילוף כלבים לבית.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&family=Alef:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<!-- Built by tools/build-site.js from project/קונספט דף נחיתה - עינב מימון.dc.html.
     Do not edit by hand: re-run the build instead. Copy comes from
     content/site.json; the Hebrew inline below is the fallback if that file
     cannot be read. -->
${body}
<script src="app.js"></script>
</body>
</html>
`;

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(OUTDIR, 'styles.css'), css + '\n' + generated, 'utf8');

console.log('wrote site/index.html  (' + (html.length / 1024).toFixed(1) + ' kB)');
console.log('wrote site/styles.css  (' + ((css.length + generated.length) / 1024).toFixed(1) + ' kB)');
console.log('  ' + rules.size + ' pseudo-state classes generated');
console.log('  ' + (body.match(/data-k="/g) || []).length + ' keyed nodes, ' +
            (body.match(/data-f="/g) || []).length + ' list fields, ' +
            (body.match(/data-list="/g) || []).length + ' list containers');
