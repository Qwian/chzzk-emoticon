const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../soop-chat-history.js'), 'utf8');

// Native LiveView's observed gates: msg/ogq require isChatOpen, its timer
// renders only when open, and closeChat empties aChatDom. No chat is sent.
function setup(initiallyReady = true) {
  let observer, tick, on = true;
  const chat = {
    open: true, aChatDom: [], rendered: [], focused: false, blocked: false,
    isChatOpen() { return this.open; },
    msg(packet) { if (this.isChatOpen() && !this.blocked) this.aChatDom.push(packet); },
    ogq(packet) { if (this.isChatOpen() && !this.blocked) this.aChatDom.push(packet); },
    printSystemMessage(packet) { if (this.isChatOpen() && packet) this.aChatDom.push(packet); },
    closeChat() { this.open = false; this.aChatDom.length = 0; return 'closed'; },
    clearChat() { this.aChatDom = []; this.rendered = []; },
    render() { if (this.isChatOpen()) this.rendered.push(...this.aChatDom.splice(0, 300)); },
    focusChatWriteArea() { if (this.isChatOpen()) this.focused = true; }
  };
  const native = Object.fromEntries(['msg', 'ogq', 'isChatOpen', 'closeChat'].map(name => [name, chat[name]]));
  const window = { liveView: initiallyReady ? { controller: { chatContainer: chat } } : null };
  window.top = window;
  const document = { documentElement: { hasAttribute: () => on } };
  const context = vm.createContext({ window, document,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
    setInterval(fn) { tick = fn; } });
  vm.runInContext(source, context);
  return { chat, native, window, context, sync: () => tick(), enable(value) { on = value; observer(); } };
}

test('native closed chat loses packets before the fix; patched queue renders once on reopen', () => {
  const { chat, native } = setup();
  native.closeChat.call(chat); native.msg.call(chat, 'lost');
  assert.deepEqual(chat.aChatDom, []);
  chat.msg('hidden text'); chat.ogq('hidden emote'); chat.printSystemMessage('hidden notice');
  assert.deepEqual(chat.aChatDom, ['hidden text', 'hidden emote', 'hidden notice']);
  chat.render(); chat.focusChatWriteArea();
  assert.deepEqual(chat.rendered, []); assert.equal(chat.focused, false); assert.equal(chat.isChatOpen(), false);
  chat.open = true; chat.render(); chat.render();
  assert.deepEqual(chat.rendered, ['hidden text', 'hidden emote', 'hidden notice']);
  chat.msg('just before close'); assert.equal(chat.closeChat(), 'closed');
  chat.msg('after close'); chat.closeChat(); chat.open = true; chat.render();
  assert.deepEqual(chat.rendered.slice(-2), ['just before close', 'after close']);
});

test('hidden queue is bounded and retains native filters, clear and channel reset', () => {
  const { chat } = setup(); chat.closeChat();
  for (let i = 0; i < 2000; i++) chat.msg(i);
  assert.equal(chat.aChatDom.length, 300); assert.equal(chat.aChatDom[0], 1700);
  chat.blocked = true; chat.msg('blocked'); chat.ogq('blocked emote');
  assert.equal(chat.aChatDom.length, 300); assert.equal(chat.aChatDom.at(-1), 1999);
  chat.clearChat(); chat.blocked = false; chat.msg('new channel'); chat.open = true; chat.render();
  assert.deepEqual(chat.rendered, ['new channel']);
});

test('feature off restores methods; delayed startup, replacement and duplicate script are safe', () => {
  const state = setup(false), { chat, native, window, context } = state;
  assert.equal(chat.msg, native.msg);
  window.liveView = { controller: { chatContainer: chat } }; state.sync();
  const wrapped = chat.msg; vm.runInContext(source, context); assert.equal(chat.msg, wrapped);
  state.enable(false); assert.equal(chat.msg, native.msg); assert.equal(chat.closeChat, native.closeChat);
  chat.closeChat(); chat.msg('off'); assert.deepEqual(chat.aChatDom, []);
  state.enable(true); chat.msg('on'); assert.deepEqual(chat.aChatDom, ['on']);
  const replacement = { ...chat, aChatDom: [], ...native };
  window.liveView.controller.chatContainer = replacement; state.sync();
  assert.equal(chat.msg, native.msg); replacement.msg('replacement');
  assert.deepEqual(replacement.aChatDom, ['replacement']);
});

test('receive exceptions restore native open state and another wrapper is preserved on disable', () => {
  const state = setup(false), { chat, window, native } = state;
  chat.msg = function () { assert.equal(this.isChatOpen(), true); throw Error('native formatter'); };
  window.liveView = { controller: { chatContainer: chat } }; state.sync(); chat.closeChat();
  assert.throws(() => chat.msg('x'), /native formatter/);
  assert.equal(chat.isChatOpen, native.isChatOpen); assert.equal(chat.isChatOpen(), false);
  const other = () => {}; chat.ogq = other; state.enable(false); assert.equal(chat.ogq, other);
});
