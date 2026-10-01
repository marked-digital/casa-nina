// Header scroll effect: transparent on load, navy once the page scrolls.
// Solid-variant headers (.xp-header--solid) keep their navy background and
// only pick up the scrolled shadow.
const nav = document.getElementById('nav');
if (nav) {
  const setScrolled = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', setScrolled, { passive: true });
  setScrolled();
}

// Mobile menu toggle
const navToggle = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

if (navToggle && mobileMenu) {
  const closeMenu = () => {
    mobileMenu.classList.remove('active');
    navToggle.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  navToggle.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('active');
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

// Scroll animations
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      const offset = 80;
      const pos = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: pos, behavior: 'smooth' });
    }
  });
});

// Lightbox for gallery images
document.querySelectorAll('.gallery-item img, .gallery-cat-grid .gallery-item img').forEach(img => {
  img.addEventListener('click', function() {
    const lb = document.createElement('div');
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:2rem;';
    const clone = this.cloneNode();
    clone.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;';
    lb.appendChild(clone);
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  });
});

// Share with your group: the device's native share sheet where the browser has
// one (every modern phone), otherwise a small menu with copy / email / WhatsApp.
// Any element with [data-share] is a trigger; the fallback menu is built on
// first use and placed right after the trigger inside its .share wrapper.
(function () {
  const triggers = document.querySelectorAll('[data-share]');
  if (!triggers.length) return;
  const desc = document.querySelector('meta[property="og:description"]');
  const share = { title: document.title, text: desc ? desc.content : '', url: location.href.split('#')[0] };

  function menuFor(btn) {
    const next = btn.nextElementSibling;
    if (next && next.classList.contains('share__menu')) return next;
    const m = document.createElement('div');
    m.className = 'share__menu';
    m.setAttribute('role', 'group');
    m.setAttribute('aria-label', 'Share options');
    const subject = encodeURIComponent(share.title);
    const body = encodeURIComponent(share.text + '\n\n' + share.url);
    const wa = encodeURIComponent(share.title + ' ' + share.url);
    m.innerHTML =
      '<button type="button" data-share-copy>Copy link</button>' +
      '<a href="mailto:?subject=' + subject + '&body=' + body + '">Email</a>' +
      '<a href="https://wa.me/?text=' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
    m.querySelector('[data-share-copy]').addEventListener('click', function () {
      const b = this;
      const done = () => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 2000); };
      const manual = () => { window.prompt('Copy this link', share.url); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(share.url).then(done, manual);
      else manual();
    });
    btn.insertAdjacentElement('afterend', m);
    return m;
  }

  triggers.forEach(btn => {
    btn.addEventListener('click', () => {
      if (navigator.share) { navigator.share(share).catch(() => {}); return; }
      const open = menuFor(btn).classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  document.addEventListener('click', e => {
    if (e.target.closest('[data-share], .share__menu')) return;
    document.querySelectorAll('.share__menu.is-open').forEach(m => {
      m.classList.remove('is-open');
      m.previousElementSibling.setAttribute('aria-expanded', 'false');
    });
  });
})();
