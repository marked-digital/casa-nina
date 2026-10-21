/* ============================================================================
   Casa Nina Flamingo — ad-click attribution and contact-click events

   Loaded on every page, deferred, straight after the Google tag.

   1. Attribution. Reads gclid, gbraid, wbraid and the utm_* parameters from
      the URL and keeps them in localStorage "cn_attr" with the time, the
      landing page and the referrer. A visit with none of them only records a
      first landing (when nothing valid is stored). Entries older than 90 days
      count as empty.
   2. Booking form. Fills the hidden inputs marked data-attribution on
      book.html from "cn_attr"; js/inquiry.js sends the non-empty ones with
      the enquiry, so they appear in the email.
   3. Events. One delegated click listener sends whatsapp_click, phone_click
      and email_click to GA4, with the link's data-location as link_location.
      Links inside the share menu are sharing, not contact, and are skipped.

   ES5 only. Storage access is wrapped: private browsing or blocked storage
   simply means no attribution, never an error.
   ============================================================================ */
(function () {
  'use strict';

  var KEY = 'cn_attr';
  var MAX_AGE = 90 * 24 * 60 * 60 * 1000;
  var PARAMS = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function readStored() {
    var data = null;
    try { data = JSON.parse(window.localStorage.getItem(KEY)); } catch (err) { return null; }
    if (!data || typeof data !== 'object' || typeof data.ts !== 'number') return null;
    if (Date.now() - data.ts > MAX_AGE) return null;                    // expired: treat as empty
    return data;
  }

  function writeStored(data) {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* storage unavailable */ }
  }

  function queryParams() {
    var out = {};
    var query = window.location.search.replace(/^\?/, '');
    if (!query) return out;
    var pairs = query.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      var rawName = eq < 0 ? pairs[i] : pairs[i].slice(0, eq);
      var rawValue = eq < 0 ? '' : pairs[i].slice(eq + 1);
      var name, value;
      try { name = decodeURIComponent(rawName.replace(/\+/g, ' ')); } catch (err) { name = rawName; }
      try { value = decodeURIComponent(rawValue.replace(/\+/g, ' ')); } catch (err) { value = rawValue; }
      if (value && !out.hasOwnProperty(name)) out[name] = value.slice(0, 500);
    }
    return out;
  }

  /* ---------- 1. capture ---------- */
  var query = queryParams();
  var found = {};
  var any = false;
  for (var p = 0; p < PARAMS.length; p++) {
    if (query.hasOwnProperty(PARAMS[p])) { found[PARAMS[p]] = query[PARAMS[p]]; any = true; }
  }
  if (any || !readStored()) {
    found.ts = Date.now();
    found.landing_page = window.location.pathname;
    found.referrer = document.referrer;
    writeStored(found);
  }

  /* ---------- 2. booking form hidden fields ---------- */
  function fillForm() {
    var inputs = document.querySelectorAll('input[type="hidden"][data-attribution]');
    if (!inputs.length) return;
    var stored = readStored() || {};
    for (var i = 0; i < inputs.length; i++) {
      var v = stored[inputs[i].name];
      v = (typeof v === 'string') ? v : '';
      inputs[i].value = v;
      inputs[i].defaultValue = v;                                       // survives form.reset()
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillForm);
  else fillForm();

  /* ---------- 3. contact-click events ---------- */
  function send(name, a) {
    if (typeof gtag !== 'function') return;
    gtag('event', name, { link_location: a.getAttribute('data-location') || 'page', page_path: window.location.pathname });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    var a = t.closest('a[href*="wa.me"], a[href*="whatsapp.com"]');
    if (a) { if (!a.closest('.share__menu')) send('whatsapp_click', a); return; }
    a = t.closest('a[href^="tel:"]');
    if (a) { send('phone_click', a); return; }
    a = t.closest('a[href^="mailto:"]');
    if (a && !a.closest('.share__menu')) send('email_click', a);
  });
})();
