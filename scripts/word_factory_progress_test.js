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
    retryDelayMs: 0,
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
    retryDelayMs: 0,
    getSnapshot: () => ({
      state: Progress.defaultState(() => "s"),
      events: [],
    }),
    applySnapshot: () => {},
  });
  return sync.loadFromServer().then(() => {
    assert.strictEqual(sync.canRemoteSave(), false);
    sync.scheduleSave(true);
    assert.strictEqual(sync.loadError(), "network");
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
  Progress.persistLocalState("student_a", Progress.defaultState(() => "new"));
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
  testLegacyKeyUntouched();
  return Promise.all([
    testGatingNoSaveBeforeLoad(),
    testGatingRefusesSaveWhenLoadFails(),
  ]).then(() => {
    console.log("PASS word_factory_progress_test");
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
