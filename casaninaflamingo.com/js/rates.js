/* ============================================================================
   Casa Nina Flamingo — rates page (rates.html)

   Marks today's season: a "Now" chip on the matching season card and the
   Today line on the year strip. Seasons, by date:
     Holiday  December 17 – January 7
     High     January 8 – May 31, November 1 – December 16
     Quiet    June 1 – August 31
     Green    September 1 – October 31
   Without JavaScript the page reads the same, minus the two markers.
   ES5, no dependencies.
   ============================================================================ */
(function () {
  'use strict';
  var now = new Date();
  var m = now.getMonth() + 1, d = now.getDate();

  var season = 'high';
  if ((m === 12 && d >= 17) || (m === 1 && d <= 7)) season = 'holiday';
  else if (m >= 6 && m <= 8) season = 'quiet';
  else if (m === 9 || m === 10) season = 'green';

  var card = document.querySelector('.season-card[data-season="' + season + '"]');
  if (card) {
    var chip = document.createElement('span');
    chip.className = 'xp-chip';
    chip.textContent = 'Now';
    card.insertBefore(chip, card.firstChild);
  }

  /* The strip is drawn on a 365-day year; place today on it. */
  var marker = document.querySelector('.season-bar__now');
  if (marker) {
    var start = Date.UTC(now.getFullYear(), 0, 1);
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var day = Math.min(Math.round((today - start) / 864e5), 364);
    marker.style.left = ((day + 0.5) / 365 * 100).toFixed(2) + '%';
    marker.hidden = false;
  }
})();
