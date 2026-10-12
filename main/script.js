(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const settingsKey = "first-touch-settings";
  const locales = {
    "en-US": { label: "English (US)" },
    "en-GB": { label: "English (UK)" },
    "en-CA": { label: "English (Canada)" },
    "en-AU": { label: "English (Australia)" },
    zh: { label: "普通话" },
    hi: { label: "हिंदी" },
    es: { label: "Español" },
    fr: { label: "Français" }
  };

  const readSettings = () => {
    try { return JSON.parse(localStorage.getItem(settingsKey)) || {}; }
    catch (error) { return {}; }
  };
  const saveSettings = (settings) => {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); }
    catch (error) { /* Persistence is optional. */ }
  };
  const settings = readSettings();

  const browserLocale = (navigator.languages || [navigator.language || "en-US"])
    .map((locale) => locale.toLowerCase())
    .map((locale) => Object.keys(locales).find((candidate) => candidate.toLowerCase() === locale)
      || ({ en: "en-US", zh: "zh", hi: "hi", es: "es", fr: "fr" })[locale.split("-")[0]])
    .find(Boolean);
  let locale = locales[settings.locale] ? settings.locale : browserLocale || "en-US";
  html.dataset.locale = locale;
  html.lang = locale === "zh" ? "zh-Hans" : locale;
  settings.locale = locale;
  saveSettings(settings);

  /* Translation keys are the stable contract for localized content. */
  const translationTargets = [
    [".brand-name", "brand.name"], ["#langLabel", "language.current"], ["#menuToggle", "navigation.menuOpen"], [".skip-link", "navigation.skipLink"],
    [".hero-eyebrow", "hero.eyebrow"], ["#top .hero-title", ["hero.titleLine1", "hero.titleLine2"]], [".hero-sub", "hero.subtitle"], [".hero-proof", "hero.credibility"],
    [".hero-ctas .btn-primary", "actions.getStarted"], [".hero-ctas .btn-text", "actions.seeHow"],
    ["#difference h2", "difference.heading"], ["#difference .diff-card h3", ["difference.personalized", "difference.position", "difference.adaptive", "difference.schedule"]],
    ["#difference .diff-card p", ["difference.personalizedBody", "difference.positionBody", "difference.adaptiveBody", "difference.scheduleBody"]],
    ["#how-it-works h2", "how.heading"], ["#how-it-works .how-step h3", ["how.stepOne", "how.stepTwo", "how.stepThree"]],
    ["#how-it-works .how-step p", ["how.stepOneBody", "how.stepTwoBody", "how.stepThreeBody"]],
    [".principles-copy > .section-kicker", "principles.kicker"], ["#principles h2", "principles.heading"], [".principles-copy > p:last-child", "principles.body"],
    ["#principles .principles-list strong", ["principles.technical", "principles.tactical", "principles.physical", "principles.decisionMaking"]], ["#principles .principles-list small", ["principles.technicalBody", "principles.tacticalBody", "principles.physicalBody", "principles.decisionMakingBody"]],
    ["#audience .section-kicker", "audience.kicker"], ["#audience h2", "audience.heading"], ["#audience .section-intro", "audience.intro"],
    ["#audience .audience-card h3", ["audience.starting", "audience.recreational", "audience.schoolClub", "audience.competitive"]], ["#audience .audience-card p", ["audience.startingBody", "audience.recreationalBody", "audience.schoolClubBody", "audience.competitiveBody"]],
    [".personalization-copy > .section-kicker", "personalization.kicker"], ["#personalization h2", "personalization.heading"], [".personalization-copy > p:last-child", "personalization.body"],
    [".plan-builder-head > span:first-child", "personalization.planLabel"], [".plan-status", "personalization.planStatus"],
    [".plan-inputs dt", ["profile.position", "profile.foot", "profile.experience", "profile.space", "personalization.dtEquipment", "profile.time", "personalization.dtGoals"]],
    [".plan-inputs dd", ["playerA.position", "playerA.foot", "playerA.experience", "playerA.space", "personalization.ddEquipment", "playerA.time", "playerA.goal"]],
    [".plan-result span", "personalization.resultLabel"], [".plan-result strong", "personalization.resultText"],
    [".progress-copy > .section-kicker", "progress.kicker"], ["#progress h2", "progress.heading"], [".progress-copy > p:last-child", "progress.body"], ["#progress .progress-label", "progress.label"], ["#progress .progress-card h3", "progress.development"], ["#progress .progress-period", "progress.period"], ["#progress .progress-next span", "progress.next"], ["#progress .progress-next strong", "progress.priority"],
    ["#progress .progress-metric span", ["progress.ballControl", "progress.passing", "progress.weakFoot", "progress.oneVOne"]], ["#progress .progress-metric strong", ["progress.statusDeveloping", "progress.statusBuilding", "progress.statusDeveloping", "progress.statusStrongFocus"]],
    ["#example h2", "example.heading"], [".example-note", "example.note"], ["#preview h2", "preview.heading"], ["#preview .preview-copy p", "preview.body"], ["#openSession", "preview.open"],
    ["#free h2", "free.heading"], ["#free p", "free.body"], ["#free .btn", "actions.getStarted"],
    ["#final-cta h2", "final.heading"], ["#final-cta p", "final.body"], ["#final-cta .btn", "actions.getStarted"],
    ["#start .section-kicker", "onboarding.kicker"], ["#start h1", "onboarding.heading"], ["#start h2", "onboarding.heading"], ["#start .onboarding-intro", "onboarding.intro"], ["#start .privacy-note strong", "privacy.note"], ["#start .privacy-note a", "privacy.link"], ["#start legend", "onboarding.legend"], ["#start .level-option strong", ["audience.starting", "audience.recreational", "audience.schoolClub", "audience.competitive"]], ["#start .level-option small", ["onboarding.startingBody", "onboarding.recreationalBody", "onboarding.schoolClubBody", "onboarding.competitiveBody"]], ["#start button[type=submit]", "actions.continue"],
    ["#dialogTitle", "dialog.heading"], ["#sessionDialog .preview-subtitle", "dialog.subtitle"], ["#startSession", "dialog.start"],
    ["#headerActions > .btn-ghost", "actions.signIn"], ["#headerActions > .btn-primary", "actions.getStarted"], ["#a11yPanel .a11y-panel-title", ["accessibility.display", "accessibility.audio"]], ["#a11yPanel .a11y-row span", ["accessibility.theme", "accessibility.largeText", "accessibility.contrast", "accessibility.motion"]], ["#a11yPanel .a11y-action", "accessibility.switchTheme"], ["#a11yPanel .a11y-coming-soon", "accessibility.audioBody"],
    ["#example .player-card h3", ["example.playerA", "example.playerB"]], ["#example .player-attrs span", ["profile.position", "profile.foot", "profile.experience", "profile.space", "profile.time", "profile.goal", "profile.position", "profile.foot", "profile.experience", "profile.space", "profile.time", "profile.goal"]], ["#example .player-attrs strong", ["playerA.position", "playerA.foot", "playerA.experience", "playerA.space", "playerA.time", "playerA.goal", "playerB.position", "playerB.foot", "playerB.experience", "playerB.space", "playerB.time", "playerB.goal"]], ["#example .equipment-label", ["equipment.available", "equipment.available"]], ["#example .equipment-list li", ["equipment.ball", "equipment.cones", "equipment.goal", "equipment.wall", "equipment.ball", "equipment.cones", "equipment.goals", "equipment.wall"]], ["#example .player-plan-label", ["plan.buildsToward", "plan.buildsToward"]], ["#example .player-plan p:last-child", ["playerA.plan", "playerB.plan"]], ["#example .training-list-label", ["training.heading", "training.heading"]], ["#example .training-list li span", ["playerA.exercise1", "playerA.exercise2", "playerA.exercise3", "playerA.exercise4", "playerB.exercise1", "playerB.exercise2", "playerB.exercise3", "playerB.exercise4", "playerB.exercise5"]],
    ["#preview .preview-card", "preview.sessionLabel"], ["#preview .preview-table caption", "preview.caption"],
    ["#preview .preview-card h3", "dialog.heading"], ["#preview .preview-duration", "dialog.duration"], ["#preview .preview-subtitle", "dialog.subtitle"], ["#preview .preview-table th", ["training.exercise", "training.time"]], ["#preview .preview-table td:first-child", ["dialog.exercise1", "dialog.exercise2", "dialog.exercise3", "dialog.exercise4", "dialog.exercise5"]], ["#preview .preview-table td:last-child", ["dialog.exercise1Time", "dialog.exercise2Time", "dialog.exercise3Time", "dialog.exercise4Time", "dialog.exercise5Time"]],
    ["#sessionDialog .session-list span", ["dialog.exercise1", "dialog.exercise2", "dialog.exercise3", "dialog.exercise4", "dialog.exercise5"]],
    [".footer-links a", ["footer.training", "footer.how", "footer.accessibility", "footer.help", "footer.privacy", "footer.terms", "footer.contact"]], [".footer-copy", "footer.copyright"]
  ];

  const englishSource = {};
  const getTargets = (selector) => Array.from(document.querySelectorAll(selector));
  const sourceText = (element) => element.dataset.sourceText || (element.dataset.sourceText = element.textContent.trim());
  const englishDialectText = (value) => {
    if (locale === "en-GB" || locale === "en-AU") {
      return value
        .replace(/\bpersonalized\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Personalised" : "personalised")
        .replace(/\bpersonalize\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Personalise" : "personalise")
        .replace(/\bpersonalization\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Personalisation" : "personalisation")
        .replace(/\bsoccer\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Football" : "football")
        .replace(/\bcenter\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Centre" : "centre")
        .replace(/\bdefense\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Defence" : "defence")
        .replace(/\bcolor\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Colour" : "colour")
        .replace(/\bfavorite\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Favourite" : "favourite")
        .replace(/\bfield\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Pitch" : "pitch")
        .replace(/\bcleats\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Boots" : "boots")
        .replace(/\borganizes\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Organises" : "organises");
    }
    if (locale === "en-CA") {
      return value
        .replace(/\bcolor\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Colour" : "colour")
        .replace(/\bcenter\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Centre" : "centre")
        .replace(/\bdefense\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Defence" : "defence")
        .replace(/\bfavorite\b/gi, (word) => word[0] === word[0].toUpperCase() ? "Favourite" : "favourite");
    }
    return value;
  };
  const translateValue = (key, fallback) => window.FIRST_TOUCH_TRANSLATIONS?.[locale]?.[key]
    ?? window.FIRST_TOUCH_TRANSLATIONS?.["en-US"]?.[key]
    ?? (locale.startsWith("en-") ? englishDialectText(fallback) : fallback);

  const applyTranslations = () => {
    translationTargets.forEach(([selector, keys]) => {
      const elements = getTargets(selector);
      elements.forEach((element, index) => {
        if (selector === "#top .hero-title") {
          const sourceLines = element.dataset.sourceLines
            ? JSON.parse(element.dataset.sourceLines)
            : Array.from(element.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent.trim())
              .filter(Boolean);
          element.dataset.sourceLines = JSON.stringify(sourceLines);
          element.replaceChildren(
            document.createTextNode(translateValue(keys[0], sourceLines[0])),
            document.createElement("br"),
            document.createTextNode(translateValue(keys[1], sourceLines[1]))
          );
          return;
        }
        const key = Array.isArray(keys) ? keys[index] : keys;
        if (!key) return;
        englishSource[key] ??= sourceText(element);
        const value = translateValue(key, englishSource[key]);
        if (selector === "#menuToggle") {
          element.setAttribute("aria-label", value);
        } else if (selector === "#preview .preview-card") {
          element.setAttribute("aria-label", value);
        } else if (selector === "#example .equipment-list li") {
          const icon = element.querySelector("span[aria-hidden]");
          element.replaceChildren(...(icon ? [icon, document.createTextNode(value)] : [document.createTextNode(value)]));
        } else {
          element.textContent = value;
        }
      });
    });
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      englishSource[key] ??= sourceText(element);
      element.textContent = translateValue(key, englishSource[key]);
    });
  };
  applyTranslations();

  /* Theme and display settings */
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let theme = settings.theme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  html.dataset.theme = theme;
  if (settings.textSize === "large") html.dataset.text = "large";
  if (settings.contrast === "high") html.dataset.contrast = "high";
  if (settings.motion === "reduced" || prefersReducedMotion.matches) html.dataset.motion = "reduced";

  const themeToggle = $("themeToggle");
  const panelThemeToggle = $("panelThemeToggle");
  const applyTheme = (next) => {
    theme = next; html.dataset.theme = theme;
    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(theme === "light"));
      themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
    if (panelThemeToggle) panelThemeToggle.textContent = theme === "dark" ? "Switch to light" : "Switch to dark";
    settings.theme = theme; saveSettings(settings);
  };
  if (themeToggle) themeToggle.addEventListener("click", () => applyTheme(theme === "dark" ? "light" : "dark"));
  if (panelThemeToggle) panelThemeToggle.addEventListener("click", () => applyTheme(theme === "dark" ? "light" : "dark"));
  applyTheme(theme);

  const largeTextBox = $("toggleLargeText");
  const contrastBox = $("toggleContrast");
  const motionBox = $("toggleMotion");
  if (largeTextBox) {
    largeTextBox.checked = settings.textSize === "large";
    largeTextBox.addEventListener("change", () => { if (largeTextBox.checked) html.dataset.text = "large"; else delete html.dataset.text; settings.textSize = largeTextBox.checked ? "large" : ""; saveSettings(settings); });
  }
  if (contrastBox) {
    contrastBox.checked = settings.contrast === "high";
    contrastBox.addEventListener("change", () => { if (contrastBox.checked) html.dataset.contrast = "high"; else delete html.dataset.contrast; settings.contrast = contrastBox.checked ? "high" : ""; saveSettings(settings); });
  }
  if (motionBox) {
    motionBox.checked = settings.motion === "reduced" || prefersReducedMotion.matches;
    if (prefersReducedMotion.matches) motionBox.disabled = true;
    motionBox.addEventListener("change", () => { if (motionBox.checked) html.dataset.motion = "reduced"; else delete html.dataset.motion; settings.motion = motionBox.checked ? "reduced" : ""; saveSettings(settings); });
  }

  /* In-place language selector */
  const langLabel = $("langLabel");
  const langOptions = document.querySelectorAll(".lang-option");
  const setLocale = (target) => {
    if (!locales[target]) return;
    locale = target;
    html.dataset.locale = locale;
    html.lang = locale === "zh" ? "zh-Hans" : locale;
    settings.locale = locale;
    saveSettings(settings);
    applyTranslations();
    if (langLabel) langLabel.textContent = locales[locale].label;
    langOptions.forEach((option) => option.classList.toggle("is-active", option.dataset.locale === locale));
    $("langMenu").hidden = true;
    $("langToggle").setAttribute("aria-expanded", "false");
  };
  langOptions.forEach((option) => {
    const target = option.dataset.locale;
    option.classList.toggle("is-active", target === locale);
    option.addEventListener("click", () => setLocale(target));
  });
  if (langLabel) langLabel.textContent = locales[locale].label;

  /* Dropdowns */
  const dropdowns = [];
  const closeAllDropdowns = () => dropdowns.forEach((close) => close());
  const setupDropdown = (toggleId, menuId) => {
    const toggle = $(toggleId); const menu = $(menuId);
    if (!toggle || !menu) return;
    const close = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
    const open = () => { closeAllDropdowns(); menu.hidden = false; toggle.setAttribute("aria-expanded", "true"); };
    toggle.addEventListener("click", (event) => { event.stopPropagation(); menu.hidden ? open() : close(); });
    menu.addEventListener("click", (event) => event.stopPropagation());
    dropdowns.push(close);
  };
  setupDropdown("langToggle", "langMenu"); setupDropdown("a11yToggle", "a11yPanel");
  document.addEventListener("click", closeAllDropdowns);

  /* Mobile menu */
  const menuToggle = $("menuToggle");
  const headerActions = $("headerActions");
  const closeMobileMenu = (restoreFocus = true) => { if (!headerActions) return; headerActions.classList.remove("is-open"); menuToggle?.setAttribute("aria-expanded", "false"); menuToggle?.setAttribute("aria-label", translateValue("navigation.menuOpen", "Open menu")); if (restoreFocus) menuToggle?.focus(); };
  const openMobileMenu = () => { headerActions?.classList.add("is-open"); menuToggle?.setAttribute("aria-expanded", "true"); menuToggle?.setAttribute("aria-label", translateValue("navigation.menuClose", "Close menu")); headerActions?.querySelector("button, a")?.focus(); };
  menuToggle?.addEventListener("click", () => headerActions.classList.contains("is-open") ? closeMobileMenu() : openMobileMenu());
  headerActions?.querySelectorAll(".btn").forEach((link) => link.addEventListener("click", () => closeMobileMenu(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeAllDropdowns(); if (headerActions?.classList.contains("is-open")) closeMobileMenu(); } });

  /* Session dialog and onboarding */
  const sessionDialog = $("sessionDialog"); const openSession = $("openSession"); const closeSession = $("closeSession"); const startSession = $("startSession"); const sessionStatus = $("sessionStatus");
  const closeSessionDialog = () => { if (!sessionDialog) return; sessionDialog.hidden = true; openSession?.focus(); };
  openSession?.addEventListener("click", () => { sessionDialog.hidden = false; closeSession?.focus(); });
  closeSession?.addEventListener("click", closeSessionDialog); sessionDialog?.querySelector("[data-close-dialog]")?.addEventListener("click", closeSessionDialog);
  startSession?.addEventListener("click", () => { if (sessionStatus) sessionStatus.textContent = translateValue("dialog.success", "This example session is ready to start in the app."); });
  const onboardingForm = $("onboardingForm");
  onboardingForm?.addEventListener("submit", (event) => { event.preventDefault(); const status = $("onboardingStatus"); if (status) status.textContent = translateValue("onboarding.success", "Great start. Next, we’ll shape the plan around your position, space, and goals."); });

  /* Header state and hero animation */
  const header = $("siteHeader");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  /* Example player tabs */
  const tabA = $("tabA"); const tabB = $("tabB"); const panelA = $("panelA"); const panelB = $("panelB");
  const showPlayer = (which) => { const active = which === "A"; tabA?.classList.toggle("is-active", active); tabB?.classList.toggle("is-active", !active); tabA?.setAttribute("aria-selected", String(active)); tabB?.setAttribute("aria-selected", String(!active)); panelA?.classList.toggle("is-visible", active); panelB?.classList.toggle("is-visible", !active); };
  if (tabA && tabB) { showPlayer("A"); tabA.addEventListener("click", () => showPlayer("A")); tabB.addEventListener("click", () => showPlayer("B")); }
})();