#!/usr/bin/env bash
# Smoke test for a deployed Casa Nina Flamingo host.
#   scripts/smoke.sh https://staging.casaninaflamingo.com user:pass
#   scripts/smoke.sh https://casaninaflamingo.com
# Exits non-zero on any failed check. Only needs curl.
set -u
BASE="${1:?usage: smoke.sh <base-url> [user:pass]}"; AUTH="${2:-}"
BASE="${BASE%/}"; HOST="${BASE#https://}"; HOST="${HOST#http://}"
CURL=(curl -sS -m 20 -o /dev/null); CURLB=(curl -sS -m 20)
if [ -n "$AUTH" ]; then CURL+=(-u "$AUTH"); CURLB+=(-u "$AUTH"); fi
pass=0; fail=0; warn=0
ok()   { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }
note() { warn=$((warn+1)); printf '  warn  %s\n' "$1"; }
headers() { "${CURL[@]}" -D - "$@" 2>/dev/null | tr -d '\r'; }
status()  { "${CURL[@]}" -w '%{http_code}' "$1" 2>/dev/null; }
location(){ headers "$1" | awk 'tolower($1)=="location:"{print $2}' | head -1; }
has_header() { headers "$1" | grep -qi "^$2:"; }

echo "smoke: $BASE"

[ "$(status "$BASE/")" = "200" ] && ok "GET / is 200" || bad "GET / is not 200"

loc=$(location "http://$HOST/")
case "$loc" in https://$HOST/*) ok "http:// redirects to https://$HOST/ (same host)";; *) bad "http:// redirect: got '${loc:-none}', want https://$HOST/";; esac

if [ "$HOST" = "casaninaflamingo.com" ]; then
  loc=$(location "https://www.$HOST/")
  [ "$loc" = "https://$HOST/" ] && ok "www redirects to the apex" || bad "www redirect: got '${loc:-none}'"
else
  note "www redirect check only runs against the apex domain"
fi

[ "$(status "$BASE/this-page-does-not-exist-$RANDOM")" = "404" ] && ok "bogus path is 404" || bad "bogus path is not 404"
body=$("${CURLB[@]}" "$BASE/this-page-does-not-exist-$RANDOM" 2>/dev/null)
echo "$body" | grep -q 'page-404' && ok "404 page is the branded one" || note "404 body is not 404.html (ErrorDocument not applied?)"

avail=$("${CURLB[@]}" "$BASE/api/availability" 2>/dev/null)
echo "$avail" | grep -q '"status"' && ok "/api/availability returns JSON with status ($(echo "$avail" | grep -o '"status":"[a-z]*"'))" || bad "/api/availability has no status field: ${avail:0:120}"

for h in X-Content-Type-Options X-Frame-Options Referrer-Policy Permissions-Policy; do
  has_header "$BASE/" "$h" && ok "$h present" || bad "$h missing"
done

case "$HOST" in
  staging.*) has_header "$BASE/" "X-Robots-Tag" && ok "X-Robots-Tag present on staging" || bad "X-Robots-Tag missing on staging";;
  *)         has_header "$BASE/" "X-Robots-Tag" && bad "X-Robots-Tag present on production" || ok "X-Robots-Tag absent on production";;
esac

headers "$BASE/" -H 'Accept-Encoding: gzip, br' | grep -qi '^content-encoding:' && ok "HTML is compressed" || note "HTML not compressed"
headers "$BASE/favicon.ico" | grep -qi '^cache-control:.*max-age=31536000' && ok "long Cache-Control on images" || note "no long Cache-Control on favicon.ico"
[ "$(status "$BASE/images/")" != "200" ] && ok "no directory listing at /images/" || bad "/images/ returns 200 (directory listing?)"
[ "$(status "$BASE/php/availability.php")" = "200" ] && ok "php/availability.php answers directly" || note "php/availability.php did not answer 200"

echo "smoke: $pass passed, $fail failed, $warn warnings"
[ "$fail" -eq 0 ]
