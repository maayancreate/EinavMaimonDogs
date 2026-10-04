/* ---------------------------------------------------------------------------
 * WHERE EVERY EDITABLE STRING LIVES IN THE PROTOTYPE.
 *
 * One table, two consumers:
 *   extract-content.js  reads the prototype through it to seed content/site.json
 *   build-site.js       reads the prototype through it to stamp data-k / data-f
 *                       onto the built page
 *
 * They must agree exactly — a key that the content file calls "hero.title" and
 * the page calls something else is a silently blank headline — so the mapping
 * lives here once rather than twice.
 *
 * Entries are anchored by LINE NUMBER, not by their Hebrew text, because the
 * text is not unique: "השירותים" is both a nav link and the services eyebrow,
 * "על עינב" is both a nav link and the about eyebrow, and "עינב מימון" appears
 * in the splash, the header and the footer. Every entry carries `expect`, and
 * both consumers refuse to run if the line no longer starts with it.
 *
 *   line   1-based line in project/קונספט דף נחיתה - עינב מימון.dc.html
 *   nth    which match on that line, when a line holds several (default 0)
 *   kind   'pair'  — read HE and EN from data-t / data-en
 *          'plain' — a bare text node the prototype never translated, so the
 *                    English has to be supplied here
 *          'img'   — an image path, read from src
 *          'href'  — a link target, read from href
 *   alias  true    — another node showing a string already defined elsewhere
 *                    (the mobile nav, the duplicated marquee run). The page
 *                    stamps it; the content file does not re-read it.
 * ------------------------------------------------------------------------- */

/* --- fixed copy: one key, one meaning ----------------------------------- */
const text = {
  'splash.name':    { line: 450, kind: 'plain', expect: 'עינב מימון', en: 'Einav Maimon' },
  'splash.tagline': { line: 451, kind: 'plain', expect: 'כלבנות טיפולית', en: 'Therapy dog handling & training' },

  'brand.name':     { line: 470, expect: 'עינב מימון' },
  'brand.role':     { line: 474, expect: 'מאלפת כלבים' },

  'nav.services':   { line: 478, expect: 'השירותים' },
  'nav.about':      { line: 479, expect: 'על עינב' },
  'nav.session':    { line: 480, expect: 'איך נראה מפגש' },
  'nav.dogs':       { line: 481, expect: 'הכלבים' },
  'nav.cta':        { line: 484, expect: 'קביעת שיחת היכרות' },

  'hero.eyebrow':      { line: 519, expect: 'מוסמכת כלבנות' },
  'hero.title':        { line: 521, expect: 'כלב אחד' },
  'hero.body':         { line: 523, expect: 'מפגשים קבוצתיים' },
  'hero.ctaPrimary':   { line: 525, expect: 'בואו נדבר' },
  'hero.ctaSecondary': { line: 526, expect: 'מה אפשר לעשות' },
  'hero.statLabel':    { line: 539, expect: 'כלבים מקסימים' },

  'services.eyebrow': { line: 599, expect: 'השירותים' },
  'services.title':   { line: 600, expect: 'ארבע דרכים' },

  'about.badge':      { line: 638, expect: 'בהסמכה' },
  'about.eyebrow':    { line: 643, expect: 'על עינב' },
  'about.title':      { line: 644, expect: 'קודם מכירים' },
  'about.body':       { line: 645, expect: 'עינב מימון היא' },
  'about.certsTitle': { line: 646, expect: 'הסמכות' },
  'about.certsNote':  { line: 672, expect: 'הקישורים יובילו' },

  'session.eyebrow': { line: 679, expect: 'איך נראה מפגש' },
  'session.title':   { line: 680, expect: '45 דקות' },

  'dogs.eyebrow': { line: 712, expect: 'הצוות' },
  'dogs.title':   { line: 713, expect: 'שלושה כלבים' },
  'dogs.body':    { line: 714, expect: 'חלקם עברו אילוף' },

  'pricing.title':  { line: 770, expect: 'מחירים ואזור' },
  'pricing.status': { line: 771, expect: 'עוד לא נקבע' },
  'pricing.body':   { line: 772, expect: 'בגרסה הסופית' },
  'pricing.badge':  { line: 774, expect: '◍' },

  'contact.eyebrow':    { line: 782, expect: 'יצירת קשר' },
  'contact.title':      { line: 783, expect: 'משאירים טלפון' },
  'contact.body':       { line: 784, expect: 'שיחת היכרות' },
  'contact.phoneLabel': { line: 791, expect: 'הטלפון של עינב' },
  'contact.formNote':   { line: 805, expect: 'בקונספט הזה' },

  'form.name':  { line: 801, expect: 'שם' },
  'form.phone': { line: 802, expect: 'טלפון' },
  'form.topic': { line: 803, expect: 'במה מדובר' },

  /* The label on every certificate link. One string, three rows use it. */
  'certs.linkLabel': { line: 654, expect: 'צפייה בתעודה' },

  'footer.name':   { line: 813, kind: 'plain', nth: 0, expect: 'עינב מימון', en: 'Einav Maimon' },
  'footer.role':   { line: 813, expect: '· מאלפת כלבים' },
  'footer.note':   { line: 815, expect: 'קונספט לדף נחיתה' },
  'footer.replay': { line: 816, kind: 'plain', expect: '↻', en: '↻ Replay the intro animation' },
};

/* Second copies of strings already defined above. The mobile nav repeats the
   desktop nav, and the marquee runs twice so the scroll can loop seamlessly.
   These get stamped on the page but are not read into the content file. */
const aliases = [
  { line: 493, key: 'nav.services', expect: 'השירותים' },
  { line: 494, key: 'nav.about',    expect: 'על עינב' },
  { line: 495, key: 'nav.session',  expect: 'איך נראה מפגש' },
  { line: 496, key: 'nav.dogs',     expect: 'הכלבים' },
  { line: 497, key: 'nav.cta',      expect: 'קביעת שיחת היכרות' },
  { line: 662, key: 'certs.linkLabel', expect: 'צפייה בתעודה' },
];

/* --- repeating blocks ---------------------------------------------------- *
 *  `container` is the element whose children repeat; `items` lists each
 *  existing item's fields. The first item becomes the template at runtime and
 *  the rest are discarded, so adding a fourth dog is just another array entry.
 *  `alt` is a second container rendering the same list (the marquee's
 *  duplicated run).
 * ----------------------------------------------------------------------- */
const lists = {
  marquee: {
    container: { line: 555, expect: '<div style="display:flex; gap:34px' },
    alt:       { line: 563, expect: '<div style="display:flex; gap:34px' },
    items: [
      { text: { line: 556, expect: 'גני ילדים' } },
      { text: { line: 557, expect: 'מסגרות לצרכים' } },
      { text: { line: 558, expect: 'בתי אבות' } },
      { text: { line: 559, expect: 'משפחות' } },
      { text: { line: 560, expect: 'מבוגרים' } },
      { text: { line: 561, expect: 'אילוף כלבים' } },
    ],
    altItems: [564, 565, 566, 567, 568, 569],
  },

  services: {
    container: { line: 602, expect: '<div class="rail"' },
    items: [
      { title: { line: 605, expect: 'קבוצות ילדים' },    body: { line: 606, expect: 'מפגש שבועי' } },
      { title: { line: 610, expect: 'הורים וילדים' },     body: { line: 611, expect: 'מפגש משותף' } },
      { title: { line: 615, expect: 'קשישים' },           body: { line: 616, expect: 'ביקורים קבועים' } },
      { title: { line: 620, expect: 'אילוף כלבים לבית' }, body: { line: 621, expect: 'גור חדש' } },
    ],
  },

  certs: {
    container: { line: 647, expect: '<div style="display:flex; flex-direction:column; gap:10px;">' },
    items: [
      { title: { line: 651, expect: 'תעודת אילוף' },  meta: { line: 652, expect: '[' }, href: { line: 654, kind: 'href' } },
      { title: { line: 659, expect: 'תעודת כלבנות' }, meta: { line: 660, expect: '[' }, href: { line: 662, kind: 'href' } },
      { title: { line: 667, expect: 'תעודת CBT' },    meta: { line: 668, expect: '[' } },
    ],
  },

  steps: {
    container: { line: 682, expect: '<div class="rail"' },
    items: [
      { photo: { line: 684, kind: 'img' }, title: { line: 685, expect: 'פגישה' }, body: { line: 686, expect: 'הכלב נכנס' } },
      { photo: { line: 689, kind: 'img' }, title: { line: 690, expect: 'משימה' }, body: { line: 691, expect: 'כל ילד' } },
      { photo: { line: 694, kind: 'img' }, title: { line: 695, expect: 'פרידה' }, body: { line: 696, expect: 'מסכמים' } },
    ],
  },

  dogs: {
    container: { line: 736, expect: '<div class="rail rail-dark"' },
    items: [
      { photo: { line: 738, kind: 'img' }, name: { line: 739, kind: 'plain', expect: '[', en: '[ Name ]' }, meta: { line: 740, expect: 'גזע' } },
      { photo: { line: 743, kind: 'img' }, name: { line: 744, kind: 'plain', expect: '[', en: '[ Name ]' }, meta: { line: 745, expect: 'גזע' } },
      { photo: { line: 748, kind: 'img' }, name: { line: 749, kind: 'plain', expect: '[', en: '[ Name ]' }, meta: { line: 750, expect: 'גזע' } },
    ],
  },

  testimonials: {
    container: { line: 757, expect: '<div class="rail"' },
    items: [
      { quote: { line: 760, expect: '[' },
        author: { line: 761, kind: 'plain', nth: 0, expect: '[', en: '[ Name ]' },
        role:   { line: 761, kind: 'plain', nth: 1, expect: '·', en: '· [ role ]' } },
      { quote: { line: 765, expect: '[' },
        author: { line: 766, kind: 'plain', nth: 0, expect: '[', en: '[ Name ]' },
        role:   { line: 766, kind: 'plain', nth: 1, expect: '·', en: '· [ role ]' } },
    ],
  },

  /* The "what's it about?" dropdown. nth starts at 1 because the label's own
     text node is #0 on that line, ahead of the six <option>s. */
  topics: {
    container: { line: 803, expect: '<select' },
    items: [
      { text: { line: 803, kind: 'plain', nth: 1, expect: 'קבוצת ילדים',  en: "Children's group" } },
      { text: { line: 803, kind: 'plain', nth: 2, expect: 'הורים וילדים', en: 'Parents & children' } },
      { text: { line: 803, kind: 'plain', nth: 3, expect: 'מבוגרים',      en: 'Adults — one-on-one' } },
      { text: { line: 803, kind: 'plain', nth: 4, expect: 'מסגרת לצרכים', en: 'Special-needs program' } },
      { text: { line: 803, kind: 'plain', nth: 5, expect: 'בית אבות',     en: 'Senior residence' } },
      { text: { line: 803, kind: 'plain', nth: 6, expect: 'אילוף כלב',    en: 'Private dog training' } },
    ],
  },
};

/* --- images that are not part of a list ---------------------------------- */
const media = {
  'hero.photo1': { line: 532, kind: 'img' },
  'hero.photo2': { line: 533, kind: 'img' },
  'hero.photo3': { line: 536, kind: 'img' },
  'about.photo': { line: 629, kind: 'img' },
  'about.logo':  { line: 636, kind: 'img' },
};

/* The phone is one fact with two renderings: the number the page prints and
   the string the tel: link dials. */
const contact = {
  phone:    { line: 794, kind: 'plain', expect: '054', en: '054-2612096' },
  phoneTel: { line: 794, kind: 'href' },
};

module.exports = { text, aliases, lists, media, contact };
