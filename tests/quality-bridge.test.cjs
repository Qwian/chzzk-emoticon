const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const source = name => readFileSync(join(__dirname, "..", name), "utf8");
function fixture(features, reverse = false) {
  const document = new EventTarget();
  class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init.detail; } }
  class Response {
    constructor(value, url) { this.value = value; this.url = url; }
    json() { return Promise.resolve(this.value); }
  }
  const listeners = [];
  const context = vm.createContext({ document, CustomEvent, Event, Response, URL,
    chrome: { storage: { local: { get: async () => ({ features }) }, onChanged: { addListener: fn => listeners.push(fn) } } } });
  for (const file of reverse ? ["quality-settings.js", "quality-bridge.js"] : ["quality-bridge.js", "quality-settings.js"]) vm.runInContext(source(file), context);
  return { context, listeners, parse: value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, context) };
}
const media = () => ({ liveId: 123, liveTitle: "live", channel: { channelId: "a".repeat(32) }, dab: true,
  livePlaybackJson: '{"media":[{"path":"https://example.test/original","p2pPath":"original"}]}',
  adult: true, paidProduct: { required: true }, userAdultStatus: "NOT_ADULT", playerAdDisplayResponse: { preRoll: true } });

for (const reverse of [false, true]) test(`metadata bridge startup order ${reverse}`, async () => {
  const f = fixture(undefined, reverse);
  // Until stored preferences are read, leave the page untouched.
  assert.equal(f.parse(media()).dab, true);
  await Promise.resolve();
  const original = media(), result = f.parse({ code: 200, content: original });
  assert.equal(result.content.dab, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.content)), { ...original, dab: false });
  f.listeners.forEach(fn => fn({ features: { newValue: { adblockQuality: false } } }, "local"));
  assert.equal(f.parse(media()).dab, true);
});
test("disabled preference, malformed data, error response and unrelated JSON pass through", async () => {
  const disabled = fixture({ adblockQuality: false }); await Promise.resolve();
  assert.equal(disabled.parse(media()).dab, true);
  const f = fixture(); await Promise.resolve();
  for (const value of [{ dab: true }, { ...media(), channel: { channelId: "wrong" } },
    { code: 403, content: media() }, { content: media() }, { message: media() }, { ...media(), dab: "true" }]) {
    assert.deepEqual(JSON.parse(JSON.stringify(f.parse(value))), value);
  }
  assert.throws(() => vm.runInContext('JSON.parse("{")', f.context), /JSON/);
  assert.equal(vm.runInContext('JSON.parse(`{"x":2}`, (key,value)=>key==="x"?value*3:value).x', f.context), 6);
  f.context.text = JSON.stringify(media());
  assert.equal(vm.runInContext('JSON.parse(text, (key,value)=>value).dab', f.context), true);
});
test("VOD and API Response.json repair preserve other response behavior", async () => {
  const f = fixture(); await Promise.resolve();
  const vod = { ...media(), liveId: undefined, videoNo: 456, videoTitle: "vod" };
  assert.equal(f.parse(vod).dab, false);
  for (const [url, expected] of [
    [`https://api.chzzk.naver.com/service/v3/channels/${"a".repeat(32)}/live-detail-meta?dt=test`, false],
    ["https://api.chzzk.naver.com/service/v3/videos/456", false],
    ["https://example.test/service/v3/videos/456", true],
    ["https://api.chzzk.naver.com/service/v1/search/channels", true], ["", true]
  ]) {
    f.context.value = { code: 200, content: media() }; f.context.url = url;
    const result = await vm.runInContext("new Response(value,url).json()", f.context);
    assert.equal(result.content.dab, expected, url);
  }
});
