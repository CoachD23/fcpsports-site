/* =============================================
   FCP Sports — main.js
   ============================================= */

// ── Nav: mobile toggle ──────────────────────
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');
if (navToggle && mobileNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = !mobileNav.classList.contains('hidden');
    mobileNav.classList.toggle('hidden', isOpen);
    navToggle.setAttribute('aria-expanded', String(!isOpen));
  });
}

// ── Nav: scroll shadow ───────────────────────
const header = document.getElementById('site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('shadow-2xl', window.scrollY > 60);
  }, { passive: true });
}

// ── Scroll animations ────────────────────────
const fadeEls = document.querySelectorAll('.fade-in');
if (fadeEls.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  fadeEls.forEach(el => observer.observe(el));
}

// ── Exit intent popup ────────────────────────
(function () {
  const popup = document.getElementById('exit-popup');
  if (!popup) return;

  const sessionKey = 'fcp_exit_shown';
  if (sessionStorage.getItem(sessionKey)) return;

  let eligible = false;
  setTimeout(() => { eligible = true; }, 3000);

  function showPopup() {
    if (!eligible || sessionStorage.getItem(sessionKey)) return;
    popup.classList.remove('hidden');
    sessionStorage.setItem(sessionKey, '1');
    document.body.style.overflow = 'hidden';
  }

  function closePopup() {
    popup.classList.add('hidden');
    document.body.style.overflow = '';
  }

  document.addEventListener('mouseleave', (e) => {
    if (e.clientY < 20) showPopup();
  });

  setTimeout(showPopup, 40000);

  document.getElementById('exit-close')?.addEventListener('click', closePopup);
  document.getElementById('exit-overlay')?.addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopup();
  });
})();
