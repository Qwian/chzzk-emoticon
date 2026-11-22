const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../soop-chat-history-settings.js'), 'utf8');
function setup() {
  let resolve, listener, removed = false, flag = false;
  const window = {}; window.top = window;
  const context = vm.createContext({ window,
    document: { documentElement: { toggleAttribute(_, value) { flag = value; }, removeAttribute() { flag = false; } } },
    chrome: { storage: { local: { get: () => new Promise(done => { resolve = done; }) }, onChanged: {
      addListener(fn) { listener = fn; }, removeListener() { removed = true; }
    } } }
  });
  vm.runInContext(source, context);
  return { resolve: value => resolve(value), change: value => listener({ features: { newValue: value } }, 'local'),
    flag: () => flag, removed: () => removed };
}
test('history is on by default independently of overlay and layout settings', async () => {
  const state = setup(); state.resolve({ features: { freeChat: false }, soopFreeChatLayout: { enabled: false } });
  await new Promise(setImmediate); assert.equal(state.flag(), true);
  state.change({ freeChat: false, soopChatHistory: false }); assert.equal(state.flag(), false);
  state.change({ freeChat: false, soopChatHistory: true }); assert.equal(state.flag(), true);
});
test('an explicit off setting survives startup and stale async reads cannot overwrite a change', async () => {
  const off = setup(); off.resolve({ features: { soopChatHistory: false } });
  await new Promise(setImmediate); assert.equal(off.flag(), false);
  const stale = setup(); stale.change({ soopChatHistory: false }); stale.resolve({ features: { soopChatHistory: true } });
  await new Promise(setImmediate); assert.equal(stale.flag(), false);
});
