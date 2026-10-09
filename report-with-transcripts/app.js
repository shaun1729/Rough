(function () {
  'use strict';

  // ---- metric filters: copied from the dashboard's own definitions (metrics.ts) ----
  var has = function (t) { return function (r) { return r.tags.indexOf(t) !== -1; }; };
  var oc = function () { var s = [].slice.call(arguments); return function (r) { return s.indexOf(r.oc) !== -1; }; };
  var and = function (a, b) { return function (r) { return a(r) && b(r); }; };
  var or = function (a, b) { return function (r) { return a(r) || b(r); }; };
  var isType = function (t) { return function (r) { return r.type === t; }; };
  var ALL = function () { return true; };
  var WALKIN = isType('walk-in'), BOOKED = isType('booked');

  var KNOWN_WALKIN = ['seated', 'seated_promptly', 'kept_waiting', 'declined_capacity', 'declined', 'enquiry_only', 'redirected_later', 'booked_later', 'unclear', 'unclear_insufficient', 'unknown', 'walkin_other'];

  var M = {
    total: { t: 'All logged interactions', p: ALL },
    booked: { t: 'Arrived with a booking', p: BOOKED },
    walkin: { t: 'Walked in without a booking', p: WALKIN },
    unclearTy: { t: 'Booking status unclear from the audio', p: isType('unclear'), n: 'The audio gave no clear sign whether these guests had booked. They are left out of both the walk-in and booked groups rather than guessed.' },

    wiSeated: { t: 'Walk-ins seated', p: and(WALKIN, oc('seated', 'seated_promptly')) },
    wiWait: { t: 'Walk-ins asked to wait — outcome never confirmed', p: and(WALKIN, oc('kept_waiting')), n: 'The audio ends without showing whether these guests were eventually seated or left.' },
    wiTurned: { t: 'Walk-ins turned away', p: and(WALKIN, oc('declined_capacity', 'declined')), n: 'Declined because the outlet was full, or for another reason.' },
    wiAsked: { t: 'Walk-ins who only asked, or were told to come back later', p: and(WALKIN, oc('enquiry_only', 'redirected_later', 'booked_later')) },
    wiUnclear: { t: 'Walk-ins with no clear result in the audio', p: and(WALKIN, oc('unclear', 'unclear_insufficient', 'unknown', 'walkin_other')) },
    wiOther: { t: 'Walk-ins — other results', p: and(WALKIN, function (r) { return KNOWN_WALKIN.indexOf(r.oc) === -1; }) },

    pitchExplained: { t: 'Staff explained the offer (walk-ins)', p: and(WALKIN, has('sp_explained')), n: 'Staff described what the dining format includes. Quoting only a price does not count.' },
    pitchAlt: { t: 'Staff offered an alternative (walk-ins)', p: and(WALKIN, has('sp_alt')), n: 'Staff proposed something specific beyond "wait" or "sold out": another slot, another channel, a callback.' },
    pitchGenuine: { t: 'Extra sales effort (walk-ins)', p: and(WALKIN, has('sp_genuine')) },
    pitchNone: { t: 'Walk-ins where no sales pitch was recorded', p: and(WALKIN, function (r) { return !(has('sp_explained')(r) || has('sp_alt')(r) || has('sp_genuine')(r)); }) },

    qPrice: { t: 'Guest asked about price / buffet cost', p: and(WALKIN, has('q_price')) },
    qMenu: { t: 'Guest asked about menu / food variety', p: and(WALKIN, has('q_menu')) },
    qLater: { t: 'Guest asked about booking for later', p: and(WALKIN, has('q_later')) },
    qTable: { t: 'Guest asked about table availability', p: and(WALKIN, has('q_table')) },
    qOffers: { t: 'Guest asked about offers / discounts', p: and(WALKIN, has('q_offers')) },

    bkHonored: { t: 'Booked guests seated as booked', p: and(BOOKED, oc('booked', 'seated', 'seated_promptly')) },
    bkWaiting: { t: 'Booked guests kept waiting or sent elsewhere', p: and(BOOKED, oc('kept_waiting', 'redirected_later')) },
    bkCancel: { t: 'Bookings cancelled', p: and(BOOKED, oc('cancelled', 'cancelled_late')), n: 'Includes bookings cancelled against the outlet\'s late-arrival buffer.' },
    bkOther: { t: 'Booked guests with no clear result in the audio', p: and(BOOKED, oc('unclear', 'unclear_insufficient', 'unknown', 'booked_later', 'declined', 'declined_capacity', 'enquiry_only', 'walkin_other')) },
    bkOccStaff: { t: 'Staff asked about the occasion (booked guests)', p: and(BOOKED, has('sp_occasion_staff')) },
    bkCoaching: { t: 'Staff coached the guest on what rating to give (booked guests)', p: function (r) { return BOOKED(r) && r.fb; }, n: 'Staff steering a guest toward a specific rating rather than asking neutrally how the meal was (the dashboard\'s own definition). Open a row to read the conversation and judge.' },

    crsVerified: { t: 'Matched to a booking in the reservation system', p: function (r) { return r.v === 1; }, n: 'Matched to an arrival logged in Barbeque Nation\'s reservation system for this outlet and date.' }
  };

  var LABELS = { sp_explained: 'Explained offer', sp_alt: 'Alternative offered', sp_genuine: 'Extra effort', sp_occasion_staff: 'Asked occasion', sp_occasion_guest: 'Guest raised occasion', q_price: 'Asked price', q_menu: 'Asked menu', q_later: 'Asked booking for later', q_table: 'Asked table', q_offers: 'Asked offers' };

  var data, rows;
  var sortAsc = false;
  var current = null;

  function count(k) { return rows.filter(M[k].p).length; }
  function fmt(n) { return n.toLocaleString('en-IN'); }
  function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '—'; }
  function n(k) { return '<button type="button" class="num" data-k="' + k + '">' + fmt(count(k)) + '</button>'; }
  function np(k, base) { return n(k) + ' <span class="pct">(' + pct(count(k), count(base)) + ')</span>'; }

  // ---- time helpers (copied from the dashboard's time.ts) ----
  function toSec(h) { var p = h.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
  function stamp(r) {
    if (!r.time) return null;
    var iso = data.dayStartByDayId[r.day_id];
    var ms = iso ? Date.parse(iso) : NaN;
    return (isFinite(ms) ? ms : 0) + toSec(r.time) * 1000;
  }
  function clock(r) {
    var iso = data.dayStartByDayId[r.day_id];
    if (!r.time || !iso) return '—';
    var m = iso.match(/T(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return '—';
    var w = (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + toSec(r.time)) % 86400;
    var h = Math.floor(w / 3600), mi = Math.floor((w % 3600) / 60);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + String(mi).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dlabel(d) { var p = d.split('-'); return parseInt(p[2], 10) + ' ' + MON[parseInt(p[1], 10) - 1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- drill-down ----
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var x = stamp(a), y = stamp(b);
      if (x == null && y == null) return a.n - b.n;
      if (x == null) return 1;
      if (y == null) return -1;
      return (sortAsc ? x - y : y - x) || a.n - b.n;
    });
  }
  function tagsHtml(r) {
    var out = (r.tags || []).filter(function (t) { return LABELS[t]; }).map(function (t) { return '<span class="tag">' + esc(LABELS[t]) + '</span>'; });
    if (r.fb) out.push('<span class="tag alert">Rating coaching</span>');
    return out.join('');
  }
  function crsHtml(r) {
    if (r.v === 1) return '<span class="ok">✓ Matched' + (r.hc ? ' · ' + r.hc + ' guest' + (r.hc === 1 ? '' : 's') : '') + '</span>';
    if (r.v === 0) return '<span class="miss">Not matched</span>';
    return '<span class="miss">—</span>';
  }
  function hms(sec) { sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
  function transcriptHtml(r) {
    if (!r.tr || !r.tr.length) return '';
    return '<div class="transcript"><div class="t-flag">Full conversation this interaction was drawn from. The accented line is the segment the quote was anchored to \u2014 the moment Type and Outcome were judged on.</div>' +
      r.tr.map(function (l) {
        return '<div class="t-line' + (l[3] ? ' anchor' : '') + '"><span class="t-meta">' + esc(l[0]) + ' \u00b7 ' + (typeof l[2] === 'number' ? hms(l[2]) : 'Timing unavailable') + '</span><div class="t-text">' + esc(l[1]) + '</div></div>';
      }).join('') + '</div>';
  }
  function interactionTable(list) {
    var head = '<tr><th>#</th><th>Guest</th><th>Type</th><th>Outcome</th><th>Time</th><th>Summary</th></tr>';
    var body = sorted(list).map(function (r, i) {
      var hot = r.fb || /declin|cancel/i.test(r.oc);
      var summary = r.tr && r.tr.length
        ? '<button type="button" class="summary-toggle" aria-expanded="false"><span class="chev">\u25b8</span><span>' + esc(r.quote) + '</span></button>'
        : '\u201c' + esc(r.quote) + '\u201d';
      return '<tr><td class="idx">' + (i + 1) + '</td><td class="name">Guest ' + (i + 1) + '</td><td class="ty"><span class="tag tag-neutral">' + esc(r.type) + '</span></td>' +
        '<td class="outcome"><span class="tag ' + (hot ? 'tag-accent' : 'tag-outline') + '">' + esc(r.outcome) + '</span>' + (r.fb ? ' <span class="tag tag-accent">Rating coaching</span>' : '') + '</td>' +
        '<td class="num2">' + esc(clock(r)) + '<br><span class="dt">' + esc(dlabel(r.date)) + '</span></td><td class="quote">' + summary + '</td></tr>' +
        '<tr class="ev-detail" hidden><td colspan="6">' + transcriptHtml(r) + '</td></tr>';
    }).join('');
    return '<table class="ev">' + head + body + '</table>';
  }
  function openDrill(title, countLabel, note, html, canSort) {
    document.getElementById('drill-title').textContent = title;
    document.getElementById('drill-count').textContent = countLabel;
    var noteEl = document.getElementById('drill-note');
    noteEl.hidden = !note; noteEl.textContent = note || '';
    document.getElementById('drill-body').innerHTML = html || '<div class="empty">Nothing matched. That is a real zero, not missing data.</div>';
    document.getElementById('sort-btn').hidden = !canSort;
    document.getElementById('drill').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function showMetric(k) {
    current = { kind: 'metric', k: k };
    var list = rows.filter(M[k].p);
    openDrill(M[k].t, fmt(list.length) + ' matching interaction' + (list.length === 1 ? '' : 's'), M[k].n, list.length ? interactionTable(list) : '', list.length > 1);
  }
  function showArrivals() {
    current = { kind: 'arrivals' };
    var hs = data.crsHours.filter(function (h) { return h.arrivals > 0 || h.interactions > 0; }).sort(function (a, b) { return a.hour < b.hour ? -1 : 1; });
    var html = '<table><tr><th>Day and hour</th><th>Bookings arrived</th><th>Guests</th><th>Conversations heard</th><th>Matched</th></tr>' +
      hs.map(function (h) {
        var d = h.hour.slice(0, 10), hr = h.hour.slice(11, 13);
        return '<tr><td>' + esc(dlabel(d)) + ', ' + esc(hr) + ':00</td><td>' + h.arrivals + '</td><td>' + h.arrived_total + '</td><td>' + h.interactions + '</td><td>' + h.verified + '</td></tr>';
      }).join('') + '</table>';
    openDrill('Arrivals in the reservation system, hour by hour', fmt(arrivals()) + ' bookings arrived', 'Each row is one hour at the outlet: what the reservation system says arrived against what the microphones heard.', html, false);
  }
  function showFailed() {
    current = { kind: 'failed' };
    var html = '<table><tr><th>Date</th><th>Slot started</th><th>Attempts</th></tr>' + data.failedWindows.map(function (w) {
      return '<tr><td>' + esc(dlabel(w.date)) + '</td><td>' + esc(String(w.startedAt).replace('T', ' ').slice(0, 16)) + '</td><td>' + w.attempts + '</td></tr>';
    }).join('') + '</table>';
    openDrill('Fifteen-minute slots that could not be analysed', data.failedWindows.length + ' slots', 'The audio is saved. These slots have no result because the AI step did not answer in time.', html, false);
  }
  function arrivals() { return data.crsHours.reduce(function (s, h) { return s + h.arrivals; }, 0); }
  function guests() { return data.crsHours.reduce(function (s, h) { return s + h.arrived_total; }, 0); }

  // ---- the report ----
  function render() {
    var el = document.getElementById('report');
    el.innerHTML =
      '<h1>Ambient Scribe — September 2026</h1>' +
      '<p class="sub">Hyderabad outlet · 1–30 September</p>' +
      '<p class="hint">Every <button type="button" class="num" data-k="total" style="pointer-events:none">number</button> in red can be clicked. It opens the list of interactions behind it.</p>' +

      '<h2>Outlet performance</h2>' +
      '<p>In September the system listened at the front desk all day and picked up ' + n('total') + ' guest conversations. ' + n('walkin') + ' were walk-ins, ' + n('booked') + ' were guests who already had a booking, and for ' + n('unclearTy') + ' we could not tell.</p>' +

      '<h2>Walk-ins: the sales opportunity</h2>' +
      '<p>' + n('walkin') + ' walk-in parties came to the desk.</p><ul>' +
      '<li>' + np('wiSeated', 'walkin') + ' were seated</li>' +
      '<li>' + np('wiWait', 'walkin') + ' were left waiting with no clear result</li>' +
      '<li>' + np('wiTurned', 'walkin') + ' were turned away</li>' +
      '<li>' + np('wiAsked', 'walkin') + ' only asked questions or were told to come back later</li>' +
      '<li>' + np('wiUnclear', 'walkin') + ' had no clear result in the audio</li>' +
      (count('wiOther') ? '<li>' + np('wiOther', 'walkin') + ' had another result</li>' : '') + '</ul>' +

      '<h2>Sales effort by staff</h2><ul>' +
      '<li>Staff explained the offer to ' + np('pitchExplained', 'walkin') + '</li>' +
      '<li>Staff offered an alternative to ' + np('pitchAlt', 'walkin') + '</li>' +
      '<li>Extra sales effort was seen in ' + np('pitchGenuine', 'walkin') + '</li>' +
      '<li>No sales pitch was recorded in ' + np('pitchNone', 'walkin') + ' of walk-in conversations</li></ul>' +

      '<h2>What walk-in guests asked</h2><p class="sub">A guest can ask more than one thing.</p><ul>' +
      '<li>Price / buffet cost: ' + np('qPrice', 'walkin') + '</li>' +
      '<li>Menu / food variety: ' + np('qMenu', 'walkin') + '</li>' +
      '<li>Booking for a later time: ' + np('qLater', 'walkin') + '</li>' +
      '<li>Table availability: ' + np('qTable', 'walkin') + '</li>' +
      '<li>Offers / discounts: ' + np('qOffers', 'walkin') + '</li></ul>' +

      '<h2>Guests with a booking</h2>' +
      '<p>' + n('booked') + ' guests had a booking.</p><ul>' +
      '<li>' + np('bkHonored', 'booked') + ' were seated as booked</li>' +
      '<li>' + np('bkWaiting', 'booked') + ' were kept waiting or sent elsewhere</li>' +
      '<li>' + np('bkCancel', 'booked') + ' cancelled</li>' +
      '<li>' + np('bkOther', 'booked') + ' had no clear result in the audio</li></ul>' +

      '<h2>Staff behaviour (booked guests)</h2><ul>' +
      '<li>Staff asked about a birthday or special occasion in ' + np('bkOccStaff', 'booked') + '</li>' +
      '<li>Staff coached the guest on what rating to give in ' + n('bkCoaching') + ' conversations</li></ul>' +

      '<h2>Audio we could not analyse</h2>' +
      '<p>The day is cut into fifteen-minute slots. <button type="button" class="num" data-k="__failed">' + data.failedWindows.length + '</button> slots could not be analysed. The audio is saved; there is no result for those slots because the AI step did not answer in time.</p>' +

      '<h2>What changed in the system in September</h2>' +
      '<p>We connected to Barbeque Nation\'s own booking system, which tells us who actually arrived. Before this we only had what the microphone heard. It has been running since 20 September.</p><ul>' +
      '<li><button type="button" class="num" data-k="__arrivals">' + fmt(arrivals()) + '</button> bookings arrived, ' + fmt(guests()) + ' guests in all</li>' +
      '<li>' + n('crsVerified') + ' conversations were matched to a booking in that system</li></ul>' +

      '<p class="foot">Audio is not on this page. To listen to an interaction, open it in the Ambient Scribe dashboard (login needed). Guest names and conversation text are left out of this public page.</p>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && b.dataset.k !== 'total' || (b && b.closest('#report') && !b.closest('.hint'))) {
      var k = b.dataset.k;
      if (k === '__failed') return showFailed();
      if (k === '__arrivals') return showArrivals();
      return showMetric(k);
    }
    if (e.target.id === 'close-btn' || e.target.id === 'drill') close();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('.summary-toggle');
    if (!t) return;
    var detail = t.closest('tr').nextElementSibling;
    var open = detail.hidden;
    detail.hidden = !open;
    t.setAttribute('aria-expanded', open);
    t.querySelector('.chev').classList.toggle('open', open);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.getElementById('sort-btn').addEventListener('click', function () {
    sortAsc = !sortAsc;
    this.textContent = 'Sort by time ' + (sortAsc ? '↑' : '↓');
    if (current && current.kind === 'metric') showMetric(current.k);
  });
  function close() { document.getElementById('drill').hidden = true; document.body.style.overflow = ''; }

  fetch('data.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    data = d; rows = d.rows; render();
    window.__counts = Object.keys(M).reduce(function (o, k) { o[k] = count(k); return o; }, {});
  }).catch(function () {
    document.getElementById('report').innerHTML = '<p>The report data could not be loaded. Refresh the page, and sign in again if asked.</p>';
  });
})();
