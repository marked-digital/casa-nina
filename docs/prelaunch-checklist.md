# Pre-launch checklist: Spaceship cutover

**Date:** 2026-09-25 (rewrites the 14 Sept book.html checklist) · **Scope:** the whole site, with the book.html items kept · **State:** the 24 Sept client round (43 changes, see `Casa-Nina-Website-Change-Log.md`) is on `client-edits` awaiting confirmation. Vercel is preview only. Production goes to Spaceship cPanel/LiteSpeed through a GitHub Actions deploy. DNS and Spacemail stay where they are: the cutover is a deploy, not a DNS change.

Owner tags: **[you]** Mark · **[client]** owner sign-off · **[me]** Claude (chat or Claude Code)

---

## 0. Done since 14 Sept

- [x] Repo hygiene: cPanel artifacts purged, `.gitignore` blocks keys, logs, zips and `config/*.php`, repo private.
- [x] Vercel reconnected as preview only: Root Directory `public_html`, Deployment Protection off, `vercel.json` sends an unconditional `X-Robots-Tag: noindex`.
- [x] Form endpoint: Web3Forms, background send, success and error states, honeypot, guest as reply-to (change 39). `api/inquire.js`, Resend and SMTP are out of the plan.
- [x] Availability: `AIRBNB_ICAL_URL` set on Vercel; the calendar dims booked nights on preview (31).
- [x] FAQ facts: all 40 Q&As live, tokens resolved, FAQPage schema complete, no `TODO(client)` left.
- [x] GA4 tag `G-7MXV425WVL` on all eight pages (25). Needs the hostname gate in §1c before production.

## 1. Blocking: nothing ships until these are done

### 1a. Approvals and branches

- [ ] **Client confirmation of the 24 Sept round** [client], including the hero capitalisation decision in §4.
- [x] **Merge `client-edits` → `main`**, then cut `feat/spaceship-hosting` from that `main` so the adapter PR carries all 43 changes [you].
- [x] **`_vercel/image` grep** [you]: `grep -rl "_vercel/image" public_html` must return nothing. Any hit becomes a plain `<img src>` and the `images` block leaves `vercel.json`. Confirm `cleanUrls` is not in `vercel.json` either, so preview URLs match production's `.html` URLs.

### 1b. cPanel recon and setup [you]

- [ ] Hosting Manager: PHP version (8.x with cURL), SSH hostname, username, port. Add the deploy public key under SSH Access.
- [ ] Confirm Spacemail is active for `info@casaninaflamingo.com` (three-dot menu next to the domain). Mail does not change in this plan.
- [ ] SSL/TLS: reissue the main certificate. The old private key sat in public git history, so this is mandatory whatever else happens.
- [ ] Staging subdomain `staging.casaninaflamingo.com` with document root `/home/<user>/staging` (its own root, not under `public_html`, so absolute `/css` and `/js` paths hold). Directory Privacy login for the client. A record at Spaceship Advanced DNS if cPanel did not add it. AutoSSL for it. **Gotcha:** Directory Privacy writes its `AuthType`/`AuthUserFile`/`Require` lines into the staging `.htaccess`, and every deploy overwrites that file. Copy those lines into `/home/<user>/staging-auth.htaccess` (outside the docroot); the workflow prepends them after each staging deploy (see the workflow item).
- [ ] Config outside the webroot, by hand, once: `/home/<user>/config/casa-nina.php` returning `airbnb_ical_urls` (array; Full Casa now, Half Casa later) and `cache_dir` (`/home/<user>/cache`, writable). Commit `config/casa-nina.example.php` with placeholders; the real file never enters the repo or a chat.
- [ ] Web3Forms dashboard: if domain restriction is on for the access key, add `casaninaflamingo.com` and `staging.casaninaflamingo.com`.

### 1c. Adapter files on `feat/spaceship-hosting` [me]

- [x] **`public_html/php/availability.php`**: `require dirname(__DIR__, 2) . '/config/casa-nina.php'`; fetches each iCal with cURL; caches the raw `.ics` in `cache_dir` for 60 minutes (the "refreshed a few times a day" note the client was given); serves the stale cache if Airbnb is unreachable; parses `DTSTART`/`DTEND` into ranges merged across URLs; returns exactly the JSON `api/availability.js` returns, `{"status":"unconfigured",…}` when the config is missing and `{"status":"live",…}` otherwise; sends `Cache-Control: public, max-age=3600`.
- [x] **`public_html/.htaccess`**: `RewriteEngine On`; `http` → `https` as a 301 to `%{HTTP_HOST}` (not the apex, or staging bounces to production), then a second rule `www` → apex; `RewriteRule ^api/availability/?$ php/availability.php [L,QSA]`; `ErrorDocument 404 /404.html`; `Options -Indexes` (drop it if the host 500s on it); security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`); expires (HTML 0, CSS/JS 1 day until filenames are versioned, images and fonts 1 year); deflate; HSTS line commented out until 48 hours clean; `SetEnvIf Host ^staging\. STAGING` plus `Header always set X-Robots-Tag "noindex, nofollow" env=STAGING` so staging never indexes even with the login lifted.
- [x] **`public_html/.vercelignore`**: `.htaccess` and `php/`.
- [x] **Delete `api/inquire.js`** (dead since Web3Forms). Keep `api/availability.js` for previews.
- [x] **GA4 hostname gate** on all eight pages, so previews and staging load the tag but send nothing:

  ```html
  if (location.hostname === 'casaninaflamingo.com') {
    gtag('js', new Date());
    gtag('config', 'G-7MXV425WVL');
  }
  ```

- [x] **Deploy workflow `.github/workflows/deploy.yml`**: `workflow_dispatch` with a `target` choice (`staging` default, `production`); `easingthemes/ssh-deploy@v5`; `SOURCE: public_html/`; `TARGET` is `/home/<user>/staging/` or `/home/<user>/public_html/`; `ARGS: -rlgoDzvc --delete --delay-updates`; `EXCLUDE: /api/, /vercel.json, /.vercelignore, /.well-known/, /cgi-bin/`. Secrets: `SPACESHIP_SSH_KEY`, `SPACESHIP_HOST`, `SPACESHIP_USER`, `SPACESHIP_PORT`. `--delete` is what clears the old site, the zip, the test file and the photos removed in changes 33 to 38. Add a `dry_run` input (adds `-n`, prints what would be deleted; use it once before the first production run). Pre-deploy job runs `build-sitemap --check`, `build-schema --check`, `check-robots.py`, the name grep and the `_vercel/image` grep, and fails on any hit. `SCRIPT_AFTER` on staging prepends `/home/<user>/staging-auth.htaccess` to the deployed `.htaccess` so the login survives the deploy.

### 1d. Content checks that predate the log

- [ ] **Hero photos** [you/client]: `.xp-hero-bg` on book.html and faq.html were gradient placeholders on 14 Sept and neither appears in the 24 Sept log. Confirm both are real images with `<link rel="preload" as="image">` and descriptive alt.
- [ ] **Facts on book.html** [you]: "Good to know" and the Offers schema repeat the FAQ figures (minimum stay, deposit and balance timing, check-in and check-out, cancellation, damage hold). Diff them against the finalized FAQ.

## 2. Staging QA on Spaceship, the real target stack [you]

Run the workflow with `staging`, then on `staging.casaninaflamingo.com`:

- [ ] Every page loads behind the Directory Privacy login; CSS, JS, fonts and images resolve with nothing missing in the console.
- [ ] `/api/availability` returns `{"status":"live",…}` with the booked ranges; the calendar dims booked nights and the note under it reads as on preview.
- [ ] Enquiry form: a real submission shows the "Request received" panel and lands in `info@` with the guest as reply-to and the subject "Availability request: … (Half Casa)". Fill the hidden trap field once to confirm bots are dropped. Break the key briefly (or go offline) to see the error state with the direct email link.
- [ ] `curl -sI` checks: `http://staging.…` → 301 to https; a bogus URL → branded 404; `X-Robots-Tag: noindex` present on staging; security headers present; `Content-Encoding: gzip` on HTML; long `Cache-Control` on images; no directory listing at `/images/`.
- [ ] Share (29, 30): the share sheet opens on iOS and Android; the desktop fallback shows Copy link, Email, WhatsApp; the shared URL is the staging URL, which proves it comes from `location.href` and not a hard-coded vercel.app address.
- [ ] Mobile action bar (40): hidden from the moment the availability section is in view, through calendar, form, talk strip and the thank-you panel; returns after; never renders on desktop.
- [ ] Carried-over device QA: calendar taps and range picking; native date pickers filling and highlighting the calendar; `?demo=1`; `?option=` deep links and card buttons pre-selecting the option; header and mobile-menu "Check availability" jumping to the form under Lenis; `prefers-reduced-motion` (Lenis off, calendar and bar still work); keyboard tab order, gold focus rings, `aria-live` pick line; `min` = today on both date inputs (check whether this landed with the Web3Forms wiring).
- [ ] Name grep: `grep -ril karina public_html` returns nothing (copy, JSON-LD, alt text). Standing rule before every ship.
- [ ] Lighthouse on staging. The 825 px Potrero photo (42) will be flagged; a larger original from the client is the fix, not code.
- [ ] Same branch on Vercel preview: pages identical, `/php/availability.php` is 404, `/api/availability` still live there.
- [ ] Merge `feat/spaceship-hosting` → `main`, delete the branch.

## 3. Go-live [you]

- [ ] Sanity on `main`: name grep clean; `sitemap.xml` lists all eight pages as `.html` URLs; `robots.txt` present (create if missing) allowing everything with a `Sitemap:` line; canonicals, OG/Twitter URLs and every JSON-LD `@id` on `https://casaninaflamingo.com/….html`.
- [ ] Spaceship Advanced DNS: apex A and `www` already point at the hosting IP shown in Hosting Manager; MX untouched. Confirm, change nothing.
- [ ] Run the workflow with `production`. That is the cutover.
- [ ] Verify:

  ```bash
  curl -sI https://casaninaflamingo.com/ | grep -iE "HTTP/|x-robots"   # 200, no x-robots header
  curl -sI http://casaninaflamingo.com/ | grep -i location             # https
  curl -sI https://www.casaninaflamingo.com/ | grep -i location        # apex
  curl -sI https://casaninaflamingo.com/nope | head -1                 # 404
  curl -s https://casaninaflamingo.com/api/availability | head -c 200 # status live
  ```

  An `X-Robots-Tag` on production means `vercel.json` got deployed; it is on the exclude list.
- [ ] Certificate: the served certificate's issue date is after the reissue (padlock details or `openssl s_client`).
- [ ] From a phone: one enquiry, one WhatsApp tap, one share to WhatsApp. The preview should show the villa photo and title with the real domain; `og:image` is absolute and now resolves against production.
- [ ] GA4 Realtime shows the visit; preview and staging visits do not.
- [ ] Rich Results Test and Schema.org validator on `/`, `/book.html`, `/faq.html`, `/explore.html`: FAQPage, VacationRental with the corrected geo (10.428825, -85.790987), two Accommodation nodes with Offers and no price, ReserveAction, BreadcrumbList, VideoObject pointing at `lwvIslSuoEo`, `sameAs` for Instagram, YouTube and TikTok.
- [ ] Search Console: verify the Domain property with a DNS TXT record at Spaceship; submit `sitemap.xml`; request indexing for `/`, `/book.html`, `/faq.html`, `/explore.html`. Link GA4 to Search Console.
- [ ] After 48 hours clean on https: uncomment HSTS in `.htaccess`, redeploy.

## 4. Copy sign-off [client]

Approved by request in the 24 Sept round (the client wrote or changed these; no further sign-off needed):

- [x] Options lede, Half Casa subtitle "Pool and patio exclusively yours", Half Casa description and hidden description (21 to 24)
- [x] Full Casa subtitle "Everyone you love, under one roof" (27)
- [x] Calendar note, live wording (31)
- [x] "Request received" panel (39)
- [x] Talk strip addition "Planning together? Share with your group." (29)

Still to approve verbatim:

- [ ] Hero: "Book your stay." · sub · trust line "Concierge and private airport transfers are included with every stay."
- [ ] Half Casa card: "Sleeps 4 to 6 guests", "Private first-floor residence · Own entrance"
- [ ] Why book direct: "Our best rates are always direct" · "Concierge and airport transfers included" · "A direct line to the people who run the villa"
- [ ] Availability head and lede; button "Check availability"; note "We reply personally, usually the same day. No obligation." The thank-you panel says "always within 24 hours"; make the two promises match.
- [ ] Minimum-stay helper under the dates
- [ ] Good to know: six items (figures per §1d)
- [ ] Talk strip: "Prefer to talk it through? Message us directly."
- [ ] Airbnb band: "Rather book through Airbnb? Instant booking is there too."
- [ ] **Site-wide, from the change log:** hero headline case. Recommend "One casa. Everyone you love." (client's word order, sentence case like every other heading and the voice doc). The Full Casa subtitle echoes it either way.
- [ ] Optional: offer tidied alternatives beside the client-dictated lines in changes 2, 14 and 17 (homepage hero description, rental car answer, beach answer), which read rougher than the surrounding copy. Their call.
- [ ] **Rates: none published anywhere, by decision.** Calendar, form and schema never show a price. Keep it that way.

## 5. SEO and structured data, pre-deploy

- [ ] 1200×630 crop of the dusk villa photo for `og:image` / `twitter:image` on every page (current file is 4:3); `images/og-faq.jpg` export flagged in faq.html; favicon links in every `<head>`.
- [ ] `sitemap.xml`: `/explore.html`, `/faq.html`, `/book.html` added (queued at each page's launch); `lastmod` bumped for the 24 Sept round.
- [ ] Internal links: homepage → explore with a descriptive anchor ("things to do in Playa Flamingo"); homepage and explore → FAQ ("frequently asked questions about staying at Casa Nina"); no "learn more" anchors.
- [ ] VacationRental `@id` aligned across homepage, explore, FAQ and book so Google merges the entity; geo is 10.428825, -85.790987 everywhere (12).
- [ ] **Decision:** the explore and FAQ "Check availability" buttons land on `index.html#booking`. Point them at `book.html#availability`; the homepage callout can pre-select with `book.html?option=half#availability`.
- [ ] URL scheme: `.html` everywhere at launch. Extensionless is a later project with the find-and-replace list: canonical, OG/Twitter URLs, every `@id`/`url` in the JSON-LD (`#availability`, `#full-casa`, `#half-casa`, `#breadcrumb`, `#webpage`), then `.htaccess` rewrites with 301s from `.html`.
- [ ] Google listing: "Casa nina" already exists on Maps (12). Phase 2 GBP is claim, rename to Casa Nina Flamingo, add website, categories and photos, then link the explore page from it.

## 6. Analytics (Phase 2, define now so nothing is rebuilt later)

- [ ] Events: `generate_lead` on the Web3Forms success callback (primary conversion, mark as a key event); WhatsApp click (hero, strip, bar, footer); Airbnb click (cards, band); share click (menu, book strip, gallery, footer); calendar range picked; `?option=` source; film play.
- [ ] Internal traffic: define Marked Digital and client IPs as internal traffic in the GA4 data stream, on top of the hostname gate.
- [ ] Goal: form success primary, WhatsApp click secondary.

## 7. Not blocking

- [ ] Social proof: once real Airbnb reviews are scraped (homepage TODO), the rating and one short quote beside the form.
- [ ] Shared footer fixes (bare `<li>` at 16px; wordmark differs from the header). Waiting on the logo SVG. The footer was touched in 28 and 30; check whether the `<li>` issue went with it.
- [ ] Reveal unification: `.fade-in` on migrated pages vs `[data-reveal]` on explore (D14).
- [ ] Two CTA bands: `.xp-cta` (ink) and `.xp-faq-cta` (navy gradient). Unify when next in the FAQ.
- [ ] Stylesheet consolidation pass (legacy tokens → brand tokens, button variants, dead rules). Post-launch; the Claude Code prompt is ready.
- [ ] Half Casa Airbnb calendar merged into the availability feed, on the client's word (31). `availability.php` already takes a list.
- [ ] Gallery "Beach & beyond" still shows the daytime Potrero photo; client to say whether it changes (42). Ask for a larger Potrero original at the same time.
- [ ] Explore "Good to know" once named the host. Covered by the name grep in §2; if it trips, "our concierge".
- [ ] OwnerRez go-live triggers the TikTok bio CTA and direct-booking activation (separate track).

## 8. After launch

- [ ] `git tag archive/spaceship-original <old-branch>`, push tags, delete the branch.
- [ ] Vercel stays preview only: never add the domain there; the Hobby caveat stands.
- [ ] Nothing cancelled at Spaceship: hosting, domain and Spacemail all renew.
- [ ] Every later update: PR → Vercel preview for the client → merge → run the workflow with `production`. No cPanel file manager sessions.
- [ ] Replace the `faq.html` copy in the Claude project files with the live one; the copy there still carries `[[TOKENS]]` and the host's name.
