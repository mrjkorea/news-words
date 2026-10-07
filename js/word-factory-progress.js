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
  var MAX_LOAD_RETRIES = 10;
  var LOAD_RETRY_DELAYS = [0, 1500, 4000, 60000];
  var SAVE_RETRY_DELAYS = [1500, 4000, 60000];
  var nextSessionGeneration = 1;

  function idKey(id, auth) {
    if (auth && typeof auth.idKey === "function") {
      try {
        var fromAuth = auth.idKey(id);
        if (fromAuth != null && String(fromAuth).trim()) {
          return String(fromAuth).trim().toLowerCase();
        }
      } catch (e) {}
    }
    return String(id || "").trim().toLowerCase();
  }

  function studentKey(id, auth) {
    return idKey(id, auth);
  }

  function lsStateKey(idKeyVal) {
    var k = String(idKeyVal || "").trim();
    return k ? LS_STATE + ":" + k : LS_STATE;
  }

  function lsEventsKey(idKeyVal) {
    var k = String(idKeyVal || "").trim();
    return k ? LS_EVENTS + ":" + k : LS_EVENTS;
  }

  function legacyRawKeyCandidates(id, auth) {
    var raw = String(id || "").trim();
    var out = [];
    if (raw) out.push(raw);
    var ik = idKey(id, auth);
    if (ik && out.indexOf(ik) < 0) out.push(ik);
    return out;
  }

  function newSessionToken(idKeyVal) {
    return {
      generation: nextSessionGeneration++,
      idKey: String(idKeyVal || "").trim().toLowerCase(),
    };
  }

  function sessionMatches(token, active) {
    if (!token || !active) return false;
    return (
      token.generation === active.generation &&
      String(token.idKey).toLowerCase() === String(active.idKey).toLowerCase()
    );
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

  function readLocalStateWithFallback(id, auth) {
    var ik = idKey(id, auth);
    var fromNorm = readLocalJson(lsStateKey(ik));
    if (fromNorm) return fromNorm;
    var raw = String(id || "").trim();
    if (raw && raw !== ik) {
      var fromRaw = readLocalJson(LS_STATE + ":" + raw);
      if (fromRaw) return fromRaw;
    }
    return null;
  }

  function loadLocalState(id, auth) {
    return normalizeLoadedState(readLocalStateWithFallback(id, auth), null);
  }

  function readLocalEventsWithFallback(id, auth) {
    var ik = idKey(id, auth);
    var fromNorm = readLocalJson(lsEventsKey(ik));
    if (fromNorm) return fromNorm;
    var raw = String(id || "").trim();
    if (raw && raw !== ik) {
      var fromRaw = readLocalJson(LS_EVENTS + ":" + raw);
      if (fromRaw) return fromRaw;
    }
    return null;
  }

  function loadLocalEvents(id, auth) {
    var arr = readLocalEventsWithFallback(id, auth);
    return Array.isArray(arr) ? arr : [];
  }

  function persistLocalState(id, state, auth) {
    var ik = idKey(id, auth);
    if (!ik) return;
    var copy = normalizeLoadedState(state, null);
    writeLocalJson(lsStateKey(ik), copy);
  }

  function persistLocalEvents(id, events, auth) {
    var ik = idKey(id, auth);
    if (!ik) return;
    writeLocalJson(lsEventsKey(ik), Array.isArray(events) ? events : []);
  }

  function maxWinMap(a, b) {
    var out = {};
    var keys = {};
    var ak = a && typeof a === "object" ? Object.keys(a) : [];
    var bk = b && typeof b === "object" ? Object.keys(b) : [];
    ak.forEach(function (k) { keys[k] = 1; });
    bk.forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (wid) {
      out[wid] = Math.max(Number(a && a[wid]) || 0, Number(b && b[wid]) || 0);
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
    Object.keys(keys).forEach(function (wid) {
      out[wid] = !!(a && a[wid]) || !!(b && b[wid]);
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
      var sid = byKey[mk];
      out[sid] = mergeOneSet(out[sid], set);
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
      Object.keys(m).forEach(function (wid) {
        n += Number(m[wid]) || 0;
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

  function loadRetryDelayMs(attemptIndex, hooks) {
    if (hooks && hooks.loadRetryDelays) return hooks.loadRetryDelays[attemptIndex] || 60000;
    if (attemptIndex < LOAD_RETRY_DELAYS.length) return LOAD_RETRY_DELAYS[attemptIndex];
    return 60000;
  }

  function saveRetryDelayMs(attemptIndex) {
    if (attemptIndex < SAVE_RETRY_DELAYS.length) return SAVE_RETRY_DELAYS[attemptIndex];
    return 60000;
  }

  function createRemoteSync(auth, hooks) {
    var api = authPackApi(auth);
    var program = PACK_PROGRAM;
    var sessionToken =
      hooks && hooks.sessionToken
        ? hooks.sessionToken
        : newSessionToken("");
    var loadOk = false;
    var loadDone = false;
    var loadError = "";
    var saveTimer = null;
    var saveRetryTimer = null;
    var lastSaveAt = 0;
    var pendingFlush = false;
    var loadRetryTimer = null;
    var loadRetryCount = 0;
    var saveRetryCount = 0;
    var stopped = false;
    var dirty = false;
    var dirtyEpoch = 0;
    var maxLoadRetries =
      hooks && typeof hooks.maxLoadRetries === "number"
        ? hooks.maxLoadRetries
        : MAX_LOAD_RETRIES;
    var loadRetriesDisabled = !!(hooks && hooks.disableLoadRetry);

    function isActive() {
      if (stopped) return false;
      if (hooks && typeof hooks.isSessionActive === "function") {
        return hooks.isSessionActive(sessionToken);
      }
      return true;
    }

    function packReady() {
      if (!api) return false;
      if (typeof api.packReady === "function") return api.packReady(program);
      return loadOk;
    }

    function canRemoteSave() {
      return !!(api && loadOk && loadDone && !loadError && isActive());
    }

    function getSnapshot() {
      if (!isActive()) return null;
      if (!hooks || typeof hooks.getSnapshot !== "function") return null;
      return hooks.getSnapshot();
    }

    function applySnapshot(snap) {
      if (!isActive()) return;
      if (hooks && typeof hooks.applySnapshot === "function") hooks.applySnapshot(snap);
    }

    function markDirty() {
      if (!isActive()) return;
      dirty = true;
      dirtyEpoch += 1;
    }

    function clearDirtyIfUnchanged(epochAtStart) {
      if (dirtyEpoch === epochAtStart) dirty = false;
    }

    function stop() {
      stopped = true;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (saveRetryTimer) {
        clearTimeout(saveRetryTimer);
        saveRetryTimer = null;
      }
      if (loadRetryTimer) {
        clearTimeout(loadRetryTimer);
        loadRetryTimer = null;
      }
    }

    function scheduleSave(flush) {
      if (!isActive() || !canRemoteSave() || !packReady()) return;
      if (!dirty) return;
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

    function scheduleSaveRetry() {
      if (!isActive() || !dirty || saveRetryTimer) return;
      var delay = saveRetryDelayMs(saveRetryCount);
      saveRetryCount += 1;
      saveRetryTimer = setTimeout(function () {
        saveRetryTimer = null;
        runSave(true);
      }, delay);
    }

    function runSave(flush) {
      if (!isActive() || !canRemoteSave() || !packReady()) return Promise.resolve();
      if (!dirty) return Promise.resolve();
      var epochAtStart = dirtyEpoch;
      var snap = getSnapshot();
      if (!snap) return Promise.resolve();
      var body = JSON.stringify(packFromParts(snap.state, snap.events));
      if (!flush && lastSaveAt && Date.now() - lastSaveAt < SAVE_THROTTLE_MS) {
        scheduleSave(false);
        return Promise.resolve();
      }
      return api.savePack(program, body).then(function (res) {
        if (!isActive()) return res;
        if (res && res.ok) {
          lastSaveAt = Date.now();
          saveRetryCount = 0;
          clearDirtyIfUnchanged(epochAtStart);
        } else {
          markDirty();
          scheduleSaveRetry();
        }
        return res;
      }).catch(function () {
        if (!isActive()) return;
        markDirty();
        scheduleSaveRetry();
      });
    }

    function scheduleLoadRetry() {
      if (loadRetriesDisabled || !isActive() || !api) return;
      if (loadRetryCount >= maxLoadRetries) return;
      if (loadRetryTimer) return;
      var delay = loadRetryDelayMs(loadRetryCount, hooks);
      loadRetryCount += 1;
      loadRetryTimer = setTimeout(function () {
        loadRetryTimer = null;
        loadFromServer();
      }, delay);
    }

    function saveMergedIfRicher(mergedState, mergedEvents, parsed) {
      if (!isActive()) return Promise.resolve();
      var serverScore = richnessScore(parsed.state, parsed.events);
      var mergedScore = richnessScore(mergedState, mergedEvents);
      if (mergedScore <= serverScore || !packReady()) return Promise.resolve();
      markDirty();
      var epochAtStart = dirtyEpoch;
      var body = JSON.stringify(packFromParts(mergedState, mergedEvents));
      return api.savePack(program, body).then(function (saveRes) {
        if (!isActive()) return saveRes;
        if (saveRes && saveRes.ok) {
          lastSaveAt = Date.now();
          saveRetryCount = 0;
          clearDirtyIfUnchanged(epochAtStart);
        } else {
          markDirty();
          scheduleSaveRetry();
        }
        return saveRes;
      }).catch(function () {
        if (!isActive()) return;
        markDirty();
        scheduleSaveRetry();
      });
    }

    function loadFromServer() {
      if (!api) {
        loadDone = true;
        loadOk = false;
        return Promise.resolve({ ok: false, skipped: true });
      }
      if (!isActive()) {
        return Promise.resolve({ ok: false, stale: true });
      }
      return api.loadPack(program).then(function (res) {
        if (!isActive()) return res || { ok: false, stale: true };
        loadDone = true;
        if (!res || !res.ok) {
          loadOk = false;
          loadError = res && res.error ? String(res.error) : "load_failed";
          scheduleLoadRetry();
          return res || { ok: false };
        }
        loadOk = true;
        loadError = "";
        loadRetryCount = 0;
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
        return saveMergedIfRicher(mergedState, mergedEvents, parsed).then(function () {
          return res;
        });
      }).catch(function () {
        if (!isActive()) return { ok: false, stale: true };
        loadDone = true;
        loadOk = false;
        loadError = "network";
        scheduleLoadRetry();
        return { ok: false, error: "network" };
      });
    }

    function onPageHide() {
      if (!dirty) return;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      runSave(true);
    }

    return {
      program: program,
      sessionToken: sessionToken,
      loadFromServer: loadFromServer,
      scheduleSave: scheduleSave,
      markDirty: markDirty,
      onPageHide: onPageHide,
      stop: stop,
      canRemoteSave: canRemoteSave,
      packReady: packReady,
      isDirty: function () { return dirty; },
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
    MAX_LOAD_RETRIES: MAX_LOAD_RETRIES,
    idKey: idKey,
    studentKey: studentKey,
    lsStateKey: lsStateKey,
    lsEventsKey: lsEventsKey,
    newSessionToken: newSessionToken,
    sessionMatches: sessionMatches,
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
