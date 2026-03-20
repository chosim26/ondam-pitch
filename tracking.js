/**
 * about.ondam.me 공통 트래킹 스크립트
 * GA4 이벤트: G-JSNVDKKX6Q
 */
(function() {
  if (typeof gtag === 'undefined') return;

  var page = location.pathname.replace(/\//g, '') || 'home';

  // 1. 스크롤 깊이 추적 (25%, 50%, 75%, 100%)
  var scrollMarks = { 25: false, 50: false, 75: false, 100: false };
  window.addEventListener('scroll', function() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    var pct = Math.round((scrollTop / docHeight) * 100);

    [25, 50, 75, 100].forEach(function(mark) {
      if (pct >= mark && !scrollMarks[mark]) {
        scrollMarks[mark] = true;
        gtag('event', 'scroll_depth', {
          page_name: page,
          depth: mark + '%'
        });
      }
    });
  }, { passive: true });

  // 2. 섹션 도달 추적 (IntersectionObserver)
  var trackedSections = {};
  var sectionObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (!e.isIntersecting) return;
      var id = e.target.id || e.target.className.split(' ')[0];
      if (id && !trackedSections[id]) {
        trackedSections[id] = true;
        gtag('event', 'section_view', {
          page_name: page,
          section: id
        });
        sectionObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('section[id], section[class]').forEach(function(el) {
    sectionObs.observe(el);
  });

  // 3. 체류시간 마일스톤 (15초, 30초, 60초, 120초)
  [15, 30, 60, 120].forEach(function(sec) {
    setTimeout(function() {
      gtag('event', 'time_on_page', {
        page_name: page,
        seconds: sec
      });
    }, sec * 1000);
  });

  // 4. 네비 탭 클릭 추적
  document.querySelectorAll('.nav-link').forEach(function(link) {
    link.addEventListener('click', function() {
      gtag('event', 'nav_click', {
        page_name: page,
        destination: link.textContent.trim()
      });
    });
  });

  // 5. 외부 링크 클릭 추적
  document.querySelectorAll('a[href^="http"]').forEach(function(link) {
    if (link.hostname === location.hostname) return;
    link.addEventListener('click', function() {
      gtag('event', 'outbound_click', {
        page_name: page,
        url: link.href,
        text: link.textContent.trim().substring(0, 50)
      });
    });
  });

  // 6. 전화 버튼 클릭 추적 (tel: 링크)
  document.querySelectorAll('a[href^="tel:"]').forEach(function(link) {
    link.addEventListener('click', function() {
      gtag('event', 'phone_call_click', {
        page_name: page,
        phone_number: link.href.replace('tel:', '')
      });
    });
  });

  // 7. 카카오 채널 클릭 추적
  document.querySelectorAll('a[href*="pf.kakao.com"]').forEach(function(link) {
    link.addEventListener('click', function() {
      gtag('event', 'kakao_channel_click', {
        page_name: page
      });
    });
  });

  // 8. Sticky CTA 클릭 추적
  var stickyCta = document.querySelector('.sticky-cta-btn');
  if (stickyCta) {
    stickyCta.addEventListener('click', function() {
      gtag('event', 'sticky_cta_click', {
        page_name: page,
        text: stickyCta.textContent.trim()
      });
    });
  }

})();
