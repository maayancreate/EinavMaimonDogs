/* ---------------------------------------------------------------------------
 * Seeds content/site.json from the design prototype, through tools/keymap.js.
 *
 *   node tools/extract-content.js
 *
 * Run ONCE. After that the JSON is the source of truth and is edited through
 * edit.html — re-running would overwrite Einav's copy, so it refuses to
 * overwrite an existing file unless --force is passed.
 *
 * Every read is checked against the `expect` in the keymap. A silent mismatch
 * would file the wrong Hebrew under the wrong key and nothing would look wrong
 * until the page rendered nonsense, so a mismatch stops the run.
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const MAP = require('./keymap');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'project', 'קונספט דף נחיתה - עינב מימון.dc.html');
const OUT = path.join(ROOT, 'content', 'site.json');

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const problems = [];

const decode = s => s
  .replace(/&#10;/g, '\n').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/* Read one entry described by the keymap. Returns {he,en} for copy, or a bare
   string for images and link targets. */
function read(spec, where) {
  const l = lines[spec.line - 1] || '';
  const nth = spec.nth || 0;
  const fail = m => { problems.push(`${where} (line ${spec.line}): ${m}`); };

  if (spec.kind === 'img') {
    const m = l.match(/src="(uploads\/[^"]+)"/);
    if (!m) { fail('no uploads/ image'); return ''; }
    return m[1];
  }

  if (spec.kind === 'href') {
    const m = l.match(/href="([^"]*)"/);
    if (!m) { fail('no href'); return ''; }
    /* "#" is the prototype's placeholder for a certificate scan that does not
       exist yet. Stored as empty so the page can omit the link rather than
       render one that goes nowhere. */
    const href = m[1] === '#' ? '' : m[1].replace(/^tel:/, '');
    return href;
  }

  if (spec.kind === 'plain') {
    const found = [...l.matchAll(/>([^<>]+)</g)].map(m => decode(m[1].trim())).filter(Boolean);
    const he = found[nth];
    if (he === undefined) { fail(`no text node #${nth}`); return { he: '', en: spec.en || '' }; }
    if (spec.expect && !he.startsWith(spec.expect)) {
      fail(`expected text to start "${spec.expect}", got "${he.slice(0, 40)}"`);
    }
    return { he, en: spec.en || '' };
  }

  const found = [...l.matchAll(/data-t="([^"]*)"\s+data-en="([^"]*)"/g)];
  const m = found[nth];
  if (!m) { fail(`no data-t/data-en pair #${nth}`); return { he: '', en: '' }; }
  const he = decode(m[1]), en = decode(m[2]);
  if (spec.expect && !he.startsWith(spec.expect)) {
    fail(`expected HE to start "${spec.expect}", got "${he.slice(0, 40)}"`);
  }
  return { he, en };
}

/* --- assemble ------------------------------------------------------------ */

const content = {
  /* Site-wide switches Einav controls from the editor. langToggle decides
     whether the published page offers English at all: with it off the toggle
     is not rendered and the page is Hebrew only. */
  settings: { langToggle: true, defaultLang: 'he' },
  text: {},
  lists: {},
  media: {},
  contact: {},
};

for (const [key, spec] of Object.entries(MAP.text)) {
  content.text[key] = read(spec, key);
}

for (const [name, list] of Object.entries(MAP.lists)) {
  content.lists[name] = list.items.map((item, i) => {
    const out = {};
    for (const [field, spec] of Object.entries(item)) {
      out[field] = read(spec, `${name}[${i}].${field}`);
    }
    /* A cert with no scan yet still needs the key, so the editor shows an
       empty field to fill rather than hiding the row. */
    if (name === 'certs' && out.href === undefined) out.href = '';
    return out;
  });
}

/* A single-field list is stored as a flat array of {he,en} rather than as
   objects with one key, because that is what it reads like in the editor. */
for (const name of ['marquee', 'topics']) {
  content.lists[name] = content.lists[name].map(o => o.text);
}

for (const [key, spec] of Object.entries(MAP.media)) {
  content.media[key] = read(spec, key);
}

const phone = read(MAP.contact.phone, 'contact.phone');
content.contact.phone = phone.he;
content.contact.phoneTel = read(MAP.contact.phoneTel, 'contact.phoneTel');

/* --- write --------------------------------------------------------------- */

if (problems.length) {
  console.error('Refusing to write — the prototype does not match tools/keymap.js:\n');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(path.relative(ROOT, OUT) + ' already exists and is the source of truth now.');
  console.error('Re-extracting would overwrite real copy. Pass --force only if you mean to.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(content, null, 2) + '\n', 'utf8');

const items = Object.values(content.lists).reduce((n, v) => n + v.length, 0);
console.log('wrote ' + path.relative(ROOT, OUT));
console.log(`  ${Object.keys(content.text).length} fixed strings, ` +
            `${items} list items across ${Object.keys(content.lists).length} lists, ` +
            `${Object.keys(content.media).length} images`);
