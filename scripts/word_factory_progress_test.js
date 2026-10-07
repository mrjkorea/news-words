const assert = require("assert");
const Progress = require("../js/word-factory-progress.js");

function testMergeWinsMax() {
  const a = {
    id: "s1",
    packId: "news-2026-10-01",
    words: [{ id: "w1", en: "a", ko: "a" }],
    winsA: { w1: 2 },
    winsB: { w1: 0 },
    winsC: {},
    intro: { w1: true },
    createdAt: 100,
    lastPlayedAt: 200,
  };
  const b = {
    id: "s2",
    packId: "news-2026-10-01",
    words: [{ id: "w1", en: "a", ko: "a" }],
    winsA: { w1: 1 },
    winsB: { w1: 2 },
    winsC: { w1: 1 },
    intro: {},
    createdAt: 50,
    lastPlayedAt: 150,
  };
  const merged = Progress.mergeOneSet(a, b);
  assert.strictEqual(merged.winsA.w1, 2);
  assert.strictEqual(merged.winsB.w1, 2);
  assert.strictEqual(merged.winsC.w1, 1);
  assert.strictEqual(merged.intro.w1, true);
  assert.strictEqual(merged.createdAt, 50);
  assert.strictEqual(merged.lastPlayedAt, 200);
}

function testParseBrokenServerJson() {
  const p = Progress.parsePackJson("{not json");
  assert.strictEqual(p.parseError, true);
  assert.strictEqual(p.state, null);
  assert.deepStrictEqual(p.events, []);
}

function testRicherMergeTriggersSave() {
  const local = Progress.defaultState(() => "stu1");
  local.sets = {
    a: {
      id: "a",
      packId: "news-2026-10-07",
      words: [{ id: "w1", en: "x", ko: "y" }],
      winsA: { w1: 2 },
      winsB: {},
      winsC: {},
      intro: {},
    },
  };
  const server = Progress.parsePackJson("{}");
  assert.ok(
    Progress.stateRicherThan(local, [], server.state, server.events)
  );
}

function testIdKeyNormalization() {
  const auth = { idKey: (id) => "  " + String(id).trim() + "  " };
  assert.strictEqual(Progress.idKey("Student_A", auth), "student_a");
  assert.strictEqual(
    Progress.lsStateKey(Progress.idKey("Student_A", auth)),
    "mrj.word_factory.state:student_a"
  );
}

function testRawKeyFallbackReadOnly() {
  const store = {};
  global.localStorage = {
    getItem(k) {
      return store[k] == null ? null : store[k];
    },
    setItem(k, v) {
      store[k] = v;
    },
    removeItem(k) {
      delete store[k];
    },
  };
  store["mrj.word_factory.state:StudentA"] = JSON.stringify({
    studentId: "legacy",
    sets: { x: { id: "x", winsA: { w: 1 } } },
  });
  const loaded = Progress.loadLocalState("StudentA", null);
  assert.strictEqual(loaded.studentId, "legacy");
  Progress.persistLocalState("StudentA", Progress.defaultState(() => "n"), null);
  assert.ok(store["mrj.word_factory.state:studenta"]);
  assert.ok(store["mrj.word_factory.state:StudentA"], "raw key must not be deleted");
  delete global.localStorage;
}

function testGatingNoSaveBeforeLoad() {
  let saves = 0;
  const auth = {
    loadPack: () =>
      Promise.resolve({ ok: true, found: false, progress_json: "{}" }),
    savePack: () => {
      saves += 1;
      return Promise.resolve({ ok: true });
    },
    packReady: () => true,
  };
  const sync = Progress.createRemoteSync(auth, {
    disableLoadRetry: true,
    getSnapshot: () => ({
      state: Progress.defaultState(() => "s"),
      events: [],
    }),
    applySnapshot: () => {},
  });
  assert.strictEqual(sync.canRemoteSave(), false);
  return sync.loadFromServer().then(() => {
    assert.strictEqual(sync.canRemoteSave(), true);
    assert.strictEqual(saves, 0);
  });
}

function testGatingRefusesSaveWhenLoadFails() {
  const auth = {
    loadPack: () => Promise.resolve({ ok: false, error: "network" }),
    savePack: () => Promise.resolve({ ok: true }),
    packReady: () => false,
  };
  const sync = Progress.createRemoteSync(auth, {
    disableLoadRetry: true,
    getSnapshot: () => ({
      state: Progress.defaultState(() => "s"),
      events: [],
    }),
    applySnapshot: () => {},
  });
  return sync.loadFromServer().then(() => {
    assert.strictEqual(sync.canRemoteSave(), false);
    sync.onPageHide();
    assert.strictEqual(sync.loadError(), "network");
  });
}

function testIdlePagehideNoSave() {
  let saves = 0;
  const auth = {
    loadPack: () =>
      Promise.resolve({ ok: true, found: false, progress_json: "{}" }),
    savePack: () => {
      saves += 1;
      return Promise.resolve({ ok: true });
    },
    packReady: () => true,
  };
  const sync = Progress.createRemoteSync(auth, {
    disableLoadRetry: true,
    getSnapshot: () => ({
      state: Progress.defaultState(() => "s"),
      events: [],
    }),
    applySnapshot: () => {},
  });
  return sync.loadFromServer().then(() => {
    sync.onPageHide();
    sync.onPageHide();
    assert.strictEqual(saves, 0);
  });
}

function testCrossStudentStaleLoad() {
  let resolveA;
  let saves = [];
  const auth = {
    loadPack: () =>
      new Promise((resolve) => {
        resolveA = resolve;
      }),
    savePack: (prog, body) => {
      saves.push(body);
      return Promise.resolve({ ok: true });
    },
    packReady: () => true,
  };

  const stateA = Progress.defaultState(() => "a");
  stateA.sets = {
    sa: {
      id: "sa",
      packId: "news-a",
      words: [{ id: "a1", en: "a1", ko: "a1" }],
      winsA: { a1: 2 },
      winsB: {},
      winsC: {},
      intro: {},
    },
    sb: {
      id: "sb",
      packId: "news-b",
      words: [{ id: "a2", en: "a2", ko: "a2" }],
      winsA: { a2: 2 },
      winsB: {},
      winsC: {},
      intro: {},
    },
  };

  const stateB = Progress.defaultState(() => "b");
  stateB.sets = {
    bb: {
      id: "bb",
      packId: "news-b-only",
      words: [{ id: "b1", en: "b1", ko: "b1" }],
      winsA: { b1: 1 },
      winsB: {},
      winsC: {},
      intro: {},
    },
  };

  let liveState = JSON.parse(JSON.stringify(stateA));
  let active = Progress.newSessionToken("student_a");
  const tokenA = active;

  const syncA = Progress.createRemoteSync(auth, {
    sessionToken: tokenA,
    isSessionActive: (tok) => Progress.sessionMatches(tok, active),
    disableLoadRetry: true,
    getSnapshot: () => ({ state: liveState, events: [] }),
    applySnapshot: (snap) => {
      liveState = snap.state;
    },
  });

  const loadPromise = syncA.loadFromServer();

  active = Progress.newSessionToken("student_b");
  syncA.stop();
  liveState = JSON.parse(JSON.stringify(stateB));

  const syncB = Progress.createRemoteSync(auth, {
    sessionToken: active,
    isSessionActive: (tok) => Progress.sessionMatches(tok, active),
    disableLoadRetry: true,
    getSnapshot: () => ({ state: liveState, events: [] }),
    applySnapshot: (snap) => {
      liveState = snap.state;
    },
  });

  const aPack = Progress.packFromParts(stateA, []);
  resolveA({
    ok: true,
    found: true,
    progress_json: JSON.stringify(aPack),
  });

  return loadPromise.then(() => {
    assert.strictEqual(Object.keys(liveState.sets).length, 1);
    assert.ok(liveState.sets.bb);
    assert.strictEqual(liveState.sets.bb.winsA.b1, 1);
    assert.ok(!liveState.sets.sa, "A set must not leak into B");
    const uploaded = saves.join("\n");
    assert.ok(!uploaded.includes("a1"), "A data must not upload for B");
    assert.ok(!uploaded.includes("a2"), "A data must not upload for B");
  });
}

function testLegacyKeyUntouched() {
  const store = {};
  global.localStorage = {
    getItem(k) {
      return store[k] == null ? null : store[k];
    },
    setItem(k, v) {
      store[k] = v;
    },
    removeItem(k) {
      delete store[k];
    },
  };
  store[Progress.LS_STATE] = JSON.stringify({
    studentId: "legacy",
    sets: { big: { id: "big", winsA: { w: 9 } } },
  });
  Progress.persistLocalState("student_a", Progress.defaultState(() => "new"), null);
  assert.ok(store[Progress.LS_STATE], "legacy device key must remain");
  assert.ok(store[Progress.lsStateKey("student_a")], "student key written");
  assert.notStrictEqual(
    store[Progress.LS_STATE],
    store[Progress.lsStateKey("student_a")]
  );
  delete global.localStorage;
}

function run() {
  testMergeWinsMax();
  testParseBrokenServerJson();
  testRicherMergeTriggersSave();
  testIdKeyNormalization();
  testRawKeyFallbackReadOnly();
  testLegacyKeyUntouched();
  return Promise.all([
    testGatingNoSaveBeforeLoad(),
    testGatingRefusesSaveWhenLoadFails(),
    testIdlePagehideNoSave(),
    testCrossStudentStaleLoad(),
  ]).then(() => {
    console.log("PASS word_factory_progress_test");
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
