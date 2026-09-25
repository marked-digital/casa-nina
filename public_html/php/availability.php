<?php
/* ============================================================================
   Casa Nina Flamingo — /api/availability   (PHP port for Spaceship / cPanel)

   .htaccess rewrites /api/availability to this file. It mirrors the Vercel
   function api/availability.js exactly: same JSON, same three status values.

   Response (200, application/json):
     { "status": "live", "updated": "2026-09-14T18:00:00.000Z",
       "blocked": [["2026-12-20","2026-12-28"], ...] }      // [start, end) — end exclusive
     { "status": "unconfigured", "blocked": [] }             // no config file / no feed URLs
     { "status": "error", "blocked": [] }                    // a feed unreachable and no cache

   Configuration lives OUTSIDE the web root and is never committed:
     /home/<user>/config/casa-nina.php   (see config/casa-nina.example.php)
   It returns ['airbnb_ical_urls' => [...], 'cache_dir' => '/home/<user>/cache'].
   CASA_NINA_CONFIG (environment) overrides that path for local tests.

   Caching: each feed's raw .ics is cached in cache_dir for 60 minutes and
   written atomically (temp file, then rename). If Airbnb is unreachable the
   stale copy is served instead. No feed URL or filesystem path is ever
   echoed in a response.
   ============================================================================ */

declare(strict_types=1);

const FRESH_TTL     = 3600;   // seconds a cached feed is reused without refetching
const FETCH_TIMEOUT = 10;     // seconds
const USER_AGENT    = 'CasaNinaFlamingo-availability/1.0 (+https://casaninaflamingo.com/book.html)';

header('Content-Type: application/json; charset=utf-8');
/* Same-origin in production; the header only matters if the calendar is
   ever embedded from another host. Locked to the site domain. */
header('Access-Control-Allow-Origin: https://casaninaflamingo.com');
header('Vary: Origin');

/* ---------- output helpers ---------- */
function respond(array $body, int $maxAge): void {
    header('Cache-Control: public, max-age=' . $maxAge);
    echo json_encode($body, JSON_UNESCAPED_SLASHES), "\n";
    exit;
}
function unconfigured(): void { respond(['status' => 'unconfigured', 'blocked' => []], 300); }
function failed(string $why): void {
    error_log('availability: ' . $why);          // server log only, never the response
    respond(['status' => 'error', 'blocked' => []], 300);
}

/* ---------- configuration ---------- */
function loadConfig(): ?array {
    $path = getenv('CASA_NINA_CONFIG');
    if (!is_string($path) || $path === '') $path = dirname(__DIR__, 2) . '/config/casa-nina.php';
    if (!is_readable($path)) return null;
    $cfg = require $path;
    if (!is_array($cfg)) return null;
    $urls = array_values(array_filter(
        array_map('strval', (array)($cfg['airbnb_ical_urls'] ?? [])),
        fn(string $u): bool => preg_match('~^https?://~i', trim($u)) === 1
    ));
    if ($urls === []) return null;
    return ['urls' => array_map('trim', $urls), 'cache_dir' => rtrim((string)($cfg['cache_dir'] ?? ''), '/')];
}

/* ---------- feed cache (raw .ics per URL) ---------- */
function cachePath(string $cacheDir, string $url): ?string {
    if ($cacheDir === '' || !is_dir($cacheDir)) return null;
    return $cacheDir . '/airbnb-' . hash('sha256', $url) . '.ics';
}
function readCache(?string $file, bool $freshOnly): ?string {
    if ($file === null || !is_file($file)) return null;
    if ($freshOnly && (time() - (int)filemtime($file)) > FRESH_TTL) return null;
    $data = @file_get_contents($file);
    return ($data === false || $data === '') ? null : $data;
}
function writeCache(?string $file, string $data): void {
    if ($file === null) return;
    $dir = dirname($file);
    if (!is_writable($dir)) return;
    $tmp = @tempnam($dir, 'airbnb-');
    if ($tmp === false) return;
    if (@file_put_contents($tmp, $data) === strlen($data) && @rename($tmp, $file)) {
        @chmod($file, 0600);
    } else {
        @unlink($tmp);
    }
}

/* ---------- fetch ---------- */
function fetchFeed(string $url): ?string {
    $ch = curl_init($url);
    if ($ch === false) return null;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => FETCH_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => FETCH_TIMEOUT,
        CURLOPT_USERAGENT      => USER_AGENT,
        CURLOPT_HTTPHEADER     => ['Accept: text/calendar, text/plain;q=0.9, */*;q=0.5'],
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if (!is_string($body) || $code < 200 || $code >= 300) return null;
    if (stripos($body, 'BEGIN:VCALENDAR') === false) return null;   // an error page, not a feed
    return $body;
}

/* ---------- iCal parsing (mirrors api/availability.js) ---------- */

/* iCal lines may be "folded": a continuation line starts with a space or tab. */
function unfold(string $ics): array {
    return preg_split('/\r?\n/', (string)preg_replace('/\r\n[ \t]|\n[ \t]/', '', $ics));
}

/* DTSTART;VALUE=DATE:20261220  ->  "2026-12-20"
   DTSTART:20261220T150000Z     ->  "2026-12-20"  (date part only; all-day is the norm) */
function toIsoDate(string $value): ?string {
    return preg_match('/^(\d{4})(\d{2})(\d{2})/', trim($value), $m) ? "$m[1]-$m[2]-$m[3]" : null;
}

function addDays(string $iso, int $n): string {
    $d = new DateTimeImmutable($iso . 'T00:00:00', new DateTimeZone('UTC'));
    return $d->modify(($n >= 0 ? '+' : '') . $n . ' days')->format('Y-m-d');
}

function parseBlocked(string $ics): array {
    $ranges = [];
    $inEvent = false; $start = null; $end = null;
    foreach (unfold($ics) as $line) {
        if ($line === 'BEGIN:VEVENT') { $inEvent = true; $start = $end = null; continue; }
        if ($line === 'END:VEVENT') {
            if ($inEvent && $start !== null) $ranges[] = [$start, $end ?? addDays($start, 1)];
            $inEvent = false; continue;
        }
        if (!$inEvent) continue;
        $idx = strpos($line, ':'); if ($idx === false) continue;
        $key = strtoupper(explode(';', substr($line, 0, $idx))[0]);
        $val = substr($line, $idx + 1);
        if ($key === 'DTSTART') $start = toIsoDate($val);
        elseif ($key === 'DTEND') $end = toIsoDate($val);
    }
    return $ranges;
}

/* Drop ranges already in the past, sort, and merge touching or overlapping ones. */
function tidy(array $ranges): array {
    $today = gmdate('Y-m-d');
    $kept = array_values(array_filter($ranges, fn(array $r): bool => $r[1] > $today));
    usort($kept, fn(array $a, array $b): int => strcmp($a[0], $b[0]));
    $out = [];
    foreach ($kept as [$s, $e]) {
        $last = $out === [] ? null : $out[count($out) - 1];
        if ($last !== null && $s <= $last[1]) { if ($e > $last[1]) $out[count($out) - 1][1] = $e; }
        else $out[] = [$s, $e];
    }
    return $out;
}

/* ---------- main ---------- */
$cfg = loadConfig();
if ($cfg === null) unconfigured();

$ranges = [];
foreach ($cfg['urls'] as $url) {
    $file = cachePath($cfg['cache_dir'], $url);
    $ics = readCache($file, true);
    if ($ics === null) {
        $ics = fetchFeed($url);
        if ($ics !== null) writeCache($file, $ics);
        else $ics = readCache($file, false);              // stale copy beats nothing
    }
    if ($ics === null) failed('feed ' . (array_search($url, $cfg['urls'], true) + 1) . ' unreachable and not cached');
    foreach (parseBlocked($ics) as $r) $ranges[] = $r;
}

respond([
    'status'  => 'live',
    'updated' => gmdate('Y-m-d\TH:i:s.v\Z'),
    'blocked' => tidy($ranges),
], FRESH_TTL);
