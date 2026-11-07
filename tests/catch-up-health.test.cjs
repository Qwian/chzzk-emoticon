const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

// Run the real controller independently for each stream, with a media clock and
// decoder counters we can drive without network or machine-speed assumptions.
async function stream() {
  let now = 100000, current = 80, edge = 100, rate = 1, poll, source = '';
  let total = 100, dropped = 0, paused = false, writes = 0, seeks = 0, ownershipWrites = 0, hasQuality = true;
  const events = new Map(), docEvents = new Map();
  const listen = map => (name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const emit = name => { for (const fn of events.get(name) || []) fn({ type: name }); };
  const video = {
    dataset: new Proxy({}, { set(obj, key, value) { ownershipWrites++; obj[key] = value; return true; } }),
    isConnected: true, readyState: 4, seeking: false, muted: false, volume: 1,
    get paused() { return paused; }, get currentSrc() { return source; },
    get currentTime() { return current; }, set currentTime(value) { seeks++; current = value; },
    get playbackRate() { return rate; }, set playbackRate(value) { writes++; rate = value; },
    get seekable() { return { length: 1, start: () => 0, end: () => edge }; },
    get buffered() { return this.seekable; },
    getVideoPlaybackQuality: () => hasQuality ? { totalVideoFrames: total, droppedVideoFrames: dropped } : undefined,
    getBoundingClientRect: () => ({ width: 640, height: 360 }),
    addEventListener: listen(events), removeEventListener: (name, fn) => events.get(name)?.delete(fn),
    dispatchEvent: event => { emit(event.type); },
  };
  const context = vm.createContext({
    performance: { now: () => now }, location: { href: 'https://chzzk.naver.com/live/' + 'a'.repeat(32), pathname: '/live/' + 'a'.repeat(32) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { documentElement: { append() {} }, createElement: () => ({}), addEventListener: listen(docEvents),
      dispatchEvent: event => { for (const fn of docEvents.get(event.type) || []) fn(event); },
      querySelectorAll: selector => selector === 'video.webplayer-internal-video' ? [video] : [] },
    window: { addEventListener() {}, setInterval: fn => { poll = fn; } },
    chrome: { storage: { local: { get: async () => ({ features: { catchUp: true, adSpeed: 1 } }) }, onChanged: { addListener() {} } } },
    ChzzkAdDom: { wrappers: () => [], videos: () => [], audioVideos: () => [] },
  });
  for (const file of ['tools-core.js', 'player-tools.js']) vm.runInContext(readFileSync(join(__dirname, '..', file), 'utf8'), context);
  await Promise.resolve();
  return {
    get rate() { return rate; }, get writes() { return writes; }, get seeks() { return seeks; }, get ownershipWrites() { return ownershipWrites; },
    advance(ms, { frames = 60, lost = 0, progress = true } = {}) {
      now += ms; edge += ms / 1000; if (progress && !paused) current += ms / 1000 * rate;
      total += frames; dropped += lost; poll();
    },
    emit, conflict() { rate = 1; now += 200; emit('ratechange'); },
    pause(value) { paused = value; },
    quality(value) { hasQuality = value; },
    resetCounters() { total = 0; dropped = 0; },
    catchNow() { context.document.dispatchEvent(new context.CustomEvent('chzzk-tools:catch-up')); },
    source(value) { source = value; total = 0; dropped = 0; emit('loadedmetadata'); },
  };
}

test('two streams stop accelerating independently when their decoders drop frames', async () => {
  const streams = await Promise.all([stream(), stream()]);
  for (const player of streams) {
    assert.equal(player.rate, 1.15);
    player.advance(1000, { lost: 15 });
    assert.equal(player.rate, 1, 'decoder overload must release the extra decoding load');
    for (let i = 0; i < 20; i++) { player.emit('canplay'); player.advance(1000); }
    assert.equal(player.rate, 1, 'canplay and the polling timer must respect the safety hold');
    assert.equal(player.seeks, 0);
    player.advance(11000);
    assert(player.rate > 1, 'a healthy stream can retry after recovery');
  }
});

test('healthy second stream keeps catching up when only the first stream is overloaded', async () => {
  const [busy, healthy] = await Promise.all([stream(), stream()]);
  busy.advance(1000, { lost: 15 }); healthy.advance(1000);
  assert.equal(busy.rate, 1); assert.equal(healthy.rate, 1.15);
});

test('repeated native rate resets cannot cause an unlimited rate fight', async () => {
  const player = await stream();
  for (let i = 0; i < 30; i++) player.conflict();
  assert.equal(player.rate, 1);
  assert(player.writes <= 4, `unexpected repeated playbackRate writes: ${player.writes}`);
  assert.equal(player.seeks, 0);
});

test('repeated buffering keeps normal speed even after canplay', async () => {
  const player = await stream();
  player.emit('waiting'); player.emit('canplay');
  player.advance(1000); player.emit('waiting'); player.emit('canplay');
  player.advance(3000);
  assert.equal(player.rate, 1);
  player.advance(30000);
  assert(player.rate > 1);
});

test('stalled playback with decoded frames stops acceleration; paused time is excluded', async () => {
  const player = await stream();
  player.advance(1000, { frames: 0, progress: false });
  player.advance(1000, { frames: 0, progress: false });
  assert.equal(player.rate, 1);
  const paused = await stream();
  paused.pause(true); paused.advance(10000, { frames: 0, progress: false });
  paused.pause(false); paused.advance(1000);
  assert.equal(paused.rate, 1.15);
});

test('healthy polling does not keep rewriting the catch-up ownership attribute', async () => {
  const player = await stream();
  const initial = player.ownershipWrites;
  for (let i = 0; i < 10; i++) player.advance(1000);
  assert.equal(player.ownershipWrites, initial);
  assert(player.rate > 1);
});

test('catch-now can seek during a safety hold without restarting acceleration', async () => {
  const player = await stream();
  player.advance(1000, { lost: 15 }); player.catchNow();
  assert.equal(player.seeks, 1); assert.equal(player.rate, 1);
});

test('repeated overload backs off longer instead of retrying every few seconds', async () => {
  const player = await stream();
  player.advance(1000, { lost: 15 });
  player.advance(31000); // First retry (and a fresh sample).
  player.advance(1000, { lost: 15 });
  player.advance(31000);
  assert.equal(player.rate, 1, 'second overload must wait 60 seconds');
  player.advance(30000);
  assert(player.rate > 1);
});

test('counter resets, background timer gaps and missing quality API do not imply overload', async () => {
  const player = await stream();
  player.resetCounters(); player.advance(1000, { frames: 0 });
  assert.equal(player.rate, 1.15);
  player.advance(10000, { lost: 15, progress: false });
  assert.equal(player.rate, 1.15);
  player.quality(false); player.advance(2000);
  assert.equal(player.rate, 1.15);
  player.source('new-source'); player.advance(1000);
  assert.equal(player.rate, 1.15);
});
