(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const html = document.documentElement;

  /* ============================================================
     Display settings — same storage key as the landing page, so
     theme / text size / contrast / motion carry over.
     ============================================================ */

  const SETTINGS_KEY = "first-touch-settings";
  const readSettings = () => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  };
  const patchSettings = (patch) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch })); } catch (e) { /* optional */ }
  };
  const settings = readSettings();
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const tactics = $("#obTactics");
  const syncMotion = () => {
    if (!tactics || !tactics.pauseAnimations) return;
    if (html.dataset.motion === "reduced") tactics.pauseAnimations(); else tactics.unpauseAnimations();
  };

  const themeToggle = $("#themeToggle");
  const applyTheme = (theme) => {
    html.dataset.theme = theme;
    themeToggle.setAttribute("aria-pressed", String(theme === "light"));
    themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  };
  applyTheme(html.dataset.theme || "dark");
  themeToggle.addEventListener("click", () => {
    const next = html.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    patchSettings({ theme: next });
  });

  const setupToggle = (id, attr, onValue, key, after) => {
    const box = $(id);
    box.checked = html.dataset[attr] === onValue;
    box.addEventListener("change", () => {
      if (box.checked) html.dataset[attr] = onValue; else delete html.dataset[attr];
      patchSettings({ [key]: box.checked ? onValue : "" });
      if (after) after();
    });
    return box;
  };
  setupToggle("#toggleLargeText", "text", "large", "textSize");
  setupToggle("#toggleContrast", "contrast", "high", "contrast");
  const motionBox = setupToggle("#toggleMotion", "motion", "reduced", "motion", syncMotion);
  if (reduceQuery.matches) motionBox.disabled = true; // the system setting already covers it
  syncMotion();

  /* Accessibility popover */
  const a11yToggle = $("#a11yToggle");
  const a11yPanel = $("#a11yPanel");
  const closePanel = () => { a11yPanel.hidden = true; a11yToggle.setAttribute("aria-expanded", "false"); };
  a11yToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = a11yPanel.hidden;
    a11yPanel.hidden = !open;
    a11yToggle.setAttribute("aria-expanded", String(open));
  });
  a11yPanel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  /* ============================================================
     Onboarding state. Non-sensitive profile answers stay in this
     browser so the training environment is remembered. Email,
     password, date of birth and guardian email are never stored.
     ============================================================ */

  const STATE_KEY = "first-touch-onboarding";
  const blankState = () => ({
    done: { account: false, player: false, position: false, role: false, foot: false, environment: false, equipment: false },
    displayName: "",
    ageBand: "",
    player: { experience: "", level: "", frequency: "" },
    position: { size: "11", formation: "4-3-3", primary: "", secondary: [], customFormation: null },
    role: { selection: "", custom: "" },
    foot: { preferred: "", weakerComfort: "" },
    environment: { locations: [], spaceSize: "", minutes: "" },
    equipment: []
  });
  const loadState = () => {
    const base = blankState();
    try {
      const savedValue = localStorage.getItem(STATE_KEY) || sessionStorage.getItem(STATE_KEY);
      const saved = savedValue ? JSON.parse(savedValue) : null;
      if (!saved || typeof saved !== "object") return base;
      return {
        done: { ...base.done, ...saved.done },
        displayName: typeof saved.displayName === "string" ? saved.displayName : "",
        ageBand: typeof saved.ageBand === "string" ? saved.ageBand : "",
        player: { ...base.player, ...saved.player },
        position: {
          ...base.position,
          ...saved.position,
          secondary: Array.isArray(saved.position && saved.position.secondary) ? saved.position.secondary : [],
          customFormation: saved.position && saved.position.customFormation && Array.isArray(saved.position.customFormation.slots)
            ? saved.position.customFormation
            : null
        },
        role: { ...base.role, ...saved.role },
        foot: { ...base.foot, ...saved.foot },
        environment: {
          ...base.environment,
          ...saved.environment,
          locations: Array.isArray(saved.environment && saved.environment.locations)
            ? saved.environment.locations
            : (saved.environment && saved.environment.space ? [saved.environment.space] : [])
        },
        equipment: Array.isArray(saved.equipment)
          ? saved.equipment
          : Array.isArray(saved.environment && saved.environment.equipment)
            ? saved.environment.equipment
            : []
      };
    } catch (e) { return base; }
  };
  let state = loadState();
  const saveState = () => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      sessionStorage.removeItem(STATE_KEY);
    } catch (e) { /* optional */ }
  };

  /* ============================================================
     Routing — one hash per step, so the browser's Back/Forward
     buttons work. Later steps stay locked until earlier ones are done.
     ============================================================ */

  const STEPS = ["welcome", "account", "player", "position", "role", "foot", "environment", "equipment", "next"];
  const TITLES = {
    welcome: "Welcome", account: "Create your account", player: "Player profile",
    position: "Position and formation", role: "Playing role", foot: "Preferred foot",
    environment: "Training environment", equipment: "Equipment", next: "Up next"
  };
  const PHASES = ["Account", "Player", "Position", "Role", "Foot", "Environment", "Equipment", "Goals", "Assessment", "Profile", "First plan"];
  const PHASE_OF = { account: 0, player: 1, position: 2, role: 3, foot: 4, environment: 5, equipment: 6, next: 7 };

  const unlocked = (step) => {
    switch (step) {
      case "player": return state.done.account;
      case "position": return state.done.player;
      case "role": return state.done.position;
      case "foot": return state.done.role;
      case "environment": return state.done.foot;
      case "equipment": return state.done.environment;
      case "next": return state.done.equipment;
      default: return true;
    }
  };
  const resolveStep = (name) => {
    const index = STEPS.indexOf(name);
    if (index < 0) return "welcome";
    for (let k = 1; k <= index; k++) if (!unlocked(STEPS[k])) return STEPS[k - 1];
    return name;
  };

  const header = $("#obHeader");
  const rail = $("#obRail");
  const railList = $("#obRailList");
  PHASES.forEach((name) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "ob-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = name;
    li.append(dot, label);
    railList.append(li);
  });

  const updateRail = (step) => {
    rail.hidden = step === "welcome";
    const current = PHASE_OF[step];
    $$("li", railList).forEach((li, i) => {
      li.classList.toggle("is-done", current !== undefined && i < current);
      li.classList.toggle("is-current", i === current);
      if (i === current) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  };

  const showStep = (step, moveFocus) => {
    $$(".ob-step").forEach((el) => {
      const on = el.dataset.step === step;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });
    document.body.dataset.step = step;
    document.title = `${TITLES[step]} — First Touch`;
    updateRail(step);
    header.classList.toggle("is-scrolled", step !== "welcome" || window.scrollY > 8);
    window.scrollTo(0, 0);
    if (step === "position") { hideTip(); refreshSelection(); }
    if (step === "role") renderRoleChoices();
    if (step === "next") renderRecap();
    if (moveFocus) {
      const heading = $(".ob-title, .ob-welcome-title", $(`#step-${step}`));
      if (heading) heading.focus({ preventScroll: true });
    }
  };

  let firstRender = true;
  const route = () => {
    const wanted = location.hash.replace("#", "");
    const step = resolveStep(wanted || "welcome");
    if (wanted && step !== wanted) history.replaceState(null, "", `#${step}`);
    showStep(step, !firstRender);
    firstRender = false;
  };
  const go = (step) => {
    const target = `#${step}`;
    if (location.hash === target) route(); else location.hash = target;
  };
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", () => {
    if (document.body.dataset.step === "welcome") header.classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });
  $$("[data-go]").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.go)));

  /* ============================================================
     Step 1 — Welcome
     ============================================================ */

  $("#signInLink").addEventListener("click", (e) => {
    e.preventDefault();
    $("#signInNote").textContent = "Sign in isn’t available in this prototype yet.";
  });

  /* ============================================================
     Shared helpers: errors + choice groups
     ============================================================ */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const setFieldError = (input, message) => {
    const wrap = input.closest(".ob-field");
    const err = $(".ob-error", wrap);
    wrap.classList.toggle("has-error", !!message);
    if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    err.hidden = !message;
    err.textContent = message || "";
  };

  const setGroupError = (group, message) => {
    const err = $(".ob-error", group);
    group.classList.toggle("has-error", !!message);
    err.hidden = !message;
    err.textContent = message || "";
  };

  /* Returns the first input of the group when nothing is chosen (so it can take focus). */
  const checkGroup = (form, name, message) => {
    const inputs = $$(`input[name="${name}"]`, form);
    const ok = inputs.some((i) => i.checked);
    setGroupError(inputs[0].closest(".ob-group"), ok ? "" : message);
    return ok ? null : inputs[0];
  };
  const clearGroupOnChange = (form) => {
    $$(".ob-group", form).forEach((group) => {
      $$("input", group).forEach((input) => input.addEventListener("change", () => setGroupError(group, "")));
    });
  };
  const checkedValue = (form, name) => {
    const hit = $$(`input[name="${name}"]`, form).find((i) => i.checked);
    return hit ? hit.value : "";
  };
  const checkedLabel = (form, name) => {
    const hit = $$(`input[name="${name}"]`, form).find((i) => i.checked);
    return hit ? $(".ob-choice-label", hit.closest(".ob-choice")).textContent : "";
  };
  const setChecked = (form, name, values) => {
    const list = Array.isArray(values) ? values : [values];
    $$(`input[name="${name}"]`, form).forEach((i) => { i.checked = list.includes(i.value); });
  };

  /* ============================================================
     Step 2 — Account
     ============================================================ */

  // Placeholder thresholds: the legally required ages vary by region (for example 13 under
  // US COPPA, and 13–16 for digital consent across the EU), so confirm these before launch.
  const GUARDIAN_REQUIRED_UNDER = 13;
  const MINOR_NOTICE_UNDER = 18;

  const accountForm = $("#step-account");
  const fields = {
    name: $("#displayName"), email: $("#email"), password: $("#password"),
    dob: $("#dob"), guardian: $("#guardianEmail")
  };
  const guardianBlock = $("#guardianBlock");
  const ageNoteWrap = $("#ageNoteWrap");

  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date();
  fields.dob.max = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const ageFrom = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const [y, mo, d] = m.slice(1).map(Number);
    const dob = new Date(y, mo - 1, d);
    if (dob.getFullYear() !== y || dob.getMonth() !== mo - 1 || dob.getDate() !== d) return null;
    const now = new Date();
    let age = now.getFullYear() - y;
    if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age--;
    return age;
  };

  const needsGuardian = () => {
    const age = ageFrom(fields.dob.value);
    return age !== null && age >= 0 && age < GUARDIAN_REQUIRED_UNDER;
  };

  const rules = {
    name(v) {
      const s = v.trim();
      if (s.length < 2 || s.length > 30) return "Enter a display name between 2 and 30 characters.";
      if (s.includes("@")) return "Use a nickname rather than an email address.";
      return "";
    },
    email: (v) => (EMAIL_RE.test(v.trim()) ? "" : "Enter a valid email address."),
    password: (v) => (v.length >= 8 ? "" : "Use at least 8 characters."),
    dob(v) {
      if (!v) return "Enter your date of birth.";
      const age = ageFrom(v);
      return age === null || age < 0 || age > 110 ? "Enter a valid date of birth." : "";
    },
    guardian: (v) => (EMAIL_RE.test(v.trim()) ? "" : "Enter your parent or guardian’s email address.")
  };

  const validateField = (key) => {
    if (key === "guardian" && !needsGuardian()) { setFieldError(fields.guardian, ""); return true; }
    const message = rules[key](fields[key].value);
    setFieldError(fields[key], message);
    return !message;
  };

  Object.keys(fields).forEach((key) => {
    const input = fields[key];
    input.addEventListener("blur", () => { if (input.value || input.closest(".ob-field").classList.contains("has-error")) validateField(key); });
    input.addEventListener("input", () => { if (input.closest(".ob-field").classList.contains("has-error")) validateField(key); });
  });

  const updateAgeNote = () => {
    const age = ageFrom(fields.dob.value);
    guardianBlock.hidden = !needsGuardian();
    ageNoteWrap.textContent = "";
    if (age === null || age < 0) return;
    let text = "";
    if (age < GUARDIAN_REQUIRED_UNDER) text = "Because you’re under 13, a parent or guardian needs to approve your account.";
    else if (age < MINOR_NOTICE_UNDER) text = "You’re under 18, so check with a parent or guardian before you sign up.";
    if (!text) return;
    const note = document.createElement("p");
    note.className = "ob-note";
    note.textContent = text;
    ageNoteWrap.append(note);
  };
  fields.dob.addEventListener("input", updateAgeNote);
  fields.dob.addEventListener("change", () => { updateAgeNote(); if (fields.dob.value) validateField("dob"); });

  const pwToggle = $("#pwToggle");
  pwToggle.addEventListener("click", () => {
    const show = fields.password.type === "password";
    fields.password.type = show ? "text" : "password";
    pwToggle.textContent = show ? "Hide" : "Show";
    pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  accountForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const order = ["name", "email", "password", "dob", "guardian"];
    const invalid = order.filter((key) => !validateField(key));
    if (invalid.length) { fields[invalid[0]].focus(); return; }
    const age = ageFrom(fields.dob.value);
    state.displayName = fields.name.value.trim();
    state.ageBand = age < GUARDIAN_REQUIRED_UNDER ? "under-13" : age < MINOR_NOTICE_UNDER ? "13-17" : "adult";
    state.done.account = true;
    saveState();
    go("player");
  });

  /* ============================================================
     Step 3 — Player basics
     ============================================================ */

  const playerForm = $("#step-player");
  clearGroupOnChange(playerForm);
  playerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = [
      checkGroup(playerForm, "experience", "Choose how long you’ve played."),
      checkGroup(playerForm, "level", "Choose your current level."),
      checkGroup(playerForm, "frequency", "Choose how often you play.")
    ].filter(Boolean);
    if (missing.length) { missing[0].focus(); return; }
    state.player = {
      experience: checkedValue(playerForm, "experience"),
      level: checkedValue(playerForm, "level"),
      frequency: checkedValue(playerForm, "frequency")
    };
    state.done.player = true;
    saveState();
    go("position");
  });

  /* ============================================================
     Step 4 — Position and formation
     ============================================================ */

  const POSITIONS = {
    GK: "Goalkeeper",
    CB: "Center Back", LB: "Left Back", RB: "Right Back", LWB: "Left Wing Back", RWB: "Right Wing Back",
    CDM: "Central Defensive Midfielder", CM: "Central Midfielder", CAM: "Central Attacking Midfielder",
    LM: "Left Midfielder", RM: "Right Midfielder",
    LW: "Left Winger", RW: "Right Winger", CF: "Center Forward", ST: "Striker"
  };
  const POSITION_GROUPS = [
    ["Goalkeeper", ["GK"]],
    ["Defenders", ["CB", "LB", "RB", "LWB", "RWB"]],
    ["Midfielders", ["CDM", "CM", "CAM", "LM", "RM"]],
    ["Attackers", ["LW", "RW", "CF", "ST"]]
  ];
  const WIDE = new Set(["LB", "RB", "LWB", "RWB", "LM", "RM", "LW", "RW"]);
  const MAX_SECONDARY = 3;

  // Rows run from defence to attack; the goalkeeper is always added at the back.
  // "CDM@7" nudges a player 7% back toward their own goal.
  const FORMATIONS = {
    11: {
      "4-3-3": [["LB", "CB", "CB", "RB"], ["CM", "CDM@7", "CM"], ["LW", "ST", "RW"]],
      "4-4-2": [["LB", "CB", "CB", "RB"], ["LM", "CM", "CM", "RM"], ["ST", "ST"]],
      "4-2-3-1": [["LB", "CB", "CB", "RB"], ["CDM", "CDM"], ["LW", "CAM", "RW"], ["ST"]],
      "4-1-4-1": [["LB", "CB", "CB", "RB"], ["CDM"], ["LM", "CM", "CM", "RM"], ["ST"]],
      "4-4-1-1": [["LB", "CB", "CB", "RB"], ["LM", "CM", "CM", "RM"], ["CAM"], ["ST"]],
      "3-5-2": [["CB", "CB", "CB"], ["LWB", "CM", "CDM@7", "CM", "RWB"], ["ST", "ST"]],
      "3-5-2 (variant)": [["LB", "CB", "RB"], ["LW@-7", "LM", "CM", "RM", "RW@-7"], ["ST", "ST"]],
      "3-4-3": [["CB", "CB", "CB"], ["LWB", "CM", "CM", "RWB"], ["LW", "ST", "RW"]],
      "5-3-2": [["LWB", "CB", "CB", "CB", "RWB"], ["CM", "CM", "CM"], ["ST", "ST"]],
      "5-4-1": [["LWB", "CB", "CB", "CB", "RWB"], ["LM", "CM", "CM", "RM"], ["ST"]]
    },
    9: {
      "3-3-2": [["CB", "CB", "CB"], ["LM", "CM", "RM"], ["ST", "ST"]],
      "3-2-3": [["CB", "CB", "CB"], ["CM", "CM"], ["LW", "ST", "RW"]],
      "2-4-2": [["CB", "CB"], ["LM", "CM", "CM", "RM"], ["ST", "ST"]],
      "3-4-1": [["CB", "CB", "CB"], ["LM", "CM", "CM", "RM"], ["ST"]],
      "2-3-3": [["CB", "CB"], ["CM", "CM", "CM"], ["LW", "ST", "RW"]],
      "4-3-1": [["LB", "CB", "CB", "RB"], ["LM", "CM", "RM"], ["ST"]]
    },
    7: {
      "2-3-1": [["CB", "CB"], ["LM", "CM", "RM"], ["ST"]],
      "3-2-1": [["CB", "CB", "CB"], ["CM", "CM"], ["ST"]],
      "2-2-2": [["CB", "CB"], ["CM", "CM"], ["ST", "ST"]],
      "3-1-2": [["CB", "CB", "CB"], ["CM"], ["ST", "ST"]],
      "1-3-2": [["CB"], ["LM", "CM", "RM"], ["ST", "ST"]]
    },
    5: {
      "1-2-1": [["CB"], ["LM", "RM"], ["ST"]],
      "2-2": [["CB", "CB"], ["ST", "ST"]],
      "2-1-1": [["CB", "CB"], ["CM"], ["ST"]],
      "1-1-2": [["CB"], ["CM"], ["ST", "ST"]],
      "3-1": [["CB", "CB", "CB"], ["ST"]]
    }
  };

  const layoutSlots = (rows) => {
    const slots = [{ code: "GK", x: 50, y: 91 }];
    const n = rows.length;
    const top = n <= 2 ? 28 : 14;
    rows.forEach((row, i) => {
      const baseY = n === 1 ? 50 : 76 - ((76 - top) * i) / (n - 1);
      const k = row.length;
      const wide = row.some((cell) => WIDE.has(cell.split("@")[0]));
      const span = k === 1 ? 0 : k === 2 ? (wide ? 52 : 28) : k === 3 ? (wide ? 72 : 52) : 72;
      row.forEach((cell, j) => {
        const [code, nudge] = cell.split("@");
        slots.push({
          code,
          x: k === 1 ? 50 : 50 - span / 2 + (span * j) / (k - 1),
          y: baseY + (nudge ? Number(nudge) : 0)
        });
      });
    });
    return slots;
  };

  const positionForm = $("#step-position");
  const pitch = $("#pitch");
  const slotsWrap = $("#slots");
  const tip = $("#pitchTip");
  const teamSizeSelect = $("#teamSize");
  const formationSelect = $("#formation");
  const pitchNote = $("#pitchNote");
  const posMessage = $("#posMessage");
  const modeHint = $("#modeHint");
  const secondaryRadio = $('input[name="posMode"][value="secondary"]', positionForm);
  const primaryRadio = $('input[name="posMode"][value="primary"]', positionForm);
  const slotEls = [];
  const chipEls = {};

  const pos = () => state.position;
  const roleOf = (code) => (code === pos().primary ? "primary" : pos().secondary.includes(code) ? "secondary" : "");
  const roleText = { primary: ", main position", secondary: ", also play" };

  Object.keys(FORMATIONS).sort((a, b) => b - a).forEach((size) => {
    const opt = document.createElement("option");
    opt.value = size;
    opt.textContent = `${size} players`;
    teamSizeSelect.append(opt);
  });
  const fillFormations = () => {
    formationSelect.textContent = "";
    Object.keys(FORMATIONS[pos().size]).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      formationSelect.append(opt);
    });
    if (pos().size === "11" && pos().customFormation) {
      const custom = document.createElement("option");
      custom.value = "custom";
      custom.textContent = pos().customFormation.name;
      formationSelect.append(custom);
    }
    formationSelect.value = pos().formation;
  };

  /* Position list (also the keyboard / screen-reader route to every position) */
  const posList = $("#posList");
  POSITION_GROUPS.forEach(([title, codes]) => {
    const group = document.createElement("div");
    const heading = document.createElement("p");
    heading.className = "ob-posgroup-title";
    heading.textContent = title;
    const chips = document.createElement("div");
    chips.className = "ob-poschips";
    codes.forEach((code) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ob-pos";
      btn.dataset.code = code;
      btn.setAttribute("aria-pressed", "false");
      const short = document.createElement("b");
      short.textContent = code;
      const long = document.createElement("span");
      long.textContent = POSITIONS[code];
      const sr = document.createElement("span");
      sr.className = "sr-only";
      btn.append(short, long, sr);
      btn.addEventListener("click", () => choose(code));
      chips.append(btn);
      chipEls[code] = btn;
    });
    group.append(heading, chips);
    posList.append(group);
  });

  /* Pitch */
  const makeSlot = () => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ob-slot is-entering";
    btn.addEventListener("click", () => { choose(btn.dataset.code); showTip(btn); window.clearTimeout(tipTimer); tipTimer = window.setTimeout(hideTip, 1800); });
    return btn;
  };

  const currentSlots = () => pos().formation === "custom" && pos().customFormation
    ? [{ code: "GK", x: 50, y: 91 }, ...pos().customFormation.slots]
    : layoutSlots(FORMATIONS[pos().size][pos().formation]);
  const renderPitch = () => {
    const slots = currentSlots();
    while (slotEls.length < slots.length) {
      const btn = makeSlot();
      slotEls.push(btn);
      applySlot(btn, slots[slotEls.length - 1]);
      slotsWrap.append(btn);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => btn.classList.remove("is-entering")));
    }
    while (slotEls.length > slots.length) {
      const btn = slotEls.pop();
      btn.classList.add("is-leaving");
      btn.disabled = true;
      btn.setAttribute("aria-hidden", "true");
      window.setTimeout(() => btn.remove(), 350);
    }
    slotEls.forEach((btn, i) => applySlot(btn, slots[i]));
    refreshSelection();
  };
  const applySlot = (btn, slot) => {
    btn.dataset.code = slot.code;
    btn.dataset.x = slot.x;
    btn.dataset.y = slot.y;
    btn.style.setProperty("--x", `${slot.x}%`);
    btn.style.setProperty("--y", `${slot.y}%`);
    btn.textContent = slot.code;
  };

  /* Tooltip: hover, focus, or briefly after a tap */
  let tipTimer = 0;
  function showTip(btn) {
    const W = pitch.clientWidth;
    const H = pitch.clientHeight;
    const x = (parseFloat(btn.dataset.x) / 100) * W;
    const y = (parseFloat(btn.dataset.y) / 100) * H;
    tip.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = btn.dataset.code;
    tip.append(strong, POSITIONS[btn.dataset.code]);
    tip.hidden = false;
    const half = tip.offsetWidth / 2;
    const above = y > 70;
    tip.style.left = `${Math.min(Math.max(x, half + 6), W - half - 6)}px`;
    tip.style.top = `${above ? y - 30 : y + 30}px`;
    tip.style.transform = above ? "translate(-50%, -100%)" : "translate(-50%, 0)";
  }
  function hideTip() { tip.hidden = true; }
  slotsWrap.addEventListener("mouseover", (e) => { const b = e.target.closest(".ob-slot"); if (b) showTip(b); });
  slotsWrap.addEventListener("mouseout", (e) => { if (e.target.closest(".ob-slot")) hideTip(); });
  slotsWrap.addEventListener("focusin", (e) => { const b = e.target.closest(".ob-slot"); if (b) showTip(b); });
  slotsWrap.addEventListener("focusout", hideTip);

  /* Selection */
  const say = (message) => { posMessage.textContent = message; };

  function choose(code) {
    const p = pos();
    const mode = $('input[name="posMode"]:checked', positionForm).value;
    if (mode === "primary" || !p.primary) {
      const first = !p.primary;
      const changed = p.primary !== code;
      p.secondary = p.secondary.filter((c) => c !== code);
      p.primary = code;
      if (changed) {
        state.role = { selection: "", custom: "" };
        state.done.role = false;
      }
      say(first
        ? `Main position: ${POSITIONS[code]}. Do you also play somewhere else? Switch to “Also play” to add up to three more.`
        : `Main position: ${POSITIONS[code]}.`);
    } else {
      if (code === p.primary) { say(`${POSITIONS[code]} is already your main position.`); return; }
      const at = p.secondary.indexOf(code);
      if (at >= 0) { p.secondary.splice(at, 1); say(`Removed ${POSITIONS[code]}.`); }
      else if (p.secondary.length >= MAX_SECONDARY) { say("You can add up to three other positions. Remove one to add another."); return; }
      else { p.secondary.push(code); say(`Added ${POSITIONS[code]}.`); }
    }
    setGroupError($("#err-position").parentElement, "");
    $("#err-position").hidden = true;
    saveState();
    refreshSelection();
  }

  function removeSecondary(code) {
    pos().secondary = pos().secondary.filter((c) => c !== code);
    say(`Removed ${POSITIONS[code]}.`);
    saveState();
    refreshSelection();
  }

  function refreshSelection() {
    const p = pos();
    slotEls.forEach((btn) => {
      const code = btn.dataset.code;
      const role = roleOf(code);
      btn.classList.toggle("is-primary", role === "primary");
      btn.classList.toggle("is-secondary", role === "secondary");
      btn.setAttribute("aria-pressed", String(!!role));
      btn.setAttribute("aria-label", `${POSITIONS[code]} (${code})${roleText[role] || ""}`);
    });
    Object.keys(chipEls).forEach((code) => {
      const btn = chipEls[code];
      const role = roleOf(code);
      if (role) btn.dataset.role = role; else delete btn.dataset.role;
      btn.setAttribute("aria-pressed", String(!!role));
      $(".sr-only", btn).textContent = roleText[role] || "";
    });

    // summary
    const sumPrimary = $("#sumPrimary");
    const sumSecondary = $("#sumSecondary");
    sumPrimary.textContent = "";
    sumSecondary.textContent = "";
    if (p.primary) {
      const chip = document.createElement("span");
      chip.className = "ob-chip";
      chip.textContent = `${p.primary} · ${POSITIONS[p.primary]}`;
      sumPrimary.append(chip);
    } else {
      sumPrimary.innerHTML = '<span class="ob-muted">Not chosen yet</span>';
    }
    if (p.secondary.length) {
      p.secondary.forEach((code) => {
        const chip = document.createElement("span");
        chip.className = "ob-chip ob-chip--secondary";
        chip.append(`${code} · ${POSITIONS[code]}`);
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = "×";
        x.setAttribute("aria-label", `Remove ${POSITIONS[code]}`);
        x.addEventListener("click", () => removeSecondary(code));
        chip.append(x);
        sumSecondary.append(chip);
      });
    } else {
      sumSecondary.innerHTML = '<span class="ob-muted">None</span>';
    }

    // mode control
    $("#secCount").textContent = `${p.secondary.length}/${MAX_SECONDARY}`;
    secondaryRadio.disabled = !p.primary;
    if (!p.primary) primaryRadio.checked = true;
    const secondaryMode = secondaryRadio.checked;
    modeHint.textContent = !p.primary
      ? "Choose your main position first."
      : secondaryMode
        ? "Tap up to three other positions you regularly play. Tap again to remove one."
        : "Tap a position to change your main position.";

    // positions saved but not drawn in this formation
    const drawn = new Set(slotEls.map((b) => b.dataset.code));
    const hidden = [p.primary, ...p.secondary].filter((c) => c && !drawn.has(c));
    pitchNote.textContent = hidden.length
      ? `${hidden.join(", ")} ${hidden.length > 1 ? "aren’t" : "isn’t"} in this formation, but ${hidden.length > 1 ? "they’re" : "it’s"} still saved.`
      : "Hover or focus a position to see its name.";
  }

  $$('input[name="posMode"]', positionForm).forEach((r) => r.addEventListener("change", refreshSelection));

  teamSizeSelect.addEventListener("change", () => {
    pos().size = teamSizeSelect.value;
    pos().formation = Object.keys(FORMATIONS[pos().size])[0];
    fillFormations();
    saveState();
    renderPitch();
  });
  formationSelect.addEventListener("change", () => {
    pos().formation = formationSelect.value;
    saveState();
    renderPitch();
  });

  /* Custom formation builder */
  const formationDialog = $("#formationDialog");
  const builderPitch = $("#builderPitch");
  const builderSlotsWrap = $("#builderSlots");
  const builderPalette = $("#builderPalette");
  const builderCount = $("#builderCount");
  const builderSelected = $("#builderSelected");
  const removeBuilderSlot = $("#removeBuilderSlot");
  const formationNameInput = $("#formationName");
  let builderSlots = [];
  let selectedBuilderSlot = -1;
  let activePointerDrag = null;
  let dragGhost = null;
  let suppressBuilderClick = false;
  const BUILDER_MAX = 10;
  const builderPositions = POSITION_GROUPS.flatMap(([, codes]) => codes).filter((code) => code !== "GK");

  const updateBuilderStatus = () => {
    builderCount.textContent = `${builderSlots.length + 1}/11 players placed (goalkeeper included)`;
    removeBuilderSlot.disabled = selectedBuilderSlot < 0 || selectedBuilderSlot >= builderSlots.length;
    $$(".ob-builder-palette-item", builderPalette).forEach((button) => { button.disabled = builderSlots.length >= BUILDER_MAX; });
    builderSelected.textContent = selectedBuilderSlot < 0
      ? "Select a player on the pitch to remove it."
      : `Selected: ${builderSlots[selectedBuilderSlot].code}`;
  };
  const addBuilderSlot = (code, x, y) => {
    if (builderSlots.length >= BUILDER_MAX) return false;
    builderSlots.push({ code, x, y });
    selectedBuilderSlot = builderSlots.length - 1;
    renderBuilderSlots();
    return true;
  };
  const builderDefaultPoint = (index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const columns = Math.min(4, BUILDER_MAX - row * 4);
    return {
      x: columns === 1 ? 50 : 20 + col * (60 / (columns - 1)),
      y: 66 - row * 16
    };
  };
  const renderBuilderSlots = () => {
    builderSlotsWrap.textContent = "";
    const goalkeeper = document.createElement("span");
    goalkeeper.className = "ob-builder-slot is-goalkeeper";
    goalkeeper.style.setProperty("--x", "50%");
    goalkeeper.style.setProperty("--y", "91%");
    goalkeeper.textContent = "GK";
    goalkeeper.setAttribute("aria-label", "Goalkeeper, fixed on the goal");
    builderSlotsWrap.append(goalkeeper);
    builderSlots.forEach((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ob-builder-slot${index === selectedBuilderSlot ? " is-selected" : ""}`;
      button.dataset.index = String(index);
      button.style.setProperty("--x", `${slot.x}%`);
      button.style.setProperty("--y", `${slot.y}%`);
      button.textContent = slot.code;
      button.setAttribute("aria-label", `${POSITIONS[slot.code]} at pitch position ${index + 1}; select to remove or drag to move`);
      builderSlotsWrap.append(button);
    });
    updateBuilderStatus();
  };
  const openFormationBuilder = () => {
    builderSlots = [];
    selectedBuilderSlot = -1;
    activePointerDrag = null;
    formationNameInput.value = "";
    $("#formationNameError").hidden = true;
    $("#builderError").hidden = true;
    renderBuilderSlots();
    formationDialog.showModal();
    formationNameInput.focus();
  };
  const snapBuilderPoint = (clientX, clientY) => {
    const bounds = builderPitch.getBoundingClientRect();
    const x = Math.min(92, Math.max(8, ((clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(93, Math.max(7, ((clientY - bounds.top) / bounds.height) * 100));
    return {
      x: Math.round(x / 4) * 4,
      y: Math.round(y / 4) * 4
    };
  };
  const updateDragGhost = (clientX, clientY) => {
    if (!dragGhost) return;
    dragGhost.style.left = `${clientX}px`;
    dragGhost.style.top = `${clientY}px`;
  };

  builderPositions.forEach((code) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ob-builder-palette-item";
    button.dataset.code = code;
    button.textContent = code;
    button.setAttribute("aria-label", `Add ${POSITIONS[code]} (${code}); drag onto pitch`);
    builderPalette.append(button);
  });
  $("#suggestFormation").addEventListener("click", openFormationBuilder);
  $("#closeFormationDialog").addEventListener("click", () => formationDialog.close());
  $("#cancelFormation").addEventListener("click", () => formationDialog.close());
  formationDialog.addEventListener("click", (e) => {
    if (e.target === formationDialog) formationDialog.close();
  });
  builderPalette.addEventListener("click", (e) => {
    if (suppressBuilderClick) { suppressBuilderClick = false; return; }
    const button = e.target.closest(".ob-builder-palette-item");
    if (!button || builderSlots.length >= BUILDER_MAX) return;
    const point = builderDefaultPoint(builderSlots.length);
    addBuilderSlot(button.dataset.code, point.x, point.y);
  });
  builderSlotsWrap.addEventListener("click", (e) => {
    if (suppressBuilderClick) { suppressBuilderClick = false; return; }
    const button = e.target.closest(".ob-builder-slot[data-index]");
    if (!button) return;
    selectedBuilderSlot = Number(button.dataset.index);
    renderBuilderSlots();
  });
  removeBuilderSlot.addEventListener("click", () => {
    if (selectedBuilderSlot < 0 || selectedBuilderSlot >= builderSlots.length) return;
    builderSlots.splice(selectedBuilderSlot, 1);
    selectedBuilderSlot = -1;
    renderBuilderSlots();
  });
  formationDialog.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const paletteItem = e.target.closest(".ob-builder-palette-item");
    const slotItem = e.target.closest(".ob-builder-slot[data-index]");
    if (!paletteItem && !slotItem) return;
    activePointerDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      code: paletteItem ? paletteItem.dataset.code : builderSlots[Number(slotItem.dataset.index)].code,
      index: slotItem ? Number(slotItem.dataset.index) : -1,
      moved: false
    };
  });
  document.addEventListener("pointermove", (e) => {
    if (!activePointerDrag || activePointerDrag.pointerId !== e.pointerId) return;
    if (!activePointerDrag.moved && Math.hypot(e.clientX - activePointerDrag.startX, e.clientY - activePointerDrag.startY) > 6) {
      activePointerDrag.moved = true;
      dragGhost = document.createElement("span");
      dragGhost.className = "ob-builder-drag-ghost";
      dragGhost.textContent = activePointerDrag.code;
      document.body.append(dragGhost);
    }
    updateDragGhost(e.clientX, e.clientY);
  });
  document.addEventListener("pointerup", (e) => {
    if (!activePointerDrag || activePointerDrag.pointerId !== e.pointerId) return;
    const drag = activePointerDrag;
    activePointerDrag = null;
    if (!drag.moved) return;
    const bounds = builderPitch.getBoundingClientRect();
    if (e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom) {
      const point = snapBuilderPoint(e.clientX, e.clientY);
      if (drag.index < 0) {
        if (!addBuilderSlot(drag.code, point.x, point.y)) $("#builderError").textContent = "This formation already has 11 players.";
      } else {
        builderSlots[drag.index] = { ...builderSlots[drag.index], ...point };
        selectedBuilderSlot = drag.index;
        renderBuilderSlots();
      }
    }
    if (dragGhost) dragGhost.remove();
    dragGhost = null;
    suppressBuilderClick = true;
    window.setTimeout(() => { suppressBuilderClick = false; }, 0);
  });
  $("#saveFormation").addEventListener("click", () => {
    const name = formationNameInput.value.trim();
    const nameError = $("#formationNameError");
    const builderError = $("#builderError");
    nameError.hidden = true;
    builderError.hidden = true;
    if (name.length < 2) {
      nameError.textContent = "Enter a formation name of at least 2 characters.";
      nameError.hidden = false;
      formationNameInput.focus();
      return;
    }
    if (builderSlots.length !== BUILDER_MAX) {
      builderError.textContent = `Add ${BUILDER_MAX - builderSlots.length} more outfield position${BUILDER_MAX - builderSlots.length === 1 ? "" : "s"} to complete the 11-player formation.`;
      builderError.hidden = false;
      return;
    }
    pos().customFormation = {
      name,
      slots: builderSlots.map(({ code, x, y }) => ({ code, x, y }))
    };
    pos().size = "11";
    pos().formation = "custom";
    teamSizeSelect.value = "11";
    fillFormations();
    renderPitch();
    saveState();
    formationDialog.close();
  });

  positionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pos().primary) {
      const err = $("#err-position");
      err.textContent = "Choose your main position to continue.";
      err.hidden = false;
      (slotEls[0] || chipEls.GK).focus();
      return;
    }
    state.done.position = true;
    saveState();
    go("role");
  });

  /* ============================================================
     Step 5 — Playing role
     ============================================================ */

  const roleForm = $("#step-role");
  const roleChoices = $("#roleChoices");
  const roleLegend = $("#roleLegend");
  const customRoleField = $("#customRoleField");
  const customRoleInput = $("#customRole");
  const roleOptions = {
    CM: ["Box-to-box", "Deep-lying", "Playmaker", "Holding midfielder", "Attacking midfielder"],
    LW: ["Touchline winger", "Inverted winger", "Inside forward", "Wide playmaker"],
    RW: ["Touchline winger", "Inverted winger", "Inside forward", "Wide playmaker"],
    CB: ["Ball-playing defender", "Stopper", "Cover defender"],
    CDM: ["Holding midfielder", "Deep-lying playmaker", "Ball-winning midfielder"],
    CAM: ["Attacking midfielder", "Playmaker", "Shadow striker", "Wide playmaker"],
    LB: ["Overlapping fullback", "Inverted fullback", "Defensive fullback"],
    RB: ["Overlapping fullback", "Inverted fullback", "Defensive fullback"],
    LWB: ["Attacking wingback", "Defensive wingback", "Wide playmaker"],
    RWB: ["Attacking wingback", "Defensive wingback", "Wide playmaker"],
    LM: ["Touchline winger", "Inside forward", "Wide playmaker"],
    RM: ["Touchline winger", "Inside forward", "Wide playmaker"],
    CF: ["Target forward", "False nine", "Second striker", "Pressing forward"],
    ST: ["Target forward", "Poacher", "Pressing forward", "Complete forward"],
    GK: ["Shot stopper", "Sweeper keeper", "Ball-playing goalkeeper"]
  };
  const renderRoleChoices = () => {
    const code = state.position.primary;
    const names = roleOptions[code] || ["Attacking role", "Balanced role", "Defensive role"];
    roleLegend.textContent = `${POSITIONS[code] || "Your position"} — choose a role`;
    roleChoices.textContent = "";
    [...names, "Not sure", "Custom role"].forEach((name) => {
      const label = document.createElement("label");
      label.className = "ob-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "role";
      input.value = name === "Custom role" ? "custom" : name === "Not sure" ? "not-sure" : name;
      input.checked = state.role.selection === input.value;
      const text = document.createElement("span");
      text.className = "ob-choice-label";
      text.textContent = name;
      label.append(input, text);
      roleChoices.append(label);
    });
    customRoleField.hidden = state.role.selection !== "custom";
    customRoleInput.value = state.role.custom;
  };
  const syncCustomRole = () => {
    const customSelected = checkedValue(roleForm, "role") === "custom";
    customRoleField.hidden = !customSelected;
    if (!customSelected) setFieldError(customRoleInput, "");
  };
  roleForm.addEventListener("change", (e) => {
    if (e.target.name !== "role") return;
    state.role.selection = e.target.value;
    state.done.role = false;
    syncCustomRole();
    setGroupError($("#grp-role"), "");
    saveState();
  });
  customRoleInput.addEventListener("input", () => {
    state.role.custom = customRoleInput.value;
    state.done.role = false;
    if (customRoleInput.closest(".ob-field").classList.contains("has-error")) setFieldError(customRoleInput, "");
    saveState();
  });
  roleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const selected = checkedValue(roleForm, "role");
    if (!selected) {
      setGroupError($("#grp-role"), "Choose a role, or select “Not sure.”");
      $('input[name="role"]', roleChoices).focus();
      return;
    }
    if (selected === "custom" && customRoleInput.value.trim().length < 2) {
      setFieldError(customRoleInput, "Enter a role of at least 2 characters.");
      customRoleInput.focus();
      return;
    }
    setFieldError(customRoleInput, "");
    state.role = { selection: selected, custom: customRoleInput.value.trim() };
    state.done.role = true;
    saveState();
    go("foot");
  });

  /* ============================================================
     Step 6 — Preferred foot
     ============================================================ */

  const footForm = $("#step-foot");
  clearGroupOnChange(footForm);
  footForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = [
      checkGroup(footForm, "preferredFoot", "Choose left, right, or both."),
      checkGroup(footForm, "weakerComfort", "Choose a comfort level from 1 to 5.")
    ].filter(Boolean);
    if (missing.length) { missing[0].focus(); return; }
    state.foot = {
      preferred: checkedValue(footForm, "preferredFoot"),
      weakerComfort: checkedValue(footForm, "weakerComfort")
    };
    state.done.foot = true;
    saveState();
    go("environment");
  });

  /* ============================================================
     Step 7 — Training environment
     ============================================================ */

  const environmentForm = $("#step-environment");
  clearGroupOnChange(environmentForm);
  environmentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = [
      checkGroup(environmentForm, "locations", "Choose at least one place where you train."),
      checkGroup(environmentForm, "spaceSize", "Choose how much space you usually have.")
    ].filter(Boolean);
    if (missing.length) { missing[0].focus(); return; }
    state.environment = {
      locations: $$('input[name="locations"]', environmentForm).filter((b) => b.checked).map((b) => b.value),
      spaceSize: checkedValue(environmentForm, "spaceSize"),
      minutes: state.environment.minutes
    };
    state.done.environment = true;
    saveState();
    go("equipment");
  });

  /* ============================================================
     Step 8 — Equipment
     ============================================================ */

  const equipmentForm = $("#step-equipment");
  clearGroupOnChange(equipmentForm);
  const equipmentBoxes = $$('input[name="equipment"]', equipmentForm);
  equipmentBoxes.forEach((box) => box.addEventListener("change", () => {
    if (box.value === "just-ball" && box.checked) {
      equipmentBoxes.forEach((other) => { if (other !== box) other.checked = false; });
    } else if (box.checked) {
      const justBall = equipmentBoxes.find((other) => other.value === "just-ball");
      if (justBall) justBall.checked = false;
    }
  }));
  equipmentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = [
      checkGroup(equipmentForm, "equipment", "Choose your equipment, or select “None / Just a ball.”"),
      checkGroup(equipmentForm, "minutes", "Choose how long you can train.")
    ].filter(Boolean);
    if (missing.length) { missing[0].focus(); return; }
    state.equipment = equipmentBoxes.filter((b) => b.checked).map((b) => b.value === "just-ball" ? "ball" : b.value);
    state.environment.minutes = checkedValue(equipmentForm, "minutes");
    state.done.equipment = true;
    saveState();
    go("next");
  });

  /* ============================================================
     Placeholder end state: recap of what was collected
     ============================================================ */

  const LABELS = {
    experience: { "just-starting": "Just starting", "under-1": "Less than 1 year", "1-2": "1–2 years", "3-5": "3–5 years", "5-plus": "5+ years" },
    level: { recreational: "Recreational", school: "School", club: "Club", "competitive-club": "Competitive club", academy: "Academy / development program", other: "Other" },
    frequency: { rarely: "Rarely", "1-2": "1–2 days/week", "3-4": "3–4 days/week", "5-plus": "5+ days/week" },
    locations: { backyard: "Backyard", "small-outdoor": "Small outdoor space", "full-field": "Full field", turf: "Turf", indoor: "Indoor space", gym: "Gym", "wall-area": "Wall / rebounder area" },
    spaceSize: { "very-small": "Very small", small: "Small", medium: "Medium", large: "Large", "full-pitch": "Full pitch" },
    equipment: {
      ball: "Ball", cones: "Cones", goal: "Goal", wall: "Wall", rebounder: "Rebounder",
      ladder: "Agility ladder", targets: "Training targets", bands: "Resistance bands",
      partner: "Training partner", team: "Team", "just-ball": "None / Just a ball", none: "No equipment yet"
    },
    foot: { left: "Left", right: "Right", both: "Both" },
    comfort: { "1": "1 — Very uncomfortable", "2": "2 — Developing", "3": "3 — Okay", "4": "4 — Comfortable", "5": "5 — Very comfortable" }
  };

  function renderRecap() {
    const p = state.position;
    const roleName = state.role.selection === "custom"
      ? state.role.custom
      : state.role.selection === "not-sure"
        ? "Not sure"
        : state.role.selection;
    const rows = [
      ["Display name", state.displayName],
      ["Player", [LABELS.experience[state.player.experience], LABELS.level[state.player.level], LABELS.frequency[state.player.frequency]].filter(Boolean).join(" · ")],
      ["Position", [p.primary && `${p.primary} (main)`, p.secondary.length && `also ${p.secondary.join(", ")}`].filter(Boolean).join(" · ")],
      ["Playing role", roleName],
      ["Formation", `${p.formation === "custom" && p.customFormation ? p.customFormation.name : p.formation}, ${p.size}-a-side`],
      ["Preferred foot", LABELS.foot[state.foot.preferred]],
      ["Weaker foot", LABELS.comfort[state.foot.weakerComfort]],
      ["Training places", state.environment.locations.map((v) => LABELS.locations[v]).filter(Boolean).join(", ")],
      ["Available space", LABELS.spaceSize[state.environment.spaceSize]],
      ["Equipment", state.equipment.map((v) => LABELS.equipment[v]).filter(Boolean).join(", ")],
      ["Session length", state.environment.minutes && `${state.environment.minutes} min`]
    ];
    const recap = $("#recap");
    recap.textContent = "";
    rows.forEach(([term, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value || "—";
      row.append(dt, dd);
      recap.append(row);
    });
  }

  $("#startOver").addEventListener("click", () => {
    state = blankState();
    saveState();
    $$("form.ob-form").forEach((form) => form.reset());
    $$(".ob-error").forEach((el) => { el.hidden = true; el.textContent = ""; });
    $$(".has-error").forEach((el) => el.classList.remove("has-error"));
    updateAgeNote();
    restoreForms();
    go("welcome");
  });

  /* ============================================================
     Restore saved answers into the forms, then start
     ============================================================ */

  function restoreForms() {
    setChecked(playerForm, "experience", state.player.experience);
    setChecked(playerForm, "level", state.player.level);
    setChecked(playerForm, "frequency", state.player.frequency);
    setChecked(roleForm, "role", state.role.selection);
    customRoleInput.value = state.role.custom;
    setChecked(footForm, "preferredFoot", state.foot.preferred);
    setChecked(footForm, "weakerComfort", state.foot.weakerComfort);
    setChecked(environmentForm, "locations", state.environment.locations);
    setChecked(environmentForm, "spaceSize", state.environment.spaceSize);
    setChecked(equipmentForm, "equipment", state.equipment);
    setChecked(equipmentForm, "minutes", state.environment.minutes);
    if (!FORMATIONS[state.position.size] || !FORMATIONS[state.position.size][state.position.formation]) {
      const customIsValid = state.position.size === "11" &&
        state.position.formation === "custom" &&
        state.position.customFormation &&
        typeof state.position.customFormation.name === "string" &&
        state.position.customFormation.name.trim().length >= 2 &&
        state.position.customFormation.slots.length === BUILDER_MAX &&
        state.position.customFormation.slots.every((slot) =>
          POSITIONS[slot.code] && slot.code !== "GK" &&
          Number.isFinite(slot.x) && slot.x >= 8 && slot.x <= 92 &&
          Number.isFinite(slot.y) && slot.y >= 7 && slot.y <= 93
        );
      if (!customIsValid) {
        state.position.size = "11";
        state.position.formation = "4-3-3";
        state.position.customFormation = null;
      }
    }
    state.position.secondary = state.position.secondary.filter((c) => POSITIONS[c] && c !== state.position.primary).slice(0, MAX_SECONDARY);
    if (state.position.primary && !POSITIONS[state.position.primary]) state.position.primary = "";
    teamSizeSelect.value = state.position.size;
    fillFormations();
    renderPitch();
  }

  restoreForms();
  route();
})();