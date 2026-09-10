/* ============================================================================
   Casa Nina Flamingo — site-wide smooth scrolling
   Lenis 1.3.26 (MIT, https://github.com/darkroomengineering/lenis), self-hosted
   as js/lenis.min.js. Include on EVERY page, just before the page's own script:

     <script src="js/lenis.min.js"></script>
     <script src="js/smooth-scroll.js"></script>

   What this module does
   · Eases wheel input for a weighted, unhurried scroll. Touch stays native.
   · Switches itself OFF when the visitor prefers reduced motion — the CSS
     scroll-behavior:smooth in styles.css then remains the fallback.
   · Smooth-scrolls same-page anchor links (a[href="#id"]) with the correct
     offset: it reads the target's CSS scroll-margin-top, so each page's
     existing header/rail contract is honoured automatically. It updates the
     URL and fires `hashchange`, so hash-routed pages (FAQ) keep working.
     Links whose own handler already calls preventDefault are left alone.
   · Pauses when the page locks scroll (mobile menu setting overflow:hidden on
     <body>) and resumes when it unlocks. Manual API: window.siteLenis.stop()
     / .start().
   · Exposes window.smoothScrollTo(target, { offset, duration }) for any page
     script that scrolls programmatically (replace element.scrollIntoView()).
     Safe to call even when Lenis is disabled: it falls back to native scroll.

   Nested scrollers: add data-lenis-prevent-horizontal to horizontal strips,
   data-lenis-prevent to anything that should own the wheel entirely (an
   activated map). Nested vertical scrollers are auto-detected.
   ============================================================================ */
(function(){
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── helpers ── */
  function headerH(){
    var v = parseFloat(getComputedStyle(root).getPropertyValue('--xp-header-h'));
    return isNaN(v) ? 68 : v;
  }
  function resolve(target){
    if (!target) return null;
    if (typeof target === 'string'){
      var id = target.charAt(0) === '#' ? target.slice(1) : target;
      return document.getElementById(id) || document.querySelector(target);
    }
    return target.nodeType === 1 ? target : null;
  }
  /* Offset = the element's own scroll-margin-top (each page's contract),
     else header height + breathing room. */
  function offsetFor(el){
    var m = parseFloat(getComputedStyle(el).scrollMarginTop);
    return (isNaN(m) || m === 0) ? headerH() + 24 : m;
  }
  function pickOffset(el, opts){
    return (opts && typeof opts.offset === 'number') ? opts.offset : offsetFor(el);
  }

  /* ── native implementation (used when Lenis is absent or motion is reduced) ── */
  window.smoothScrollTo = function(target, opts){
    var el = resolve(target); if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY - pickOffset(el, opts);
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  if (reduceMotion || typeof Lenis === 'undefined') return;

  /* ── Lenis ── */
  var lenis = new Lenis({
    lerp: 0.09,              /* the feel: lower = longer glide. 0.09 is composed, not floaty */
    smoothWheel: true,
    syncTouch: false,        /* phones and tablets keep native scrolling */
    wheelMultiplier: 1,
    allowNestedScroll: true, /* nested vertical scrollers (dropdowns, panels) scroll natively */
    autoRaf: false
  });
  function raf(time){ lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
  window.siteLenis = lenis;

  window.smoothScrollTo = function(target, opts){
    var el = resolve(target); if (!el) return;
    lenis.scrollTo(el, {
      offset: -pickOffset(el, opts),
      duration: (opts && opts.duration) || 1.25,
      easing: function(t){ return 1 - Math.pow(1 - t, 3); }
    });
  };

  /* ── same-page anchor links ── */
  document.addEventListener('click', function(e){
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-smooth')) return;
    var url; try { url = new URL(a.getAttribute('href'), location.href); } catch (err){ return; }
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    var id = decodeURIComponent(url.hash.slice(1)); if (!id) return;
    var el = document.getElementById(id) || document.querySelector('a[name="' + id + '"]'); if (!el) return;

    e.preventDefault();
    if (history.pushState && location.hash !== '#' + id){
      var oldURL = location.href;
      history.pushState(null, '', '#' + id);
      try { window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: oldURL, newURL: location.href })); } catch (err){}
    }
    /* next frame: lets hash-routed UI (accordions) open before we measure */
    requestAnimationFrame(function(){ window.smoothScrollTo(el); });
  });

  /* ── pause while the page locks scroll (e.g. mobile menu open) ── */
  var locked = false;
  function syncLock(){
    var htmlY = root.classList.contains('lenis-stopped') ? 'visible' : getComputedStyle(root).overflowY;
    var bodyY = getComputedStyle(document.body).overflowY;
    var shouldLock = /hidden|clip/.test(htmlY) || /hidden|clip/.test(bodyY);
    if (shouldLock && !locked){ lenis.stop(); locked = true; }
    else if (!shouldLock && locked){ lenis.start(); locked = false; }
  }
  var lockObserver = new MutationObserver(syncLock);
  lockObserver.observe(root, { attributes:true, attributeFilter:['class','style'] });
  lockObserver.observe(document.body, { attributes:true, attributeFilter:['class','style'] });
})();
