(() => {
  const VOICES = [
    ["us_m", "US male", { lang: "en-US", pitch: 0.85, rate: 0.92 }],
    ["us_f", "US female", { lang: "en-US", pitch: 1.15, rate: 0.95 }],
    ["uk_m", "UK male", { lang: "en-GB", pitch: 0.85, rate: 0.92 }],
    ["uk_f", "UK female", { lang: "en-GB", pitch: 1.15, rate: 0.95 }],
    ["grandma", "Grandma", { lang: "en-US", pitch: 1.35, rate: 0.82 }],
    ["leo", "Teenager", { lang: "en-US", pitch: 1.05, rate: 1.08 }],
    ["grandpa", "Grandpa", { lang: "en-GB", pitch: 0.7, rate: 0.8 }],
    ["robot", "Robot", { lang: "en-US", pitch: 0.4, rate: 1.15 }],
  ];
  let voiceId = "us_m";
  let pack = null;
  let i = 0;
  let phase = "meet"; // meet learn dict write done
  let dictScore = 0;
  let writeScore = 0;
  const date = new URLSearchParams(location.search).get("date") || "";

  const $ = (id) => document.getElementById(id);
  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const cfg = (VOICES.find((v) => v[0] === voiceId) || VOICES[0])[2];
    u.lang = cfg.lang;
    u.pitch = cfg.pitch;
    u.rate = cfg.rate;
    const sys = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.startsWith(cfg.lang.slice(0, 2)));
    const prefer = sys.find((v) => v.lang === cfg.lang) || sys[0];
    if (prefer) u.voice = prefer;
    speechSynthesis.speak(u);
  };

  const renderVoices = () => {
    $("voices").innerHTML = VOICES.map(
      ([id, label]) =>
        `<button type="button" data-voice="${id}" aria-pressed="${id === voiceId}">${label}</button>`
    ).join("");
    $("voices").onclick = (e) => {
      const b = e.target.closest("button[data-voice]");
      if (!b) return;
      voiceId = b.dataset.voice;
      renderVoices();
      const w = pack && pack.words[i];
      if (w) speak(w.en);
    };
  };

  const word = () => pack.words[i];

  const setBar = (html) => {
    $("bar").innerHTML = html;
  };

  const renderMeet = () => {
    const w = word();
    $("step-line").textContent = `Meet ${i + 1} / ${pack.words.length}`;
    $("stage").innerHTML = `<p class="pos">${w.pos}</p><p class="word">${w.en}</p><p class="big">${w.def_en}</p><p class="meta">${w.example_en}</p>`;
    speak(`${w.en}. ${w.def_en}`);
    setBar(
      `<button class="ghost" id="btn-speak">Hear it</button><button class="chunk" id="btn-next">${
        i + 1 === pack.words.length ? "Start Learn" : "Next word"
      }</button>`
    );
    $("btn-speak").onclick = () => speak(w.en);
    $("btn-next").onclick = () => {
      if (i + 1 < pack.words.length) {
        i += 1;
        renderMeet();
      } else {
        i = 0;
        phase = "learn";
        renderLearn();
      }
    };
  };

  const renderLearn = () => {
    const w = word();
    $("step-line").textContent = `Learn ${i + 1} / ${pack.words.length}`;
    $("stage").innerHTML = `<p class="word">${w.en}</p><p class="big">${w.def_en}</p><p class="meta">${w.example_en}</p>`;
    speak(`${w.en}. ${w.example_en}`);
    setBar(
      `<button class="ghost" id="btn-speak">Hear it</button><button class="chunk" id="btn-next">${
        i + 1 === pack.words.length ? "Start dictation" : "Next"
      }</button>`
    );
    $("btn-speak").onclick = () => speak(w.en);
    $("btn-next").onclick = () => {
      if (i + 1 < pack.words.length) {
        i += 1;
        renderLearn();
      } else {
        i = 0;
        phase = "dict";
        renderDict();
      }
    };
  };

  const renderDict = () => {
    const w = word();
    $("step-line").textContent = `Dictation ${i + 1} / ${pack.words.length}`;
    $("stage").innerHTML = `<p class="meta">Listen. Type the word.</p><input class="ans" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false"/><p class="meta" id="fb"></p>`;
    speak(w.en);
    setBar(
      `<button class="ghost" id="btn-speak">Hear it again</button><button class="chunk" id="btn-check">Check</button>`
    );
    $("btn-speak").onclick = () => speak(w.en);
    $("ans").focus();
    const go = () => {
      const ok = $("ans").value.trim().toLowerCase() === w.en.toLowerCase();
      if (ok) dictScore += 1;
      $("fb").textContent = ok ? "Yes." : `It was “${w.en}”.`;
      setTimeout(() => {
        if (i + 1 < pack.words.length) {
          i += 1;
          renderDict();
        } else {
          i = 0;
          phase = "write";
          renderWrite();
        }
      }, 650);
    };
    $("btn-check").onclick = go;
    $("ans").addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  };

  const renderWrite = () => {
    const w = word();
    $("step-line").textContent = `Write ${i + 1} / ${pack.words.length}`;
    $("stage").innerHTML = `<p class="meta">Read the meaning. Type the English word.</p><p class="big">${w.def_en}</p><input class="ans" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false"/><p class="meta" id="fb"></p>`;
    setBar(`<button class="chunk" id="btn-check">Check</button>`);
    $("ans").focus();
    const go = () => {
      const ok = $("ans").value.trim().toLowerCase() === w.en.toLowerCase();
      if (ok) writeScore += 1;
      $("fb").textContent = ok ? "Yes." : `It was “${w.en}”.`;
      setTimeout(() => {
        if (i + 1 < pack.words.length) {
          i += 1;
          renderWrite();
        } else {
          phase = "done";
          renderDone();
        }
      }, 650);
    };
    $("btn-check").onclick = go;
    $("ans").addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  };

  const renderDone = () => {
    const total = pack.words.length * 2;
    const got = dictScore + writeScore;
    const key = `mrj-news-words-${pack.date}`;
    const prev = JSON.parse(localStorage.getItem(key) || '{"attempts":0}');
    prev.attempts += 1;
    prev.last = got;
    localStorage.setItem(key, JSON.stringify(prev));
    $("step-line").textContent = "Score this visit";
    $("stage").innerHTML = `<p class="score">${got} / ${total}</p><p>Dictation ${dictScore}/10 · Write ${writeScore}/10</p><p class="meta">Attempt ${prev.attempts} on this phone.</p>`;
    setBar(
      `<button class="chunk" id="btn-retry">다시 풀기</button><a class="chunk" style="text-decoration:none" href="index.html">All days</a>`
    );
    $("btn-retry").onclick = () => {
      i = 0;
      dictScore = 0;
      writeScore = 0;
      phase = "meet";
      renderMeet();
    };
  };

  const boot = async () => {
    renderVoices();
    if (!date) {
      $("stage").innerHTML = `<p>Missing date. Open from the <a href="index.html">index</a>.</p>`;
      return;
    }
    $("date-pill").textContent = date;
    const res = await fetch(`packs/news-${date}.json`);
    if (!res.ok) {
      $("stage").innerHTML = `<p>No pack for ${date}. <a href="index.html">All days</a></p>`;
      return;
    }
    pack = await res.json();
    $("headline").textContent = pack.headline || "Word practice";
    document.title = `${date} word practice · MRJ English`;
    renderMeet();
  };
  boot();
})();
