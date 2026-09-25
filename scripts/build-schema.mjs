#!/usr/bin/env node
/* ============================================================================
   build-schema.mjs — generates one JSON-LD @graph per page from
   schema/entity.json (shared nodes, hand-authored from visible copy) plus
   page nodes derived from each page's DOM. Writes the block between
   <!-- schema:start --> and <!-- schema:end --> markers; nothing outside the
   markers changes. Also writes schema/out/<page>.json (the graph alone) for
   pasting into Google's Rich Results Test.

   Usage:
     node scripts/build-schema.mjs           write pages + schema/out
     node scripts/build-schema.mjs --check   exit 1 if pages or schema/out are stale

   Node 20+, ES modules, no dependencies. Regex parsing; the markup is static
   and consistent. Every validation in step 4 of the brief runs on each build
   and any failure exits non-zero.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'public_html');
const OUTDIR = path.join(ROOT, 'schema', 'out');
const ENTITY = JSON.parse(readFileSync(path.join(ROOT, 'schema', 'entity.json'), 'utf8'));
const BASE = ENTITY.base;
const PAGES = ['index', 'the-casa', 'gallery', 'book', 'faq', 'explore', 'concierge'];
const CHECK = process.argv.includes('--check');
const GEO = { lat: 10.428825, lng: -85.790987 };
const START = '<!-- schema:start -->', END = '<!-- schema:end -->';

const CLICHES = ['paradise', 'oasis', 'nestled', 'breathtaking', 'stunning', 'ultimate', 'unforgettable'];
const FORBIDDEN = ['Karina', 'Rafael', '[[', 'TODO', '$', 'USD', 'price', 'priceRange', 'aggregateRating', 'vercel', 'staging.', 'localhost', '—'];
const notes = [], flagged = [];
function fail(msg) { console.error('\nBUILD FAILED: ' + msg); process.exit(1); }

/* ---------- text helpers ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', middot: '·', deg: '°', prime: '′', Prime: '″', oacute: 'ó', eacute: 'é', iacute: 'í', aacute: 'á', uacute: 'ú', ntilde: 'ñ', copy: '©', times: '×' };
function decode(s, keepXml = false) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (keepXml && ['amp', 'lt', 'gt', 'quot'].includes(e)) return m;
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return e in ENT ? ENT[e] : m;
  });
}
const ws = s => s.replace(/\s+/g, ' ').trim();
const text = html => ws(decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')));
const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
const abs = p => p.startsWith('http') ? p : BASE + '/' + p.replace(/^\.?\//, '');
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i'];
/* Answer HTML restricted to the allowed tags; other tags dropped (their text kept); attributes stripped except a[href]. */
function restrictHtml(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, rest) => {
    const t = tag.toLowerCase(); if (!ALLOWED_TAGS.includes(t)) return ' ';
    const closing = m.startsWith('</');
    if (closing) return `</${t}>`;
    if (t === 'a') { const h = attr(rest, 'href'); return h ? `<a href="${h.startsWith('#') ? '' : ''}${h.startsWith('http') || h.startsWith('mailto:') ? h : abs(h)}">` : '<a>'; }
    return t === 'br' ? '<br>' : `<${t}>`;
  });
  return ws(decode(s, true)).replace(/> </g, '><').replace(/ <\//g, '</');
}

/* ---------- page readers ---------- */
function page(p) {
  const html = readFileSync(path.join(SITE, p + '.html'), 'utf8');
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  if (!canonical) fail(`${p}.html has no canonical`);
  const title = text(/<title>([\s\S]*?)<\/title>/.exec(html)[1]);
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '');
  const heroImg = /<section class="[^"]*xp-hero[^"]*"[\s\S]*?<img[^>]*src="([^"]*)"/.exec(html)?.[1];
  const crumbs = (() => {
    const m = /<ol class="xp-breadcrumb">([\s\S]*?)<\/ol>/.exec(html); if (!m) return null;
    return [...m[1].matchAll(/<li[^>]*>(?:<a href="([^"]*)">)?([^<]*)/g)].map(x => ({ href: x[1] ? abs(x[1].replace(/^index\.html$/, '')) : canonical, name: text(x[2]) }));
  })();
  return { p, html, canonical, title, description, heroImg, crumbs };
}
const imageObject = (src, alt, w, h, extra = {}) => ({ '@type': 'ImageObject', contentUrl: abs(src), url: abs(src), ...(alt ? { caption: decode(alt) } : {}), ...(w ? { width: Number(w) } : {}), ...(h ? { height: Number(h) } : {}), ...extra });

/* ---------- graph builders ---------- */
function webPage(P, extra = {}) {
  const node = {
    '@type': 'WebPage', '@id': P.canonical + '#webpage', url: P.canonical, name: P.title, description: P.description,
    isPartOf: { '@id': ENTITY.website['@id'] }, about: { '@id': ENTITY.vacationRental['@id'] },
    primaryImageOfPage: imageObject(P.heroImg), inLanguage: 'en', ...extra,
  };
  if (P.crumbs) node.breadcrumb = { '@id': P.canonical + '#breadcrumb' };
  return node;
}
function breadcrumb(P) {
  if (!P.crumbs) return null;
  return { '@type': 'BreadcrumbList', '@id': P.canonical + '#breadcrumb', itemListElement: P.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.href })) };
}

const builders = {
  index(P) {
    return [webPage(P, { primaryImageOfPage: imageObject(P.heroImg) }), ENTITY.film];
  },
  'the-casa'(P) {
    const main = P.html.slice(P.html.indexOf('<main'), P.html.indexOf('</main>'));
    const photos = [...main.matchAll(/<img[^>]*>/g)].map(m => m[0]).filter(t => !attr(t, 'src').endsWith('.svg'));
    const seen = new Set();
    const image = photos.filter(t => !seen.has(attr(t, 'src')) && seen.add(attr(t, 'src'))).map(t => imageObject(attr(t, 'src'), attr(t, 'alt'), attr(t, 'width'), attr(t, 'height')));
    return [webPage(P, { image }), breadcrumb(P)];
  },
  gallery(P) {
    const tiles = [...P.html.matchAll(/<a class="tour__item[^"]*" href="([^"]*)" data-lightbox="[^"]*"><img([^>]*)>/g)];
    if (!tiles.length) fail('gallery.html: no tiles found');
    const media = tiles.map((m, i) => imageObject(m[1], attr(m[2], 'alt'), attr(m[2], 'width'), attr(m[2], 'height'), i === 0 ? { representativeOfPage: true } : {}));
    const wp = webPage(P, { associatedMedia: media }); wp['@type'] = 'ImageGallery';
    return [wp, breadcrumb(P), ENTITY.film];
  },
  book(P) {
    /* the Airbnb offers in entity.json must match the links on this page */
    const links = new Set([...P.html.matchAll(/https:\/\/www\.airbnb\.[a-z]+\/rooms\/\d+/g)].map(m => m[0]));
    for (const o of ENTITY.vacationRental.makesOffer) if (/airbnb\./.test(o.url) && !links.has(o.url)) fail(`book.html: offer url ${o.url} is not linked on the page`);
    return [webPage(P), breadcrumb(P), ENTITY.availability];
  },
  faq(P) {
    const arts = [...P.html.matchAll(/<article class="xp-item" id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
    const visibleCount = (P.html.match(/class="xp-q-text"/g) || []).length;
    if (arts.length !== visibleCount) fail(`faq.html: ${arts.length} articles but ${visibleCount} visible questions`);
    const mainEntity = arts.map(([, id, body]) => {
      const q = text(/<span class="xp-q-text">([\s\S]*?)<\/span>/.exec(body)[1]);
      const inner = /<div class="xp-a-inner">([\s\S]*?)<\/div>\s*<\/div>\s*<\/article>|<div class="xp-a-inner">([\s\S]*)$/.exec(body + '</article>');
      const a = restrictHtml(inner[1] ?? inner[2]);
      if (!a) fail(`faq.html: empty answer for ${id}`);
      return { '@type': 'Question', '@id': P.canonical + '#' + id, name: q, acceptedAnswer: { '@type': 'Answer', text: a } };
    });
    const wp = webPage(P, { mainEntity }); wp['@type'] = 'FAQPage';
    return [wp, breadcrumb(P)];
  },
  explore(P) {
    const items = [];
    for (const m of P.html.matchAll(/<section class="xp-chapter[^"]*" id="(beaches|water|land|daytrips)"([\s\S]*?)<\/section>/g)) {
      for (const c of m[2].matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<[^>]*>\s*)*?<p[^>]*>([\s\S]*?)<\/p>/g)) items.push({ '@type': 'TouristAttraction', name: text(c[1]), description: text(c[2]) });
    }
    if (items.length < 10) fail(`explore.html: only ${items.length} attractions found`);
    const list = { '@type': 'ItemList', '@id': P.canonical + '#attractions', name: 'Things to do around Playa Flamingo', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, item: it })) };
    const know = [...P.html.matchAll(/<div class="xp-know__item"[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)];
    if (know.length < 3) fail('explore.html: the Good to know Q&A was not found');
    const faq = { '@type': 'FAQPage', '@id': P.canonical + '#faq', mainEntity: know.map(k => ({ '@type': 'Question', name: text(k[1]), acceptedAnswer: { '@type': 'Answer', text: restrictHtml(k[2]) } })) };
    return [webPage(P, { mainEntity: { '@id': list['@id'] } }), breadcrumb(P), ENTITY.destination, list, faq];
  },
  concierge(P) {
    const section = id => { const m = new RegExp(`id="${id}"[\\s\\S]*?</section>`).exec(P.html); if (!m) fail(`concierge.html: section ${id} missing`); return m[0]; };
    const cards = html => [...html.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(c => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: text(c[1]), description: text(c[2]) } }));
    const included = cards(section('included-title'));
    const onRequest = ['villa-title', 'water-title', 'land-title'].flatMap(id => cards(section(id)));
    if (included.length < 3 || onRequest.length < 8) fail(`concierge.html: found ${included.length} included and ${onRequest.length} on-request cards`);
    const service = {
      '@type': 'Service', '@id': P.canonical + '#concierge', name: 'Casa Nina Flamingo concierge', url: P.canonical,
      provider: { '@id': ENTITY.vacationRental['@id'] }, areaServed: { '@type': 'Place', name: 'Playa Flamingo, Guanacaste, Costa Rica' },
      hasOfferCatalog: [
        { '@type': 'OfferCatalog', name: 'Included with every stay', itemListElement: included },
        { '@type': 'OfferCatalog', name: 'Arranged on request', itemListElement: onRequest },
      ],
    };
    return [webPage(P, { mainEntity: { '@id': service['@id'] } }), breadcrumb(P), service];
  },
};

/* ---------- build ---------- */
const results = {};
for (const p of PAGES) {
  const P = page(p);
  /* #vacationrental.containsPlace points at the two Accommodation nodes, so they travel with it on every page (all four are shared, byte-identical nodes). */
  const graph = [ENTITY.website, ENTITY.vacationRental, ENTITY.fullCasa, ENTITY.halfCasa, ...builders[p](P)].filter(Boolean);
  const doc = { '@context': 'https://schema.org', '@graph': graph };
  const json = JSON.stringify(doc, null, 2);
  const block = `${START}\n  <script type="application/ld+json">\n${json.split('\n').map(l => '  ' + l).join('\n')}\n  </script>\n  ${END}`;
  let html = P.html, replaced;
  if (html.includes(START)) {
    const s = html.indexOf(START), e = html.indexOf(END) + END.length;
    if (html.indexOf(START, s + 1) !== -1 || html.indexOf(END, e) !== -1) fail(`${p}.html: more than one schema marker pair`);
    replaced = html.slice(0, s) + block + html.slice(e);
  } else {
    const m = /<script type="application\/ld\+json">[\s\S]*?<\/script>/.exec(html);
    if (!m) fail(`${p}.html: no JSON-LD block to replace`);
    if ((html.match(/<script type="application\/ld\+json">/g) || []).length !== 1) fail(`${p}.html: expected one JSON-LD block`);
    replaced = html.slice(0, m.index) + block + html.slice(m.index + m[0].length);
  }
  results[p] = { P, doc, json, html: replaced };
}

/* ---------- validation ---------- */
const nodesOf = doc => { const out = []; const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (o['@type']) out.push(o); Object.values(o).forEach(walk); }; walk(doc['@graph']); return out; };
const refsOf = doc => { const out = []; const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); const k = Object.keys(o); if (k.length === 1 && k[0] === '@id') return out.push(o['@id']); Object.values(o).forEach(walk); }; walk(doc['@graph']); return out; };
const stringsOf = (doc, keyPath = '') => { const out = []; const walk = (o, kp) => { if (typeof o === 'string') return out.push({ kp, s: o }); if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach((x, i) => walk(x, kp + '[' + i + ']')); for (const [k, v] of Object.entries(o)) walk(v, kp ? kp + '.' + k : k); }; walk(doc, keyPath); return out; };

const sharedIds = [ENTITY.website, ENTITY.vacationRental, ENTITY.film, ENTITY.fullCasa, ENTITY.halfCasa, ENTITY.availability].map(n => n['@id']);
const sharedSeen = {};
const airbnbOnBook = new Set([...results.book.P.html.matchAll(/https:\/\/www\.airbnb\.[a-z]+\/rooms\/\d+/g)].map(m => m[0]));
const whitelistHits = [];

for (const p of PAGES) {
  const { doc, html, P } = results[p];
  /* exactly one block, inside markers, valid JSON, context, one graph */
  if ((html.match(/<script type="application\/ld\+json">/g) || []).length !== 1) fail(`${p}: expected exactly one JSON-LD block`);
  const between = html.slice(html.indexOf(START), html.indexOf(END));
  if (!between.includes('<script type="application/ld+json">')) fail(`${p}: block is not inside the markers`);
  const parsed = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  if (parsed['@context'] !== 'https://schema.org' || !Array.isArray(parsed['@graph'])) fail(`${p}: bad @context or @graph`);
  /* refs resolve */
  const ids = new Set(nodesOf(doc).map(n => n['@id']).filter(Boolean));
  for (const r of refsOf(doc)) if (!ids.has(r)) fail(`${p}: reference ${r} does not resolve on the page`);
  /* shared nodes identical */
  for (const n of doc['@graph']) if (sharedIds.includes(n['@id'])) { const s = JSON.stringify(n); if (sharedSeen[n['@id']] && sharedSeen[n['@id']] !== s) fail(`${p}: shared node ${n['@id']} differs from another page`); sharedSeen[n['@id']] = s; }
  /* geo */
  for (const g of nodesOf(doc).filter(n => n['@type'] === 'GeoCoordinates')) if (g.latitude !== GEO.lat || g.longitude !== GEO.lng) fail(`${p}: geo ${g.latitude}, ${g.longitude}`);
  const gm = /<meta name="geo.position" content="([^"]*)"/.exec(html)?.[1], icbm = /<meta name="ICBM" content="([^"]*)"/.exec(html)?.[1];
  if (gm !== `${GEO.lat};${GEO.lng}` || icbm !== `${GEO.lat}, ${GEO.lng}`) fail(`${p}: geo meta tags are ${gm} / ${icbm}`);
  if (/-85\.791\b/.test(JSON.stringify(doc))) fail(`${p}: rounded longitude present`);
  /* urls */
  for (const { kp, s } of stringsOf(doc)) {
    if (!s.startsWith(BASE)) continue;
    const rest = s.slice(BASE.length).split('#')[0];
    if (rest === '/' || rest === '') continue;
    if (!/^\/[^?]*\.(html|jpe?g|png|webp|svg)$/.test(rest)) fail(`${p}: ${kp} url must be a .html page or an image: ${s}`);
    if (!existsSync(path.join(SITE, rest))) fail(`${p}: ${kp} does not resolve to a file: ${s}`);
  }
  /* airbnb */
  for (const u of ENTITY.vacationRental.sameAs.filter(u => /airbnb\./.test(u))) if (!airbnbOnBook.has(u)) fail(`sameAs Airbnb url ${u} is not linked on book.html`);
  for (const u of airbnbOnBook) if (!ENTITY.vacationRental.sameAs.includes(u)) fail(`book.html links ${u} which is missing from sameAs`);
  /* forbidden strings (FAQ answers are whitelisted for prices and staff names, and reported) */
  for (const { kp, s } of stringsOf(doc)) {
    const isFaqAnswer = /acceptedAnswer\.text$/.test(kp) && p === 'faq';
    for (const f of FORBIDDEN) {
      const hit = f === 'price' ? /\bprice/i.test(s) && !/\bpriceCurrency|priceRange/.test(kp) : s.includes(f);
      if (!hit) continue;
      if (isFaqAnswer && ['$', 'USD', 'price', 'Karina', 'Rafael'].includes(f)) { whitelistHits.push(`faq ${kp}: "${f}"`); continue; }
      fail(`${p}: forbidden "${f}" at ${kp}: ${s.slice(0, 120)}`);
    }
    for (const c of CLICHES) if (new RegExp('\\b' + c + '\\b', 'i').test(s)) { if (isFaqAnswer) { whitelistHits.push(`faq ${kp}: cliché "${c}"`); continue; } fail(`${p}: cliché "${c}" at ${kp}: ${s.slice(0, 120)}`); }
    if (/\bluxury\b/i.test(s) && /\b(the|of|pure|sheer|in)\s+luxury\b/i.test(s)) fail(`${p}: "luxury" used as a noun at ${kp}`);
  }
  for (const k of Object.keys(doc['@graph'].flat())) {}
  /* video */
  const vid = /data-youtube-id="([^"]+)"/.exec(html)?.[1];
  const film = doc['@graph'].find(n => n['@id'] === ENTITY.film['@id']);
  if (film) { if (!vid) fail(`${p}: film node present but no embed on the page`); if (film.embedUrl !== `https://www.youtube.com/embed/${vid}`) fail(`${p}: embed id ${vid} does not match the film node`); if (!existsSync(path.join(SITE, film.thumbnailUrl.replace(BASE + '/', '')))) fail(`${p}: film thumbnail missing`); }
  /* faq count */
  if (p === 'faq') { const n = doc['@graph'].find(n => n['@type'] === 'FAQPage').mainEntity.length, v = (P.html.match(/class="xp-q-text"/g) || []).length; if (n !== v) fail(`faq: ${n} questions in schema, ${v} visible`); }
}
/* property keys must not include price fields anywhere */
for (const p of PAGES) for (const { kp } of stringsOf(results[p].doc)) if (/price|aggregateRating|datePublished|dateModified/.test(kp)) fail(`${p}: property ${kp} is not allowed`);

/* schema.org vocabulary check. Reads the vocabulary from the file named by SCHEMAORG_VOCAB when set (for
   machines that cannot reach schema.org), otherwise fetches it; skipped only when neither is available. */
let vocabNote = 'schema.org vocabulary check skipped (offline or blocked)';
let vocab = null;
try {
  if (process.env.SCHEMAORG_VOCAB) vocab = JSON.parse(readFileSync(process.env.SCHEMAORG_VOCAB, 'utf8'));
  else {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://schema.org/version/latest/schemaorg-current-https.jsonld', { signal: ctrl.signal }); clearTimeout(t);
    if (res.ok) vocab = await res.json();
  }
} catch { /* offline */ }
if (vocab) {
  const g = vocab['@graph'];
  const byId = Object.fromEntries(g.map(n => [n['@id'].replace('schema:', ''), n]));
  const parents = id => { const n = byId[id]; if (!n) return []; const s = n['rdfs:subClassOf'] || []; return (Array.isArray(s) ? s : [s]).map(x => x['@id'].replace('schema:', '')); };
  const isA = (type, target) => { const seen = new Set(); const q = [type]; while (q.length) { const t = q.shift(); if (t === target) return true; if (seen.has(t)) continue; seen.add(t); q.push(...parents(t)); } return false; };
  let checked = 0; const problems = new Set();
  for (const p of PAGES) for (const n of nodesOf(results[p].doc)) {
    const types = [].concat(n['@type']);
    for (const t of types) if (!byId[t] || !(byId[t]['@type'] === 'rdfs:Class' || [].concat(byId[t]['@type']).includes('rdfs:Class'))) problems.add(`${p}: unknown @type ${t}`);
    for (const prop of Object.keys(n)) {
      if (prop.startsWith('@')) continue; checked++;
      const pn = byId[prop]; if (!pn) { problems.add(`${p}: unknown property ${prop} on ${types.join('/')}`); continue; }
      const domains = [].concat(pn['schema:domainIncludes'] || []).map(d => d['@id'].replace('schema:', ''));
      if (!domains.some(d => types.some(t => isA(t, d)))) problems.add(`${p}: property ${prop} is not defined for ${types.join('/')} (domains: ${domains.join(', ')})`);
    }
  }
  if (problems.size) fail('schema.org vocabulary check\n  ' + [...problems].join('\n  '));
  vocabNote = `schema.org vocabulary check passed (${checked} property uses, ${process.env.SCHEMAORG_VOCAB ? 'local file' : 'fetched'})`;
}

/* ---------- write / check ---------- */
mkdirSync(OUTDIR, { recursive: true });
let stale = [];
for (const p of PAGES) {
  const { html, json } = results[p];
  const pagePath = path.join(SITE, p + '.html'), outPath = path.join(OUTDIR, p + '.json');
  if (CHECK) {
    if (readFileSync(pagePath, 'utf8') !== html) stale.push(p + '.html');
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== json + '\n') stale.push('schema/out/' + p + '.json');
  } else { writeFileSync(pagePath, html); writeFileSync(outPath, json + '\n'); }
}
if (CHECK && stale.length) { console.error('stale: ' + stale.join(', ') + '\nrun `node scripts/build-schema.mjs` and commit the result'); process.exit(1); }

/* ---------- report ---------- */
console.log('\nREPORT');
for (const p of PAGES) {
  const types = results[p].doc['@graph'].map(n => [].concat(n['@type']).join('+'));
  console.log(`  ${p.padEnd(10)} ${types.join(', ')}`);
}
console.log('\nFlagged');
if (whitelistHits.length) { console.log('  Whitelisted copy-rule hits in visible FAQ answers (not edited):'); [...new Set(whitelistHits)].forEach(h => console.log('    ' + h)); }
console.log('  No 16:9 or 1:1 photo of the villa exists; #vacationrental.image carries the 3:2 hero and the 4:3 exterior only.');
console.log('  index.html has no visible breadcrumb, so no BreadcrumbList there.');
console.log('  ' + vocabNote);
console.log(`\n${CHECK ? 'checked' : 'wrote'} ${PAGES.length} pages and schema/out/`);
