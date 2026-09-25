#!/usr/bin/env node
/* ============================================================================
   build-sitemap.mjs — generates public_html/sitemap.xml for casaninaflamingo.com
   with Google image-sitemap entries (and a video entry where the page's JSON-LD
   has a complete VideoObject).

   Usage:
     node scripts/build-sitemap.mjs           write public_html/sitemap.xml
     node scripts/build-sitemap.mjs --check   exit 1 if the committed file is stale

   Node 20+, ES modules, no dependencies. The site markup is static and
   consistent, so it is parsed with regular expressions. Every rule below is
   deliberate; see the REPORT at the end of a run for what was included and
   what was excluded and why.
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'public_html');
const OUT = path.join(SITE, 'sitemap.xml');
const BASE = 'https://casaninaflamingo.com';

/* Pages, in the fixed order they appear in the sitemap. (location.html was an
   obsolete, unlinked page and was removed from the site on 2026-09-25.) */
const PAGES = ['index', 'the-casa', 'gallery', 'book', 'faq', 'explore', 'concierge'];

const FORBIDDEN = ['_vercel/image', 'vercel.app', 'staging.', 'localhost'];

const CHECK = process.argv.includes('--check');
const notes = [];        // things worth saying in the report (fallbacks, skips)
const excluded = [];     // { page, ref, why }

function fail(msg) { console.error('\nBUILD FAILED: ' + msg); process.exit(1); }

/* ---------- small helpers ---------- */
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag, name) => { const m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag) || new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'", 'i').exec(tag); return m ? m[1].trim() : null; };
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* Largest candidate in a srcset: highest w descriptor, else highest x, else last. */
function largestInSrcset(srcset) {
  const cands = srcset.split(',').map(c => c.trim()).filter(Boolean).map(c => {
    const [url, desc] = c.split(/\s+/);
    const w = desc && /w$/.test(desc) ? parseFloat(desc) : null;
    const x = desc && /x$/.test(desc) ? parseFloat(desc) : null;
    return { url, w, x };
  });
  if (!cands.length) return null;
  const byW = cands.filter(c => c.w != null).sort((a, b) => b.w - a.w);
  if (byW.length) return byW[0].url;
  const byX = cands.filter(c => c.x != null).sort((a, b) => b.x - a.x);
  if (byX.length) return byX[0].url;
  return cands[cands.length - 1].url;
}

/* url(...) references inside CSS text, ignoring gradients (which have no url()). */
function cssUrls(css) {
  const out = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi; let m;
  while ((m = re.exec(css))) out.push(m[2].trim());
  return out;
}

/* W3C datetime in UTC with an explicit +00:00 offset, from a Date. Formatted here rather than by git so the
   output is identical on every git version (git 2.47+ prints UTC iso-strict dates as "Z", older as "+00:00"). */
function w3cUTC(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}
/* Commit date of the last commit touching a file, or null if untracked. %ct is a unix timestamp, so it does not
   depend on the committer's or the machine's time zone. */
function gitDate(relPath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', relPath], { cwd: ROOT, encoding: 'utf8' }).trim();
    return out ? w3cUTC(new Date(Number(out) * 1000)) : null;
  } catch { return null; }
}
function mtimeW3C(absPath) {
  return w3cUTC(statSync(absPath).mtime);
}
function lastmodFor(relPath) {
  const g = gitDate(relPath);
  if (g) return g;
  notes.push(`${relPath} is not tracked by git; lastmod falls back to file mtime`);
  return mtimeW3C(path.join(ROOT, relPath));
}

/* Decide whether a reference is an image we list, an exclusion, or an error. */
function classify(ref, page) {
  const r = decodeEntities(ref);
  if (/^data:/i.test(r)) return { skip: 'data: URI' };
  if (/^https?:\/\//i.test(r)) {
    const host = new URL(r).host;
    if (host === 'casaninaflamingo.com' || host === 'www.casaninaflamingo.com') return classify(new URL(r).pathname.replace(/^\//, ''), page);
    if (/youtube\.com|ytimg\.com/i.test(host)) return { skip: 'youtube thumbnail' };
    if (/google\.com\/maps/i.test(r)) return { skip: 'Google Maps' };
    return { skip: `external host ${host}` };
  }
  if (/^\/\//.test(r)) return { skip: 'protocol-relative external' };
  const clean = r.split('#')[0].split('?')[0];
  const base = path.posix.basename(clean).toLowerCase();
  if (base.endsWith('.svg')) return { skip: 'SVG' };
  if (base.startsWith('favicon')) return { skip: 'favicon' };
  if (base.startsWith('apple-touch-icon')) return { skip: 'apple-touch-icon' };
  if (/(^|\/)(icons?|logos?)\//i.test(clean)) return { skip: 'icons/logo path' };
  if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(base)) return { skip: 'not an image file' };
  const rel = path.posix.normalize(clean.replace(/^\//, ''));
  const abs = path.join(SITE, rel);
  if (!existsSync(abs)) fail(`${page}.html references ${r} but public_html/${rel} does not exist`);
  return { rel };
}

/* Collect image references from a page in DOM order. */
function collectImages(html, page) {
  const found = []; // { idx, ref }
  const tagRe = /<(img|source|link|a)\b([^>]*)>/gi; let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[0], name = m[1].toLowerCase(), idx = m.index;
    if (name === 'img') {
      const real = attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original');
      const src = real || attr(tag, 'src');
      if (src) found.push({ idx, ref: src });
      const ss = attr(tag, 'srcset') || attr(tag, 'data-srcset');
      if (ss) { const l = largestInSrcset(ss); if (l) found.push({ idx: idx + 0.1, ref: l }); }
    } else if (name === 'source') {
      const ss = attr(tag, 'srcset');
      if (ss) { const l = largestInSrcset(ss); if (l) found.push({ idx, ref: l }); }
    } else if (name === 'link') {
      if (/rel\s*=\s*"preload"/i.test(tag) && /as\s*=\s*"image"/i.test(tag)) { const h = attr(tag, 'href'); if (h) found.push({ idx, ref: h }); }
    } else if (name === 'a') {
      if (/data-lightbox/i.test(tag)) { const h = attr(tag, 'href'); if (h) found.push({ idx, ref: h }); }   // the lightbox opens a.href full-size
    }
  }
  // inline style attributes
  const styleAttrRe = /\sstyle\s*=\s*"([^"]*)"/gi;
  while ((m = styleAttrRe.exec(html))) for (const u of cssUrls(m[1])) found.push({ idx: m.index, ref: u });
  // <style> blocks in the page itself (styles.css is deliberately not parsed)
  const styleBlockRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleBlockRe.exec(html))) for (const u of cssUrls(m[1])) found.push({ idx: m.index, ref: u });

  found.sort((a, b) => a.idx - b.idx);
  const seen = new Set(), images = [];
  for (const { ref } of found) {
    const c = classify(ref, page);
    if (c.skip) { excluded.push({ page, ref, why: c.skip }); continue; }
    if (!seen.has(c.rel)) { seen.add(c.rel); images.push(c.rel); }
  }
  return images;
}

/* Video entry from a complete VideoObject in the page's JSON-LD, else null. */
function collectVideo(html, page) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map(x => x[1]);
  const objs = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (o['@type'] === 'VideoObject') objs.push(o); Object.values(o).forEach(walk); };
  for (const b of blocks) { try { walk(JSON.parse(b)); } catch (e) { fail(`${page}.html has invalid JSON-LD: ${e.message}`); } }
  if (!objs.length) return null;
  const v = objs[0];
  const thumb = Array.isArray(v.thumbnailUrl) ? v.thumbnailUrl[0] : v.thumbnailUrl;
  const id = v.embedUrl && (/\/embed\/([A-Za-z0-9_-]{6,})/.exec(v.embedUrl) || [])[1];
  const missing = [['thumbnail_loc', thumb], ['title', v.name], ['description', v.description], ['player_loc (embedUrl)', id]].filter(([, val]) => !val).map(([k]) => k);
  if (missing.length) { notes.push(`${page}.html has a VideoObject but is missing ${missing.join(', ')}; no video entry written`); return null; }
  return { thumbnail: thumb, title: v.name, description: v.description, player: `https://www.youtube.com/embed/${id}` };
}

/* Gallery reconciliation: tiles per section must match the "N photos" label. */
function reconcileGallery(html) {
  const rows = [];
  const secRe = /<section class="tour[^"]*" id="([^"]+)"[\s\S]*?<\/section>/g; let m;
  const allTiles = new Set(); let total = 0;
  while ((m = secRe.exec(html))) {
    const id = m[1], sec = m[0];
    const tiles = [...sec.matchAll(/<a class="tour__item[^"]*" href="([^"]+)"/g)].map(x => x[1]);
    const label = /<p class="tour__count">(\d+) photos<\/p>/.exec(sec);
    total += tiles.length; tiles.forEach(t => allTiles.add(t));
    if (!label) { rows.push(`  ${id.padEnd(10)} ${String(tiles.length).padStart(2)} tiles  (no photo count label)`); continue; }
    const n = Number(label[1]);
    rows.push(`  ${id.padEnd(10)} ${String(tiles.length).padStart(2)} tiles  label ${n}${tiles.length === n ? '' : '  <-- MISMATCH'}`);
    if (tiles.length !== n) fail(`gallery.html section "${id}" has ${tiles.length} tiles but its label says ${n} photos`);
  }
  return { rows, total, unique: allTiles.size };
}

/* Minimal well-formedness check (tag balance, single root) as a fallback for xmllint. */
function assertWellFormed(xml) {
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = []; const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g; let m, roots = 0;
  while ((m = re.exec(body))) {
    if (m[1]) { if (stack.pop() !== m[2]) fail(`XML not well-formed near </${m[2]}>`); }
    else if (!m[3]) { if (!stack.length) roots++; stack.push(m[2]); }
  }
  if (stack.length) fail(`XML not well-formed: unclosed <${stack[stack.length - 1]}>`);
  if (roots !== 1) fail(`XML must have exactly one root element, found ${roots}`);
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(body)) fail('XML has an unescaped &');
}

/* ---------- build ---------- */
const entries = [];
for (const page of PAGES) {
  const rel = `public_html/${page}.html`;
  const html = readFileSync(path.join(ROOT, rel), 'utf8');

  const can = /<link rel="canonical" href="([^"]*)"/.exec(html);
  if (!can) fail(`${page}.html has no <link rel="canonical">`);
  const loc = can[1];
  if (!/^https:\/\/casaninaflamingo\.com\//.test(loc)) fail(`${page}.html canonical must be absolute on ${BASE}: ${loc}`);

  const images = collectImages(html, page);
  const video = collectVideo(html, page);

  const dates = [lastmodFor(rel), ...images.map(i => lastmodFor(`public_html/${i}`))];
  const lastmod = dates.map(d => ({ d, t: Date.parse(d) })).sort((a, b) => b.t - a.t)[0].d;

  entries.push({ page, loc, lastmod, images, video });
}

let gallery = null;
{ const html = readFileSync(path.join(SITE, 'gallery.html'), 'utf8'); gallery = reconcileGallery(html); }

const hasVideo = entries.some(e => e.video);
const lines = [];
lines.push('<?xml version="1.0" encoding="UTF-8"?>');
lines.push('<!-- generated by scripts/build-sitemap.mjs, do not edit by hand -->');
lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
lines.push('        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' + (hasVideo ? '' : '>'));
if (hasVideo) lines.push('        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">');
for (const e of entries) {
  lines.push('  <url>');
  lines.push(`    <loc>${xmlEsc(e.loc)}</loc>`);
  lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
  for (const img of e.images) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${xmlEsc(BASE + '/' + encodeURI(img))}</image:loc>`);
    lines.push('    </image:image>');
  }
  if (e.video) {
    lines.push('    <video:video>');
    lines.push(`      <video:thumbnail_loc>${xmlEsc(e.video.thumbnail)}</video:thumbnail_loc>`);
    lines.push(`      <video:title>${xmlEsc(e.video.title)}</video:title>`);
    lines.push(`      <video:description>${xmlEsc(e.video.description)}</video:description>`);
    lines.push(`      <video:player_loc>${xmlEsc(e.video.player)}</video:player_loc>`);
    lines.push('    </video:video>');
  }
  lines.push('  </url>');
}
lines.push('</urlset>');
const xml = lines.join('\n') + '\n';

/* ---------- validation ---------- */
assertWellFormed(xml);
const urlCount = (xml.match(/<url>/g) || []).length;
if (urlCount !== PAGES.length) fail(`expected ${PAGES.length} <url> entries, found ${urlCount}`);
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
if (new Set(locs).size !== locs.length) fail('duplicate <loc> values');
for (const [, iloc] of xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) {
  const p = decodeURI(iloc.replace(/&amp;/g, '&').replace(BASE + '/', ''));
  if (!existsSync(path.join(SITE, p))) fail(`image:loc does not resolve to a file: ${iloc}`);
}
for (const s of FORBIDDEN) if (xml.includes(s)) fail(`forbidden string "${s}" in output`);

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== xml) { console.error('sitemap.xml is stale: run `node scripts/build-sitemap.mjs` and commit the result'); process.exit(1); }
  console.log('sitemap.xml is up to date');
} else {
  writeFileSync(OUT, xml);
}

/* xmllint, when available */
try {
  execFileSync('xmllint', ['--noout', CHECK ? OUT : OUT], { stdio: 'pipe' });
  notes.push('xmllint --noout: passed');
} catch (e) {
  if (e.code === 'ENOENT') notes.push('xmllint not available; internal well-formedness check only');
  else fail('xmllint reported errors:\n' + String(e.stderr || e.message));
}

/* ---------- report ---------- */
console.log('\nREPORT');
console.log('Pages');
for (const e of entries) console.log(`  ${e.page.padEnd(10)} ${e.loc.padEnd(44)} lastmod ${e.lastmod}  images ${String(e.images.length).padStart(2)}  video ${e.video ? 'yes' : 'no'}`);
console.log('\nGallery reconciliation');
gallery.rows.forEach(r => console.log(r));
console.log(`  total tiles ${gallery.total}, unique files ${gallery.unique}`);
console.log('\nExcluded references');
const byWhy = {};
for (const x of excluded) (byWhy[x.why] ||= []).push(`${x.page}: ${x.ref}`);
for (const [why, refs] of Object.entries(byWhy)) { console.log(`  ${why} (${refs.length})`); [...new Set(refs)].forEach(r => console.log(`    ${r}`)); }
if (!excluded.length) console.log('  none');
console.log('\nNotes');
notes.length ? notes.forEach(n => console.log('  ' + n)) : console.log('  none');
console.log(`\n${CHECK ? 'checked' : 'wrote'} ${path.relative(ROOT, OUT)}: ${urlCount} urls, ${(xml.match(/<image:loc>/g) || []).length} image entries, ${(xml.match(/<video:video>/g) || []).length} video entries`);
