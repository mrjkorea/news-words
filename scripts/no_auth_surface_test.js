const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PATTERN = /mrj-signin|mrj-auth(?:\.|-)|MRJ_AUTH/i;

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(html|js)$/i.test(name)) continue;
    if (name === "no_auth_surface_test.js") continue;
    if (name === "mrj-scores.js") continue;
    acc.push(full);
  }
}

function run() {
  const files = [];
  walk(ROOT, files);
  const hits = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, "utf8");
    if (PATTERN.test(text)) hits.push(rel);
  }
  assert.deepStrictEqual(
    hits,
    [],
    "mrj-auth / mrj-signin must not appear in shipped HTML or JS:\n" + hits.join("\n")
  );
  console.log("PASS no_auth_surface_test (" + files.length + " files scanned)");
}

run();
