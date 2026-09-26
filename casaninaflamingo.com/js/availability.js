/* ============================================================================
   Casa Nina Flamingo — availability calendar (book.html)

   · Fetches /api/availability (see api/availability.js). Blocked ranges are
     [start, end) with the end exclusive, so a guest may check in on the day
     another party checks out.
   · Three states, all shown honestly in the note under the calendar:
       live          feed connected: booked nights are dimmed
       connecting    no feed yet (status "unconfigured"/"error", or the request
                     fails): every date shows as open and the note says the
                     live calendar is being connected
       demo          book.html?demo=1 renders sample bookings so the design
                     can be reviewed before the feed exists (never on by default)
   · Picking a start and end date fills #checkin / #checkout in the form, and
     typing dates into the form highlights them here.
   · Two months side by side from 760px up, one below. Past dates disabled.
   No dependencies.
   ============================================================================ */
(function(){
  'use strict';

  var root = document.getElementById('availability-calendar');
  if (!root) return;

  var endpoint   = root.getAttribute('data-endpoint') || '/api/availability';
  var monthsEl   = root.querySelector('[data-cal-months]');
  var noteEl     = root.querySelector('[data-cal-note]');
  var pickEl     = root.querySelector('[data-cal-pick]');
  var prevBtn    = root.querySelector('[data-cal-prev]');
  var nextBtn    = root.querySelector('[data-cal-next]');
  var badgeEl    = root.querySelector('[data-cal-badge]');
  var checkinEl  = document.getElementById('checkin');
  var checkoutEl = document.getElementById('checkout');
  var MIN_NIGHTS = 4;

  var NOTES = {
    live:       'Availability is refreshed a few times a day from our booking calendar. Every request is confirmed personally by our team.',
    connecting: 'Live availability is being connected. Choose your dates and our team will confirm them personally, usually the same day.',
    demo:       'Sample availability for design review. Live dates appear here once the booking calendar is connected.'
  };

  var today = stripTime(new Date());
  var view  = new Date(today.getFullYear(), today.getMonth(), 1);   // first visible month
  var blocked = [];                                                  // [[Date start, Date end), ...]
  var selStart = null, selEnd = null;

  /* ---------- helpers ---------- */
  function stripTime(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function fromIso(s){ var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n){ var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameDay(a, b){ return a && b && a.getTime() === b.getTime(); }
  function nightsBetween(a, b){ return Math.round((b - a) / 86400000); }
  function isBlockedNight(d){                       /* is the night starting on d unavailable? */
    for (var i = 0; i < blocked.length; i++){ if (d >= blocked[i][0] && d < blocked[i][1]) return true; }
    return false;
  }
  function rangeHasBlockedNight(a, b){ for (var d = new Date(a); d < b; d = addDays(d, 1)){ if (isBlockedNight(d)) return true; } return false; }
  function monthsVisible(){ return window.matchMedia('(min-width: 760px)').matches ? 2 : 1; }
  var fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  var fmtLong  = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  var fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  var WEEKDAYS = ['S','M','T','W','T','F','S'];

  /* ---------- render ---------- */
  function render(){
    monthsEl.innerHTML = '';
    var n = monthsVisible();
    for (var i = 0; i < n; i++){
      monthsEl.appendChild(renderMonth(new Date(view.getFullYear(), view.getMonth() + i, 1)));
    }
    prevBtn.disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    updatePick();
  }

  function renderMonth(first){
    var wrap = document.createElement('div'); wrap.className = 'avail__month';
    var h = document.createElement('h3'); h.className = 'avail__title'; h.textContent = fmtMonth.format(first); wrap.appendChild(h);

    var grid = document.createElement('div'); grid.className = 'avail__grid'; grid.setAttribute('role', 'grid');
    WEEKDAYS.forEach(function(w){ var c = document.createElement('span'); c.className = 'avail__wd'; c.textContent = w; grid.appendChild(c); });

    var lead = first.getDay();                                  /* Sunday-first, matching the audience's calendars */
    for (var i = 0; i < lead; i++){ var pad_ = document.createElement('span'); pad_.className = 'avail__pad'; grid.appendChild(pad_); }

    var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= days; d++){
      var date = new Date(first.getFullYear(), first.getMonth(), d);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'avail__day';
      b.textContent = d; b.setAttribute('data-date', iso(date));
      var past = date < today, blockedNight = isBlockedNight(date);
      var label = fmtLong.format(date);
      if (past){ b.disabled = true; b.classList.add('is-past'); }
      else if (blockedNight){ b.classList.add('is-blocked'); label += ', booked'; }
      if (sameDay(date, today)) b.classList.add('is-today');
      if (selStart && sameDay(date, selStart)) b.classList.add('is-start');
      if (selEnd && sameDay(date, selEnd)) b.classList.add('is-end');
      if (selStart && selEnd && date > selStart && date < selEnd) b.classList.add('is-range');
      if (selStart && !selEnd && sameDay(date, selStart)) b.setAttribute('aria-pressed', 'true');
      b.setAttribute('aria-label', label);
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /* ---------- selection ---------- */
  function onDayClick(e){
    var btn = e.target.closest('.avail__day'); if (!btn || btn.disabled) return;
    var date = fromIso(btn.getAttribute('data-date'));
    if (!selStart || selEnd || date <= selStart){
      /* first click, or restarting: check-in cannot be a booked night */
      if (btn.classList.contains('is-blocked')){ say('That night is already booked. Choose another check-in date.'); return; }
      selStart = date; selEnd = null; clearInputs(); render(); return;
    }
    /* second click = check-out (that day itself may be someone else's check-in) */
    if (rangeHasBlockedNight(selStart, date)){ say('Those dates include a booked night. Try a shorter stay or a different start.'); return; }
    selEnd = date; render(); writeInputs();
  }

  function updatePick(){
    if (selStart && selEnd){
      var n = nightsBetween(selStart, selEnd);
      var text = fmtShort.format(selStart) + ' \u2192 ' + fmtShort.format(selEnd) + ' \u00b7 ' + n + (n === 1 ? ' night' : ' nights');
      if (n < MIN_NIGHTS) text += ' \u00b7 four-night minimum';
      pickEl.textContent = text; pickEl.hidden = false;
    } else if (selStart){
      pickEl.textContent = 'Check-in ' + fmtShort.format(selStart) + '. Now choose your check-out date.'; pickEl.hidden = false;
    } else { pickEl.hidden = true; pickEl.textContent = ''; }
  }
  function say(msg){ pickEl.textContent = msg; pickEl.hidden = false; }

  function writeInputs(){
    if (checkinEl)  checkinEl.value  = iso(selStart);
    if (checkoutEl) checkoutEl.value = iso(selEnd);
  }
  function clearInputs(){ if (checkinEl) checkinEl.value = ''; if (checkoutEl) checkoutEl.value = ''; }

  /* typed dates in the form reflect back onto the calendar */
  function fromInputs(){
    var a = checkinEl && checkinEl.value ? fromIso(checkinEl.value) : null;
    var b = checkoutEl && checkoutEl.value ? fromIso(checkoutEl.value) : null;
    if (a && b && b > a){ selStart = a; selEnd = b; view = new Date(a.getFullYear(), a.getMonth(), 1); }
    else if (a){ selStart = a; selEnd = null; view = new Date(a.getFullYear(), a.getMonth(), 1); }
    render();
  }

  /* ---------- data ---------- */
  function setState(state){
    root.setAttribute('data-state', state);
    noteEl.textContent = NOTES[state];
    if (badgeEl) badgeEl.hidden = state !== 'demo';
  }

  function sampleBlocked(){
    /* Relative to today so the review never goes stale: a few stays over the next three months. */
    var m = today.getMonth(), y = today.getFullYear();
    function r(mo, d1, d2){ return [new Date(y, m + mo, d1), new Date(y, m + mo, d2)]; }
    return [r(0, 24, 29), r(1, 3, 9), r(1, 15, 20), r(2, 1, 8), r(2, 22, 27)];
  }

  function load(){
    if (/[?&]demo=1/.test(location.search)){ blocked = sampleBlocked(); setState('demo'); render(); return; }
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function(){ ctrl.abort(); }, 4000);
    fetch(endpoint, { signal: ctrl && ctrl.signal })
      .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){
        clearTimeout(timer);
        if (data && data.status === 'live' && Array.isArray(data.blocked)){
          blocked = data.blocked.map(function(p){ return [fromIso(p[0]), fromIso(p[1])]; });
          setState('live');
        } else { setState('connecting'); }
        render();
      })
      .catch(function(){ clearTimeout(timer); setState('connecting'); render(); });
  }

  /* ---------- wire up ---------- */
  monthsEl.addEventListener('click', onDayClick);
  prevBtn.addEventListener('click', function(){ view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
  nextBtn.addEventListener('click', function(){ view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
  if (checkinEl)  checkinEl.addEventListener('change', fromInputs);
  if (checkoutEl) checkoutEl.addEventListener('change', fromInputs);
  var mq = window.matchMedia('(min-width: 760px)');
  (mq.addEventListener ? mq.addEventListener('change', render) : mq.addListener(render));

  setState('connecting'); render(); load();
})();
