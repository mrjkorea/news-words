/**
 * Per-student Word Factory progress: merge, pack JSON, local keys (news-words).
 * Safe on Node (tests) and browser (window.WordFactoryProgress).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WordFactoryProgress = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PACK_PROGRAM = "news-words";
  var LS_STATE = "mrj.word_factory.state";
  var LS_EVENTS = "mrj.word_factory.events";
  var PACK_VERSION = 1;
  var SAVE_THROTTLE_MS = 17000;

  function studentKey(id) {
    return String(id || "").trim();
  }

  function lsStateKey(id) {
    var k = studentKey(id);
    return k ? LS_STATE + ":" + k : LS_STATE;
  }

  function lsEventsKey(id) {
    var k = studentKey(id);
    return k ? LS_EVENTS + ":" + k : LS_EVENTS;
  }

  function defaultState(uid) {
    var makeId =
      uid ||
      function (prefix) {
        return (
          (prefix || "id") +
          "_" +
          Math.random().toString(36).slice(2, 10) +
          Date.now().toString(36).slice(-4)
        );
      };
    return {
      studentId: makeId("stu"),
      sessionId: makeId("ses"),
      voice: "us_m",
      displayName: "",
      testKind: "easy",
      studySize: 10,
      locale: "en",
      currentSetId: null,
      sets: {},
    };
  }

  function normalizeLoadedState(parsed, uid) {
    if (!parsed || typeof parsed !== "object") return defaultState(uid);
    if (!parsed.sets || typeof parsed.sets !== "object") parsed.sets = {};
    if (!parsed.studentId) parsed.studentId = defaultState(uid).studentId;
    if (!parsed.sessionId) parsed.sessionId = defaultState(uid).sessionId;
    if (!parsed.testKind) parsed.testKind = "easy";
    if (!parsed.studySize) parsed.studySize = 10;
    if (!parsed.voice || parsed.voice === "man") parsed.voice = "us_m";
    if (parsed.voice === "woman") parsed.voice = "us_f";
    if (parsed.voice === "maya" || parsed.voice === "wizard") {
      parsed.voice = parsed.voice === "wizard" ? "grandpa" : "grandma";
    }
    if (!parsed.locale) parsed.locale = "en";
    parsed.displayName = "";
    return parsed;
  }

  function readLocalJson(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeLocalJson(key, value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function loadLocalState(id) {
    return normalizeLoadedState(readLocalJson(lsStateKey(id)), null);
  }

  function loadLocalEvents(id) {
    var arr = readLocalJson(lsEventsKey(id));
    return Array.isArray(arr) ? arr : [];
  }

  function persistLocalState(id, state) {
    if (!studentKey(id)) return;
    var copy = normalizeLoadedState(state, null);
    writeLocalJson(lsStateKey(id), copy);
  }

  function persistLocalEvents(id, events) {
    if (!studentKey(id)) return;
    writeLocalJson(lsEventsKey(id), Array.isArray(events) ? events : []);
  }

  function maxWinMap(a, b) {
    var out = {};
    var keys = {};
    var ak = a && typeof a === "object" ? Object.keys(a) : [];
    var bk = b && typeof b === "object" ? Object.keys(b) : [];
    ak.forEach(function (k) { keys[k] = 1; });
    bk.forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (id) {
      out[id] = Math.max(Number(a && a[id]) || 0, Number(b && b[id]) || 0);
    });
    return out;
  }

  function mergeIntro(a, b) {
    var out = {};
    var keys = {};
    var ak = a && typeof a === "object" ? Object.keys(a) : [];
    var bk = b && typeof b === "object" ? Object.keys(b) : [];
    ak.forEach(function (k) { keys[k] = 1; });
    bk.forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (id) {
      out[id] = !!(a && a[id]) || !!(b && b[id]);
    });
    return out;
  }

  function setMergeKey(set) {
    if (!set || typeof set !== "object") return "";
    if (set.packId) return "pack:" + String(set.packId);
    if (set.id) return "id:" + String(set.id);
    return "";
  }

  function mergeOneSet(a, b) {
    if (!a) return b ? JSON.parse(JSON.stringify(b)) : null;
    if (!b) return JSON.parse(JSON.stringify(a));
    var out = JSON.parse(JSON.stringify(a));
    out.title = b.title || out.title;
    if (b.words && b.words.length) out.words = b.words;
    out.winsA = maxWinMap(out.winsA, b.winsA);
    out.winsB = maxWinMap(out.winsB, b.winsB);
    out.winsC = maxWinMap(out.winsC, b.winsC);
    out.intro = mergeIntro(out.intro, b.intro);
    out.rememberForever = !!(out.rememberForever || b.rememberForever);
    var ca = Number(out.createdAt) || 0;
    var cb = Number(b.createdAt) || 0;
    if (cb && (!ca || cb < ca)) out.createdAt = b.createdAt;
    var la = Number(out.lastPlayedAt) || 0;
    var lb = Number(b.lastPlayedAt) || 0;
    out.lastPlayedAt = Math.max(la, lb) || out.lastPlayedAt || b.lastPlayedAt;
    if (b.nextReviewAt != null || out.nextReviewAt != null) {
      var na = out.nextReviewAt == null ? Infinity : Number(out.nextReviewAt);
      var nb = b.nextReviewAt == null ? Infinity : Number(b.nextReviewAt);
      var pick = Math.min(na, nb);
      out.nextReviewAt = pick === Infinity ? null : pick;
    }
    if (b.packId) out.packId = b.packId;
    return out;
  }

  function mergeSets(localSets, remoteSets) {
    var out = {};
    var byKey = {};
    function add(set) {
      if (!set || typeof set !== "object") return;
      var mk = setMergeKey(set);
      if (!mk) return;
      if (!byKey[mk]) {
        byKey[mk] = set.id;
        out[set.id] = JSON.parse(JSON.stringify(set));
        return;
      }
      var id = byKey[mk];
      out[id] = mergeOneSet(out[id], set);
    }
    var lk = localSets && typeof localSets === "object" ? Object.keys(localSets) : [];
    var rk = remoteSets && typeof remoteSets === "object" ? Object.keys(remoteSets) : [];
    lk.forEach(function (k) { add(localSets[k]); });
    rk.forEach(function (k) { add(remoteSets[k]); });
    return out;
  }

  function mergePrefs(local, remote) {
    var out = {};
    out.voice = local.voice || remote.voice || "us_m";
    out.testKind = local.testKind || remote.testKind || "easy";
    out.studySize = local.studySize || remote.studySize || 10;
    out.locale = local.locale || remote.locale || "en";
    out.studentId = local.studentId || remote.studentId;
    out.sessionId = local.sessionId || remote.sessionId;
    var cur = local.currentSetId;
    if (!cur || !local.sets || !local.sets[cur]) cur = remote.currentSetId;
    out.currentSetId = cur || null;
    return out;
  }

  function eventDedupeKey(ev) {
    if (!ev || typeof ev !== "object") return "";
    return [
      ev.student_id || "",
      ev.session_id || "",
      ev.set_id || "",
      ev.item_id || "",
      ev.activity_id || "",
      ev.mode || "",
      ev.started_at || "",
      ev.ended_at || "",
      ev.correct ? "1" : "0",
    ].join("|");
  }

  function mergeEvents(localEvents, remoteEvents) {
    var seen = {};
    var out = [];
    function push(ev) {
      if (!ev || typeof ev !== "object") return;
      var k = eventDedupeKey(ev);
      if (seen[k]) return;
      seen[k] = true;
      out.push(ev);
    }
    (Array.isArray(localEvents) ? localEvents : []).forEach(push);
    (Array.isArray(remoteEvents) ? remoteEvents : []).forEach(push);
    out.sort(function (a, b) {
      return (Number(a.ended_at) || 0) - (Number(b.ended_at) || 0);
    });
    return out;
  }

  function mergeState(local, remote) {
    var loc = normalizeLoadedState(local, null);
    var rem = normalizeLoadedState(remote, null);
    var prefs = mergePrefs(loc, rem);
    var sets = mergeSets(loc.sets, rem.sets);
    if (prefs.currentSetId && !sets[prefs.currentSetId]) {
      var ids = Object.keys(sets);
      prefs.currentSetId = ids.length ? ids[0] : null;
    }
    return normalizeLoadedState(
      {
        studentId: prefs.studentId,
        sessionId: prefs.sessionId,
        voice: prefs.voice,
        testKind: prefs.testKind,
        studySize: prefs.studySize,
        locale: prefs.locale,
        currentSetId: prefs.currentSetId,
        sets: sets,
        displayName: "",
      },
      null
    );
  }

  function totalWinsInSet(set) {
    if (!set) return 0;
    var n = 0;
    ["winsA", "winsB", "winsC"].forEach(function (bucket) {
      var m = set[bucket];
      if (!m || typeof m !== "object") return;
      Object.keys(m).forEach(function (id) {
        n += Number(m[id]) || 0;
      });
    });
    return n;
  }

  function richnessScore(state, events) {
    var score = 0;
    var st = state && state.sets ? state.sets : {};
    Object.keys(st).forEach(function (k) {
      score += totalWinsInSet(st[k]) * 10;
      var intro = st[k].intro;
      if (intro && typeof intro === "object") {
        Object.keys(intro).forEach(function (w) {
          if (intro[w]) score += 1;
        });
      }
    });
    score += Object.keys(st).length * 5;
    score += Array.isArray(events) ? events.length : 0;
    return score;
  }

  function stateRicherThan(aState, aEvents, bState, bEvents) {
    return richnessScore(aState, aEvents) > richnessScore(bState, bEvents);
  }

  function packFromParts(state, events) {
    var st = normalizeLoadedState(state, null);
    return {
      v: PACK_VERSION,
      state: {
        studentId: st.studentId,
        sessionId: st.sessionId,
        voice: st.voice,
        testKind: st.testKind,
        studySize: st.studySize,
        locale: st.locale,
        currentSetId: st.currentSetId,
        sets: st.sets || {},
      },
      events: Array.isArray(events) ? events : [],
    };
  }

  function parsePackJson(raw) {
    if (raw == null || raw === "") {
      return { ok: true, empty: true, state: null, events: [] };
    }
    try {
      var data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!data || typeof data !== "object") {
        return { ok: true, empty: true, state: null, events: [] };
      }
      var st = data.state != null ? data.state : data;
      var ev = data.events != null ? data.events : [];
      return {
        ok: true,
        empty: false,
        state: normalizeLoadedState(st, null),
        events: Array.isArray(ev) ? ev : [],
      };
    } catch (e) {
      return { ok: true, empty: true, parseError: true, state: null, events: [] };
    }
  }

  function authPackApi(auth) {
    if (!auth || typeof auth !== "object") return null;
    if (typeof auth.loadPack !== "function" || typeof auth.savePack !== "function") return null;
    return auth;
  }

  function createRemoteSync(auth, hooks) {
    var api = authPackApi(auth);
    var program = PACK_PROGRAM;
    var loadOk = false;
    var loadDone = false;
    var loadError = "";
    var saveTimer = null;
    var lastSaveAt = 0;
    var pendingFlush = false;
    var retryTimer = null;
    var retryDelayMs =
      hooks && typeof hooks.retryDelayMs === "number" ? hooks.retryDelayMs : 60000;

    function packReady() {
      if (!api) return false;
      if (typeof api.packReady === "function") return api.packReady(program);
      return loadOk;
    }

    function canRemoteSave() {
      return !!(api && loadOk && loadDone && !loadError);
    }

    function getSnapshot() {
      if (!hooks || typeof hooks.getSnapshot !== "function") return null;
      return hooks.getSnapshot();
    }

    function applySnapshot(snap) {
      if (hooks && typeof hooks.applySnapshot === "function") hooks.applySnapshot(snap);
    }

    function scheduleSave(flush) {
      if (!canRemoteSave() || !packReady()) return;
      if (flush) pendingFlush = true;
      var delay = SAVE_THROTTLE_MS;
      if (flush) delay = 0;
      else if (lastSaveAt && Date.now() - lastSaveAt < SAVE_THROTTLE_MS) {
        delay = SAVE_THROTTLE_MS - (Date.now() - lastSaveAt);
      }
      if (saveTimer) return;
      saveTimer = setTimeout(function () {
        saveTimer = null;
        runSave(!!pendingFlush);
        pendingFlush = false;
      }, delay);
    }

    function runSave(flush) {
      if (!canRemoteSave() || !packReady()) return Promise.resolve();
      var snap = getSnapshot();
      if (!snap) return Promise.resolve();
      var body = JSON.stringify(packFromParts(snap.state, snap.events));
      if (!flush && lastSaveAt && Date.now() - lastSaveAt < SAVE_THROTTLE_MS) {
        scheduleSave(false);
        return Promise.resolve();
      }
      return api.savePack(program, body).then(function (res) {
        if (res && res.ok) lastSaveAt = Date.now();
        else if (res && res.error) loadError = String(res.error);
      }).catch(function () {});
    }

    function scheduleRetry() {
      if (!retryDelayMs || retryTimer || !api) return;
      retryTimer = setTimeout(function () {
        retryTimer = null;
        loadFromServer();
      }, retryDelayMs);
    }

    function loadFromServer() {
      if (!api) {
        loadDone = true;
        loadOk = false;
        return Promise.resolve({ ok: false, skipped: true });
      }
      return api.loadPack(program).then(function (res) {
        loadDone = true;
        if (!res || !res.ok) {
          loadOk = false;
          loadError = res && res.error ? String(res.error) : "load_failed";
          scheduleRetry();
          return res || { ok: false };
        }
        loadOk = true;
        loadError = "";
        var parsed = parsePackJson(res.progress_json);
        var local = getSnapshot() || { state: defaultState(), events: [] };
        var mergedState = mergeState(local.state, parsed.state);
        var mergedEvents = mergeEvents(local.events, parsed.events);
        applySnapshot({ state: mergedState, events: mergedEvents });
        if (hooks && typeof hooks.afterMerge === "function") {
          hooks.afterMerge({
            mergedState: mergedState,
            mergedEvents: mergedEvents,
            serverParsed: parsed,
          });
        }
        var serverScore = richnessScore(parsed.state, parsed.events);
        var mergedScore = richnessScore(mergedState, mergedEvents);
        if (mergedScore > serverScore && packReady()) {
          return api.savePack(program, JSON.stringify(packFromParts(mergedState, mergedEvents))).then(function (saveRes) {
            if (saveRes && saveRes.ok) lastSaveAt = Date.now();
            return res;
          });
        }
        return res;
      }).catch(function () {
        loadDone = true;
        loadOk = false;
        loadError = "network";
        scheduleRetry();
        return { ok: false, error: "network" };
      });
    }

    function onPageHide() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      runSave(true);
    }

    return {
      program: program,
      loadFromServer: loadFromServer,
      scheduleSave: scheduleSave,
      onPageHide: onPageHide,
      canRemoteSave: canRemoteSave,
      packReady: packReady,
      loadOk: function () { return loadOk; },
      loadError: function () { return loadError; },
    };
  }

  return {
    PACK_PROGRAM: PACK_PROGRAM,
    LS_STATE: LS_STATE,
    LS_EVENTS: LS_EVENTS,
    PACK_VERSION: PACK_VERSION,
    SAVE_THROTTLE_MS: SAVE_THROTTLE_MS,
    studentKey: studentKey,
    lsStateKey: lsStateKey,
    lsEventsKey: lsEventsKey,
    defaultState: defaultState,
    normalizeLoadedState: normalizeLoadedState,
    loadLocalState: loadLocalState,
    loadLocalEvents: loadLocalEvents,
    persistLocalState: persistLocalState,
    persistLocalEvents: persistLocalEvents,
    mergeState: mergeState,
    mergeEvents: mergeEvents,
    mergeOneSet: mergeOneSet,
    parsePackJson: parsePackJson,
    packFromParts: packFromParts,
    richnessScore: richnessScore,
    stateRicherThan: stateRicherThan,
    createRemoteSync: createRemoteSync,
    authPackApi: authPackApi,
  };
});
