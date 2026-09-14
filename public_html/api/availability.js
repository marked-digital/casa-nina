/* ============================================================================
   Casa Nina Flamingo — /api/availability  (Vercel serverless function, Node)

   Turns the Airbnb iCal export into a small JSON list of blocked date ranges
   for js/availability.js. The feed URL carries a private token, so it lives
   ONLY in the Vercel environment variable AIRBNB_ICAL_URL (Production +
   Preview). Never commit it: this repo is public.

   Response (200):
     { "status": "live", "updated": "2026-09-14T18:00:00.000Z",
       "blocked": [["2026-12-20","2026-12-28"], ...] }      // [start, end) — end exclusive
     { "status": "unconfigured", "blocked": [] }             // env var not set yet
     { "status": "error", "blocked": [] }                    // Airbnb unreachable; page falls back

   Caching: s-maxage=3600 lets Vercel's CDN answer for an hour and revalidate
   in the background for a day, so this function runs about once an hour.
   Airbnb itself refreshes the export every few hours; the page says so.

   Location: the api/ folder must sit at the project's Root Directory
   (repo root, or public_html/ if that is the configured root).
   ============================================================================ */

const HOUR = 3600;

function cors(res){
  /* Same-origin in production; the header only matters if the calendar is
     ever embedded from another host. Locked to the site domain. */
  res.setHeader("Access-Control-Allow-Origin", "https://casaninaflamingo.com");
  res.setHeader("Vary", "Origin");
}

/* iCal lines may be "folded": a continuation line starts with a space or tab. */
function unfold(ics){
  return ics.replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r?\n/);
}

/* DTSTART;VALUE=DATE:20261220  ->  "2026-12-20"
   DTSTART:20261220T150000Z     ->  "2026-12-20"  (date part only; all-day is the norm) */
function toIsoDate(value){
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseBlocked(ics){
  const ranges = [];
  let inEvent = false, start = null, end = null;
  for (const line of unfold(ics)){
    if (line === "BEGIN:VEVENT"){ inEvent = true; start = end = null; continue; }
    if (line === "END:VEVENT"){
      if (inEvent && start){ ranges.push([start, end || addDays(start, 1)]); }
      inEvent = false; continue;
    }
    if (!inEvent) continue;
    const idx = line.indexOf(":"); if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    const val = line.slice(idx + 1);
    if (key === "DTSTART") start = toIsoDate(val);
    else if (key === "DTEND") end = toIsoDate(val);
  }
  return ranges;
}

function addDays(iso, n){
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Drop ranges already in the past, sort, and merge touching or overlapping ones. */
function tidy(ranges){
  const today = new Date().toISOString().slice(0, 10);
  const kept = ranges.filter(([s, e]) => e > today).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const out = [];
  for (const [s, e] of kept){
    const last = out[out.length - 1];
    if (last && s <= last[1]){ if (e > last[1]) last[1] = e; }
    else out.push([s, e]);
  }
  return out;
}

export default async function handler(req, res){
  cors(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const url = process.env.AIRBNB_ICAL_URL;
  if (!url){
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    return res.status(200).json({ status: "unconfigured", blocked: [] });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const upstream = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "CasaNinaFlamingo-availability/1.0" } });
    clearTimeout(timer);
    if (!upstream.ok) throw new Error(`Airbnb responded ${upstream.status}`);
    const ics = await upstream.text();
    const blocked = tidy(parseBlocked(ics));
    res.setHeader("Cache-Control", `s-maxage=${HOUR}, stale-while-revalidate=${24 * HOUR}`);
    return res.status(200).json({ status: "live", updated: new Date().toISOString(), blocked });
  } catch (err) {
    console.error("availability: " + (err && err.message));
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ status: "error", blocked: [] });
  }
}
