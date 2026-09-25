#!/usr/bin/env node
/* ============================================================================
   indexnow-ping.mjs — tells Bing (and every IndexNow participant) which pages
   changed, after a publish. Reads the page URLs from public_html/sitemap.xml,
   waits until the live sitemap matches the committed one (so the ping does
   not race the deploy), then POSTs to api.indexnow.org.

   The key is the one public <key>.txt file in public_html/. IndexNow keys are
   public by design: Bing verifies ownership by fetching that file from the
   live host, so the ping only succeeds once casaninaflamingo.com serves this
   site. Set INDEXNOW_ENABLED=true (env) to send; anything else prints what
   would be sent and exits 0.

   Usage: INDEXNOW_ENABLED=true node scripts/indexnow-ping.mjs
   ============================================================================ */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'public_html');
const HOST = 'casaninaflamingo.com';
const sitemap = readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const keyFile = readdirSync(SITE).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('no IndexNow key file (<32 hex>.txt) in public_html/'); process.exit(1); }
const key = readFileSync(path.join(SITE, keyFile), 'utf8').trim();
if (key !== keyFile.replace(/\.txt$/, '')) { console.error('key file content must equal its filename'); process.exit(1); }

const enabled = process.env.INDEXNOW_ENABLED === 'true';
console.log(`${urls.length} urls from sitemap.xml, key ${key.slice(0, 6)}…, enabled=${enabled}`);
if (!enabled) { console.log('INDEXNOW_ENABLED is not "true": dry run, nothing sent.'); urls.forEach(u => console.log('  ' + u)); process.exit(0); }

/* Wait (up to 6 minutes) for the deploy: the live sitemap must match the committed bytes. */
const live = `https://${HOST}/sitemap.xml`;
let matched = false;
for (let i = 0; i < 24; i++) {
  try { const r = await fetch(live, { cache: 'no-store' }); if (r.ok && (await r.text()) === sitemap) { matched = true; break; } } catch {}
  await new Promise(r => setTimeout(r, 15000));
}
if (!matched) { console.error(`live ${live} did not match the committed sitemap within 6 minutes; not pinging`); process.exit(1); }

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls }),
});
console.log(`IndexNow responded ${res.status} ${res.statusText}`);
if (![200, 202].includes(res.status)) { console.error(await res.text()); process.exit(1); }
