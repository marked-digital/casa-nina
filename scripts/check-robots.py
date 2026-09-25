#!/usr/bin/env python3
"""Verify public_html/robots.txt.

Evaluates rules the way Google and Bing do (the most specific matching rule wins,
`*` is a wildcard, `$` anchors the end, Allow wins a tie). Python's
urllib.robotparser is not used for matching: it applies rules in file order and
has no wildcard support, so it misreads this file. It is used only to read the
Sitemap line.

Usage: python3 scripts/check-robots.py   (exit 1 on any mismatch)
"""
import os, re, sys, urllib.robotparser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROBOTS = os.path.join(ROOT, 'public_html', 'robots.txt')
HOST = 'https://casaninaflamingo.com'
AGENTS = ['*', 'Googlebot', 'Googlebot-Image', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot']
ALLOWED = ['/', '/gallery.html', '/book.html', '/book.html?option=half', '/images/gallery-pool-01.jpg', '/sitemap.xml']
DISALLOWED = ['/api/availability', '/php/availability.php', '/cgi-bin/x', '/book.html?demo=1']

def parse(text):
    """-> list of groups: {'agents': [...], 'rules': [(allow: bool, pattern)]}"""
    groups, cur = [], None
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line or ':' not in line: continue
        key, val = [x.strip() for x in line.split(':', 1)]
        key = key.lower()
        if key == 'user-agent':
            if cur is None or cur['rules']: cur = {'agents': [], 'rules': []}; groups.append(cur)
            cur['agents'].append(val.lower())
        elif key in ('allow', 'disallow') and cur is not None:
            if val: cur['rules'].append((key == 'allow', val))
    return groups

def group_for(groups, agent):
    a = agent.lower()
    best = None
    for g in groups:
        for ua in g['agents']:
            if ua != '*' and (a.startswith(ua) or ua.startswith(a)):
                if best is None or len(ua) > best[0]: best = (len(ua), g)
    if best: return best[1]
    for g in groups:
        if '*' in g['agents']: return g
    return {'agents': ['*'], 'rules': []}

def matches(pattern, path):
    anchored = pattern.endswith('$')
    pat = pattern[:-1] if anchored else pattern
    rx = '^' + '.*'.join(re.escape(part) for part in pat.split('*')) + ('$' if anchored else '')
    return re.match(rx, path) is not None

def can_fetch(groups, agent, path):
    g = group_for(groups, agent)
    hits = [(len(p), allow) for allow, p in g['rules'] if matches(p, path)]
    if not hits: return True
    longest = max(h[0] for h in hits)
    return any(allow for n, allow in hits if n == longest)   # Allow wins a tie at equal length

raw = open(ROBOTS, 'rb').read()
failures = []
if raw.startswith(b'\xef\xbb\xbf'): failures.append('file has a UTF-8 BOM')
if b'\r' in raw: failures.append('file has CR line endings')
if not raw.endswith(b'\n'): failures.append('file lacks a trailing newline')
text = raw.decode('utf-8')
groups = parse(text)
if any(len(g['agents']) != 1 or g['agents'] != ['*'] for g in groups): failures.append('expected exactly one User-agent: * group and no per-agent groups')

for agent in AGENTS:
    for p in ALLOWED:
        if not can_fetch(groups, agent, p): failures.append(f'{agent}: expected ALLOW  {p}')
    for p in DISALLOWED:
        if can_fetch(groups, agent, p): failures.append(f'{agent}: expected BLOCK  {p}')

rp = urllib.robotparser.RobotFileParser(); rp.parse(text.splitlines())
sitemaps = rp.site_maps() or []
if sitemaps != [HOST + '/sitemap.xml']: failures.append(f'Sitemap line is {sitemaps}, expected {HOST}/sitemap.xml')
if not os.path.exists(os.path.join(ROOT, 'public_html', 'sitemap.xml')): failures.append('public_html/sitemap.xml does not exist')
if re.search(r'^(crawl-delay|host)\s*:', text, re.I | re.M): failures.append('file contains a Crawl-delay or Host directive')

if failures:
    print('robots.txt check FAILED'); [print('  - ' + f) for f in failures]; sys.exit(1)
print(f'robots.txt OK: {len(AGENTS)} agents x {len(ALLOWED)} allowed + {len(DISALLOWED)} blocked paths; sitemap line correct; one * group; clean UTF-8/LF')
