#!/usr/bin/env node
/* ============================================================================
   test-availability.mjs — proves public_html/php/availability.php returns what
   public_html/api/availability.js returns for the same iCal feed.

   Serves scripts/fixtures/airbnb-sample.ics on a local port, runs the Node
   handler against it, runs `php -S` with a test config against it, and asserts
   the two JSON bodies agree (status, blocked; updated is a timestamp). Then
   checks the PHP-only behaviour: unconfigured, cache reuse, stale cache on
   fetch failure, error without a cache, and the response headers.

   Needs php (with curl) on PATH. Node 20+, no dependencies.
   ============================================================================ */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = readFileSync(path.join(ROOT, 'scripts/fixtures/airbnb-sample.ics'), 'utf8');
const FEED_PORT = 8081, PHP_PORT = 8080;
const work = mkdtempSync(path.join(tmpdir(), 'casa-nina-avail-'));
const cacheDir = path.join(work, 'cache');
mkdirSync(cacheDir);
let feedUp = true, feedHits = 0;

/* 1. a stand-in for Airbnb */
const feed = createServer((req, res) => {
  feedHits++;
  if (!feedUp) { res.statusCode = 503; return res.end('down'); }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.end(FIXTURE);
});
await new Promise(r => feed.listen(FEED_PORT, '127.0.0.1', r));
const feedUrl = `http://127.0.0.1:${FEED_PORT}/airbnb-sample.ics`;

/* 2. the Node function, called the way Vercel calls it */
async function runNode(url) {
  process.env.AIRBNB_ICAL_URL = url ?? '';
  if (url == null) delete process.env.AIRBNB_ICAL_URL;
  const { default: handler } = await import(path.join(ROOT, 'public_html/api/availability.js') + `?t=${Date.now()}`);
  const headers = {}; let body;
  const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(b) { body = b; return this; } };
  await handler({}, res);
  return { code: res.code, headers, body };
}

/* 3. the PHP file under php -S, with a test config */
const configPath = path.join(work, 'casa-nina.php');
const writeConfig = (urls) => writeFileSync(configPath, `<?php return ['airbnb_ical_urls' => ${JSON.stringify(urls)}, 'cache_dir' => ${JSON.stringify(cacheDir)}];`);
writeConfig([feedUrl]);
const php = spawn('php', ['-S', `127.0.0.1:${PHP_PORT}`, '-t', 'public_html'], { cwd: ROOT, env: { ...process.env, CASA_NINA_CONFIG: configPath }, stdio: ['ignore', 'ignore', 'pipe'] });
let phpLog = ''; php.stderr.on('data', d => { phpLog += d; });
await new Promise(r => setTimeout(r, 700));
async function runPhp(configOverride) {
  const res = await fetch(`http://127.0.0.1:${PHP_PORT}/php/availability.php`, { headers: configOverride ? { 'X-Test': '1' } : {} });
  return { code: res.status, headers: Object.fromEntries(res.headers), body: await res.json() };
}

const results = [];
const check = (name, fn) => { try { fn(); results.push('  ok   ' + name); } catch (e) { results.push('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

try {
  /* --- live: PHP output equals Node output --- */
  const node = await runNode(feedUrl);
  const phpLive = await runPhp();
  check('node returns live', () => assert.equal(node.body.status, 'live'));
  check('php returns live', () => assert.equal(phpLive.body.status, 'live'));
  check('blocked ranges identical', () => assert.deepEqual(phpLive.body.blocked, node.body.blocked));
  check('blocked has the expected shape (past dropped, touching+overlapping merged, no-DTEND = one night)', () =>
    assert.deepEqual(phpLive.body.blocked, [['2027-02-14', '2027-02-20'], ['2027-06-01', '2027-06-02'], ['2027-12-20', '2028-01-03']]));
  check('updated is an ISO timestamp like the Node one', () => { assert.match(phpLive.body.updated, ISO); assert.match(node.body.updated, ISO); });
  check('same keys in the same order', () => assert.deepEqual(Object.keys(phpLive.body), Object.keys(node.body)));
  check('content-type application/json', () => assert.match(phpLive.headers['content-type'], /^application\/json/));
  check('cache-control public, max-age=3600', () => assert.equal(phpLive.headers['cache-control'], 'public, max-age=3600'));
  check('cors header matches node', () => assert.equal(phpLive.headers['access-control-allow-origin'], node.headers['access-control-allow-origin']));
  check('no feed url or path leaks into the body', () => { const t = JSON.stringify(phpLive.body); assert.ok(!t.includes('127.0.0.1') && !t.includes(work)); });

  /* --- cache: second call does not hit the feed --- */
  const hitsBefore = feedHits;
  await runPhp();
  check('fresh cache reused (feed not refetched)', () => assert.equal(feedHits, hitsBefore));
  check('cache file written with a hashed name', () => assert.ok(readdirSync(cacheDir).some(f => /^airbnb-[0-9a-f]{64}\.ics$/.test(f))));

  /* --- stale cache served when the feed is down --- */
  const cacheFile = path.join(cacheDir, readdirSync(cacheDir).find(f => f.endsWith('.ics')));
  const old = new Date(Date.now() - 2 * 3600 * 1000); utimesSync(cacheFile, old, old);   // older than 60 min
  feedUp = false;
  const stale = await runPhp();
  check('feed down + stale cache → still live from cache', () => { assert.equal(stale.body.status, 'live'); assert.deepEqual(stale.body.blocked, phpLive.body.blocked); });

  /* --- error when the feed is down and nothing is cached --- */
  rmSync(cacheFile);
  const err = await runPhp();
  const nodeErr = await runNode(`http://127.0.0.1:${FEED_PORT}/x.ics`);
  check('feed down + no cache → error, same as node', () => { assert.deepEqual(err.body, { status: 'error', blocked: [] }); assert.deepEqual(nodeErr.body, err.body); });
  check('error response cache-control is short', () => assert.equal(err.headers['cache-control'], 'public, max-age=300'));
  feedUp = true;

  /* --- unconfigured --- */
  writeConfig([]);
  const unconf = await runPhp();
  const nodeUnconf = await runNode(null);
  check('empty url list → unconfigured, same as node without the env var', () => { assert.deepEqual(unconf.body, { status: 'unconfigured', blocked: [] }); assert.deepEqual(nodeUnconf.body, unconf.body); });
  rmSync(configPath);
  const missing = await runPhp();
  check('missing config file → unconfigured', () => assert.deepEqual(missing.body, { status: 'unconfigured', blocked: [] }));
} finally {
  php.kill(); feed.close(); rmSync(work, { recursive: true, force: true });
}
console.log('php/availability.php vs api/availability.js');
console.log(results.join('\n'));
if (process.exitCode) { console.log('\nphp -S log:\n' + phpLog); }
