const fs = require("fs");
const app = fs.readFileSync("js/app.js", "utf8");
function extract(name) {
  const re = new RegExp("(?:async )?function " + name + "\\b");
  const m = re.exec(app);
  if (!m) return "";
  const start = m.index;
  const i = app.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < app.length; j++) {
    if (app[j] === "{") depth++;
    else if (app[j] === "}") {
      depth--;
      if (depth === 0) return app.slice(start, j + 1);
    }
  }
  return "";
}
const teach = extract("teachSpelling");
const advance = extract("advanceLearn");
const letter = extract("speakLetter");
const fails = [];
if (!fs.existsSync("js/spell-stop.js")) fails.push("missing spell-stop.js");
if (teach.indexOf("SpellStop.stale") === -1) fails.push("teachSpelling missing stale");
if (teach.indexOf("await wait(900)") !== -1) fails.push("teachSpelling still waits 900");
if (advance.indexOf("SpellStop.bump") === -1) fails.push("advanceLearn missing bump");
if (letter.indexOf("SpellStop.bump") !== -1) fails.push("speakLetter must not bump");
if (fails.length) {
  console.error(fails.join("\n"));
  process.exit(1);
}
console.log("PASS");
