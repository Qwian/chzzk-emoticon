const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = readFileSync(path.join(__dirname, '../media-background.js'), 'utf8');
function setup() {
  let listener, update, remove, now = 10000;
  const calls = [], responses = new Map();
  const chrome = {
    runtime: { id: 'test', getURL: name => `chrome-extension://test/${name}`, onMessage: { addListener: fn => listener = fn } },
    action: Object.fromEntries(['setBadgeText','setBadgeTextColor','setBadgeBackgroundColor','setTitle'].map(key => [key, async () => {}])),
    tabs: { onRemoved: { addListener: fn => remove = fn }, onUpdated: { addListener: fn => update = fn },
      sendMessage: async (tabId, message, options) => { calls.push({ tabId, message, options });
        if (message.type === 'MEDIA_ZOOM_APPLY') return responses.get(options.frameId) ?? { ok: true, scale: 2 };
        return { ok: true };
      } }
  };
  vm.runInNewContext(source, { chrome, Date: { now: () => now }, setTimeout: fn => setImmediate(fn) });
  const sender = (tabId = 1, frameId = 0) => ({ id: 'test', tab: { id: tabId }, frameId });
  const request = (message, from = sender()) => new Promise(resolve => {
    if (listener(message, from, resolve) !== true) resolve(undefined);
  });
  return { calls, responses, sender, request, update, remove, advance: ms => now += ms,
    report: (score, tab = 1, frame = 0) => request({ type: 'MEDIA_ZOOM_FRAME', score }, sender(tab, frame)) };
}
test('zoom commands from a parent page and the popup reach the largest video iframe', async () => {
  const b = setup(); await b.report(100); await b.report(90000, 1, 17); await b.report(999999, 2, 44);
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'open' });
  assert.equal(b.calls.at(-1).options.frameId, 17); assert.equal(b.calls.at(-1).tabId, 1);
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'pan', tabId: 2, x: .2 }, { id: 'test', url: 'chrome-extension://test/popup.html' });
  assert.equal(b.calls.at(-1).options.frameId, 44); assert.equal(b.calls.at(-1).message.x, .2);
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'state', tabId: 2 }, { ...b.sender(99), url: 'chrome-extension://test/popup.html' });
  assert.equal(b.calls.at(-1).tabId, 2);
});
test('content scripts cannot name another tab and foreign senders cannot control video', async () => {
  const b = setup(); await b.report(100, 1); await b.report(100, 2);
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'reset', tabId: 2 });
  assert.equal(b.calls.at(-1).tabId, 1);
  const count = b.calls.length;
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'reset', tabId: 2 }, { id: 'foreign', url: 'chrome-extension://test/popup.html' });
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'reset', tabId: 2 }, { id: 'test', url: 'https://example.com/' });
  assert.equal(b.calls.length, count);
});
test('removed and expired iframes cannot retain zoom ownership', async () => {
  const b = setup(); await b.report(100000, 1, 17); b.advance(11000); await b.report(100);
  await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'increase' }); assert.equal(b.calls.at(-1).options.frameId, 0);
  b.responses.set(0, { ok: false }); await b.report(50000, 1, 17); b.responses.set(17, { ok: false });
  assert.equal((await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'reset' })).ok, false);
  b.update(1, { status: 'loading' }); b.calls.length = 0;
  assert.equal((await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'state' })).ok, false);
  assert.equal(b.calls.filter(call => call.message.type === 'MEDIA_ZOOM_APPLY').length, 0);
});
test('failed main frame falls back within the same tab and commands preserve pan/reset arguments', async () => {
  const b = setup(); await b.report(100); await b.report(100000, 1, 17); b.responses.set(17, { ok: false });
  assert.equal((await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'pan', x: -.2, y: .2 })).ok, true);
  assert.equal(b.calls.at(-1).options.frameId, 0); assert.equal(b.calls.at(-1).message.y, .2);
  const count = b.calls.length; await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'unknown' }); assert.equal(b.calls.length, count);
  b.remove(1); assert.equal((await b.request({ type: 'MEDIA_ZOOM_COMMAND', action: 'state' })).ok, false);
});
