/* Work page: filter case studies, coursework and roles by skill, or search by tool, place or keyword. */
(function () {
  'use strict';
  var bar = document.querySelector('.work-filter');
  if (!bar) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('.case-list .case-card, .role-list .role-row'));
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function shownIn(sel) { return items.filter(function (el) { return el.matches(sel) && !el.hidden; }).length; }
  var buttons = Array.prototype.slice.call(bar.querySelectorAll('[data-tag]'));
  var input = document.getElementById('work-q');
  var count = bar.querySelector('.work-filter__count');
  var none = document.querySelector('.work-filter__none');
  var tag = 'all';

  function tags(el) { return (el.getAttribute('data-tags') || '').split(' ').filter(Boolean); }
  function text(el) { return (el.textContent + ' ' + (el.getAttribute('data-keywords') || '')).toLowerCase(); }

  buttons.forEach(function (b) {
    var t = b.getAttribute('data-tag');
    var n = t === 'all' ? items.length : items.filter(function (el) { return tags(el).indexOf(t) > -1; }).length;
    b.querySelector('span').textContent = n;
    if (!n) b.hidden = true;
    b.addEventListener('click', function () {
      tag = t;
      buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      apply();
    });
  });
  input.addEventListener('input', apply);
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; apply(); } });

  function apply() {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
    items.forEach(function (el) {
      var ok = (tag === 'all' || tags(el).indexOf(tag) > -1) && terms.every(function (w) { return text(el).indexOf(w) > -1; });
      el.hidden = !ok;
      if (ok) shown++;
    });
    var phrase = plural(shownIn('.case-card'), 'case study', 'case studies') + ', ' +
      plural(shownIn('.course-list .role-row'), 'coursework project', 'coursework projects') + ' and ' +
      plural(shownIn('.role-list:not(.course-list) .role-row'), 'role', 'roles');
    count.textContent = shown === items.length ? 'Showing everything: ' + phrase + '.' : 'Showing ' + phrase + '.';
    if (none) none.hidden = shown > 0;
    // Hide a section whose rows are all filtered out; Roles stays when nothing matches, since it holds the message.
    var course = document.getElementById('coursework');
    if (course) course.hidden = !shownIn('.course-list .role-row');
    var roles = document.querySelector('section[aria-labelledby="roles-title"]');
    if (roles) roles.hidden = shown > 0 && !shownIn('.role-list:not(.course-list) .role-row');
  }

  // Deep link: portfolio.html#cad opens with that filter on.
  var start = location.hash.replace('#', '');
  buttons.forEach(function (b) { if (b.getAttribute('data-tag') === start && !b.hidden) b.click(); });

  bar.hidden = false;
  apply();
})();
