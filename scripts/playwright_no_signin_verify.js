/**
 * Headless check: no sign-in UI, no forbidden network, progress survives reload.
 * Run: node scripts/playwright_no_signin_verify.js (starts static server on 8765).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 8765;
const BASE = "http://127.0.0.1:" + PORT;

const FORBIDDEN = [
  /mrjkorea\.github\.io\/mrj-signin/i,
  /script\.google\.com/i,
];

const PAGES = [
  "/index.html",
  "/days.html",
  "/games/leap-frog/index.html",
  "/games/snow-jump/index.html",
  "/games/spellfire/index.html",
  "/games/sound-invaders/index.html",
];

const VIEWPORTS = [
  { width: 390, height: 844, name: "390x844" },
  { width: 1280, height: 800, name: "1280x800" },
];

function mime(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".mp3")) return "audio/mpeg";
  if (file.endsWith(".wav")) return "audio/wav";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.normalize(path.join(ROOT, urlPath.replace(/^\//, "")));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": mime(filePath) });
        res.end(data);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function forbiddenUrl(url) {
  return FORBIDDEN.some((re) => re.test(url));
}

async function assertNoSignIn(page) {
  const gate = await page.$("#mrj-auth-gate");
  if (gate && (await gate.isVisible())) {
    throw new Error("mrj-auth-gate visible");
  }
  const bodyText = await page.locator("body").innerText();
  if (/checking your id/i.test(bodyText)) {
    throw new Error('found "Checking your ID" copy');
  }
}

async function runViewport(vp) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await context.newPage();
  const badRequests = [];
  const pageErrors = [];
  page.on("request", (req) => {
    const url = req.url();
    if (forbiddenUrl(url)) badRequests.push(url);
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  for (const route of PAGES) {
    badRequests.length = 0;
    pageErrors.length = 0;
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
    await assertNoSignIn(page);
    if (badRequests.length) {
      throw new Error(vp.name + " " + route + " forbidden requests: " + badRequests.join(", "));
    }
    if (pageErrors.length) {
      throw new Error(vp.name + " " + route + " page errors: " + pageErrors.join(" | "));
    }
  }

  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.click("#btn-tap-start");
  await page.waitForTimeout(500);
  const deviceKey = await page.evaluate(() => localStorage.getItem("mrj.news_words.device_id"));
  const stateBefore = await page.evaluate(() => {
    const id = localStorage.getItem("mrj.news_words.device_id") || "";
    const k = "mrj.word_factory.state:" + id.toLowerCase();
    return localStorage.getItem(k);
  });
  await page.evaluate(() => {
    const id = localStorage.getItem("mrj.news_words.device_id") || "dev_anonymous";
    const k = "mrj.word_factory.state:" + id.toLowerCase();
    const raw = localStorage.getItem(k);
    let st = raw ? JSON.parse(raw) : { sets: {} };
    if (!st.sets) st.sets = {};
    st.sets.__pw = { id: "__pw", winsA: { w: 1 } };
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload({ waitUntil: "networkidle" });
  const stateAfter = await page.evaluate(() => {
    const id = localStorage.getItem("mrj.news_words.device_id") || "";
    const k = "mrj.word_factory.state:" + id.toLowerCase();
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    try {
      return JSON.parse(raw).sets && JSON.parse(raw).sets.__pw;
    } catch (e) {
      return null;
    }
  });
  if (!stateAfter || !stateAfter.winsA || stateAfter.winsA.w !== 1) {
    throw new Error(vp.name + " progress did not survive reload");
  }
  if (!deviceKey) {
    throw new Error(vp.name + " missing device id key");
  }

  await browser.close();
  return { viewport: vp.name, pages: PAGES.length, deviceKey, progressOk: true };
}

async function main() {
  const server = await startServer();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      results.push(await runViewport(vp));
      console.log("OK playwright " + vp.name);
    }
    console.log("PASS playwright_no_signin_verify", JSON.stringify(results));
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
