// Issey Siele portfolio: shared behaviour for every page.
// No libraries, no tracking. Everything here is progressive: the pages work without it.

(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Mobile navigation ----------
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');

  function setNav(open) {
    if (!header || !toggle) return;
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.visually-hidden').textContent = open ? 'Close menu' : 'Open menu';
  }

  if (toggle && header && nav) {
    toggle.addEventListener('click', function () {
      setNav(!header.classList.contains('nav-open'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) {
        setNav(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') && !header.contains(e.target)) setNav(false);
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
  }

  // ---------- Header style once the page scrolls ----------
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Reveal on scroll ----------
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if ('IntersectionObserver' in window && !reduceMotion.matches) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    }
  }

  // ---------- Case-study section nav: mark the section in view ----------
  var csLinks = document.querySelectorAll('.cs-nav a[href^="#"]');
  if (csLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    csLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          csLinks.forEach(function (a) { a.classList.remove('is-current'); a.removeAttribute('aria-current'); });
          var link = byId[entry.target.id];
          if (link) {
            link.classList.add('is-current');
            link.setAttribute('aria-current', 'true');
            link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) spy.observe(sec);
    });
  }

  // ---------- Videos: play while visible, never under reduced motion ----------
  var videos = document.querySelectorAll('.video');
  videos.forEach(function (wrap) {
    var v = wrap.querySelector('video');
    var btn = wrap.querySelector('.video__toggle');
    if (!v || !btn) return;
    var userPaused = reduceMotion.matches;

    function label() {
      btn.textContent = v.paused ? 'Play' : 'Pause';
      btn.setAttribute('aria-label', (v.paused ? 'Play' : 'Pause') + ' video: ' + (v.getAttribute('aria-label') || 'clip'));
    }

    btn.addEventListener('click', function () {
      if (v.paused) {
        userPaused = false;
        v.play().catch(function () {});
      } else {
        userPaused = true;
        v.pause();
      }
    });
    v.addEventListener('play', label);
    v.addEventListener('pause', label);
    label();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !userPaused) {
            if (v.preload === 'none') v.preload = 'auto';
            v.play().catch(function () {});
          } else if (!entry.isIntersecting && !v.paused) {
            v.pause();
          }
        });
      }, { threshold: 0.35 }).observe(v);
    }
  });

  // ---------- Lightbox for large figures ----------
  var zooms = document.querySelectorAll('.zoom[data-full]');
  if (zooms.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Enlarged figure');
    dlg.innerHTML = '<div class="lightbox__bar"><span class="lightbox__cap"></span>' +
      '<button type="button" class="lightbox__close">Close</button></div><img alt="">';
    document.body.appendChild(dlg);
    var dImg = dlg.querySelector('img');
    var dCap = dlg.querySelector('.lightbox__cap');
    var lastTrigger = null;

    zooms.forEach(function (btn) {
      btn.addEventListener('click', function () {
        lastTrigger = btn;
        var inner = btn.querySelector('img');
        dImg.src = btn.getAttribute('data-full');
        dImg.alt = inner ? inner.alt : '';
        dCap.textContent = btn.getAttribute('data-caption') || '';
        dlg.showModal();
      });
    });
    dlg.querySelector('.lightbox__close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (lastTrigger) lastTrigger.focus(); });
  }

  // ---------- Tooltips for HTML charts (bars, ranges, timeline) ----------
  var tipped = document.querySelectorAll('[data-tip]');
  if (tipped.length) {
    tipped.forEach(function (el) {
      var host = el.closest('.chart, .timeline-chart');
      if (!host) return;
      host.style.position = 'relative';
      var tip = host.querySelector(':scope > .chart-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'chart-tip';
        tip.setAttribute('aria-hidden', 'true');
        host.appendChild(tip);
      }
      function show() {
        var parts = el.getAttribute('data-tip').split('|');
        tip.textContent = '';
        var head = document.createElement('div');
        head.className = 'chart-tip__head';
        head.textContent = parts[0];
        tip.appendChild(head);
        var strong = document.createElement('strong');
        strong.textContent = parts[1] || '';
        tip.appendChild(strong);
        var hr = host.getBoundingClientRect();
        var r = el.getBoundingClientRect();
        var x = Math.min(Math.max(r.left - hr.left + r.width / 2 - 80, 8), hr.width - 180);
        tip.style.left = x + 'px';
        tip.style.top = (r.top - hr.top - 58) + 'px';
        tip.classList.add('is-on');
      }
      function hide() { tip.classList.remove('is-on'); }
      el.addEventListener('pointerenter', show);
      el.addEventListener('pointerleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
    });
  }
})();
