const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const source = readFileSync(path.join(__dirname, "../media-background.js"), "utf8");
function background() {
  const events = {}, badges = new Map(), titles = new Map(), calls = [];
  let now = 100000, reject = false;
  const chrome = {
    runtime: { id: "extension", onMessage: { addListener: fn => { events.message = fn; } } },
    action: Object.fromEntries(["setBadgeBackgroundColor", "setBadgeTextColor", "setBadgeText", "setTitle"].map(method => [method, async details => {
      if (reject) throw Error("No tab with id");
      calls.push({ method, ...details });
      if (method === "setBadgeText") badges.set(details.tabId, details.text);
      if (method === "setTitle") titles.set(details.tabId, details.title);
    }])),
    tabs: { onRemoved: { addListener: fn => { events.remove = fn; } }, onUpdated: { addListener: fn => { events.update = fn; } }, sendMessage: async () => ({ ok: true }) }
  };
  vm.runInNewContext(source, { chrome, Date: { now: () => now } });
  const flush = async () => { await new Promise(setImmediate); };
  const message = async (body, tabId = 1, frameId = 0, id = "extension") => {
    let result;
    events.message(body, { id, tab: { id: tabId }, frameId }, response => { result = response; });
    await flush(); return result;
  };
  const report = (rate, tabId = 1, frameId = 0, score = 100) => message({ type: "MEDIA_FRAME_REPORT", rate, score, mediaScore: score }, tabId, frameId);
  return { events, badges, titles, calls, message, report, flush, advance: ms => { now += ms; }, reject: value => { reject = value; } };
}
test("badge shows actual native and automatic catch-up speeds, including normal speed", async () => {
  const b = background();
  for (const [rate, text] of [[1, "1"], [1.5, "1.5"], [1.03, "1.03"], [1.08, "1.08"], [16, "16"], [0.1, "0.1"]]) {
    await b.report(rate);
    assert.equal(b.badges.get(1), text);
    assert.match(b.titles.get(1), new RegExp(`${text.replace(".", "\\.")}배속`));
  }
});
test("tabs keep independent badges and the main iframe wins over smaller media", async () => {
  const b = background();
  await b.report(1.5, 1, 17, 500000);
  await b.report(4, 1, 0, 100);
  await b.report(2, 2);
  assert.equal(b.badges.get(1), "1.5"); assert.equal(b.badges.get(2), "2");
  await b.report(null, 1, 17, 0);
  assert.equal(b.badges.get(1), "4");
});
test("audio speed is shown without making audio a video frame-step target", async () => {
  const b = background();
  await b.message({ type: "MEDIA_FRAME_REPORT", score: 0, mediaScore: 1, rate: 0.8 });
  assert.equal(b.badges.get(1), "0.8");
  const result = await b.message({ type: "MEDIA_SPEED_COMMAND", action: "step", hasVideo: false });
  assert.equal(result.ok, false);
});
test("removing media and navigating clear stale speed and tooltip", async () => {
  const b = background();
  await b.report(2); await b.report(null, 1, 0, 0);
  assert.equal(b.badges.get(1), ""); assert.equal(b.titles.get(1), "치지직 편의 도구 설정");
  await b.report(3); b.events.update(1, { status: "loading" }); await b.flush();
  assert.equal(b.badges.get(1), "");
  b.events.update(44, { status: "loading" }); await b.flush();
  assert.equal(b.badges.get(44), ""); // Clear a badge retained across a worker restart, too.
});
test("expired iframe rates cannot conceal the current main video", async () => {
  const b = background(); await b.report(8, 1, 17, 1000000); b.advance(16000);
  await b.report(1.2, 1, 0, 100);
  assert.equal(b.badges.get(1), "1.2");
});
test("removing the last iframe clears its old speed without waiting for another video", async () => {
  const b = background(); await b.report(2, 1, 17, 1000000);
  await b.message({ type: "MEDIA_FRAME_REPORT", rate: null, score: 0, mediaScore: 0, hasIframes: false });
  assert.equal(b.badges.get(1), "");
});
test("command targets never replace observed speed when playback rejects the target", async () => {
  const b = background(); await b.report(1);
  await b.message({ type: "MEDIA_SPEED_COMMAND", action: "increase", currentRate: 1 });
  assert.equal(b.badges.get(1), "1");
  await b.report(1.1); assert.equal(b.badges.get(1), "1.1");
  await b.message({ type: "MEDIA_FRAME_REPORT", score: 100, mediaScore: 100, rate: 1.1, enabled: false });
  const result = await b.report(1.1); assert.equal(result.rate, null);
});
test("invalid rates and foreign senders are ignored, and repeated reports avoid action writes", async () => {
  const b = background(); await b.report(1.5, 0); const count = b.calls.length;
  await b.report(1.5, 0); assert.equal(b.calls.length, count);
  await b.message({ type: "MEDIA_FRAME_REPORT", rate: 8, mediaScore: 999 }, 0, 0, "foreign");
  assert.equal(b.badges.get(0), "1.5");
  for (const rate of [NaN, Infinity, -1, "2"]) { await b.report(rate, 0); assert.equal(b.badges.get(0), ""); }
});
test("closed-tab API failures are contained and a later report can retry", async () => {
  const b = background(); b.reject(true); await b.report(1);
  b.reject(false); await b.report(1); assert.equal(b.badges.get(1), "1");
  b.events.remove(1); await b.report(2); assert.equal(b.badges.get(1), "2");
});
