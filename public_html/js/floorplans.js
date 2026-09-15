/* ============================================================================
   Casa Nina Flamingo — floor-plan explorer (the-casa.html)

   Renders into #floorplans-explorer (the .fp div inside the #floorplans section). Three floors from the architect's plans, a
   Full Casa / Half Casa mode switch, and a hotspot per room. Everything a
   hotspot says comes from the plans themselves or copy already on the site;
   bed sizes are deliberately absent until the client confirms them (see the
   FAQ's [[BED_CONFIGURATIONS]] token).

   Hotspot coordinates are percentages of each plan image, so the images can
   be swapped for higher-resolution exports without touching this file as
   long as the framing stays the same.
   No dependencies.
   ============================================================================ */
(function(){
  'use strict';

  var root = document.getElementById('floorplans-explorer') || document.querySelector('.fp');
  if (!root) return;

  var BOOK = 'book.html?option={mode}#availability';

  /* x,y in source pixels of the supplied plans (640 wide); converted to % below */
  var FLOORS = [
    { id: 'third', short: 'Rooftop', label: 'Third floor', title: 'The rooftop suite',
      img: 'images/floorplans/floor-3.jpg', w: 640, h: 382, half: false, dy: -20,
      stats: '1 bedroom suite \u00b7 1.5 bathrooms \u00b7 rooftop terrace',
      rooms: [
        { n: 'Bedroom 7',  x: 170, y: 118, t: 'Top-floor suite with its own bathroom.' },
        { n: 'Bathroom 5', x: 44,  y: 92,  t: 'Full bathroom adjoining Bedroom 7.' },
        { n: 'Rooftop terrace', x: 456, y: 152, t: 'Most of the roof is open terrace: sunset panoramas over the bay, with room for the whole group at once.' },
        { n: 'Elevator',   x: 300, y: 322, t: 'The private elevator arrives on every floor.' },
        { n: 'WC 2',       x: 364, y: 326, t: 'Powder room beside the terrace.' }
      ]},
    { id: 'second', short: 'Second', label: 'Second floor', title: 'The second living unit',
      img: 'images/floorplans/floor-2.jpg', w: 640, h: 284, half: false, dy: -13,
      stats: '3 bedrooms \u00b7 2 bathrooms \u00b7 kitchen & living room \u00b7 balcony',
      rooms: [
        { n: 'Balcony',       x: 290, y: 18,  t: 'Full-width balcony off the living room, one floor closer to the view.' },
        { n: 'Bedroom 4',     x: 108, y: 94,  t: 'Suite with a walk-in closet and Bathroom 3 alongside.' },
        { n: 'Bathroom 3',    x: 28,  y: 94,  t: 'Full bathroom for Bedroom 4.' },
        { n: 'Walk-in closet', x: 120, y: 160, t: 'Bedroom 4\u2019s walk-in closet.' },
        { n: 'Living Room 2', x: 264, y: 116, t: 'The second living unit\u2019s own living room, opening onto the balcony.' },
        { n: 'Kitchen 2',     x: 384, y: 116, t: 'A second full kitchen with island. Two kitchens mean two groups can cook at once.' },
        { n: 'Dining area',   x: 294, y: 202, t: 'Dining for this floor, beside the kitchen.' },
        { n: 'Bedroom 5',     x: 458, y: 98,  t: 'Guest bedroom.' },
        { n: 'Bathroom 4',    x: 524, y: 98,  t: 'Full bathroom between Bedrooms 5 and 6.' },
        { n: 'Bedroom 6',     x: 590, y: 98,  t: 'Guest bedroom at the end of the hall.' },
        { n: 'Elevator',      x: 196, y: 246, t: 'The private elevator arrives on every floor.' },
        { n: 'Laundry 2',     x: 236, y: 258, t: 'This floor\u2019s laundry room.' }
      ]},
    { id: 'first', short: 'First', label: 'First floor', title: 'The Half Casa', tag: 'Half Casa',
      img: 'images/floorplans/floor-1.jpg', w: 640, h: 402, half: true, dy: -13,
      stats: '3 bedrooms \u00b7 2.5 bathrooms \u00b7 kitchen & living room \u00b7 pool & patio \u00b7 own entrance',
      rooms: [
        { n: 'Infinity pool', x: 300, y: 82,  t: 'The private infinity pool, looking out over the Pacific.' },
        { n: 'Patio',         x: 302, y: 152, t: 'The patio runs the full length of the pool, straight off the living room.' },
        { n: 'Entryway',      x: 156, y: 302, t: 'The Half Casa\u2019s own front door.' },
        { n: 'Bedroom 1',     x: 152, y: 214, t: 'First-floor suite with a walk-in closet and Bathroom 1 alongside.' },
        { n: 'Bathroom 1',    x: 88,  y: 214, t: 'Full bathroom for Bedroom 1.' },
        { n: 'Walk-in closet', x: 160, y: 264, t: 'Bedroom 1\u2019s walk-in closet.' },
        { n: 'WC 1',          x: 88,  y: 155, t: 'Powder room by the pool, so nobody drips through the house.' },
        { n: 'Living Room 1', x: 280, y: 230, t: 'Open living room with sliding doors to the patio and pool.' },
        { n: 'Kitchen 1',     x: 376, y: 230, t: 'Full kitchen with island.' },
        { n: 'Dining area',   x: 304, y: 302, t: 'Dining for the whole floor.' },
        { n: 'Bedroom 2',     x: 440, y: 221, t: 'Guest bedroom.' },
        { n: 'Bathroom 2',    x: 492, y: 221, t: 'Full bathroom between Bedrooms 2 and 3.' },
        { n: 'Bedroom 3',     x: 548, y: 221, t: 'Guest bedroom at the end of the hall.' },
        { n: 'Elevator',      x: 224, y: 338, t: 'The private elevator connects all three floors.' },
        { n: 'Laundry 1',     x: 257, y: 338, t: 'This floor\u2019s laundry room.' }
      ]}
  ];

  var SUMMARY = {
    full: { h: 'The Full Casa', s: '7 bedrooms \u00b7 6 bathrooms \u00b7 sleeps 14', t: 'All three floors: two independent living units with their own kitchens, the rooftop suite and terrace, the pool, and the elevator between them.' },
    half: { h: 'The Half Casa', s: '3 bedrooms \u00b7 2.5 bathrooms \u00b7 sleeps 4 to 6', t: 'The whole first floor: your own entrance, kitchen, living and dining room, three bedrooms, and the pool and patio. The upper floors stay empty; the rest of the villa is never rented at the same time.' }
  };

  var mode = 'full', current = 'first', activeRoom = null;

  /* ---------- build ---------- */
  root.innerHTML =
    '<div class="fp__side">' +
      '<div class="fp__mode" role="group" aria-label="Which stay">' +
        '<button type="button" class="fp__modebtn is-on" data-mode="full" aria-pressed="true">Full Casa</button>' +
        '<button type="button" class="fp__modebtn" data-mode="half" aria-pressed="false">Half Casa</button>' +
      '</div>' +
      '<div class="fp__stack" role="tablist" aria-label="Floors"></div>' +
    '</div>' +
    '<div class="fp__summary" aria-live="polite"></div>' +
    '<a class="xp-btn xp-btn--solid fp__cta" href="' + BOOK.replace('{mode}', 'full') + '">Check availability</a>' +
    '<div class="fp__main">' +
      '<div class="fp__planhead"><h3 class="fp__title"></h3><p class="fp__stats"></p></div>' +
      '<div class="fp__plan"><div class="fp__canvas"><img class="fp__img" alt="" decoding="async"><div class="fp__spots"></div></div></div>' +
      '<p class="fp__caption" aria-live="polite"></p>' +
      '<div class="fp__rooms" aria-label="Rooms on this floor"></div>' +
    '</div>';

  var stackEl = root.querySelector('.fp__stack'), summaryEl = root.querySelector('.fp__summary'), ctaEl = root.querySelector('.fp__cta');
  var titleEl = root.querySelector('.fp__title'), statsEl = root.querySelector('.fp__stats');
  var imgEl = root.querySelector('.fp__img'), spotsEl = root.querySelector('.fp__spots'), capEl = root.querySelector('.fp__caption'), roomsEl = root.querySelector('.fp__rooms');

  FLOORS.forEach(function(f){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fp__floor'; b.setAttribute('role', 'tab'); b.setAttribute('data-floor', f.id);
    b.innerHTML = '<span class="fp__floor-label"><span class="fp__floor-long">' + f.label + '</span><span class="fp__floor-short">' + f.short + '</span>' + (f.tag ? ' <span class="xp-chip fp__chip">' + f.tag + '</span>' : '') + '</span>' +
                  '<span class="fp__floor-title">' + f.title + '</span>' +
                  '<span class="fp__floor-stats">' + f.stats + '</span>' +
                  '<span class="fp__floor-excl">Full Casa only</span>';
    b.addEventListener('click', function(){ if (!b.classList.contains('is-excluded')) selectFloor(f.id); });
    stackEl.appendChild(b);
  });

  root.querySelectorAll('.fp__modebtn').forEach(function(b){ b.addEventListener('click', function(){ setMode(b.getAttribute('data-mode')); }); });

  function floor(id){ for (var i = 0; i < FLOORS.length; i++) if (FLOORS[i].id === id) return FLOORS[i]; }

  function setMode(m){
    mode = m;
    root.setAttribute('data-mode', m);
    root.querySelectorAll('.fp__modebtn').forEach(function(b){ var on = b.getAttribute('data-mode') === m; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    root.querySelectorAll('.fp__floor').forEach(function(b){ var f = floor(b.getAttribute('data-floor')); b.classList.toggle('is-excluded', m === 'half' && !f.half); });
    var s = SUMMARY[m];
    summaryEl.innerHTML = '<span class="fp__sum-h">' + s.h + '</span><span class="fp__sum-s">' + s.s + '</span><span class="fp__sum-t">' + s.t + '</span>';
    ctaEl.href = BOOK.replace('{mode}', m);
    if (m === 'half' && !floor(current).half) selectFloor('first');
  }

  function selectFloor(id){
    current = id; activeRoom = null;
    var f = floor(id);
    root.querySelectorAll('.fp__floor').forEach(function(b){ var on = b.getAttribute('data-floor') === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    titleEl.textContent = f.label + ' \u00b7 ' + f.title;
    statsEl.textContent = f.stats;
    imgEl.src = f.img; imgEl.width = f.w; imgEl.height = f.h;
    imgEl.alt = 'Architectural floor plan of the ' + f.label.toLowerCase() + ' of Casa Nina Flamingo';
    spotsEl.innerHTML = ''; roomsEl.innerHTML = '';
    f.rooms.forEach(function(r, i){
      var spot = document.createElement('button'); spot.type = 'button'; spot.className = 'fp__spot';
      var y = Math.max(8, r.y + (f.dy || 0));                         /* dy lifts the dot off the plan's own label; clamp keeps top-edge rooms inside */
      spot.style.left = (r.x / f.w * 100).toFixed(2) + '%'; spot.style.top = (y / f.h * 100).toFixed(2) + '%';
      spot.setAttribute('data-room', i); spot.setAttribute('aria-label', r.n);
      spot.innerHTML = '<span class="fp__tip">' + r.n + '</span>';
      spotsEl.appendChild(spot);
      var pill = document.createElement('button'); pill.type = 'button'; pill.className = 'fp__room'; pill.textContent = r.n; pill.setAttribute('data-room', i);
      roomsEl.appendChild(pill);
    });
    capEl.textContent = 'Tap a room to read about it.'; capEl.classList.add('is-idle');
  }

  function setRoom(i){
    var f = floor(current), r = f.rooms[i];
    activeRoom = i;
    root.querySelectorAll('[data-room]').forEach(function(el){ el.classList.toggle('is-on', el.getAttribute('data-room') === String(i)); });
    capEl.innerHTML = '<strong>' + r.n + '</strong> ' + r.t; capEl.classList.remove('is-idle');
  }
  root.addEventListener('click', function(e){ var el = e.target.closest('[data-room]'); if (el) setRoom(+el.getAttribute('data-room')); });

  setMode('full'); selectFloor('first');
})();
