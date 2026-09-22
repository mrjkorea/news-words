(function () {
  "use strict";

  const Algo = window.WordFactoryAlgo;
  const LS_STATE = "mrj.word_factory.state";
  const LS_EVENTS = "mrj.word_factory.events";
  const DEMO_PACK_ID = "news-2026-09-18";
  const NEWS_INDEX_URL = "packs/index.json";

  const DEMO_FALLBACK = {
    id: DEMO_PACK_ID,
    title: "News 2026-09-18",
    words: [
      { id: "detector", en: "detector", ko: "탐지기" },
      { id: "hoard", en: "hoard", ko: "비축" },
      { id: "silver", en: "silver", ko: "은" },
      { id: "coin", en: "coin", ko: "동전" },
      { id: "jewelry", en: "jewelry", ko: "보석" },
      { id: "treasure", en: "treasure", ko: "보물" },
      { id: "ancient", en: "ancient", ko: "고대의" },
      { id: "museum", en: "museum", ko: "박물관" },
      { id: "container", en: "container", ko: "용기" },
      { id: "discover", en: "discover", ko: "발견하다" },
    ],
  };

  function urlDate() {
    try {
      const d = new URLSearchParams(window.location.search).get("date");
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    } catch (e) {}
    return null;
  }

  function newsPackIdFromUrl() {
    const d = urlDate();
    return d ? "news-" + d : null;
  }

  const $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  const $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  const I18n = window.WordFactoryI18n;
  const t = function (key, vars) { return I18n ? I18n.t(key, vars) : key; };

  function localeCode() {
    if (I18n && I18n.getLocale) return I18n.getLocale();
    return state.locale || "en";
  }

  function meaning(w) {
    if (!w) return "";
    const loc = localeCode();
    const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : {};
    const wwEn =
      w.ww && w.ww.def && w.ww.def.en ? String(w.ww.def.en).trim() : "";
    const l1En = String(l1.en || "").trim();
    const enExplanation = wwEn || l1En;
    if (loc === "en") return enExplanation || String(w.en || "").trim();
    let native = String(l1[loc] || "").trim();
    if (!native && loc === "ko") native = String(w.ko || "").trim();
    return native;
  }

  function packWord(w, i) {
    const l1 = w.l1 && typeof w.l1 === "object" ? w.l1 : null;
    return {
      id: String(w.id || w.en || "w" + (i + 1)),
      en: String(w.en || w.word || ""),
      ko: String(w.ko || (l1 && l1.ko) || (l1 && l1.en) || w.meaning || w.en || ""),
      l1: l1,
      ww: w.ww && typeof w.ww === "object" ? w.ww : null,
    };
  }

  const testerMode = true;
  let currentScreen = "boot";
  let speechUnlocked = false;
  let voices = [];
  let linuxTts = false;
  let ttsProbe = null;

  let state = loadState();
  let learn = blankLearn();
  let quiz = blankQuiz();
  let matchGame = null;
  let listenGame = null;

  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-4)
    );
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.studentId) {
          if (!parsed.displayName) parsed.displayName = "";
          if (!parsed.testKind) parsed.testKind = "easy";
          if (!parsed.studySize) parsed.studySize = 10;
          if (!parsed.voice || parsed.voice === "man") parsed.voice = "us_m";
          if (parsed.voice === "woman") parsed.voice = "us_f";
          if (parsed.voice === "maya" || parsed.voice === "wizard") parsed.voice = parsed.voice === "wizard" ? "grandpa" : "grandma";
          return parsed;
        }
      }
    } catch (e) {}
    return {
      studentId: uid("stu"),
      sessionId: uid("ses"),
      voice: "us_m",
      displayName: "",
      testKind: "easy",
      studySize: 10,
      locale: "en",
      currentSetId: null,
      sets: {},
    };
  }

  function persist() {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(state));
    } catch (e) {}
  }

  function loadEvents() {
    try {
      const raw = localStorage.getItem(LS_EVENTS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function logEvent(partial) {
    const set = currentSet();
    const ev = {
      student_id: state.studentId,
      session_id: state.sessionId,
      module_id: "word_factory",
      activity_id: partial.activity_id || "",
      item_id: partial.item_id || "",
      skill_tags: partial.skill_tags || ["vocab"],
      set_id: set ? set.id : "",
      mode: partial.mode || "",
      response: partial.response == null ? "" : String(partial.response),
      correct: !!partial.correct,
      latency_ms: partial.latency_ms || 0,
      wins_toward_2: partial.wins_toward_2 || 0,
      points: partial.points || 0,
      errors: partial.errors || 0,
      started_at: partial.started_at || Date.now(),
      ended_at: Date.now(),
      ui_locale: state.locale || "en",
    };
    const events = loadEvents();
    events.push(ev);
    try {
      localStorage.setItem(LS_EVENTS, JSON.stringify(events));
    } catch (e) {}
  }

  function currentSet() {
    return state.sets[state.currentSetId] || null;
  }

  function winsState(set) {
    return { winsA: set.winsA, winsB: set.winsB, winsC: set.winsC };
  }

  function factoryCleared(set) {
    return Algo.startMode(set.words, winsState(set)) === null;
  }

  function syncPack() {
    const set = currentSet();
    window.MRJ_WORD_FACTORY_PACK = set
      ? { words: set.words.map(function (w) { return { id: w.id, en: w.en, ko: w.ko }; }) }
      : { words: [] };
  }

  function blankLearn() {
    return {
      mode: "A",
      queue: [],
      cur: null,
      typed: "",
      startedAt: 0,
      locking: false,
      missTeach: false,
    };
  }

  function blankQuiz() {
    return {
      kind: "easy",
      items: [],
      index: 0,
      typed: "",
      score: 0,
      startedAt: 0,
      locking: false,
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  }

  let nameReturnTo = "boot";

  function openNameScreen(returnTo) {
    nameReturnTo = returnTo || currentScreen;
    const input = $("#name-input");
    if (input) {
      input.value = state.displayName || "";
      try {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (e) {}
    }
    showScreen("name");
  }

  function showScreen(name) {
    currentScreen = name;
    $$(".screen").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-screen") === name);
    });
    const back = $("#btn-back");
    const voice = $("#voice-toggle");
    const topbar = $("#topbar");
    const typing = name === "learn" || name === "test";
    const quiet = name === "boot" || name === "name" || name === "home";
    if (topbar) {
      topbar.hidden = name === "boot";
      topbar.classList.toggle("no-back", name === "home");
    }
    back.hidden = name === "boot" || name === "home";
    voice.hidden = quiet || typing || name === "playgame";
    const tb = $("#teacher-bar");
    if (tb) tb.hidden = quiet || typing || name === "playgame";
    document.querySelector(".phone").classList.toggle("play", typing || name === "playgame");
    if (name !== "learn") {
      const cap = $("#caption-fallback");
      if (cap) cap.hidden = true;
    }
  }

  function setVoice(code) {
    const ok = { us_m: 1, us_f: 1, uk_m: 1, uk_f: 1, grandma: 1, leo: 1, grandpa: 1, robot: 1 };
    state.voice = ok[code] ? code : "us_m";
    persist();
    $$(".voice-btn").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-voice") === state.voice ? "true" : "false");
    });
  }

  function refreshVoices() {
    if (!window.speechSynthesis) return;
    voices = speechSynthesis.getVoices() || [];
  }

  function pickVoice() {
    refreshVoices();
    if (!voices.length) return null;
    const wantMan = state.voice !== "woman";
    const femaleRe = /female|woman|samantha|karen|victoria|zira|moira|kyoko|yuna|nicky|tessa|fiona|veena|zuzana|susan|martha|princess|bella|siri|allison|ava|kathy|paulina|meijia|tingting/i;
    const maleRe = /\bmale\b|\bman\b|daniel|alex|fred|david|tom|ravi|arthur|aaron|gordon|jorge|diego|ralph|bruce|albert|puck|fred|whisper|bad news|good news|trinoids|boing|zarvox|cellos|nicky male|google us english male|english united states male|microsoft david|microsoft mark|microsoft guy/i;
    let best = null;
    let bestScore = -9999;
    voices.forEach(function (v) {
      const blob = ((v.name || "") + " " + (v.voiceURI || "") + " " + (v.lang || "")).toLowerCase();
      let score = 0;
      const en = /^en\b|en[-_]/.test(v.lang || "") || /english/.test(blob);
      if (en) score += 8;
      const isF = femaleRe.test(blob) && !/\bmale\b/.test(blob.replace("female", ""));
      const isM = maleRe.test(blob) && !/female/.test(blob);
      if (wantMan) {
        if (isM) score += 24;
        if (isF) score -= 30;
      } else {
        if (isF) score += 24;
        if (isM) score -= 30;
      }
      if (v.localService) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    });
    if (wantMan && best) {
      const blob = ((best.name || "") + " " + (best.voiceURI || "")).toLowerCase();
      const isF = femaleRe.test(blob) && !/\bmale\b/.test(blob.replace("female", ""));
      if (isF) {
        const maleOnly = voices.filter(function (v) {
          const b = ((v.name || "") + " " + (v.voiceURI || "") + " " + (v.lang || "")).toLowerCase();
          return maleRe.test(b) && !/female/.test(b);
        });
        if (maleOnly.length) best = maleOnly[0];
      }
    }
    return best;
  }

  function hasSpeech() {
    return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
  }

  function probeLinuxTts() {
    ttsProbe = fetch("/__mrj/tts", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        linuxTts = !!(j && j.linux_tts);
        return linuxTts;
      })
      .catch(function () {
        linuxTts = false;
        return false;
      });
    return ttsProbe;
  }

  let currentAudio = null;

  function dingOk() {
    try {
      const a = new Audio("audio/ding.wav");
      a.play().catch(function () {});
    } catch (e) {}
  }

  function currentPackId() {
    const set = currentSet();
    if (set && set.packId) return set.packId;
    const fromUrl = newsPackIdFromUrl();
    if (fromUrl) return fromUrl;
    return DEMO_PACK_ID;
  }

  function packBase() {
    return "packs/" + currentPackId();
  }

  function speak(str) {
    const id = String(str || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!id) return;
    const v = state.voice || "us_m";
    const src = packBase() + "/audio/" + v + "/" + id + ".mp3";
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }
    } catch (e) {}
    currentAudio = new Audio(src);
    const p = currentAudio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function speakWW(w) {
    const id = String((w && (w.id || w.en)) || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!id) return;
    const src = packBase() + "/audio/ww_us_m/" + id + ".mp3";
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }
    } catch (e) {}
    currentAudio = new Audio(src);
    const p = currentAudio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function wwLoc(blob) {
    if (!blob) return "";
    if (typeof blob === "string") return blob;
    const loc = localeCode();
    return String(blob[loc] || blob.en || "").trim();
  }

  function wwEn(blob) {
    if (!blob) return "";
    if (typeof blob === "string") return String(blob).trim();
    return String(blob.en || "").trim();
  }

  function fillWW(w) {
    const box = $("#meet-ww");
    if (!box) return;
    const ww = w && w.ww;
    if (!ww) {
      box.hidden = true;
      return;
    }
    const def = wwEn(ww.def);
    const ex = wwLoc(ww.example);
    const exEn = wwEn(ww.example);
    const origin = wwLoc(ww.origin);
    const syn = wwEn(ww.syn);
    const ant = wwEn(ww.ant);
    const bits = wwEn(ww.bits);
    if (!def && !exEn && !origin && !syn && !ant && !bits) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const posEl = $("#ww-pos");
    if (posEl) posEl.textContent = ww.pos === "n" ? t("ww_noun") : (ww.pos || "");
    const defEl = $("#ww-def");
    if (defEl) {
      defEl.textContent = def;
      defEl.hidden = !def;
    }
    const exBtn = $("#ww-ex");
    if (exBtn) {
      exBtn.textContent = (ww.example && ww.example.en) || exEn || "";
      exBtn.hidden = !exBtn.textContent;
    }
    const exL1 = $("#ww-ex-l1");
    if (exL1) {
      const loc = localeCode();
      const shown = loc === "en" ? "" : ex;
      exL1.textContent = shown;
      exL1.hidden = !shown;
    }
    const chips = $("#ww-chips");
    if (chips) {
      chips.innerHTML = "";
      function addChip(label, value) {
        if (!value) return;
        const span = document.createElement("span");
        span.className = "ww-chip";
        span.textContent = label + ": " + value;
        chips.appendChild(span);
      }
      addChip(t("ww_bits"), bits);
      addChip(t("ww_origin"), origin);
      addChip(t("ww_like"), syn);
      addChip(t("ww_unlike"), ant);
    }
  }

  function speakLetter(ch) {
    const id = String(ch || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!id) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.src = "";
        }
      } catch (e) {}
      const shared = "packs/_shared/audio/letters/" + id + ".mp3";
      const primary = packBase() + "/audio/letters/" + id + ".mp3";
      currentAudio = new Audio(primary);
      currentAudio.onended = function () { resolve(); };
      currentAudio.onerror = function () {
        if (currentAudio && currentAudio.src.indexOf("_shared") < 0) {
          currentAudio.src = shared;
          const p2 = currentAudio.play();
          if (p2 && p2.catch) p2.catch(function () { resolve(); });
        } else {
          resolve();
        }
      };
      const p = currentAudio.play();
      if (p && p.catch) p.catch(function () { resolve(); });
      setTimeout(resolve, 2200);
    });
  }

  function unlockSpeech() {
    if (speechUnlocked) return;
    speechUnlocked = true;
    if (!hasSpeech()) return;
    refreshVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = refreshVoices;
    }
    try {
      const u = new SpeechSynthesisUtterance("ready");
      u.volume = 0.01;
      u.rate = 2;
      u.lang = "en-US";
      speechSynthesis.speak(u);
    } catch (e) {}
    setInterval(function () {
      try {
        if (speechSynthesis.paused) speechSynthesis.resume();
      } catch (e2) {}
    }, 400);
  }

  function flashMark(ok) {
    const el = $("#flash");
    const mark = $("#flash-mark");
    if (!el) return wait(ok ? 650 : 850);
    mark.textContent = ok ? "✓" : "✕";
    el.className = "flash " + (ok ? "ok" : "bad");
    el.hidden = false;
    return wait(ok ? 650 : 850).then(function () {
      el.hidden = true;
    });
  }

  const STUDY_SIZES = [5, 10, 15, 20];
  let tap = blankTap();

  function studySize() {
    const n = Number(state.studySize);
    return STUDY_SIZES.indexOf(n) >= 0 ? n : 10;
  }

  function batchWords(set) {
    set = set || currentSet();
    if (!set || !set.words || !set.words.length) return [];
    const n = Math.min(studySize(), set.words.length);
    const undone = set.words.filter(function (w) {
      const intro = !(set.intro && set.intro[w.id]);
      const a = (set.winsA[w.id] || 0) < 2;
      const b = (set.winsB[w.id] || 0) < 2;
      const c = (set.winsC[w.id] || 0) < 2;
      return intro || a || b || c;
    });
    const src = undone.length ? undone : set.words;
    return src.slice(0, n);
  }

  function playWords(set) {
    return batchWords(set);
  }

  function batchKey(set) {
    return batchWords(set).map(function (w) { return w.id; }).join(",");
  }

  function tapmapDone(set) {
    if (!set) return true;
    const key = batchKey(set);
    if (!key) return true;
    return set.tapmapKey === key;
  }

  function introDone(set) {
    if (!set || !set.intro) set.intro = {};
    const words = batchWords(set);
    if (!words.length) return true;
    return tapmapDone(set) && words.every(function (w) { return !!set.intro[w.id]; });
  }

  function blankTap() {
    return {
      phase: "explore",
      words: [],
      found: {},
      queue: [],
      cur: null,
      started: 0,
      locking: false,
    };
  }

  function burst(msg) {
    const el = $("#burst");
    $("#burst-msg").textContent = msg;
    el.hidden = false;
    clearTimeout(burst._t);
    burst._t = setTimeout(function () {
      el.hidden = true;
    }, 1400);
    return wait(1400);
  }

  function shakeCard() {
    const card = $("#prompt-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }

  function makeSet(title, words, packId) {
    const empty = Algo.emptyWins();
    return {
      id: uid("set"),
      packId: packId || null,
      title: title,
      words: words,
      winsA: empty.winsA,
      winsB: empty.winsB,
      winsC: empty.winsC,
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      intro: {},
      rememberForever: false,
      nextReviewAt: null,
    };
  }

  function activateSet(set) {
    state.sets[set.id] = set;
    state.currentSetId = set.id;
    set.lastPlayedAt = Date.now();
    persist();
    syncPack();
  }

  function parseList(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);
    const words = [];
    const seen = {};
    lines.forEach(function (line, idx) {
      if (/^word\s*[,|\t]/i.test(line)) return;
      let parts;
      if (line.indexOf("\t") >= 0) parts = line.split("\t");
      else parts = line.split(",");
      if (parts.length < 2) return;
      const en = parts[0].trim().replace(/^["']|["']$/g, "");
      const ko = parts.slice(1).join(",").trim().replace(/^["']|["']$/g, "");
      if (!en || !ko) return;
      const key = norm(en);
      if (!key || seen[key]) return;
      seen[key] = true;
      words.push({ id: "w" + (idx + 1) + "_" + key, en: en, ko: ko });
    });
    return words;
  }

  async function loadPackFile(pid) {
    try {
      const res = await fetch("packs/" + pid + ".json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.words && data.words.length) {
          return {
            id: data.id || pid,
            title: data.title || pid,
            words: data.words.map(packWord).filter(function (w) { return w.en; }),
          };
        }
      }
    } catch (e) {}
    return null;
  }

  async function loadDemoPack() {
    return (await loadPackFile(DEMO_PACK_ID)) || DEMO_FALLBACK;
  }

  async function openPack(pid) {
    const pack = await loadPackFile(pid);
    if (!pack || !pack.words.length) return;
    const existing = Object.keys(state.sets)
      .map(function (k) { return state.sets[k]; })
      .find(function (s) { return s.packId === pid; });
    if (existing) {
      existing.title = pack.title;
      existing.words = pack.words;
      activateSet(existing);
      renderSetHome();
      showScreen("set");
      persist();
      return;
    }
    const set = makeSet(pack.title, pack.words, pid);
    activateSet(set);
    renderSetHome();
    showScreen("set");
  }

  async function openDemo() {
    const existing = Object.keys(state.sets)
      .map(function (k) { return state.sets[k]; })
      .find(function (s) { return s.packId === DEMO_PACK_ID; });
    if (existing) {
      const pack = await loadDemoPack();
      existing.title = pack.title;
      existing.words = pack.words;
      activateSet(existing);
      renderSetHome();
      showScreen("set");
      persist();
      return;
    }
    const pack = await loadDemoPack();
    const set = makeSet(pack.title, pack.words, DEMO_PACK_ID);
    activateSet(set);
    renderSetHome();
    showScreen("set");
  }

  let newsIndexCache = null;

  async function loadNewsIndex() {
    if (newsIndexCache) return newsIndexCache;
    try {
      const res = await fetch(NEWS_INDEX_URL, { cache: "no-store" });
      if (res.ok) newsIndexCache = await res.json();
    } catch (e) {}
    return newsIndexCache || [];
  }

  async function renderNewsDayList() {
    const host = $("#news-day-list");
    if (!host) return;
    host.innerHTML = "";
    const rows = await loadNewsIndex();
    const curPid = newsPackIdFromUrl();
    rows.slice(0, 15).forEach(function (row) {
      const date = row.date || row.id;
      const pid = "news-" + date;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chunk" + (curPid === pid ? " primary" : "");
      const title = row.title || date;
      btn.innerHTML =
        '<span class="chip-tag">' + date + "</span><strong>" + title + "</strong><em>10 words</em>";
      btn.addEventListener("click", function () {
        const u = new URL(window.location.href);
        u.searchParams.set("date", date);
        window.location.href = u.pathname + "?" + u.searchParams.toString();
      });
      host.appendChild(btn);
    });
  }

  async function afterBootHome() {
    const pid = newsPackIdFromUrl();
    if (pid) {
      await openPack(pid);
      return;
    }
    // YouTube "All news words" and bare / must land on the date index.
    window.location.replace("days.html");
  }

  function renderHome() {
    const btn = $("#btn-continue");
    const set = currentSet();
    const hello = $("#hello-line");
    if (hello) hello.textContent = state.displayName ? t("hello", { name: state.displayName }) : "";
    renderNewsDayList();
    let forever = 0;
    let trying = 0;
    Object.keys(state.sets).forEach(function (k) {
      const s = state.sets[k];
      if (s.srsForever) forever += (s.words || []).length;
      else if (s.srsTrying) trying += (s.words || []).length;
    });
    const sl = $("#stats-line");
    if (sl) sl.textContent = t("stats_line", { forever: forever, trying: trying });
    const due = $("#due-line");
    if (due) {
      const now = Date.now();
      const dueSet = Object.keys(state.sets).map(function (k) { return state.sets[k]; }).find(function (s) {
        return s.srsTrying && !s.srsForever && s.srsNextAt && s.srsNextAt <= now;
      });
      due.hidden = !dueSet;
      if (dueSet) due.textContent = t("due_line", { title: dueSet.title });
    }
    if (!set) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    $("#continue-title").textContent = set.title;
    if (factoryCleared(set)) {
      $("#continue-meta").textContent = t("cleared_meta");
    } else {
      const mode = Algo.startMode(set.words, winsState(set));
      $("#continue-meta").textContent = t("continue_meta", { mode: I18n.partName(mode) });
    }
  }

  function renderSetHome() {
    const set = currentSet();
    if (!set) return;
    $("#set-title").textContent = set.title;
    const ws = winsState(set);
    const pct = Algo.factoryProgress(set.words, ws);
    $("#set-pct").textContent = t("pct", { n: pct });
    renderStudySize(set);
    $$("#progress-ribbon .rib").forEach(function (el) {
      const jump = el.getAttribute("data-jump");
      const met = introDone(set);
      if (jump === "intro") el.classList.toggle("done", met);
      if (jump === "A" || jump === "B" || jump === "C") {
        const wins = Algo.bucket(ws, jump);
        el.classList.toggle("done", Algo.partDone(set.words, wins));
        el.classList.toggle("now", Algo.startMode(set.words, ws) === jump);
      }
    });
    const chips = $("#word-chips");
    chips.innerHTML = "";
    set.words.forEach(function (w) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "word-row";
      btn.setAttribute("aria-label", t("speak_word") + " " + w.en);
      btn.innerHTML = '<span class="en"></span><span class="meaning"></span><span class="ear" aria-hidden="true">🔊</span>';
      btn.querySelector(".en").textContent = w.en;
      btn.querySelector(".meaning").textContent = meaning(w);
      btn.addEventListener("click", function () {
        unlockSpeech();
        speak(w.en);
      });
      chips.appendChild(btn);
    });
    const cleared = factoryCleared(set);
    const met = introDone(set);
    $("#btn-easy").disabled = false;
    $("#btn-hard").disabled = false;
    $("#btn-easy").classList.toggle("picked", state.testKind === "easy");
    $("#btn-hard").classList.toggle("picked", state.testKind === "hard");
    $("#btn-learn").disabled = false;
    $("#intro-label").textContent = met ? t("intro_again") : t("intro_go");
    if (cleared) {
      $("#learn-label").textContent = t("relearn");
    } else {
      const mode = Algo.startMode(set.words, ws);
      $("#learn-label").textContent = mode === "A" && Algo.factoryProgress(set.words, ws) === 0
        ? t("start_learn")
        : t("continue_learn");
    }
    syncPack();
  }

  function renderStudySize(set) {
    const host = $("#study-size");
    if (!host) return;
    host.innerHTML = "";
    const max = set && set.words ? set.words.length : 20;
    const current = Math.min(studySize(), max);
    STUDY_SIZES.forEach(function (n) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(n);
      btn.disabled = n > max;
      btn.classList.toggle("on", n === current);
      btn.addEventListener("click", function () {
        if (n > max) return;
        state.studySize = n;
        persist();
        renderSetHome();
      });
      host.appendChild(btn);
    });
  }

  let introCurId = null;
  let meetPool = [];
  let meetBuilt = [];
  let introTyped = "";

  function wordPic(w) {
    const id = String((w && (w.id || w.en)) || "").toLowerCase().replace(/[^a-z]/g, "");
    return packBase() + "/" + id + ".png";
  }

  function scramble(en) {
    const chars = String(en || "").replace(/[^a-zA-Z]/g, "").toUpperCase().split("");
    let pool = chars.map(function (ch, i) { return { id: i, ch: ch }; });
    for (let n = 0; n < 12; n++) {
      pool = shuffle(pool);
      if (pool.map(function (x) { return x.ch; }).join("") !== chars.join("")) break;
    }
    return pool;
  }

  function startMeet() {
    startTapmap();
  }

  function startTapmap() {
    const set = currentSet();
    if (!set) return;
    if (!set.intro) set.intro = {};
    const words = batchWords(set);
    if (!words.length) {
      learn = blankLearn();
      showScreen("learn");
      beginPart("A");
      return;
    }
    tap = blankTap();
    tap.words = words.slice();
    tap.phase = "explore";
    tap.started = Date.now();
    const card = $("#meet-card");
    const map = $("#tapmap");
    if (card) card.hidden = true;
    if (map) map.hidden = false;
    renderTapmap();
    showScreen("intro");
  }

  function tapPhaseIndex() {
    if (tap.phase === "listen") return 2;
    if (tap.phase === "read") return 3;
    return 1;
  }

  function tapFoundCount() {
    if (tap.phase === "explore") return Object.keys(tap.found).length;
    return tap.words.length - tap.queue.length - (tap.cur ? 1 : 0);
  }

  function renderTapmap() {
    const map = $("#tapmap");
    if (map) map.hidden = false;
    const card = $("#meet-card");
    if (card) card.hidden = true;
    const n = tap.words.length;
    $("#tap-round-n").textContent = String(tapPhaseIndex());
    $("#tap-round-name").textContent = t("tap_" + tap.phase);
    $("#tap-hint").textContent = t("tap_hint_" + tap.phase);
    const found = tap.phase === "explore"
      ? Object.keys(tap.found).length
      : Math.max(0, n - tap.queue.length - (tap.cur ? 1 : 0));
    $("#tap-prog").textContent = t("tap_prog", { found: found, total: n });
    const speakBtn = $("#btn-tap-speak");
    const wordEl = $("#tap-word");
    if (tap.phase === "explore") {
      speakBtn.hidden = true;
      wordEl.hidden = true;
    } else if (tap.phase === "listen") {
      speakBtn.hidden = false;
      wordEl.hidden = true;
    } else {
      speakBtn.hidden = true;
      wordEl.hidden = false;
      wordEl.textContent = tap.cur ? tap.cur.en : "";
    }
    const grid = $("#tap-grid");
    grid.setAttribute("data-n", String(n <= 5 ? 5 : n <= 10 ? 10 : n <= 15 ? 15 : 20));
    grid.innerHTML = "";
    tap.words.forEach(function (w) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tap-tile";
      btn.setAttribute("data-id", w.id);
      if (tap.phase === "explore" && tap.found[w.id]) btn.classList.add("found");
      if (tap.cur && tap.cur.id === w.id && tap.phase !== "explore") {
        /* don't highlight target */
      }
      const img = document.createElement("img");
      img.src = wordPic(w);
      img.alt = tap.phase === "explore" && tap.found[w.id] ? w.en : "";
      img.draggable = false;
      btn.appendChild(img);
      if (tap.phase === "explore" && tap.found[w.id]) {
        const lab = document.createElement("span");
        lab.className = "lab";
        lab.textContent = w.en;
        btn.appendChild(lab);
      }
      btn.addEventListener("click", function () { onTapTile(w, btn); });
      grid.appendChild(btn);
    });
    showScreen("intro");
  }

  function pulseTile(el, cls) {
    if (!el) return;
    el.classList.remove("on", "wrong", "shake");
    void el.offsetWidth;
    el.classList.add(cls);
    if (cls === "wrong") el.classList.add("shake");
    setTimeout(function () {
      el.classList.remove("on", "wrong", "shake");
    }, 450);
  }

  function tileEl(id) {
    return $("#tap-grid [data-id=\"" + id + "\"]") || null;
  }

  function onTapTile(w, el) {
    if (tap.locking) return;
    unlockSpeech();
    if (tap.phase === "explore") {
      tap.found[w.id] = true;
      speak(w.en);
      pulseTile(el, "on");
      logEvent({
        activity_id: "tapmap_explore",
        item_id: w.id,
        skill_tags: ["vocab", "tapmap", "explore"],
        mode: "explore",
        response: w.en,
        correct: true,
        latency_ms: Date.now() - (tap.started || Date.now()),
        started_at: tap.started,
      });
      renderTapmap();
      if (Object.keys(tap.found).length >= tap.words.length) {
        tap.locking = true;
        wait(550).then(function () { beginTapQuiz("listen"); });
      }
      return;
    }
    const want = tap.cur;
    if (!want) return;
    const ok = w.id === want.id;
    pulseTile(el, ok ? "on" : "wrong");
    logEvent({
      activity_id: tap.phase === "listen" ? "tapmap_listen" : "tapmap_read",
      item_id: want.id,
      skill_tags: ["vocab", "tapmap", tap.phase],
      mode: tap.phase,
      response: w.en,
      correct: ok,
      latency_ms: Date.now() - (tap.started || Date.now()),
      started_at: tap.started,
      errors: ok ? 0 : 1,
    });
    if (!ok) {
      flashMark(false);
      if (tap.phase === "listen") speak(want.en);
      return;
    }
    dingOk();
    flashMark(true).then(function () { advanceTapQuiz(); });
  }

  function beginTapQuiz(phase) {
    tap.phase = phase;
    tap.found = {};
    tap.queue = shuffle(tap.words.slice());
    tap.cur = tap.queue.shift() || null;
    tap.started = Date.now();
    tap.locking = false;
    renderTapmap();
    if (phase === "listen" && tap.cur) speak(tap.cur.en);
  }

  function advanceTapQuiz() {
    if (tap.queue.length) {
      tap.cur = tap.queue.shift();
      tap.started = Date.now();
      tap.locking = false;
      renderTapmap();
      if (tap.phase === "listen" && tap.cur) speak(tap.cur.en);
      return;
    }
    if (tap.phase === "listen") {
      beginTapQuiz("read");
      return;
    }
    finishTapmap();
  }

  function finishTapmap() {
    const set = currentSet();
    if (!set) return;
    set.tapmapKey = batchKey(set);
    if (!set.intro) set.intro = {};
    tap.words.forEach(function (w) { set.intro[w.id] = true; });
    persist();
    burst(t("tap_done"));
    tap.locking = true;
    wait(700).then(function () {
      learn = blankLearn();
      showScreen("learn");
      beginPart("A");
    });
  }

  function skipTapTarget() {
    if (tap.phase === "explore") {
      const miss = tap.words.find(function (w) { return !tap.found[w.id]; });
      if (miss) onTapTile(miss, tileEl(miss.id));
      return;
    }
    if (tap.cur) advanceTapQuiz();
  }

  function skipTapmap() {
    const set = currentSet();
    if (!set) return;
    set.tapmapKey = batchKey(set);
    if (!set.intro) set.intro = {};
    batchWords(set).forEach(function (w) { set.intro[w.id] = true; });
    persist();
    learn = blankLearn();
    showScreen("learn");
    beginPart("A");
  }

  function currentMeetWord() {
    const set = currentSet();
    if (!set) return null;
    return set.words.find(function (w) { return w.id === introCurId; }) || null;
  }

  function renderMeet() {
    const w = currentMeetWord();
    if (!w) return;
    const pic = $("#meet-pic");
    pic.src = wordPic(w);
    pic.alt = w.en;
    $("#meet-en").textContent = w.en;
    $("#meet-ko").textContent = meaning(w);
    fillWW(w);
    const built = $("#meet-built");
    const pool = $("#meet-pool");
    built.innerHTML = "";
    pool.innerHTML = "";
    meetBuilt.forEach(function (tile, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = tile.ch;
      b.addEventListener("click", function () {
        meetBuilt.splice(idx, 1);
        meetPool.push(tile);
        renderMeet();
      });
      built.appendChild(b);
    });
    meetPool.forEach(function (tile, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = tile.ch;
      b.addEventListener("click", function () {
        meetPool.splice(idx, 1);
        meetBuilt.push(tile);
        const got = meetBuilt.map(function (x) { return x.ch; }).join("");
        const want = String(w.en).replace(/[^a-zA-Z]/g, "").toUpperCase();
        if (got.length === want.length) {
          const ok = got === want;
          flashMark(ok).then(function () {
            if (ok) {
              dingOk();
              const set = currentSet();
              set.intro[w.id] = true;
              persist();
              const nxt = set.words.find(function (x) { return !set.intro[x.id]; });
              if (nxt) {
                introCurId = nxt.id;
                meetBuilt = [];
                meetPool = scramble(nxt.en);
                renderMeet();
                speak(nxt.en);
              } else {
                startLearnAt("A");
              }
            }
          });
        }
        renderMeet();
      });
      pool.appendChild(b);
    });
    showScreen("intro");
  }

  function startLearnAt(mode) {
    const set = currentSet();
    if (!set) return;
    if (!tapmapDone(set)) return startTapmap();
    learn = blankLearn();
    showScreen("learn");
    beginPart(mode);
  }

  function jumpTo(step) {
    const go = function () {
      if (step === "intro") return startMeet();
      if (step === "A" || step === "B" || step === "C") return startLearnAt(step);
      if (step === "test") return showTestPick();
      if (step === "games") return goGames();
    };
    if (!currentSet()) {
      openDemo().then(go);
      return;
    }
    go();
  }

  function skipMeetWord() {
    if (currentScreen === "intro" && $("#tapmap") && !$("#tapmap").hidden) {
      return skipTapTarget();
    }
    const set = currentSet();
    const w = currentMeetWord();
    if (!set || !w) return;
    set.intro[w.id] = true;
    persist();
    const nxt = set.words.find(function (x) { return !set.intro[x.id]; });
    if (nxt) {
      introCurId = nxt.id;
      meetBuilt = [];
      meetPool = scramble(nxt.en);
      renderMeet();
    } else startLearnAt("A");
  }

  function skipStep() {
    if (currentScreen === "intro") return skipTapmap();
    if (currentScreen === "learn") {
      if (learn.mode === "A") return startLearnAt("B");
      if (learn.mode === "B") return startLearnAt("C");
      renderSetHome();
      showScreen("set");
      return;
    }
    goGames();
  }

  function distractors(correct, n) {
    const set = currentSet();
    const others = shuffle(playWords(set).filter(function (w) { return w.id !== correct.id; }));
    const pick = others.slice(0, Math.max(0, n - 1));
    return shuffle([correct].concat(pick));
  }

  function fillChoices(host, items, kind, onPick) {
    host.innerHTML = "";
    host.hidden = false;
    items.forEach(function (w) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice" + (kind === "en" ? " en" : "");
      b.textContent = kind === "en" ? w.en : meaning(w);
      b.addEventListener("click", function () { onPick(w, b); });
      host.appendChild(b);
    });
  }

  function isKbDesk() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches
      && !window.matchMedia("(pointer: coarse)").matches;
  }

  function updateKbDesk() {
    document.body.classList.toggle("kb-desk", isKbDesk());
  }

  function watchKbDesk() {
    updateKbDesk();
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const coarse = window.matchMedia("(pointer: coarse)");
    function onMqChange() { updateKbDesk(); }
    if (fine.addEventListener) {
      fine.addEventListener("change", onMqChange);
      coarse.addEventListener("change", onMqChange);
    } else if (fine.addListener) {
      fine.addListener(onMqChange);
      coarse.addListener(onMqChange);
    }
  }

  function typingScreenActive() {
    if (currentScreen === "learn") {
      return learn.cur && !learn.locking && (learn.mode === "B" || learn.mode === "C");
    }
    if (currentScreen === "test") {
      return quiz && quiz.kind === "hard" && !quiz.locking;
    }
    return false;
  }

  function buildPad(host) {
    host.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (ch) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "az-key";
      b.textContent = ch;
      b.addEventListener("click", function () { onAz(ch); });
      host.appendChild(b);
    });
  }

  function onAz(ch) {
    if (currentScreen === "intro") {
      const set = currentSet();
      if (!introCurId && set && set.words[0]) introCurId = set.words[0].id;
      if (!set || !introCurId || set.intro[introCurId]) return;
      introTyped += ch;
      renderIntro();
      return;
    }
    if (currentScreen === "learn") {
      if (learn.locking || learn.mode === "A") return;
      learn.typed += ch;
      $("#typed-text").textContent = learn.typed;
    } else if (currentScreen === "test") {
      if (quiz.locking || quiz.kind !== "hard") return;
      quiz.typed += ch;
      $("#test-typed-text").textContent = quiz.typed;
    }
  }

  function delAz() {
    if (currentScreen === "intro") {
      introTyped = introTyped.slice(0, -1);
      renderIntro();
      return;
    }
    if (currentScreen === "learn") {
      if (learn.locking) return;
      learn.typed = learn.typed.slice(0, -1);
      $("#typed-text").textContent = learn.typed;
    } else if (currentScreen === "test") {
      if (quiz.locking) return;
      quiz.typed = quiz.typed.slice(0, -1);
      $("#test-typed-text").textContent = quiz.typed;
    }
  }

  function startLearn(reset) {
    const set = currentSet();
    if (!set) return;
    if (!testerMode && !introDone(set)) {
      startTapmap();
      return;
    }
    if (reset || factoryCleared(set)) {
      const empty = Algo.emptyWins();
      set.winsA = empty.winsA;
      set.winsB = empty.winsB;
      set.winsC = empty.winsC;
      persist();
    }
    const mode = Algo.startMode(set.words, winsState(set));
    if (!mode) {
      renderSetHome();
      showScreen("set");
      return;
    }
    learn = blankLearn();
    showScreen("learn");
    $("#tester-bar").hidden = !testerMode;
    beginPart(mode);
  }

  function beginPart(mode) {
    const set = currentSet();
    const words = playWords(set);
    const wins = Algo.bucket(winsState(set), mode);
    learn.mode = mode;
    learn.queue = Algo.makeQueue(words, wins);
    const nxt = Algo.nextWord(learn.queue, words, wins);
    learn.queue = nxt.queue;
    learn.cur = nxt.cur || words[0];
    learn.typed = "";
    learn.missTeach = false;
    learn.locking = false;
    renderLearn(true);
  }

  function renderLearn(doSpeak) {
    updateKbDesk();
    const set = currentSet();
    if (!set || !learn.cur) return;
    const ws = winsState(set);
    const wins = Algo.bucket(ws, learn.mode);
    const metaName = I18n.partName(learn.mode);
    const words = playWords(set);
    const rem = Algo.remaining(words, wins).length;
    const streak = wins[learn.cur.id] || 0;
    const pct = Algo.factoryProgress(words, ws);

    document.body.setAttribute("data-factory-mode", learn.mode);
    $("#mode-letter").textContent = learn.mode;
    $("#mode-ko").textContent = metaName;
    $("#mode-hint").textContent = I18n.partHint(learn.mode);
    $("#prog-text").textContent = t("prog", { pct: pct, left: rem, streak: streak });

    const en = $("#prompt-en");
    const ko = $("#prompt-ko");
    const typed = $("#typed-line");
    const choices = $("#choices");
    const az = $("#az-wrap");
    const rail = $("#letter-rail");
    const cap = $("#caption-fallback");
    rail.hidden = true;
    if (cap) cap.hidden = true;
    $("#typed-text").textContent = learn.typed;
    const card = $("#prompt-card");
    if (card) {
      card.setAttribute("data-en", learn.cur.en);
      card.setAttribute("data-ko", meaning(learn.cur));
    }

    if (learn.mode === "A") {
      en.hidden = false;
      en.textContent = learn.cur.en;
      ko.hidden = true;
      typed.hidden = true;
      az.hidden = true;
      fillChoices(choices, distractors(learn.cur, 4), "ko", onLearnChoice);
      if (doSpeak) speak(learn.cur.en);
      if (!hasSpeech() && cap) {
        cap.hidden = false;
        cap.textContent = learn.cur.en;
      }
    } else if (learn.mode === "B") {
      en.hidden = true;
      en.textContent = "";
      ko.hidden = true;
      typed.hidden = false;
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
      if (rail) {
        rail.hidden = true;
        rail.innerHTML = "";
      }
      if (cap) {
        cap.hidden = true;
        cap.textContent = "";
      }
      if (doSpeak) speak(learn.cur.en);
    } else {
      en.hidden = true;
      ko.hidden = false;
      ko.textContent = meaning(learn.cur);
      typed.hidden = false;
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
    }
    learn.startedAt = Date.now();
  }

  function onLearnChoice(word, btn) {
    if (learn.locking || learn.mode !== "A") return;
    const ok = word.id === learn.cur.id;
    $$("#choices .choice").forEach(function (el) { el.disabled = true; });
    btn.classList.add(ok ? "good" : "bad");
    if (!ok) {
      $$("#choices .choice").forEach(function (el) {
        if (el.textContent === meaning(learn.cur)) el.classList.add("good");
      });
    }
    gradeLearn(ok, meaning(word));
  }

  function onLearnCheck() {
    if (learn.locking || learn.mode === "A") return;
    if (!learn.typed) return;
    if (learn.mustCopy) {
      if (norm(learn.typed) !== norm(learn.cur.en)) {
        shakeCard();
        return;
      }
      learn.mustCopy = false;
      const nxt = learn.pendingNxt;
      learn.pendingNxt = null;
      learn.typed = "";
      advanceLearn(nxt, false, false);
      return;
    }
    const ok = norm(learn.typed) === norm(learn.cur.en);
    gradeLearn(ok, learn.typed);
  }

  async function gradeLearn(ok, response) {
    if (learn.locking) return;
    learn.locking = true;
    const set = currentSet();
    const ws = winsState(set);
    const wins = Algo.bucket(ws, learn.mode);
    const before = wins[learn.cur.id] || 0;
    const latency = Date.now() - learn.startedAt;
    const activity =
      learn.mode === "A" ? "learn_a" : learn.mode === "B" ? "learn_b" : "learn_c";
    const startedAt = learn.startedAt;
    const cur = learn.cur;

    if (learn.mode === "B" && !ok) {
      wins[cur.id] = 0;
      persist();
      logEvent({
        activity_id: activity,
        item_id: cur.id,
        mode: learn.mode,
        response: response,
        correct: false,
        latency_ms: latency,
        wins_toward_2: 0,
        points: 0,
        errors: 1,
        started_at: startedAt,
      });
      shakeCard();
      await teachSpelling(cur.en);
      learn.typed = "";
      $("#typed-text").textContent = "";
      learn.locking = false;
      learn.startedAt = Date.now();
      return;
    }

    if (learn.mode === "C" && !ok) {
      const nxt = Algo.applyGrade(learn.queue, playWords(set), wins, cur, false);
      persist();
      logEvent({
        activity_id: activity,
        item_id: cur.id,
        mode: learn.mode,
        response: response,
        correct: false,
        latency_ms: latency,
        wins_toward_2: wins[cur.id] || 0,
        points: 0,
        errors: 1,
        started_at: startedAt,
      });
      shakeCard();
      await replayEnglish(cur.en, 3);
      learn.mustCopy = true;
      learn.pendingNxt = nxt;
      learn.typed = "";
      $("#typed-text").textContent = "";
      const en = $("#prompt-en");
      en.hidden = false;
      en.textContent = cur.en;
      learn.locking = false;
      return;
    }

    const hitTwo = ok && before + 1 >= Algo.NEED;
    const nxt = Algo.applyGrade(learn.queue, playWords(set), wins, cur, ok);
    persist();
    logEvent({
      activity_id: activity,
      item_id: cur.id,
      mode: learn.mode,
      response: response,
      correct: ok,
      latency_ms: latency,
      wins_toward_2: wins[cur.id] || 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: startedAt,
    });
    if (ok) dingOk();
    await advanceLearn(nxt, hitTwo, ok);
  }

  async function advanceLearn(nxt, hitTwo, ok) {
    const set = currentSet();
    const meta = Algo.MODE_META[learn.mode];
    if (nxt.partDone) {
      const nextMode = Algo.nextMode(learn.mode);
      if (!nextMode) {
        await burst(t("factory_done"));
        showTestPick();
        return;
      }
      await burst(hitTwo ? t("two_clean") + " · " + t("part_done", { mode: I18n.partName(learn.mode) }) : t("part_done", { mode: I18n.partName(learn.mode) }));
      beginPart(nextMode);
      return;
    }
    if (hitTwo) await burst(t("two_clean"));
    else await wait(ok ? 380 : 520);
    learn.queue = nxt.queue;
    learn.cur = nxt.cur;
    learn.typed = "";
    learn.locking = false;
    learn.missTeach = false;
    renderLearn(true);
  }

  async function teachSpelling(word) {
    learn.missTeach = true;
    const typed = String(learn.typed || "").toUpperCase();
    const want = String(word).replace(/[^a-zA-Z]/g, "").toUpperCase();
    const en = $("#prompt-en");
    en.hidden = false;
    en.textContent = word;
    const rail = $("#letter-rail");
    rail.hidden = false;
    rail.innerHTML = "";
    want.split("").forEach(function (ch, i) {
      const s = document.createElement("span");
      s.textContent = ch;
      if (typed[i] !== ch) s.classList.add("bad");
      rail.appendChild(s);
    });
    speak(word);
    await wait(900);
    const spans = $$("#letter-rail span");
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.add("on");
      await speakLetter(spans[i].textContent);
    }
    await wait(250);
  }

  async function replayEnglish(word, times) {
    const en = $("#prompt-en");
    en.hidden = false;
    en.textContent = word;
    for (let i = 0; i < times; i++) {
      speak(word);
      await wait(1100);
    }
  }

  function skipWord() {
    if (currentScreen === "intro") return skipMeetWord();
    if (!learn.cur) return;
    const set = currentSet();
    const wins = Algo.bucket(winsState(set), learn.mode);
    Algo.testerSkipWord(wins, learn.cur);
    const nxt = Algo.nextWord(learn.queue, playWords(set), wins);
    persist();
    learn.locking = true;
    advanceLearn(nxt, false, true);
  }

  function skipPart() {
    if (!testerMode) return;
    const set = currentSet();
    const wins = Algo.bucket(winsState(set), learn.mode);
    Algo.testerSkipPart(playWords(set), wins);
    persist();
    learn.locking = true;
    advanceLearn({ queue: [], cur: null, partDone: true }, false, true);
  }

  function showTestPick() {
    showScreen("test");
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = false;
    if (play) play.hidden = true;
    $("#test-score").hidden = true;
    I18n.applyDom(document);
  }

  function startEasy() {
    const set = currentSet();
    if (!set) return;
    quiz = blankQuiz();
    quiz.kind = "easy";
    quiz.items = shuffle(playWords(set).slice());
    quiz.index = 0;
    quiz.score = 0;
    quiz.mistakes = [];
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = true;
    if (play) play.hidden = false;
    showScreen("test");
    $("#test-score").hidden = true;
    renderQuiz();
  }

  function startHard() {
    const set = currentSet();
    if (!set) return;
    quiz = blankQuiz();
    quiz.kind = "hard";
    quiz.items = shuffle(playWords(set).slice());
    quiz.index = 0;
    quiz.score = 0;
    quiz.typed = "";
    quiz.mistakes = [];
    const pick = $("#test-pick");
    const play = $("#test-play");
    if (pick) pick.hidden = true;
    if (play) play.hidden = false;
    showScreen("test");
    $("#test-score").hidden = true;
    renderQuiz();
  }

  function renderQuiz() {
    updateKbDesk();
    const item = quiz.items[quiz.index];
    if (!item) return finishQuiz();
    $("#test-kind").textContent = quiz.kind === "easy" ? "EASY" : "HARD";
    $("#test-ko").textContent = quiz.kind === "easy" ? t("easy_name") : t("hard_name");
    $("#test-prog").textContent = quiz.index + 1 + " / " + quiz.items.length;
    $("#test-score").hidden = true;
    const en = $("#test-en-word");
    const ko = $("#test-ko-word");
    const typed = $("#test-typed");
    const choices = $("#test-choices");
    const az = $("#test-az-wrap");
    quiz.startedAt = Date.now();
    quiz.locking = false;
    if (quiz.kind === "easy") {
      en.hidden = false;
      en.textContent = item.en;
      ko.hidden = true;
      typed.hidden = true;
      az.hidden = true;
      $("#btn-test-speak").hidden = false;
      fillChoices(choices, distractors(item, 4), "ko", onEasyPick);
      speak(item.en);
    } else {
      en.hidden = true;
      ko.hidden = false;
      ko.textContent = meaning(item);
      typed.hidden = false;
      quiz.typed = "";
      $("#test-typed-text").textContent = "";
      az.hidden = false;
      choices.hidden = true;
      choices.innerHTML = "";
      $("#btn-test-speak").hidden = true;
    }
  }

  function onEasyPick(word, btn) {
    if (quiz.locking) return;
    quiz.locking = true;
    const item = quiz.items[quiz.index];
    const ok = word.id === item.id;
    btn.classList.add(ok ? "good" : "bad");
    if (ok) {
      quiz.score += 1;
      dingOk();
    } else {
      quiz.mistakes = quiz.mistakes || [];
      quiz.mistakes.push({ en: item.en, ko: item.ko });
    }
    logEvent({
      activity_id: "easy_test",
      item_id: item.id,
      mode: "easy",
      response: word.ko,
      correct: ok,
      latency_ms: Date.now() - quiz.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: quiz.startedAt,
    });
    setTimeout(function () {
      quiz.index += 1;
      renderQuiz();
    }, 450);
  }

  function onHardCheck() {
    if (quiz.locking || quiz.kind !== "hard") return;
    if (!quiz.typed) return;
    quiz.locking = true;
    const item = quiz.items[quiz.index];
    const ok = norm(quiz.typed) === norm(item.en);
    if (ok) quiz.score += 1;
    else {
      quiz.mistakes = quiz.mistakes || [];
      quiz.mistakes.push({ en: item.en, ko: item.ko });
    }
    logEvent({
      activity_id: "hard_test",
      item_id: item.id,
      mode: "hard",
      response: quiz.typed,
      correct: ok,
      latency_ms: Date.now() - quiz.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: quiz.startedAt,
    });
    if (ok) dingOk();
    setTimeout(function () {
      quiz.index += 1;
      renderQuiz();
    }, ok ? 400 : 900);
  }

  function finishQuiz() {
    $("#test-choices").hidden = true;
    $("#test-az-wrap").hidden = true;
    $("#test-score").hidden = false;
    const total = quiz.items.length || 1;
    const pct = Math.round((100 * quiz.score) / total);
    const misses = quiz.mistakes || [];
    $("#test-score-title").textContent = pct + "%";
    if (pct < 80) {
    $("#forever-box").hidden = true;
      $("#test-score-line").textContent = t("need_80", { pct: pct });
      const set = currentSet();
      if (set) {
        const empty = Algo.emptyWins();
        set.winsA = empty.winsA;
        set.winsB = empty.winsB;
        set.winsC = empty.winsC;
        persist();
      }
      setTimeout(function () { startLearnAt("A"); }, 1600);
      return;
    }
    const missLine = misses.length
      ? misses.map(function (m) { return m.en + " = " + meaning(m); }).join(" · ")
      : t("no_mistakes");
    $("#test-score-line").textContent = quiz.score + " / " + total + "  ·  " + missLine;
    const box = $("#forever-box");
    const chk = $("#chk-forever");
    if (box) {
      box.hidden = false;
      if (chk) chk.checked = !!(currentSet() && currentSet().srsTrying);
    }
  }

  function goGames() {
    if (!currentSet()) {
      openDemo().then(function () {
        $("#games-set-hint").textContent = t("games_hint", { title: currentSet().title });
        showScreen("games");
      });
      return;
    }
    syncPack();
    $("#games-set-hint").textContent = t("games_hint", { title: currentSet().title });
    showScreen("games");
  }

  function startMatch() {
    const set = currentSet();
    if (!set) return;
    const tiles = [];
    set.words.forEach(function (w) {
      tiles.push({ id: w.id, side: "en", text: w.en, pair: w.id });
      tiles.push({ id: w.id + "_ko", side: "ko", text: meaning(w), pair: w.id });
    });
    matchGame = {
      tiles: shuffle(tiles),
      picked: [],
      matched: {},
      started: Date.now(),
      timer: null,
      pairs: 0,
      need: set.words.length,
    };
    showScreen("match");
    $("#match-win").hidden = true;
    drawMatch();
    if (matchGame.timer) clearInterval(matchGame.timer);
    matchGame.timer = setInterval(updateMatchHud, 250);
    updateMatchHud();
  }

  function updateMatchHud() {
    if (!matchGame) return;
    const s = Math.floor((Date.now() - matchGame.started) / 1000);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    $("#match-hud").textContent = t("match_hud", { n: matchGame.pairs, time: mm + ":" + ss });
  }

  function drawMatch() {
    const grid = $("#match-grid");
    grid.innerHTML = "";
    matchGame.tiles.forEach(function (t, idx) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "match-tile " + t.side;
      b.textContent = t.text;
      if (matchGame.matched[t.pair] && matchGame.picked.indexOf(idx) === -1) {
        /* still show unmatched only */
      }
      if (matchGame.matched[t.pair]) b.classList.add("matched");
      if (matchGame.picked.indexOf(idx) >= 0) b.classList.add("picked");
      b.addEventListener("click", function () { onMatchTap(idx); });
      grid.appendChild(b);
    });
  }

  function onMatchTap(idx) {
    if (!matchGame) return;
    const t = matchGame.tiles[idx];
    if (matchGame.matched[t.pair]) return;
    if (matchGame.picked.indexOf(idx) >= 0) return;
    if (matchGame.picked.length >= 2) return;
    matchGame.picked.push(idx);
    drawMatch();
    if (matchGame.picked.length < 2) return;
    const a = matchGame.tiles[matchGame.picked[0]];
    const b = matchGame.tiles[matchGame.picked[1]];
    const ok = a.pair === b.pair && a.side !== b.side;
    if (ok) {
      matchGame.matched[a.pair] = true;
      matchGame.pairs += 1;
      matchGame.picked = [];
      drawMatch();
      updateMatchHud();
      if (matchGame.pairs >= matchGame.need) {
        clearInterval(matchGame.timer);
        $("#match-win").hidden = false;
        burst(t("match_win"));
      }
    } else {
      setTimeout(function () {
        matchGame.picked = [];
        drawMatch();
      }, 420);
    }
  }

  function startListen() {
    const set = currentSet();
    if (!set) return;
    listenGame = {
      items: shuffle(set.words),
      index: 0,
      score: 0,
      locking: false,
      startedAt: 0,
    };
    showScreen("listen");
    $("#listen-score").hidden = true;
    $("#listen-choices").hidden = false;
    renderListen();
  }

  function renderListen() {
    const item = listenGame.items[listenGame.index];
    if (!item) return finishListen();
    listenGame.locking = false;
    listenGame.startedAt = Date.now();
    $("#listen-prog").textContent =
      listenGame.index + 1 + " / " + listenGame.items.length;
    $("#listen-score").hidden = true;
    fillChoices($("#listen-choices"), distractors(item, 4), "en", onListenPick);
    speak(item.en);
  }

  function onListenPick(word, btn) {
    if (listenGame.locking) return;
    listenGame.locking = true;
    const item = listenGame.items[listenGame.index];
    const ok = word.id === item.id;
    btn.classList.add(ok ? "good" : "bad");
    if (ok) listenGame.score += 1;
    logEvent({
      activity_id: "listen_choice",
      item_id: item.id,
      mode: "listen",
      response: word.en,
      correct: ok,
      latency_ms: Date.now() - listenGame.startedAt,
      wins_toward_2: 0,
      points: ok ? 1 : 0,
      errors: ok ? 0 : 1,
      started_at: listenGame.startedAt,
    });
    setTimeout(function () {
      listenGame.index += 1;
      renderListen();
    }, 450);
  }

  function finishListen() {
    $("#listen-choices").hidden = true;
    $("#listen-score").hidden = false;
    $("#listen-score-line").textContent = t("score_line", { score: listenGame.score, total: listenGame.items.length });
  }

  function quizItemsFromSet() {
    const set = currentSet();
    const words = (set && set.words) || [];
    return words.map(function (w) {
      const others = shuffle(words.filter(function (x) { return x.id !== w.id; })).map(function (x) { return x.en; });
      return {
        item_id: w.id,
        question: meaning(w),
        correct: w.en,
        wrong: others.slice(0, 2),
        word: w.en,
      };
    }).filter(function (it) { return it.correct && it.wrong.length >= 1; });
  }

  function openPortableGame(kind) {
    const set = currentSet();
    if (!set) {
      openDemo().then(function () { openPortableGame(kind); });
      return;
    }
    const items = quizItemsFromSet();
    const paths = {
      leapfrog: "games/leap-frog/index.html",
      snowjump: "games/snow-jump/index.html",
      spellfire: "games/spellfire/index.html",
    };
    const path = paths[kind];
    if (!path) return;
    let pack;
    if (kind === "spellfire") {
      pack = {
        pack_id: set.id || "nouns100",
        title: set.title,
        seconds_per_letter: 5,
        items: set.words.map(function (w) { return { item_id: w.id, word: w.en }; }),
      };
    } else {
      pack = {
        pack_id: set.id || "nouns100",
        title: set.title,
        module_id: kind,
        activity_id: kind,
        seconds: 15,
        items: items,
      };
    }
    try {
      sessionStorage.setItem("mrj.wm.gamepack", JSON.stringify(pack));
    } catch (e) { /* ignore */ }
    const frame = $("#game-frame");
    const name = encodeURIComponent(state.displayName || "Student");
    frame.src = path + "?pack=session&packid=" + encodeURIComponent(currentPackId()) + "&student=" + name;
    showScreen("playgame");
  }

  function goBack() {
    if (currentScreen === "playgame") {
      const frame = $("#game-frame");
      if (frame) frame.src = "about:blank";
      goGames();
      return;
    }
    if (currentScreen === "intro") {
      renderSetHome();
      showScreen("set");
      return;
    }
    if (currentScreen === "learn" || currentScreen === "test") {
      renderSetHome();
      showScreen(currentSet() ? "set" : "home");
      return;
    }
    if (currentScreen === "match" || currentScreen === "listen") {
      if (matchGame && matchGame.timer) clearInterval(matchGame.timer);
      goGames();
      return;
    }
    if (currentScreen === "words") {
      renderHome();
      showScreen("home");
      return;
    }
    if (currentScreen === "games" || currentScreen === "set") {
      renderHome();
      showScreen("home");
    }
  }

  function bind() {
    watchKbDesk();
    $("#btn-tap-start").addEventListener("click", function () {
      unlockSpeech();
      setVoice(state.voice);
      openNameScreen("boot");
    });
    const changeNameBtn = $("#btn-change-name");
    if (changeNameBtn) changeNameBtn.addEventListener("click", function () {
      openNameScreen("home");
    });
    const nameGo = $("#btn-name-go");
    if (nameGo) nameGo.addEventListener("click", function () {
      const n = ($("#name-input").value || "").trim();
      if (!n) return;
      state.displayName = n;
      persist();
      if (nameReturnTo === "home") {
        renderHome();
        showScreen("home");
        return;
      }
      afterBootHome();
    });
    const listBtn = $("#btn-word-list");
    if (listBtn) listBtn.addEventListener("click", function () {
      openDemo().then(function () {
        const box = $("#alpha-list");
        box.innerHTML = "";
        currentSet().words.slice().sort(function (a, b) { return a.en.localeCompare(b.en); }).forEach(function (w) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "word-row";
          const tag = currentSet().srsForever ? t("tag_forever") : (currentSet().srsTrying ? t("tag_learning") : t("tag_new"));
          row.innerHTML = '<span class="en"></span><span class="meaning"></span>';
          row.querySelector(".en").textContent = w.en;
          row.querySelector(".meaning").textContent = meaning(w) + " · " + tag;
          row.addEventListener("click", function () { speak(w.en); });
          box.appendChild(row);
        });
        showScreen("words");
      });
    });
    const chk = $("#chk-forever");
    if (chk) chk.addEventListener("change", function () {
      const set = currentSet();
      if (!set) return;
      set.srsTrying = !!chk.checked;
      if (chk.checked) {
        set.srsStage = 0;
        set.srsNextAt = Date.now() + 86400000;
        set.srsForever = false;
      } else {
        set.srsNextAt = null;
      }
      persist();
    });
    $("#btn-back").addEventListener("click", goBack);
    $$(".voice-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setVoice(btn.getAttribute("data-voice"));
        const set = currentSet();
        if (currentScreen === "intro") {
          if (tap.phase === "listen" && tap.cur) speak(tap.cur.en);
          else if (tap.cur) speak(tap.cur.en);
        } else if (currentScreen === "set" && set && set.words[0]) speak(set.words[0].en);
        else if (currentScreen === "learn" && learn.cur) speak(learn.cur.en);
        else if (currentScreen === "test" && quiz.kind !== "hard" && quiz.items[quiz.index]) speak(quiz.items[quiz.index].en);
        else if (currentScreen === "listen" && listenGame && listenGame.items[listenGame.index]) {
          speak(listenGame.items[listenGame.index].en);
        }
      });
    });
    $("#btn-continue").addEventListener("click", function () {
      renderSetHome();
      showScreen("set");
    });
    const demoBtn = $("#btn-demo");
    if (demoBtn) demoBtn.addEventListener("click", function () { openDemo(); });
    ["nouns100", "verbs100", "adjectives100", "nouns200", "little100", "verbs200", "adjectives200", "adverbs100", "nouns300", "verbs300"].forEach(function (pid) {
      const el = $("#btn-pack-" + pid);
      if (el) el.addEventListener("click", function () { openPack(pid); });
    });
    $("#btn-games-home").addEventListener("click", goGames);
    $("#btn-intro").addEventListener("click", function () { startMeet(); });
    const tapSpeak = $("#btn-tap-speak");
    if (tapSpeak) tapSpeak.addEventListener("click", function () {
      if (tap.cur) speak(tap.cur.en);
    });
    $("#btn-learn").addEventListener("click", function () {
      startLearnAt("A");
    });
    $$("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        jumpTo(btn.getAttribute("data-jump"));
      });
    });
    const meetEn = $("#meet-en");
    if (meetEn) meetEn.addEventListener("click", function () {
      const w = currentMeetWord();
      if (w) speak(w.en);
    });
    const wwEx = $("#ww-ex");
    if (wwEx) wwEx.addEventListener("click", function () {
      const w = currentMeetWord();
      if (w) speakWW(w);
    });
    const skipStepBtn = $("#btn-skip-step");
    if (skipStepBtn) skipStepBtn.addEventListener("click", skipStep);
    $("#btn-easy").addEventListener("click", function () {
      state.testKind = "easy";
      persist();
      renderSetHome();
      startEasy();
    });
    $("#btn-hard").addEventListener("click", function () {
      state.testKind = "hard";
      persist();
      renderSetHome();
      startHard();
    });
    const te = $("#btn-test-easy");
    const th = $("#btn-test-hard");
    if (te) te.addEventListener("click", function () { state.testKind = "easy"; persist(); startEasy(); });
    if (th) th.addEventListener("click", function () { state.testKind = "hard"; persist(); startHard(); });
    $("#btn-games-set").addEventListener("click", goGames);
    $("#btn-speak").addEventListener("click", function () {
      if (learn.cur) speak(learn.cur.en);
    });
    $("#btn-del").addEventListener("click", delAz);
    $("#btn-check").addEventListener("click", onLearnCheck);
    $("#btn-skip-word").addEventListener("click", skipWord);
    const skipPartBtn = $("#btn-skip-part");
    if (skipPartBtn) skipPartBtn.addEventListener("click", skipPart);
    $("#btn-test-speak").addEventListener("click", function () {
      const item = quiz.items[quiz.index];
      if (item && quiz.kind !== "hard") speak(item.en);
    });
    $("#btn-test-del").addEventListener("click", delAz);
    $("#btn-test-check").addEventListener("click", onHardCheck);
    $("#btn-test-home").addEventListener("click", function () {
      renderSetHome();
      showScreen("set");
    });
    $$("#game-slots .slot.playable").forEach(function (slot) {
      slot.addEventListener("click", function () {
        const g = slot.getAttribute("data-game");
        if (g === "leapfrog" || g === "snowjump" || g === "spellfire") openPortableGame(g);
      });
    });
    $("#btn-listen-speak").addEventListener("click", function () {
      if (listenGame && listenGame.items[listenGame.index]) speak(listenGame.items[listenGame.index].en);
    });
    $("#btn-listen-home").addEventListener("click", goGames);

    const langSel = $("#lang-select");
    const langBoot = $("#lang-select-boot");
    function wireLang(sel) {
      if (!sel || !I18n) return;
      I18n.fillSelect(sel);
      sel.value = state.locale || "en";
      sel.addEventListener("change", function () {
        applyLocale(sel.value);
      });
    }
    if (I18n) {
      I18n.setLocale(state.locale || "en");
      wireLang(langSel);
      wireLang(langBoot);
    }

    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (typingScreenActive() && !inField) {
        if (e.code && e.code.length === 4 && e.code >= "KeyA" && e.code <= "KeyZ") {
          e.preventDefault();
          onAz(e.code.slice(3));
          return;
        }
        if (e.code === "Backspace") {
          e.preventDefault();
          delAz();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (currentScreen === "learn") onLearnCheck();
          else onHardCheck();
          return;
        }
        return;
      }

      if (e.key !== "Enter") return;
      if (currentScreen === "learn") {
        e.preventDefault();
        onLearnCheck();
      } else if (currentScreen === "test") {
        e.preventDefault();
        onHardCheck();
      } else if (currentScreen === "name") {
        e.preventDefault();
        $("#btn-name-go").click();
      }
    });
    if (window.visualViewport) {
      const fit = function () {
        const phone = document.querySelector(".phone");
        if (phone) phone.style.height = window.visualViewport.height + "px";
      };
      window.visualViewport.addEventListener("resize", fit);
      fit();
    }

    buildPad($("#az-pad"));
    buildPad($("#test-az-pad"));
    if ($("#intro-az-pad"))     buildPad($("#intro-az-pad"));
    applySlimPacks();
  }

  async function applySlimPacks() {
    try {
      const res = await fetch("BUILD_STAMP.txt", { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
      const line = text.split("\n").find(function (l) { return l.indexOf("packs=") === 0; });
      if (!line) return;
      const val = line.slice(6).trim();
      if (!val || val === "all") return;
      const allowed = val.split(/\s+/);
      const demo = $("#btn-demo");
      if (demo) demo.hidden = true;
      ["nouns100", "verbs100", "adjectives100", "nouns200", "little100", "verbs200", "adjectives200", "adverbs100", "nouns300", "verbs300"].forEach(function (pid) {
        const el = $("#btn-pack-" + pid);
        if (el && allowed.indexOf(pid) < 0) el.hidden = true;
      });
    } catch (e) { /* ignore */ }
  }

  function applyLocale(code) {
    if (!I18n) return;
    state.locale = I18n.setLocale(code || state.locale || "en");
    persist();
    I18n.applyDom(document);
    $$("#lang-select, #lang-select-boot").forEach(function (sel) {
      if (sel) sel.value = state.locale;
    });
    if (currentScreen === "home") renderHome();
    if (currentScreen === "set") renderSetHome();
    if (currentScreen === "learn" && learn.cur) renderLearn(false);
    if (currentScreen === "test" && quiz && quiz.items && quiz.items[quiz.index]) renderQuiz();
    if (currentScreen === "games" && currentSet()) {
      $("#games-set-hint").textContent = t("games_hint", { title: currentSet().title });
    }
    if (currentScreen === "match") updateMatchHud();
    if (currentScreen === "listen" && listenGame) {
      $("#listen-prog").textContent =
        listenGame.index + 1 + " / " + listenGame.items.length;
    }
    if (currentScreen === "intro") {
      if (tap && tap.words && tap.words.length && $("#tapmap") && !$("#tapmap").hidden) renderTapmap();
      else renderMeet();
    }
    if (currentScreen === "words") {
      const listBtn = $("#btn-word-list");
      if (listBtn) listBtn.click();
    }
  }

  window.MRJ_WORD_FACTORY_PACK = { words: [] };
  bind();
  probeLinuxTts();
  if (I18n) {
    I18n.setLocale(state.locale || "en");
    I18n.fillSelect($("#lang-select"));
    I18n.fillSelect($("#lang-select-boot"));
    I18n.applyDom(document);
  }
  setVoice(state.voice);
  showScreen("boot");
})();
