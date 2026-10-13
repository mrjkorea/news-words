#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { bootApp } = require("./load_app_for_test.js");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const appSrc = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
if (/set\.id\s*\|\|\s*"nouns100"/.test(appSrc)) {
  fail("js/app.js still uses set.id || nouns100 for pack_id");
}
if (!/function packIdForSet\(set\)/.test(appSrc)) {
  fail("js/app.js missing packIdForSet");
}

const api = bootApp();
const internalId = "set_internal_uid_xyz";
const packId = "news-2026-10-07";

api.activateSet({
  id: internalId,
  packId: packId,
  title: "News 2026-10-07",
  words: [{ id: "sell", en: "sell", ko: "팔다" }],
  intro: { sell: true },
  winsA: { sell: 2 },
  winsB: { sell: 2 },
  winsC: { sell: 2 },
});

const shoot = api.shooterPack(api.currentSet());
if (!shoot || shoot.pack_id !== packId) {
  fail("shooterPack pack_id " + JSON.stringify(shoot && shoot.pack_id));
}
if (api.currentPackId() !== packId) {
  fail("currentPackId " + JSON.stringify(api.currentPackId()));
}
if (api.packIdForSet({ id: internalId }) !== api.DEMO_PACK_ID) {
  fail("packIdForSet without packId should use DEMO_PACK_ID");
}
if (api.packIdForSet({ id: internalId, packId: packId }) !== packId) {
  fail("packIdForSet with packId");
}

console.log("GAME_PACK_ID_OK");
