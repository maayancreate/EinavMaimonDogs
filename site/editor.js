/* ---------------------------------------------------------------------------
 *  The editor. Reads content/site.json, lets Einav change it, publishes it.
 *
 *  Design notes worth keeping in mind before changing anything here:
 *
 *  - HE and EN are independent. Editing one never requires touching the other.
 *    Missing English is FLAGGED, never blocked: the site falls back to Hebrew,
 *    so shipping a half-translated page is a valid state, not an error.
 *  - Every field is plain text. There is no HTML input anywhere, so no edit can
 *    break the layout or inject markup.
 *  - Nothing is destructive until Publish. Edits live in localStorage as a
 *    draft; a closed tab does not lose an afternoon's work.
 *  - Publishing is a git commit, so every change is versioned and revertible.
 *
 *  The publish endpoint holds the GitHub token server-side — see worker/. Einav
 *  needs a password and nothing else: no GitHub account, no token in her
 *  browser, nothing to leak from this page.
 * ------------------------------------------------------------------------- */
(() => {
  'use strict';

  const CONTENT_URL = '../content/site.json';
  const DRAFT_KEY = 'einav_content_draft_v1';
  const PW_KEY = 'einav_publish_pw';
  /* Same-origin by default so the local dev server can serve it; override for
     the deployed Worker by setting window.PUBLISH_ENDPOINT before this script. */
  const ENDPOINT = window.PUBLISH_ENDPOINT || '../publish';

  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  let content = null;      // what is being edited
  let published = null;    // what was last loaded from the server
  let dirty = false;

  /* ===================================================================== *
   *  labels — what each key is called in the editor
   * ===================================================================== */

  const SECTIONS = [
    { title: 'הגדרות', kind: 'settings' },
    { title: 'פתיח (מסך הכניסה)', keys: ['splash.name', 'splash.tagline'] },
    { title: 'כותרת עליונה', keys: ['brand.name', 'brand.role', 'nav.services', 'nav.about', 'nav.session', 'nav.dogs', 'nav.cta'] },
    { title: 'ראש הדף', keys: ['hero.eyebrow', 'hero.title', 'hero.body', 'hero.ctaPrimary', 'hero.ctaSecondary', 'hero.statLabel'], media: ['hero.photo1', 'hero.photo2', 'hero.photo3'] },
    { title: 'רצועת הקהלים', list: 'marquee' },
    { title: 'השירותים', keys: ['services.eyebrow', 'services.title'], list: 'services' },
    { title: 'על עינב', keys: ['about.eyebrow', 'about.title', 'about.body', 'about.badge'], media: ['about.photo', 'about.logo'] },
    { title: 'הסמכות', keys: ['about.certsTitle', 'certs.linkLabel', 'about.certsNote'], list: 'certs' },
    { title: 'איך נראה מפגש', keys: ['session.eyebrow', 'session.title'], list: 'steps' },
    { title: 'הכלבים', keys: ['dogs.eyebrow', 'dogs.title', 'dogs.body'], list: 'dogs' },
    { title: 'המלצות', list: 'testimonials' },
    { title: 'מחירים ואזור פעילות', keys: ['pricing.title', 'pricing.status', 'pricing.body', 'pricing.badge'] },
    { title: 'יצירת קשר', keys: ['contact.eyebrow', 'contact.title', 'contact.body', 'contact.phoneLabel', 'contact.formNote'], kind: 'contact' },
    { title: 'הטופס', keys: ['form.name', 'form.phone', 'form.topic'], list: 'topics' },
    { title: 'תחתית הדף', keys: ['footer.name', 'footer.role', 'footer.note', 'footer.replay'] },
  ];

  const LABELS = {
    'splash.name': 'שם', 'splash.tagline': 'תת־כותרת',
    'brand.name': 'שם', 'brand.role': 'תפקיד',
    'nav.services': 'קישור · השירותים', 'nav.about': 'קישור · על עינב',
    'nav.session': 'קישור · מפגש', 'nav.dogs': 'קישור · הכלבים', 'nav.cta': 'כפתור פנייה',
    'hero.eyebrow': 'שורה עליונה', 'hero.title': 'כותרת ראשית', 'hero.body': 'פסקה',
    'hero.ctaPrimary': 'כפתור ראשי', 'hero.ctaSecondary': 'כפתור משני',
    'hero.statLabel': 'תווית ליד המספר',
    'services.eyebrow': 'שורה עליונה', 'services.title': 'כותרת',
    'about.eyebrow': 'שורה עליונה', 'about.title': 'כותרת', 'about.body': 'טקסט',
    'about.badge': 'תגית על התמונה', 'about.certsTitle': 'כותרת ההסמכות',
    'certs.linkLabel': 'טקסט הקישור לתעודה', 'about.certsNote': 'הערה מתחת',
    'session.eyebrow': 'שורה עליונה', 'session.title': 'כותרת',
    'dogs.eyebrow': 'שורה עליונה', 'dogs.title': 'כותרת', 'dogs.body': 'טקסט',
    'pricing.title': 'כותרת', 'pricing.status': 'סטטוס', 'pricing.body': 'טקסט', 'pricing.badge': 'תגית',
    'contact.eyebrow': 'שורה עליונה', 'contact.title': 'כותרת', 'contact.body': 'טקסט',
    'contact.phoneLabel': 'תווית הטלפון', 'contact.formNote': 'הערה מתחת לטופס',
    'form.name': 'שדה · שם', 'form.phone': 'שדה · טלפון', 'form.topic': 'שדה · נושא',
    'footer.name': 'שם', 'footer.role': 'תפקיד', 'footer.note': 'הערה', 'footer.replay': 'כפתור הפעלה מחדש',
    'hero.photo1': 'תמונה 1', 'hero.photo2': 'תמונה 2', 'hero.photo3': 'תמונה 3',
    'about.photo': 'תמונה', 'about.logo': 'הלוגו',
  };

  const LIST_META = {
    marquee:      { one: 'קהל', fields: null },
    services:     { one: 'שירות', fields: { title: 'כותרת', body: 'תיאור' } },
    certs:        { one: 'תעודה', fields: { title: 'שם התעודה', meta: 'מוסד ושנה', href: 'קישור לסריקה' } },
    steps:        { one: 'שלב', fields: { title: 'כותרת', body: 'תיאור', photo: 'תמונה' } },
    dogs:         { one: 'כלב', fields: { name: 'שם', meta: 'גזע ותפקיד', photo: 'תמונה' } },
    testimonials: { one: 'המלצה', fields: { quote: 'ההמלצה', author: 'שם', role: 'תפקיד' } },
    topics:       { one: 'נושא', fields: null },
  };

  /* Bracketed text is the prototype's marker for "real content goes here".
     Surfacing it turns the outstanding-content problem into a checklist. */
  const isPlaceholder = s => typeof s === 'string' && /\[[^\]]*\]|05X|XXX/.test(s);

  /* ===================================================================== *
   *  building the form
   * ===================================================================== */

  function pairRow(label, path, entry, onChange) {
    const row = el('div', 'row');
    const head = el('div', 'rowhead');
    head.append(el('span', 'label', label), el('span', 'path', path));
    if (isPlaceholder(entry.he)) head.append(el('span', 'flag todo', 'ממתין לתוכן'));
    const noen = el('span', 'flag noen', 'אין אנגלית');
    noen.hidden = !!(entry.en && entry.en.trim());
    head.append(noen);
    row.append(head);

    const pair = el('div', 'pair');
    for (const l of ['he', 'en']) {
      const f = el('div', 'field' + (l === 'en' ? ' en' : ''));
      f.append(el('span', null, l === 'he' ? 'עברית' : 'English'));
      const ta = el('textarea');
      ta.value = entry[l] || '';
      ta.rows = Math.min(6, Math.max(1, Math.ceil((ta.value.length || 1) / 46)));
      ta.addEventListener('input', () => {
        entry[l] = ta.value;
        /* The flag updates as she types, so "still missing English" is
           always current rather than only true at load. */
        noen.hidden = !!(entry.en && entry.en.trim());
        onChange();
      });
      f.append(ta);
      pair.append(f);
    }
    row.append(pair);
    return row;
  }

  function textRow(label, path, get, set, type) {
    const row = el('div', 'row');
    const head = el('div', 'rowhead');
    head.append(el('span', 'label', label), el('span', 'path', path));
    row.append(head);
    const f = el('div', 'field');
    const inp = el('input');
    inp.type = type || 'text';
    inp.value = get() || '';
    inp.addEventListener('input', () => { set(inp.value); touch(); });
    f.append(inp);
    row.append(f);
    return row;
  }

  /* A photo field. The file is read in the browser and carried in the draft as
     a data URL; publishing uploads the bytes to the repo and rewrites the path
     to the committed file. Nothing is uploaded until she publishes. */
  function photoRow(label, path, get, set) {
    const row = el('div', 'row');
    const head = el('div', 'rowhead');
    head.append(el('span', 'label', label), el('span', 'path', path));
    row.append(head);

    const box = el('div', 'photo');
    const img = el('img');
    const cur = get();
    img.src = cur && cur.startsWith('data:') ? cur : '../' + (cur || '');
    img.alt = '';
    const btns = el('div', 'pbtns');
    const name = el('div', 'name', cur && cur.startsWith('data:') ? '(תמונה חדשה, טרם פורסמה)' : (cur || '—'));

    const pick = el('button', 'btn');
    pick.textContent = '⭱ החלפת תמונה';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp';
    file.hidden = true;
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) {
        alert('התמונה גדולה מדי (מעל 4MB). כדאי לכווץ אותה קודם.');
        file.value = '';
        return;
      }
      const dataUrl = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      });
      /* The original filename rides along so publishing can keep it, which
         keeps the repo readable instead of full of blob hashes. */
      set(dataUrl, f.name);
      img.src = dataUrl;
      name.textContent = '(' + f.name + ' — טרם פורסמה)';
      touch();
    });

    btns.append(pick, name, file);
    box.append(img, btns);
    row.append(box);
    return row;
  }

  function listBlock(listName) {
    const meta = LIST_META[listName] || { one: 'פריט', fields: null };
    const wrap = el('div');

    const render = () => {
      wrap.replaceChildren();
      const arr = content.lists[listName] || [];

      arr.forEach((item, i) => {
        const box = el('div', 'item');
        const head = el('div', 'itemhead');
        head.append(el('b', null, meta.one + ' ' + (i + 1)));

        const tools = el('div', 'itemtools');
        const up = el('button', 'mini', '↑');
        up.title = 'הזזה למעלה';
        up.disabled = i === 0;
        up.addEventListener('click', () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); touch(); render(); });
        const down = el('button', 'mini', '↓');
        down.title = 'הזזה למטה';
        down.disabled = i === arr.length - 1;
        down.addEventListener('click', () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); touch(); render(); });
        const del = el('button', 'mini danger', '✕');
        del.title = 'מחיקה';
        del.addEventListener('click', () => {
          if (!confirm(`למחוק את ${meta.one} ${i + 1}?`)) return;
          arr.splice(i, 1); touch(); render();
        });
        tools.append(up, down, del);
        head.append(tools);
        box.append(head);

        if (!meta.fields) {
          box.append(pairRow('טקסט', `${listName}[${i}]`, item, touch));
        } else {
          for (const [field, label] of Object.entries(meta.fields)) {
            const path = `${listName}[${i}].${field}`;
            if (field === 'photo') {
              box.append(photoRow(label, path,
                () => item.photo,
                (v, fname) => { item.photo = v; if (fname) item._photoName = fname; }));
            } else if (field === 'href') {
              box.append(textRow(label, path,
                () => item.href,
                v => { item.href = v; }, 'url'));
            } else {
              if (!item[field]) item[field] = { he: '', en: '' };
              box.append(pairRow(label, path, item[field], touch));
            }
          }
        }
        wrap.append(box);
      });

      const add = el('button', 'btn');
      add.textContent = '+ הוספת ' + meta.one;
      add.style.marginTop = '14px';
      add.addEventListener('click', () => {
        arr.push(blankItem(listName));
        touch(); render();
      });
      wrap.append(add);
    };

    render();
    return wrap;
  }

  /* A new item is empty, not a copy of the last one — pre-filled text gets
     published by accident. The site styles it by position anyway. */
  function blankItem(listName) {
    const meta = LIST_META[listName];
    if (!meta || !meta.fields) return { he: '', en: '' };
    const out = {};
    for (const field of Object.keys(meta.fields)) {
      if (field === 'photo') out.photo = '';
      else if (field === 'href') out.href = '';
      else out[field] = { he: '', en: '' };
    }
    return out;
  }

  function buildForm() {
    const form = $('#form');
    form.replaceChildren();

    SECTIONS.forEach((sec, idx) => {
      const d = el('details', 'sec');
      if (idx < 2) d.open = true;
      const sum = el('summary', null, sec.title);
      const count = el('span', 'count');
      sum.append(count);
      d.append(sum);
      const body = el('div', 'body');

      if (sec.kind === 'settings') {
        const note = el('p', 'note',
          'הכפתור הזה קובע אם באתר יופיע מעבר לאנגלית. כשהוא כבוי — האתר בעברית בלבד, ' +
          'והכפתור פשוט לא מופיע. אפשר להמשיך למלא אנגלית גם כשהוא כבוי, והיא תחכה.');
        body.append(note);
        const sw = el('label', 'switch');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = content.settings.langToggle !== false;
        cb.addEventListener('change', () => { content.settings.langToggle = cb.checked; touch(); });
        sw.append(cb, el('span', null, 'להציג באתר כפתור מעבר לאנגלית'));
        body.append(sw);
      }

      (sec.keys || []).forEach(k => {
        if (!content.text[k]) content.text[k] = { he: '', en: '' };
        body.append(pairRow(LABELS[k] || k, k, content.text[k], touch));
      });

      (sec.media || []).forEach(k => {
        body.append(photoRow(LABELS[k] || k, k,
          () => content.media[k],
          (v, fname) => {
            content.media[k] = v;
            if (fname) (content._names = content._names || {})[k] = fname;
          }));
      });

      if (sec.kind === 'contact') {
        body.append(textRow('מספר הטלפון (כפי שמוצג)', 'contact.phone',
          () => content.contact.phone,
          v => {
            content.contact.phone = v;
            /* Derive what the tel: link dials, so she types the number once.
               Israeli mobile: drop the leading 0, prefix +972. */
            const digits = v.replace(/\D/g, '');
            if (digits) {
              content.contact.phoneTel = digits.startsWith('0')
                ? '+972' + digits.slice(1)
                : (digits.startsWith('972') ? '+' + digits : '+972' + digits);
            }
          }));
      }

      if (sec.list) body.append(listBlock(sec.list));

      d.append(body);
      form.append(d);

      const todo = body.querySelectorAll('.flag.todo').length;
      const noen = [...body.querySelectorAll('.flag.noen')].filter(f => !f.hidden).length;
      const bits = [];
      if (todo) bits.push(todo + ' ממתינים לתוכן');
      if (noen) bits.push(noen + ' בלי אנגלית');
      count.textContent = bits.join(' · ');
    });
  }

  /* ===================================================================== *
   *  draft, preview, publish
   * ===================================================================== */

  let previewTimer = 0;

  function touch() {
    dirty = true;
    $('#draftWarn').hidden = false;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(content)); } catch (e) {}
    setStatus('נשמר בדפדפן', '');
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 400);
  }

  function setStatus(msg, kind) {
    const s = $('#status');
    s.textContent = msg;
    s.className = 'status' + (kind ? ' ' + kind : '');
  }

  /* The preview is the real page, handed the draft content directly. Nothing
     is written anywhere to produce it, so previewing can never publish. */
  function refreshPreview() {
    const f = $('#preview');
    if (!f.contentWindow || !f.dataset.ready) return;
    f.contentWindow.postMessage({ type: 'einav:preview', content: stripDrafts(content) }, '*');
  }

  /* Photos picked but not yet published are data URLs. The preview can show
     them as-is; the published JSON must not carry them, so they are swapped
     for their committed paths at publish time. */
  function stripDrafts(c) {
    return JSON.parse(JSON.stringify(c));
  }

  function collectUploads(c) {
    const uploads = [];
    const stamp = String(Date.now()).slice(-6);
    const safe = n => (n || 'photo.png').replace(/[^\w.-]+/g, '-').toLowerCase();

    const take = (dataUrl, hintName) => {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
      if (!m) return null;
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[m[1]] || 'png';
      const base = safe(hintName).replace(/\.[^.]+$/, '');
      const p = `uploads/${base}-${stamp}-${uploads.length + 1}.${ext}`;
      uploads.push({ path: p, base64: m[2] });
      return p;
    };

    for (const k of Object.keys(c.media || {})) {
      if (typeof c.media[k] === 'string' && c.media[k].startsWith('data:')) {
        const p = take(c.media[k], (c._names || {})[k] || k);
        if (p) c.media[k] = p;
      }
    }
    for (const list of Object.values(c.lists || {})) {
      for (const item of list) {
        if (item && typeof item.photo === 'string' && item.photo.startsWith('data:')) {
          const p = take(item.photo, item._photoName);
          if (p) item.photo = p;
        }
        if (item) delete item._photoName;
      }
    }
    delete c._names;
    return uploads;
  }

  async function publish(password) {
    const payload = stripDrafts(content);
    const uploads = collectUploads(payload);

    setStatus('מפרסם…', '');
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, content: payload, uploads }),
    });

    if (res.status === 401) throw new Error('סיסמה שגויה');
    if (!res.ok) throw new Error('הפרסום נכשל (' + res.status + '): ' + (await res.text()).slice(0, 200));

    content = payload;
    published = JSON.parse(JSON.stringify(payload));
    dirty = false;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    $('#draftWarn').hidden = true;
    buildForm();
    refreshPreview();
  }

  /* ===================================================================== *
   *  boot
   * ===================================================================== */

  async function boot() {
    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      published = await res.json();
    } catch (e) {
      setStatus('לא הצלחתי לטעון את התוכן', 'err');
      return;
    }

    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
    content = draft || JSON.parse(JSON.stringify(published));
    if (draft) { dirty = true; $('#draftWarn').hidden = false; setStatus('טיוטה מהדפדפן', ''); }

    if (!content.settings) content.settings = { langToggle: true, defaultLang: 'he' };
    if (!content.contact) content.contact = { phone: '', phoneTel: '' };

    buildForm();

    const f = $('#preview');
    f.src = 'index.html?preview=1';
    f.addEventListener('load', () => { f.dataset.ready = '1'; refreshPreview(); });

    $('#downloadBtn').addEventListener('click', () => {
      const payload = stripDrafts(content);
      collectUploads(payload);   // strips data URLs so the file stays small
      const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'site.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#revertBtn').addEventListener('click', () => {
      if (!dirty) return;
      if (!confirm('לבטל את כל השינויים שלא פורסמו ולחזור למה שמופיע באתר?')) return;
      content = JSON.parse(JSON.stringify(published));
      dirty = false;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      $('#draftWarn').hidden = true;
      setStatus('', '');
      buildForm();
      refreshPreview();
    });

    const dlg = $('#pwDlg');
    $('#publishBtn').addEventListener('click', () => {
      let saved = '';
      try { saved = localStorage.getItem(PW_KEY) || ''; } catch (e) {}
      $('#pwInput').value = saved;
      $('#pwRemember').checked = !!saved;
      dlg.showModal();
      $('#pwInput').focus();
    });
    $('#pwCancel').addEventListener('click', () => dlg.close());
    $('#pwGo').addEventListener('click', async () => {
      const pw = $('#pwInput').value;
      if (!pw) return;
      try { localStorage.setItem(PW_KEY, $('#pwRemember').checked ? pw : ''); } catch (e) {}
      dlg.close();
      try {
        await publish(pw);
        setStatus('פורסם — יופיע באתר תוך כדקה', 'ok');
      } catch (err) {
        setStatus(err.message, 'err');
      }
    });

    addEventListener('beforeunload', e => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  boot();
})();
