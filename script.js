(() => {
  'use strict';

  /* ============================================================
     SCHEDULE DATA
     ============================================================ */

  const BELL_SEC = 8 * 3600 + 40 * 60;        // 8:40 AM — first bell
  const SCHOOL_END_SEC = 15 * 3600 + 38 * 60; // 3:38 PM — dismissal

  const toSec = (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 3600 + m * 60;
  };

  // Same clock times every day; only the block numbers change between A/B.
  const PERIODS = [
    { kind: 'hive',   start: '8:50',  end: '9:05' },
    { kind: 'switch', start: '9:05',  end: '9:10' },
    { kind: 'block',  start: '9:10',  end: '10:36', labelA: '1st Block', labelB: '5th Block' },
    { kind: 'switch', start: '10:36', end: '10:41' },
    { kind: 'block',  start: '10:41', end: '12:07', labelA: '2nd Block', labelB: '6th Block' },
    { kind: 'switch', start: '12:07', end: '12:12' },
    { kind: 'block',  start: '12:12', end: '14:07', labelA: '3rd Block', labelB: '7th Block' },
    { kind: 'switch', start: '14:07', end: '14:12' },
    { kind: 'block',  start: '14:12', end: '15:38', labelA: '4th Block', labelB: '8th Block' },
  ].map(p => ({ ...p, startSec: toSec(p.start), endSec: toSec(p.end) }));

  const FIRST_PERIOD_START = PERIODS[0].startSec;

  function periodLabel(p, dayType) {
    if (p.kind === 'switch') return 'Switch Time';
    if (p.kind === 'hive') return 'HIVE / 9th Block';
    return dayType === 'A' ? p.labelA : p.labelB;
  }

  /* ============================================================
     CYCLE DAY (A/B) DETERMINATION
     ============================================================ */

  const CYCLE_API_URL = 'https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/20277/cms/pages/cycle-day-dates';

  // Fallback per instructions: if the API can't tell us, today (Sep 9, 2026) is a B Day.
  const FALLBACK_ANCHOR = new Date(2026, 8, 9);
  const FALLBACK_ANCHOR_TYPE = 'B';

  let apiData = null; // { start, end, excluded: Set<'YYYY-MM-DD'> }
  const dayTypeCache = new Map();

  const pad = (n) => String(n).padStart(2, '0');
  const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isWeekend = (d) => { const w = d.getDay(); return w === 0 || w === 6; };
  const sameDate = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  function atSec(dateRef, sec) {
    const d = new Date(dateRef.getFullYear(), dateRef.getMonth(), dateRef.getDate());
    d.setSeconds(sec);
    return d;
  }

  function secOfDay(d) { return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); }

  function parseMMDDYYYY(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }

  function findTableHTML(obj) {
    if (obj && typeof obj === 'object') {
      if (obj.table && typeof obj.table.content === 'string') return obj.table.content;
      for (const key in obj) {
        const found = findTableHTML(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }

  function parseSettingsTable(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const map = {};
    doc.querySelectorAll('tr').forEach((row, i) => {
      if (i === 0) return; // header row
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const key = cells[0].textContent.trim();
        const val = cells[1].textContent.trim();
        if (key) map[key] = val;
      }
    });
    return map;
  }

  function fetchWithTimeout(url, ms) {
    return new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, ms);
      fetch(url, { signal: ctrl.signal })
        .then((r) => { clearTimeout(timer); resolve(r); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  async function loadCycleData() {
    try {
      const res = await fetchWithTimeout(CYCLE_API_URL, 5000);
      if (!res.ok) throw new Error('bad status');
      const json = await res.json();
      const tableHTML = findTableHTML(json);
      if (!tableHTML) throw new Error('no table found');
      const map = parseSettingsTable(tableHTML);
      const start = parseMMDDYYYY(map['cycle_day_start_date']);
      const end = parseMMDDYYYY(map['cycle_day_end_date']);
      if (!start || !end) throw new Error('bad date range');
      const excludedRaw = map['cycle_day_excluded_dates'] || '';
      const excluded = new Set(
        excludedRaw.split(',').map((s) => s.trim()).filter(Boolean)
          .map((s) => { const d = parseMMDDYYYY(s); return d ? dateKey(d) : null; })
          .filter(Boolean)
      );
      apiData = { start: stripTime(start), end: stripTime(end), excluded };
    } catch (err) {
      apiData = null; // silently fall back to manual calculation
    }
  }

  // Returns 'A' | 'B' | null (no school) | 'OUT_OF_RANGE'
  function computeDayTypeFromAPI(date) {
    if (!apiData) return 'OUT_OF_RANGE';
    if (date < apiData.start || date > apiData.end) return 'OUT_OF_RANGE';
    if (isWeekend(date)) return null;
    if (apiData.excluded.has(dateKey(date))) return null;
    let counter = 0;
    const cursor = new Date(apiData.start);
    while (cursor <= date) {
      if (!isWeekend(cursor) && !apiData.excluded.has(dateKey(cursor))) counter++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return counter % 2 === 1 ? 'A' : 'B';
  }

  function fallbackDayType(date) {
    if (isWeekend(date)) return null;
    if (sameDate(date, FALLBACK_ANCHOR)) return FALLBACK_ANCHOR_TYPE;
    let type = FALLBACK_ANCHOR_TYPE;
    let cursor = new Date(FALLBACK_ANCHOR);
    const forward = date > FALLBACK_ANCHOR;
    let guard = 0;
    while (!sameDate(cursor, date) && guard < 4000) {
      cursor = addDays(cursor, forward ? 1 : -1);
      if (!isWeekend(cursor)) type = (type === 'A') ? 'B' : 'A';
      guard++;
    }
    return type;
  }

  function getDayType(rawDate) {
    const date = stripTime(rawDate);
    const key = dateKey(date);
    if (dayTypeCache.has(key)) return dayTypeCache.get(key);
    let result = computeDayTypeFromAPI(date);
    if (result === 'OUT_OF_RANGE') result = isWeekend(date) ? null : fallbackDayType(date);
    dayTypeCache.set(key, result);
    return result;
  }

  function nextSchoolDay(fromDate, offsetDays) {
    let d = addDays(fromDate, offsetDays);
    let guard = 0;
    while (getDayType(d) === null && guard < 60) { d = addDays(d, 1); guard++; }
    return d;
  }

  /* ============================================================
     STATUS DETERMINATION
     ============================================================ */

  function getStatus(now) {
    const dayType = getDayType(now);
    if (dayType === null) return { state: 'noschool', dayType: null };

    const nowSec = secOfDay(now);
    if (nowSec < BELL_SEC) return { state: 'beforeschool', dayType };
    if (nowSec < FIRST_PERIOD_START) return { state: 'arrival', dayType };
    if (nowSec >= SCHOOL_END_SEC) return { state: 'afterschool', dayType };

    for (const p of PERIODS) {
      if (nowSec >= p.startSec && nowSec < p.endSec) {
        return { state: p.kind, dayType, period: p, startSec: p.startSec, endSec: p.endSec };
      }
    }
    return { state: 'afterschool', dayType };
  }

  /* ============================================================
     FORMATTING HELPERS
     ============================================================ */

  function formatRelative(deltaSec) {
    const abs = Math.round(Math.abs(deltaSec));
    if (abs < 1) return 'Now';
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    let parts;
    if (h > 0) {
      parts = [`${h} hour${h !== 1 ? 's' : ''}`];
      if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
    } else if (m > 0) {
      parts = [`${m} minute${m !== 1 ? 's' : ''}`];
    } else {
      parts = [`${s} second${s !== 1 ? 's' : ''}`];
    }
    const joined = parts.join(' ');
    return deltaSec > 0 ? `in ${joined}` : `${joined} ago`;
  }

  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function chipTooltipText(role, deltaSec) {
    if (Math.abs(deltaSec) < 1) return 'Now';
    const rel = formatRelative(deltaSec);
    if (role === 'start' && deltaSec < 0) return `Started ${rel}`;
    return capFirst(rel);
  }

  function formatTimeShort(sec) {
    let h = Math.floor(sec / 3600) % 24;
    const m = Math.floor((sec % 3600) / 60);
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${pad(m)}`;
  }

  function formatClock12NoSeconds(date) {
    let h = date.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(date.getMinutes())} ${ampm}`;
  }

  function formatWeekdayDateShort(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function formatTargetLabel(now, target) {
    const sameDay = sameDate(now, target);
    const tomorrow = sameDate(addDays(now, 1), target);
    const dayPhrase = sameDay ? 'Today' : tomorrow ? 'Tomorrow' : formatWeekdayDateShort(target);
    if (secOfDay(target) === 0) return dayPhrase;
    return `${dayPhrase} at ${formatClock12NoSeconds(target)}`;
  }

  function formatDuration(deltaSec) {
    const sec = Math.max(0, Math.round(deltaSec));
    const days = Math.floor(sec / 86400);
    const rem = sec % 86400;
    const hh = Math.floor(rem / 3600);
    const mm = Math.floor((rem % 3600) / 60);
    const ss = rem % 60;
    return days > 0 ? `${days}d ${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  }

  function formatCountdownClock(deltaSec) {
    const sec = Math.max(0, Math.round(deltaSec));
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }

  function chip(now, sec, role, text) {
    const ts = atSec(now, sec).getTime();
    return `<button type="button" class="chip" data-ts="${ts}" data-role="${role}">${text}</button>`;
  }

  /* ============================================================
     DOM REFERENCES
     ============================================================ */

  const els = {};
  function cacheDom() {
    els.headerDayPill = document.getElementById('header-day-pill');
    els.headerDate = document.getElementById('header-date');
    els.headerClock = document.getElementById('header-clock');

    els.heroH = document.getElementById('hero-h');
    els.heroM = document.getElementById('hero-m');
    els.heroS = document.getElementById('hero-s');
    els.heroAmpm = document.getElementById('hero-ampm');
    els.heroDate = document.getElementById('hero-date');
    els.heroYear = document.getElementById('hero-year');
    els.statusCard = document.getElementById('status-card');

    els.tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    els.panels = {
      clock: document.getElementById('panel-clock'),
      schedule: document.getElementById('panel-schedule'),
      countdowns: document.getElementById('panel-countdowns'),
    };

    els.toggleA = document.getElementById('toggle-a');
    els.toggleB = document.getElementById('toggle-b');
    els.scheduleNote = document.getElementById('schedule-note');
    els.scheduleList = document.getElementById('schedule-list');

    els.cdBellTimer = document.getElementById('cd-bell-timer');
    els.cdBellSubtitle = document.getElementById('cd-bell-subtitle');
    els.cdEndTimer = document.getElementById('cd-end-timer');
    els.cdEndSubtitle = document.getElementById('cd-end-subtitle');
    els.cdNextTimer = document.getElementById('cd-next-timer');
    els.cdNextSubtitle = document.getElementById('cd-next-subtitle');
    els.cdWeekendTitle = document.getElementById('cd-weekend-title');
    els.cdWeekendTimer = document.getElementById('cd-weekend-timer');
    els.cdWeekendSubtitle = document.getElementById('cd-weekend-subtitle');

    els.tooltip = document.getElementById('tooltip');
  }

  /* ============================================================
     STATE
     ============================================================ */

  let activeTab = 'clock';
  let selectedView = null;
  let lastStatusBuildKey = null;
  let lastScheduleBuildKey = null;
  let currentChip = null;
  let tooltipInterval = null;

  /* ============================================================
     TOOLTIP
     ============================================================ */

  function positionAndFillTooltip() {
    if (!currentChip || !document.body.contains(currentChip)) { hideTooltip(); return; }
    const ts = Number(currentChip.dataset.ts);
    const role = currentChip.dataset.role;
    const delta = (ts - Date.now()) / 1000;
    els.tooltip.textContent = chipTooltipText(role, delta);
    const rect = currentChip.getBoundingClientRect();
    els.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    els.tooltip.style.top = `${rect.top}px`;
  }

  function showTooltip(chipEl) {
    currentChip = chipEl;
    positionAndFillTooltip();
    els.tooltip.classList.add('visible');
    if (tooltipInterval) clearInterval(tooltipInterval);
    tooltipInterval = setInterval(positionAndFillTooltip, 1000);
  }

  function hideTooltip() {
    currentChip = null;
    els.tooltip.classList.remove('visible');
    if (tooltipInterval) { clearInterval(tooltipInterval); tooltipInterval = null; }
  }

  function attachTooltipDelegation() {
    document.addEventListener('mouseover', (e) => {
      const c = e.target.closest('.chip');
      if (c) showTooltip(c);
    });
    document.addEventListener('mouseout', (e) => {
      const c = e.target.closest('.chip');
      if (c && !c.contains(e.relatedTarget)) hideTooltip();
    });
    document.addEventListener('focusin', (e) => {
      const c = e.target.closest('.chip');
      if (c) showTooltip(c);
    });
    document.addEventListener('focusout', (e) => {
      const c = e.target.closest('.chip');
      if (c) hideTooltip();
    });
  }

  /* ============================================================
     RENDER: HEADER
     ============================================================ */

  function renderHeader(now, dayType) {
    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    els.headerClock.textContent = `${h}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
    els.headerDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    els.headerDayPill.textContent = dayType === 'A' ? 'A Day' : dayType === 'B' ? 'B Day' : 'No School';
    els.headerDayPill.className = 'day-pill ' + (dayType === 'A' ? 'a' : dayType === 'B' ? 'b' : 'none');
  }

  /* ============================================================
     RENDER: CLOCK TAB
     ============================================================ */

  function renderClockTab(now, status) {
    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    els.heroH.textContent = h;
    els.heroM.textContent = pad(now.getMinutes());
    els.heroS.textContent = pad(now.getSeconds());
    els.heroAmpm.textContent = ampm;
    els.heroDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    els.heroYear.textContent = String(now.getFullYear());

    const key = `${status.state}|${status.period ? PERIODS.indexOf(status.period) : ''}|${dateKey(now)}`;
    if (key !== lastStatusBuildKey) {
      buildStatusStructure(now, status);
      lastStatusBuildKey = key;
    }
    updateStatusLiveText(now, status);
  }

  function buildStatusStructure(now, status) {
    let html = '';
    let cls = 'status-card';

    if (status.state === 'beforeschool') {
      cls += ' kind-before';
      html = `
        <div class="status-kind">School Starts</div>
        <div class="status-countdown" id="status-countdown"></div>
        <div class="status-sub">HIVE begins at ${formatTimeShort(FIRST_PERIOD_START)}</div>`;
    } else if (status.state === 'arrival') {
      cls += ' kind-before';
      html = `
        <div class="status-kind">Arrival</div>
        <div class="status-range">${chip(now, BELL_SEC, 'start', formatTimeShort(BELL_SEC))}–${chip(now, FIRST_PERIOD_START, 'end', formatTimeShort(FIRST_PERIOD_START))}</div>
        <div class="status-sub">HIVE begins <span id="status-sub-value"></span></div>`;
    } else if (status.state === 'hive' || status.state === 'block') {
      cls += ` kind-${status.state}`;
      const label = periodLabel(status.period, status.dayType);
      html = `
        <div class="status-kind">${label}</div>
        <div class="status-range">${chip(now, status.startSec, 'start', formatTimeShort(status.startSec))}–${chip(now, status.endSec, 'end', formatTimeShort(status.endSec))}</div>
        <div class="status-sub">Next bell <span id="status-sub-value"></span></div>`;
    } else if (status.state === 'switch') {
      cls += ' kind-switch';
      html = `
        <div class="status-kind">Switch Time</div>
        <div class="status-range">${chip(now, status.startSec, 'start', formatTimeShort(status.startSec))}–${chip(now, status.endSec, 'end', formatTimeShort(status.endSec))}</div>
        <div class="status-sub">Next block <span id="status-sub-value"></span></div>`;
    } else if (status.state === 'afterschool') {
      cls += ' kind-after';
      html = `
        <div class="status-kind">School Is Over</div>
        <div class="status-sub">See you tomorrow!</div>`;
    } else if (status.state === 'noschool') {
      cls += ' kind-noschool';
      const weekend = isWeekend(now);
      const nd = nextSchoolDay(now, 1);
      const ndType = getDayType(nd);
      html = `
        <div class="status-kind">No School Today</div>
        <div class="status-sub">${weekend ? 'Enjoy your weekend!' : 'Enjoy your day off!'}</div>
        <div class="status-sub-secondary">School resumes ${formatWeekdayDateShort(nd)}${ndType ? ` (${ndType} Day)` : ''}</div>`;
    }

    els.statusCard.className = cls;
    els.statusCard.innerHTML = html;
  }

  function updateStatusLiveText(now, status) {
    if (status.state === 'beforeschool') {
      const el = document.getElementById('status-countdown');
      if (el) el.textContent = formatCountdownClock(atSec(now, BELL_SEC) - now);
    } else if (status.state === 'arrival') {
      const el = document.getElementById('status-sub-value');
      if (el) el.textContent = formatRelative((atSec(now, FIRST_PERIOD_START) - now) / 1000);
    } else if (status.state === 'hive' || status.state === 'block' || status.state === 'switch') {
      const el = document.getElementById('status-sub-value');
      if (el) el.textContent = formatRelative((atSec(now, status.endSec) - now) / 1000);
    }
  }

  /* ============================================================
     RENDER: SCHEDULE TAB
     ============================================================ */

  function buildScheduleRows(viewType) {
    const rows = [{ type: 'instant', label: 'Bell', sec: BELL_SEC }];
    PERIODS.forEach((p) => {
      rows.push({ type: 'period', kind: p.kind, label: periodLabel(p, viewType), startSec: p.startSec, endSec: p.endSec });
    });
    rows.push({ type: 'instant', label: 'School Ends', sec: SCHOOL_END_SEC });
    return rows;
  }

  function renderScheduleTab(now) {
    const todayType = getDayType(now);
    if (!selectedView) selectedView = todayType || 'A';

    const key = `${selectedView}|${dateKey(now)}`;
    if (key !== lastScheduleBuildKey) {
      buildScheduleDOM(now, todayType);
      lastScheduleBuildKey = key;
    }
    updateScheduleLiveText(now, todayType);
  }

  function buildScheduleDOM(now, todayType) {
    const liveMode = selectedView === todayType && todayType !== null;

    els.toggleA.textContent = todayType === 'A' ? 'Today · A Day' : 'A Day';
    els.toggleB.textContent = todayType === 'B' ? 'Today · B Day' : 'B Day';
    els.toggleA.classList.toggle('active', selectedView === 'A');
    els.toggleB.classList.toggle('active', selectedView === 'B');
    els.toggleA.setAttribute('aria-pressed', String(selectedView === 'A'));
    els.toggleB.setAttribute('aria-pressed', String(selectedView === 'B'));

    if (todayType === null) {
      els.scheduleNote.textContent = 'No school today — here are both bell schedules for reference.';
    } else if (!liveMode) {
      els.scheduleNote.textContent = `You're viewing the ${selectedView} Day schedule for reference.`;
    } else {
      els.scheduleNote.textContent = '';
    }

    const rows = buildScheduleRows(selectedView);
    let html = '';
    rows.forEach((r) => {
      if (r.type === 'instant') {
        const time = liveMode ? chip(now, r.sec, 'start', formatTimeShort(r.sec)) : formatTimeShort(r.sec);
        html += `<div class="row row-instant" data-instant-sec="${r.sec}">
          <div class="row-time">${time}</div>
          <div class="row-label">${r.label}</div>
          <div class="row-extra"></div>
        </div>`;
      } else {
        const startTxt = liveMode ? chip(now, r.startSec, 'start', formatTimeShort(r.startSec)) : formatTimeShort(r.startSec);
        const endTxt = liveMode ? chip(now, r.endSec, 'end', formatTimeShort(r.endSec)) : formatTimeShort(r.endSec);
        html += `<div class="row row-period kind-${r.kind}" data-start="${r.startSec}" data-end="${r.endSec}">
          <div class="row-time">${startTxt}–${endTxt}</div>
          <div class="row-label">${r.label}</div>
          <div class="row-extra"></div>
        </div>`;
      }
    });
    els.scheduleList.innerHTML = html;
    els.scheduleList.dataset.live = liveMode ? '1' : '0';
  }

  function updateScheduleLiveText(now) {
    if (els.scheduleList.dataset.live !== '1') return;
    const nowSec = secOfDay(now);

    els.scheduleList.querySelectorAll('.row-period').forEach((row) => {
      const s = Number(row.dataset.start);
      const e = Number(row.dataset.end);
      const extra = row.querySelector('.row-extra');
      row.classList.remove('is-past', 'is-current');
      if (nowSec >= e) {
        row.classList.add('is-past');
        extra.innerHTML = '';
      } else if (nowSec >= s) {
        row.classList.add('is-current');
        extra.innerHTML = '<span class="now-pill">Now</span>';
      } else {
        extra.textContent = capFirst(formatRelative(s - nowSec));
      }
    });

    els.scheduleList.querySelectorAll('.row-instant').forEach((row) => {
      const sec = Number(row.dataset.instantSec);
      const extra = row.querySelector('.row-extra');
      row.classList.toggle('is-past', nowSec >= sec);
      extra.textContent = nowSec >= sec ? '' : capFirst(formatRelative(sec - nowSec));
    });
  }

  /* ============================================================
     RENDER: COUNTDOWNS TAB
     ============================================================ */

  function getNextBellTarget(now) {
    const status = getStatus(now);
    if (status.state === 'beforeschool') return atSec(now, BELL_SEC);
    if (status.state === 'arrival') return atSec(now, FIRST_PERIOD_START);
    if (status.state === 'hive' || status.state === 'block' || status.state === 'switch') return atSec(now, status.endSec);
    const nd = nextSchoolDay(now, 1);
    return atSec(nd, BELL_SEC);
  }

  function getSchoolEndsTarget(now) {
    const type = getDayType(now);
    if (type !== null && secOfDay(now) < SCHOOL_END_SEC) return atSec(now, SCHOOL_END_SEC);
    const nd = nextSchoolDay(now, 1);
    return atSec(nd, SCHOOL_END_SEC);
  }

  function getWeekendTarget(now) {
    const day = now.getDay();
    if (day === 0 || day === 6) {
      const nd = nextSchoolDay(now, 0);
      return { title: 'Back to School', date: atSec(nd, BELL_SEC) };
    }
    const satDate = addDays(now, 6 - day);
    return { title: 'The Weekend', date: atSec(satDate, 0) };
  }

  function renderCountdownsTab(now) {
    const bellTarget = getNextBellTarget(now);
    els.cdBellTimer.textContent = formatDuration((bellTarget - now) / 1000);
    els.cdBellSubtitle.textContent = formatTargetLabel(now, bellTarget);

    const endTarget = getSchoolEndsTarget(now);
    els.cdEndTimer.textContent = formatDuration((endTarget - now) / 1000);
    els.cdEndSubtitle.textContent = formatTargetLabel(now, endTarget);

    const nd = nextSchoolDay(now, 1);
    const ndType = getDayType(nd);
    const ndTarget = atSec(nd, BELL_SEC);
    els.cdNextTimer.textContent = formatDuration((ndTarget - now) / 1000);
    els.cdNextSubtitle.textContent = `${ndType ? ndType + ' Day · ' : ''}${formatWeekdayDateShort(nd)}`;

    const wk = getWeekendTarget(now);
    els.cdWeekendTitle.textContent = wk.title;
    els.cdWeekendTimer.textContent = formatDuration((wk.date - now) / 1000);
    els.cdWeekendSubtitle.textContent = formatTargetLabel(now, wk.date);
  }

  /* ============================================================
     TABS
     ============================================================ */

  function setActiveTab(name) {
    activeTab = name;
    Object.keys(els.panels).forEach((n) => {
      els.panels[n].hidden = n !== name;
    });
    els.tabButtons.forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.tab === name));
    });
    lastStatusBuildKey = null;
    lastScheduleBuildKey = null;
    hideTooltip();
    tick();
  }

  function attachHandlers() {
    els.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    els.toggleA.addEventListener('click', () => {
      selectedView = 'A';
      lastScheduleBuildKey = null;
      tick();
    });
    els.toggleB.addEventListener('click', () => {
      selectedView = 'B';
      lastScheduleBuildKey = null;
      tick();
    });
    attachTooltipDelegation();
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */

  function tick() {
    const now = new Date();
    const status = getStatus(now);
    renderHeader(now, status.dayType);
    renderClockTab(now, status);
    renderScheduleTab(now);
    renderCountdownsTab(now);
  }

  function init() {
    cacheDom();
    attachHandlers();
    selectedView = getDayType(new Date()) || 'A';
    tick();
    setInterval(tick, 1000);

    loadCycleData().then(() => {
      dayTypeCache.clear();
      lastStatusBuildKey = null;
      lastScheduleBuildKey = null;
      tick();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
