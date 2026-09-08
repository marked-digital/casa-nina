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
