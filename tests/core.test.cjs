const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
vm.runInThisContext(readFileSync(require("node:path").join(__dirname, "../tools-core.js"), "utf8"));
const core = globalThis.ChzzkTools;

test("two-set keyboard composition including compound finals, shifted letters, spacing", () => {
  for (const [input, expected] of Object.entries({ rkdwl: "강지", gksrmf: "한글", dkssudgktpdy: "안녕하세요", Qk: "빠", rhoscksgdk: "괜찮아", rkqt: "값", rkqtdl: "값이", "gksrmf 123": "한글 123", "한글": "한글", "": "" })) {
    assert.equal(core.koreanFromEnglish(input), expected, input);
  }
});
test("catch-up never seeks outside loaded live buffer or across a hole to unloaded time", () => {
  const base = { time: 50, seekable: [[0, 100]], buffered: [[40, 80]], mode: "1.5", force: true };
  assert.equal(core.planCatchUp(base).seek, 78.5);
  assert.equal(core.planCatchUp({ ...base, buffered: [[40, 52], [98, 99]] }).seek, undefined);
  assert.equal(core.planCatchUp({ ...base, buffered: [[60, 80]] }).rate, 1);
  assert.equal(core.planCatchUp({ ...base, force: false }).seek, undefined);
});
test("catch-up preserves safety margin and uses modest rates for small gaps", () => {
  const base = { time: 98, seekable: [[0, 100]], buffered: [[0, 100]], mode: "1.5" };
  assert.equal(core.planCatchUp(base).rate, 1.03);
  assert.equal(core.planCatchUp({ ...base, time: 95 }).rate, 1.15);
  assert.equal(core.planCatchUp({ ...base, time: 99 }).rate, 1);
  assert.equal(core.planCatchUp({ ...base, seekable: [] }).rate, 1);
  assert.equal(core.planCatchUp({ ...base, force: true }).seek, 98.5);
});
test("each choice leaves exactly the selected headroom only when catch-now is requested", () => {
  assert.deepEqual(core.catchUpOptions.map(option => option.seconds), [2, 1.5, 1]);
  for (const mode of ["2", "1.5", "1"]) {
    const base = { time: 80, seekable: [[0, 100]], buffered: [[0, 100]], mode };
    assert.equal(core.planCatchUp(base).seek, undefined);
    assert.equal(core.planCatchUp(base).rate, 1.15);
    assert.equal(core.planCatchUp({ ...base, force: true }).seek, 100 - Number(mode));
    assert.equal(core.catchUpProfile(mode).minMargin, Number(mode));
    assert.equal(core.catchUpProfile(mode).maxMargin, Number(mode));
  }
});
test("catch-up mode is a single validated choice and missing settings restore stability", () => {
  for (const value of [undefined, {}, { catchUpMode: "stable" }, { catchUpMode: "lowLatency" }, { catchUpMode: "both" }, { catchUpMode: null }]) {
    assert.equal(core.features(value).catchUpMode, "2");
  }
  for (const mode of [2, 1.5, 1, "2", "1.5", "1"]) assert.equal(core.features({ catchUpMode: mode }).catchUpMode, String(mode));
  assert.equal(core.features({ catchUp: false, catchUpMode: "1" }).catchUp, false);
});
test("automatic recovery accelerates smoothly and never teleports even with a large backlog", () => {
  const base = { time: 94, seekable: [[0, 100]], buffered: [[0, 100]], mode: "2" };
  for (const time of [0, 50, 80, 94, 96, 97, 97.7, 98, 99]) assert.equal(core.planCatchUp({ ...base, time }).seek, undefined);
  for (const [time, rate] of [[94, 1.15], [97, 1.08], [97.7, 1.03], [98, 1], [99, 1]]) assert.equal(core.planCatchUp({ ...base, time }).rate, rate);
});
test("catch-now refuses unsafe buffer targets and never rewinds toward the selected margin", () => {
  const base = { time: 90, seekable: [[0, 100]], buffered: [[0, 100]], mode: "2", force: true };
  assert.equal(core.planCatchUp(base).seek, 98);
  assert.equal(core.planCatchUp({ ...base, buffered: [[0, 91], [99, 100]] }).seek, undefined);
  assert.equal(core.planCatchUp({ ...base, mode: "1", buffered: [[0, 91], [99.5, 100]] }).seek, undefined);
  assert.equal(core.planCatchUp({ ...base, time: 99 }).seek, undefined);
});
test("speed-only catch-up converges to each selected margin without a time jump", () => {
  for (const mode of ["2", "1.5", "1"]) {
    let time = 80, edge = 100, rate = 1;
    for (let i = 0; i < 600; i++) {
      const plan = core.planCatchUp({ time, seekable: [[0, edge]], buffered: [[0, edge]], mode });
      assert.equal(plan.seek, undefined);
      assert(plan.rate >= 1 && plan.rate <= 1.15);
      rate = plan.rate; time += rate; edge += 1;
    }
    assert(edge - time >= Number(mode) - .01);
    assert(edge - time <= Number(mode) + .16);
    assert.equal(rate, 1);
  }
});
test("channel matching excludes VOD, clips, malformed and third path segments", () => {
  const id = "a".repeat(32);
  assert.equal(core.channelId(`/live/${id}`), id);
  assert.equal(core.channelId(`/${id}`), id);
  for (const path of ["/video/123", "/live/123", `/live/${id}/chat`]) assert.equal(core.channelId(path), "");
  assert.equal(core.features({ adSpeed: 999 }).adSpeed, 4);
  assert.equal(core.features({ catchUp: false }).catchUp, false);
});
test("channel ordering keeps favorites first and applies custom order inside each group", () => {
  const items = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }];
  assert.deepEqual(core.orderChannels(items, ["c", "a"], ["d", "b", "c", "a"]).map(row => row.id), ["c", "a", "d", "b"]);
  assert.deepEqual(core.orderChannels(items, ["c"], ["b"]).map(row => row.id), ["c", "b", "a", "d"]);
  assert.deepEqual(items.map(row => row.id), ["a", "b", "c", "d"]);
});
test("following live precedes saved live, then following offline and saved offline", () => {
  const rows = [
    { id: "saved-off", followed: false, openLive: false }, { id: "follow-off", followed: true, openLive: false },
    { id: "saved-live", followed: false, openLive: true }, { id: "follow-live-a", followed: true, openLive: true },
    { id: "follow-live-b", followed: true, openLive: true }
  ];
  const custom = ["saved-off", "follow-off", "saved-live", "follow-live-b", "follow-live-a"];
  assert.deepEqual(core.orderChannels(rows, [], custom).map(row => row.id), ["follow-live-b", "follow-live-a", "saved-live", "follow-off", "saved-off"]);
  assert.deepEqual(core.orderChannels(rows, ["saved-off"], custom).map(row => row.id), ["saved-off", "follow-live-b", "follow-live-a", "saved-live", "follow-off"]);
});
