/**
 * Word Factory algorithm — Jay lock 26AUG2026.
 * SAME as School Tests Lesson 05 phone factory.js (NEED = 2, algo: streak2).
 * Do not invent a third system.
 *
 * Student path: one screen, no menus. Automatic A(배우기) → B(받아쓰기) → C(쓰기).
 * Skip buttons are tester/Jay only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WordFactoryAlgo = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NEED = 2;
  const ALGO = "streak2";
  const MODE_ORDER = ["A", "B", "C"];
  const MODE_META = {
    A: { ko: "배우기", hint: "듣고 한국어를 고르세요" },
    B: { ko: "받아쓰기", hint: "듣고 영어로 쓰세요" },
    C: { ko: "쓰기", hint: "한국어를 보고 영어로 쓰세요" },
  };

  function emptyWins() {
    return { winsA: {}, winsB: {}, winsC: {} };
  }

  function bucket(state, mode) {
    if (mode === "A") return state.winsA;
    if (mode === "B") return state.winsB;
    return state.winsC;
  }

  function partDone(words, wins) {
    return words.every(function (w) {
      return (wins[w.id] || 0) >= NEED;
    });
  }

  function remaining(words, wins) {
    return words.filter(function (w) {
      return (wins[w.id] || 0) < NEED;
    });
  }

  function nextMode(mode) {
    if (mode === "A") return "B";
    if (mode === "B") return "C";
    return null;
  }

  /** Auto path. Students never pick Learn/Spell/Write or Round 1/2/3. */
  function startMode(words, state) {
    if (!partDone(words, state.winsA)) return "A";
    if (!partDone(words, state.winsB)) return "B";
    if (!partDone(words, state.winsC)) return "C";
    return null;
  }

  function factoryProgress(words, state) {
    var got = 0;
    var need = words.length * NEED * 3;
    words.forEach(function (w) {
      got += Math.min(NEED, state.winsA[w.id] || 0);
      got += Math.min(NEED, state.winsB[w.id] || 0);
      got += Math.min(NEED, state.winsC[w.id] || 0);
    });
    return need ? Math.round((got / need) * 100) : 0;
  }

  /**
   * Interleave queue for one part.
   * Correct → back of pack (never twice in a row if others remain).
   * Two clean hits (no miss between) → done for this part.
   * Miss → streak 0, comes back later.
   */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function makeQueue(words, wins) {
    return shuffle(remaining(words, wins));
  }

  function nextWord(queue, words, wins) {
    queue = queue.filter(function (w) {
      return (wins[w.id] || 0) < NEED;
    });
    if (!queue.length) queue = shuffle(remaining(words, wins));
    if (!queue.length) return { queue: queue, cur: null, partDone: true };
    var cur = queue.shift();
    return { queue: queue, cur: cur, partDone: false };
  }

  function applyGrade(queue, words, wins, cur, ok) {
    if (ok) {
      wins[cur.id] = (wins[cur.id] || 0) + 1;
      if ((wins[cur.id] || 0) < NEED) queue.push(cur);
    } else {
      wins[cur.id] = 0;
      queue.push(cur);
    }
    return nextWord(queue, words, wins);
  }

  function testerSkipWord(wins, cur) {
    wins[cur.id] = NEED;
  }

  function testerSkipPart(words, wins) {
    words.forEach(function (w) {
      wins[w.id] = NEED;
    });
  }

  return {
    NEED: NEED,
    ALGO: ALGO,
    MODE_ORDER: MODE_ORDER,
    MODE_META: MODE_META,
    emptyWins: emptyWins,
    bucket: bucket,
    partDone: partDone,
    remaining: remaining,
    nextMode: nextMode,
    startMode: startMode,
    factoryProgress: factoryProgress,
    makeQueue: makeQueue,
    nextWord: nextWord,
    applyGrade: applyGrade,
    testerSkipWord: testerSkipWord,
    testerSkipPart: testerSkipPart,
  };
});
