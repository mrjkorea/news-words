/**
 * Generation token for dictation spelling audio.
 * bump() stops the bound clip so a later word can cancel a letter still in play().
 */
(function (root, factory) {
  var api = factory(root);
  if (root) root.SpellStop = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (root) {
  var gen = 0;
  var bound = null;

  function synth() {
    if (typeof window !== "undefined" && window.speechSynthesis) return window.speechSynthesis;
    if (root && root.speechSynthesis) return root.speechSynthesis;
    return null;
  }

  function bump() {
    gen += 1;
    var audio = bound;
    if (audio) {
      try { audio.pause(); } catch (e) {}
      try { audio.src = ""; } catch (e) {}
      try { audio.onended = null; } catch (e) {}
      try { audio.onerror = null; } catch (e) {}
    }
    var speech = synth();
    if (speech && typeof speech.cancel === "function") {
      try { speech.cancel(); } catch (e) {}
    }
    return gen;
  }

  function token() {
    return gen;
  }

  function stale(seen) {
    return seen !== gen;
  }

  function bind(audio) {
    bound = audio || null;
  }

  function settle(audio, seen) {
    if (!stale(seen) || !audio) return;
    try { audio.pause(); } catch (e) {}
    try { audio.src = ""; } catch (e) {}
  }

  return {
    bump: bump,
    token: token,
    stale: stale,
    bind: bind,
    settle: settle,
  };
});
