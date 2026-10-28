const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const source = readFileSync(join(__dirname, "../channel-data.js"), "utf8");
const id = "a".repeat(32);
const profile = value => ({ channelId: value, channelName: "테스트", openLive: true });
const live = value => ({ channel: profile(value), status: "OPEN", liveId: 123, liveTitle: "현재 방송", liveCategoryValue: "게임",
  tags: ["태그", "두 번째", { private: true }], cvExposure: true, concurrentUserCount: 1234,
  livePlaybackJson: "must-not-be-cached", liveTokenList: ["must-not-be-cached"] });
const reply = content => ({ ok: true, json: async () => ({ code: 200, content }) });
function setup(custom) {
  const calls = []; let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ AbortController, DOMException, setTimeout, clearTimeout, Date: Clock,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const value = url.match(/channels\/([a-f0-9]{32})/)[1];
      return custom ? custom(url, options, value) : reply(url.endsWith("/live-detail") ? live(value) : profile(value));
    } });
  vm.runInContext(source, context);
  return { get: context.ChzzkChannels.get, calls, advance: delta => { now += delta; } };
}
test("public metadata includes category and visible count but excludes hashtags/playback/account fields", async () => {
  const f = setup(), data = await f.get(id);
  assert.equal(data.liveId, 123); assert.equal(data.category, "게임"); assert.equal(data.viewers, 1234);
  assert.equal(Object.hasOwn(data, "tags"), false);
  assert.equal(Object.hasOwn(data, "livePlaybackJson"), false);
  assert.equal(Object.hasOwn(data, "liveTokenList"), false);
  assert(f.calls.every(call => call.options.credentials === "omit"));
});
test("hidden viewer counts and ended broadcasts do not expose stale live details", async () => {
  const hidden = setup((url, _, value) => reply(url.endsWith("/live-detail") ? { ...live(value), cvExposure: false } : profile(value)));
  assert.equal((await hidden.get(id)).viewers, null);
  const ended = setup((url, _, value) => reply(url.endsWith("/live-detail") ? { ...live(value), status: "CLOSE", closeDate: "2026-10-29" } : profile(value)));
  const data = await ended.get(id); assert.equal(data.openLive, false); assert.equal(data.liveId, null); assert.equal(data.viewers, null); assert.equal(Object.hasOwn(data, "tags"), false);
});
test("simultaneous sidebar/row requests share one pair of requests and expire after 30 seconds", async () => {
  const f = setup(); const [a, b] = await Promise.all([f.get(id), f.get(id)]);
  assert.equal(a, b); assert.equal(f.calls.length, 2);
  assert.equal(await f.get(id), a); assert.equal(f.calls.length, 2);
  f.advance(30001); await f.get(id); assert.equal(f.calls.length, 4);
});
test("leaving one hover does not abort another consumer of the same channel", async () => {
  let release;
  const f = setup((url, _, value) => url.endsWith("/live-detail") ? reply(live(value)) : new Promise(resolve => { release = () => resolve(reply(profile(value))); }));
  const controller = new AbortController();
  const first = f.get(id, { signal: controller.signal }); const rejected = assert.rejects(first, error => error.name === "AbortError");
  const second = f.get(id); controller.abort();
  assert.equal(f.calls[0].options.signal.aborted, false); release();
  await rejected; assert.equal((await second).openLive, true);
});
test("network concurrency is bounded and a cancelled queued hover never sends a request", async () => {
  const releases = [];
  const f = setup((_, options, value) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    releases.push(() => resolve(reply({ ...profile(value), openLive: false })));
  }));
  const first = ["a", "b", "c"].map(char => f.get(char.repeat(32)));
  const controller = new AbortController(), fourth = f.get("d".repeat(32), { signal: controller.signal });
  const rejected = assert.rejects(fourth, error => error.name === "AbortError");
  assert.equal(f.calls.length, 3); controller.abort(); releases.forEach(release => release());
  await Promise.all(first); await rejected;
  assert.equal(f.calls.length, 3);
});
test("invalid channel IDs do not create requests", async () => {
  const f = setup(); await assert.rejects(f.get("../../account"), /Invalid channel/); assert.equal(f.calls.length, 0);
});
