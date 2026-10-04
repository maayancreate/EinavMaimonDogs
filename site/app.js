/* ---------------------------------------------------------------------------
 *  עינב מימון — landing page runtime.
 *
 *  Replaces the design tool's support.js entirely. Two jobs:
 *
 *  1. CONTENT. Every piece of copy on the page carries the key it came from
 *     (data-k), or the field of the list it belongs to (data-f). This file
 *     reads content/site.json and fills them in. If that file will not load, or
 *     a key is missing from it, the node keeps the Hebrew it was built with —
 *     so a broken edit degrades to the previous copy instead of a blank page.
 *
 *  2. BEHAVIOUR. The splash curtain, the scroll reveal, the mascot, the mobile
 *     chrome. All of it driven imperatively: scrolling must never re-render.
 * ------------------------------------------------------------------------- */
(() => {
  'use strict';

  const CONTENT_URL = '../content/site.json';
  const ASSET_BASE = '../';          // site.json stores repo-relative paths
  const INTRO_KEY = 'einav_intro_v1';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let content = null;
  let lang = 'he';
  let splashing = false;

  /* ===================================================================== *
   *  content
   * ===================================================================== */

  /* English falls back to Hebrew on purpose. Einav writes Hebrew first and
     fills the English in later — a half-translated page has to keep reading as
     a page, not develop blank lines where the translation has not caught up. */
  function pick(entry) {
    if (entry == null) return null;
    if (typeof entry === 'string') return entry;
    const v = entry[lang];
    return (typeof v === 'string' && v.trim()) ? v : (entry.he || null);
  }

  const asset = p => (!p ? '' : /^(https?:|data:|\/)/.test(p) ? p : ASSET_BASE + p);

  /* How many DOM nodes make up one item of each list. The marquee alternates
     a label and a separator dot, so its item is two nodes wide; everything
     else is one node per item. */
  const PER = { marquee: 2 };

  /* Fill one cloned item: every [data-f] inside it takes its value from the
     matching field, and the auto-numbers are recomputed for this position. */
  function fillItem(node, item, index, total) {
    /* Single-field lists — the audience strip, the form's topic dropdown — are
       stored as a bare {he,en} rather than as an object with one key, because
       that is what they read like in the editor. Their one field marker takes
       the item itself. */
    const flat = item && typeof item === 'object' && ('he' in item || 'en' in item);
    const apply = el => {
      const f = el.dataset.f;
      if (f) {
        const val = flat ? item : item[f];
        if (val != null) {
          if (el.tagName === 'IMG') {
            if (val) el.src = asset(val);
          } else if (f === 'href') {
            /* No scan uploaded yet: hide the link rather than render one that
               goes nowhere. The prototype used href="#", which looks live and
               is not. */
            const href = pick(val);
            if (href) { el.href = href; el.hidden = false; }
            else { el.removeAttribute('href'); el.hidden = true; }
          } else {
            const txt = pick(val);
            if (txt != null) el.textContent = txt;
          }
        }
      }
      const auto = el.dataset.auto;
      if (auto === 'index') el.textContent = String(index + 1);
      else if (auto === 'index2') el.textContent = String(index + 1).padStart(2, '0');
    };
    if (node.dataset) apply(node);
    if (node.querySelectorAll) node.querySelectorAll('[data-f],[data-auto]').forEach(apply);
  }

  /* Render one list container from its array.

     Every item the page was built with is kept as a template and they are used
     in rotation, because the design varies them: the four service cards are
     four different colours and the fourth is a whole navy card. Cloning only
     the first would flatten that. Rotating means the existing items look
     exactly as designed, and a newly added fifth picks up the first card's
     treatment rather than inventing one. */
  function renderList(name, container) {
    const items = content && content.lists && content.lists[name];
    if (!Array.isArray(items) || !items.length) return;   // keep the built-in markup

    const per = PER[name] || 1;
    if (!container._tpl) {
      const kids = [...container.children];
      if (kids.length < per) return;

      if (per > 1) {
        /* Multi-node items (a label plus its separator dot): every child
           belongs to an item, taken `per` at a time. */
        const groups = [];
        for (let i = 0; i + per <= kids.length; i += per) {
          groups.push(kids.slice(i, i + per).map(n => n.cloneNode(true)));
        }
        container._tpl = groups;
        container._keep = [];
      } else {
        /* Not every child of a list container is necessarily an item. The
           testimonials rail also holds the pricing card, which is a fixed block
           that happens to sit in the same grid — treating it as a third
           testimonial deleted it the moment the list rendered two. An item is a
           child that carries (or contains) a field marker; anything else is
           kept and put back untouched. */
        const isItem = n => n.matches('[data-f]') || n.querySelector('[data-f]');
        container._tpl = kids.filter(isItem).map(n => [n.cloneNode(true)]);
        container._keep = kids.filter(n => !isItem(n)).map(n => n.cloneNode(true));
      }
      if (!container._tpl.length) { container._tpl = null; return; }
    }

    const frag = document.createDocumentFragment();
    items.forEach((item, i) => {
      const group = container._tpl[i % container._tpl.length];
      group.forEach(tplNode => {
        const clone = tplNode.cloneNode(true);
        fillItem(clone, item, i, items.length);
        frag.appendChild(clone);
      });
    });
    container._keep.forEach(n => frag.appendChild(n.cloneNode(true)));
    container.replaceChildren(frag);
  }

  function hydrate() {
    if (!content) return;

    /* lists first: the fixed-copy pass below must also reach the nodes that
       were just cloned into place (a certificate link's label, for one) */
    $$('[data-list]').forEach(el => renderList(el.dataset.list.split(':')[0], el));

    $$('[data-k]').forEach(el => {
      const v = pick(content.text[el.dataset.k]);
      if (v != null) el.textContent = v;
    });

    $$('[data-m]').forEach(el => {
      const v = content.media && content.media[el.dataset.m];
      if (v) el.src = asset(v);
    });

    const phone = content.contact && content.contact.phone;
    if (phone) $$('[data-c="phone"]').forEach(el => { el.textContent = phone; });
    const tel = content.contact && content.contact.phoneTel;
    if (tel) $$('[data-c-tel]').forEach(el => { el.href = 'tel:' + tel; });

    const dogs = (content.lists && content.lists.dogs) || [];
    $$('[data-auto="dogCount"]').forEach(el => { el.textContent = String(dogs.length); });

    applyLangSetting();
    applyLang();

    /* The lists just replaced their children with fresh clones, so anything
       that watches those nodes has to be pointed at the new ones. */
    setupReveal();
    setupRailDots();
  }

  /* ===================================================================== *
   *  language
   * ===================================================================== */

  function applyLang() {
    const en = lang === 'en';
    const wrap = $('.pagewrap');
    if (wrap) wrap.setAttribute('dir', en ? 'ltr' : 'rtl');
    document.documentElement.setAttribute('lang', en ? 'en' : 'he');
    document.documentElement.setAttribute('dir', en ? 'ltr' : 'rtl');

    const btn = $('#langBtn');
    if (btn) btn.textContent = en ? 'עברית' : 'EN';

    /* The mascot and the drawing swap margins with the text direction. The
       drawing is not mirrored: flipping it would put Einav on the dog's other
       side and the heart in the wrong corner. It reads as a picture. */
    const side = en ? 'right' : 'left';
    const dog = $('.dogpal'); if (dog) dog.setAttribute('data-side', side);
    const fig = $('.cornerfig'); if (fig) fig.setAttribute('data-side', side);

    setSubmitLabel();
  }

  function wireLangButton() {
    const btn = $('#langBtn');
    if (btn) btn.addEventListener('click', () => {
      lang = lang === 'he' ? 'en' : 'he';
      hydrate();
    });
  }

  /* With language switching turned off in the editor, the published page drops
     the button entirely rather than hiding it — there is no reason to ship a
     control that does nothing, and a hidden one still reaches a screen reader.
     In the editor's preview it is only hidden, so that ticking the setting on
     and off shows the difference immediately instead of needing a reload. */
  function applyLangSetting() {
    const on = !content || !content.settings || content.settings.langToggle !== false;
    const btn = $('#langBtn');
    if (!btn) return;
    if (PREVIEW) { btn.hidden = !on; }
    else if (!on) btn.remove();
    if (!on && lang !== 'he') { lang = 'he'; applyLang(); }
  }

  /* ===================================================================== *
   *  splash curtain
   * ===================================================================== */

  let splashHTML = '';
  let splashTimer = 0;

  function showSplash() {
    const el = $('#splash');
    if (!el) return;
    clearTimeout(splashTimer);
    /* Re-setting the markup restarts the CSS animations; without it a replay
       shows the curtain already finished. */
    el.innerHTML = splashHTML;
    el.hidden = false;
    splashTimer = setTimeout(() => { el.hidden = true; }, 2700);
  }

  function startSplash() {
    const el = $('#splash');
    if (!el) return;
    splashHTML = el.innerHTML;
    el.hidden = true;

    /* The editor's preview is this page in an iframe. A curtain dropping every
       time she stops typing would be unusable, so preview mode never plays it
       — the footer's replay button is still there to check it on purpose. */
    if (PREVIEW) return;

    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) {}
    if (seen || reduce) return;
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    splashing = true;
    showSplash();
  }

  /* ===================================================================== *
   *  form
   * ===================================================================== */

  let sent = false;
  function setSubmitLabel() {
    const b = $('#submitBtn');
    if (!b) return;
    const en = lang === 'en';
    b.textContent = sent
      ? (en ? 'Thanks — this is a concept' : 'תודה — זה עדיין קונספט')
      : (en ? 'Send my number' : 'שלחו לי את המספר');
  }

  /* ===================================================================== *
   *  mascot, cue, reveal
   * ===================================================================== */

  function setupDog() {
    const dog = $('.dogpal');
    if (dog) {
      dog.setAttribute('data-pose', 'alert');
      dog.setAttribute('data-gait', 'rest');
      setTimeout(() => dog.setAttribute('data-ready', '1'), splashing ? 2900 : 500);
    }

    /* Same cue as the mascot: wait out the curtain if it is playing, then fade
       in and let the drawing draw itself — Einav, the dog, and the heart
       landing last, the way the coral fourth toe lands last in the curtain. */
    setTimeout(() => {
      const f = $('.cornerfig');
      if (!f) return;
      f.setAttribute('data-ready', '1');
      f.setAttribute('data-draw', '1');
    }, splashing ? 3000 : 600);

    if (reduce) return;

    const marks = $$('[data-story]');
    if (dog && marks.length && 'IntersectionObserver' in window) {
      const band = new Set();
      const pick_ = () => {
        const mid = innerHeight * 0.5;
        let chosen = null;
        band.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top <= mid && r.bottom >= mid) chosen = el;
        });
        if (!chosen) band.forEach(el => { if (!chosen) chosen = el; });
        const pose = chosen && chosen.getAttribute('data-story');
        if (pose && dog.getAttribute('data-pose') !== pose) dog.setAttribute('data-pose', pose);
      };
      const dio = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) band.add(e.target); else band.delete(e.target); });
        pick_();
      }, { rootMargin: '-46% 0px -46% 0px', threshold: 0 });
      marks.forEach(el => dio.observe(el));
    }

    let gaitA = 0, gaitB = 0;
    addEventListener('scroll', () => {
      if (dog) {
        if (dog.getAttribute('data-gait') !== 'trot') dog.setAttribute('data-gait', 'trot');
        clearTimeout(gaitA); clearTimeout(gaitB);
        gaitA = setTimeout(() => dog.setAttribute('data-gait', 'idle'), 190);
        gaitB = setTimeout(() => dog.setAttribute('data-gait', 'rest'), 860);
      }
      const c = $('.scrollcue');
      if (c) {
        const hide = scrollY > 60 ? '1' : '0';
        if (c.getAttribute('data-hide') !== hide) c.setAttribute('data-hide', hide);
      }
    }, { passive: true });
  }

  /* Revealing a drawing also starts its stroke-by-stroke sequence, so the one
     in the dogs section draws itself as it scrolls into view. */
  function showRevealed(el) {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    if (el.classList.contains('drawfig')) el.setAttribute('data-draw', '1');
  }

  /* Re-run after EVERY hydrate, not once at boot.

     The cards in each list are clones made fresh on every render, and they are
     built carrying the inline opacity:0 the reveal animation starts from. The
     observer from the previous pass is watching the nodes that were just
     thrown away, so without re-observing, a re-render leaves every card in
     every list permanently invisible — which is exactly what happens in the
     editor's preview, where the content is re-applied on each keystroke, and
     on the live site the moment the language is switched. */
  let revealIO = null;

  function setupReveal() {
    const items = $$('[data-reveal]');
    if (revealIO) { revealIO.disconnect(); revealIO = null; }

    /* In the preview there is nothing to scroll into — she is looking at a
       framed page and re-rendering constantly. Show everything at once. */
    if (PREVIEW || reduce || !('IntersectionObserver' in window)) {
      items.forEach(showRevealed);
      return;
    }

    revealIO = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) { showRevealed(e.target); revealIO.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(el => revealIO.observe(el));

    /* Belt and braces: anything the observer never fires for is shown anyway,
       so no content can end up permanently invisible. */
    clearTimeout(revealFallback);
    revealFallback = setTimeout(() => $$('[data-reveal]').forEach(showRevealed), 4000);
  }
  let revealFallback = 0;

  /* ===================================================================== *
   *  mobile chrome
   * ===================================================================== */

  let shotsTimer = 0;

  function setupMobile() {
    const sheet = $('.msheet');
    const btn = $('#menuBtn');
    if (sheet && btn) {
      const set = open => {
        sheet.setAttribute('data-open', open);
        btn.setAttribute('data-open', open);
        btn.setAttribute('aria-expanded', open === '1' ? 'true' : 'false');
      };
      btn.addEventListener('click', () =>
        set(sheet.getAttribute('data-open') === '1' ? '0' : '1'));
      sheet.addEventListener('click', e => { if (e.target.closest('a')) set('0'); });
      addEventListener('resize', () => set('0'));   // rotating can cross the breakpoint
    }

    /* Hero: cross-fade the three photos through the single mobile frame. The
       interval only runs while the mobile layout is applied — on desktop the
       collage shows all three at once and needs no help. */
    const art = $('.hero-art');
    const shots = art ? [...art.querySelectorAll('.hero-shot')] : [];
    if (art && shots.length > 1 && !reduce) {
      let at = 0;
      const show = n => shots.forEach((s, i) => s.classList.toggle('on', i === n));
      art.setAttribute('data-slides', '1');
      show(0);
      const mq = matchMedia('(max-width:820px)');
      const start = () => {
        clearInterval(shotsTimer);
        if (!mq.matches) { at = 0; show(0); return; }
        shotsTimer = setInterval(() => { at = (at + 1) % shots.length; show(at); }, 3800);
      };
      start();
      mq.addEventListener('change', start);
    }

    /* Retract the action bar once its own destination is on screen. The footer
       counts too, otherwise scrolling past the form pops the bar back up over
       the last thing on the page. */
    const bar = $('.mbar');
    const contact = $('#contact');
    if (bar && contact && 'IntersectionObserver' in window) {
      const zone = new Set();
      const bio = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) zone.add(e.target); else zone.delete(e.target); });
        bar.setAttribute('data-hide', zone.size ? '1' : '0');
      }, { rootMargin: '0px 0px -32% 0px', threshold: 0 });
      bio.observe(contact);
      const foot = $('footer'); if (foot) bio.observe(foot);
    }
  }

  /* One dot per card, so a rail reads as swipeable before it is swiped. Rebuilt
     after every hydrate, because the number of cards is now content. */
  function setupRailDots() {
    $$('.raildots').forEach(d => d.remove());
    $$('.rail').forEach(rail => {
      /* Rails that stack on mobile never scroll, so a position indicator would
         be pointing at nothing. */
      if (rail.hasAttribute('data-stack')) return;
      const n = rail.children.length;
      if (!n) return;
      const dots = document.createElement('div');
      dots.className = 'raildots';
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < n; i++) dots.appendChild(document.createElement('i'));
      rail.insertAdjacentElement('afterend', dots);
      const sync = () => {
        const max = rail.scrollWidth - rail.clientWidth;
        /* RTL reports scrollLeft as negative in current browsers; abs covers
           both conventions. On desktop the rail is a grid, max is 0, and this
           settles harmlessly on the first dot while the row stays hidden. */
        const p = max > 8 ? Math.abs(rail.scrollLeft) / max : 0;
        const at = Math.round(p * (n - 1));
        for (let i = 0; i < n; i++) dots.children[i].classList.toggle('on', i === at);
      };
      sync();
      rail.addEventListener('scroll', sync, { passive: true });
    });
  }

  /* ===================================================================== *
   *  boot
   * ===================================================================== */

  function wireButtons() {
    const replay = $('#replayBtn');
    if (replay) replay.addEventListener('click', () => { scrollTo(0, 0); showSplash(); });

    const submit = $('#submitBtn');
    if (submit) submit.addEventListener('click', e => {
      e.preventDefault();
      sent = true;
      setSubmitLabel();
    });
  }

  async function boot() {
    startSplash();
    wireButtons();
    wireLangButton();

    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      content = await res.json();
      if (content.settings && content.settings.defaultLang === 'en') lang = 'en';
      hydrate();
    } catch (err) {
      /* The page was built with the Hebrew already in it, so this is survivable:
         it renders the copy it shipped with and simply will not switch language. */
      console.warn('content/site.json did not load — showing built-in copy.', err);
      const btn = $('#langBtn'); if (btn) btn.remove();
    }

    setSubmitLabel();
    setupDog();
    setupReveal();
    setupMobile();
    setupRailDots();
  }

  /* The editor previews by handing this page its draft content directly. It is
     the real page rendering the real content — not a mock-up of it — so what
     she approves is what publishes. Only accepted from the window that framed
     us, and only ever used to re-render: nothing here can write anything. */
  addEventListener('message', e => {
    if (!e.data || e.data.type !== 'einav:preview') return;
    if (e.source !== parent) return;
    content = e.data.content;
    /* Photos she has picked but not published are data URLs in the draft;
       they render directly, so the preview shows the real new image.
       hydrate() re-points the reveal and the rail dots at the new nodes. */
    hydrate();
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
