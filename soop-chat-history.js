// SOOP discards msg/ogq packets while its native chat panel is closed.
// Keep only a bounded native render queue; the site renders it when reopened.
(() => {
  if (window.top !== window || window.__chzzkSoopChatHistory) return;
  window.__chzzkSoopChatHistory = true;
  const flag = 'data-chzzk-soop-chat-history';
  const limit = 300;
  let binding = null;
  const enabled = () => document.documentElement.hasAttribute(flag);

  function attach(chat) {
    if (!chat || typeof chat.isChatOpen !== 'function' || typeof chat.msg !== 'function' ||
        typeof chat.closeChat !== 'function' || !Array.isArray(chat.aChatDom)) return null;
    const originals = new Map(), wrappers = new Map();
    function wrap(name, create) {
      if (typeof chat[name] !== 'function') return;
      const own = Object.getOwnPropertyDescriptor(chat, name);
      const wrapped = create(chat[name]);
      originals.set(name, own); wrappers.set(name, wrapped); chat[name] = wrapped;
    }
    for (const name of ['msg', 'ogq', 'printSystemMessage']) wrap(name, original => function (...args) {
      if (!enabled() || this.isChatOpen() || !Array.isArray(this.aChatDom)) return original.apply(this, args);
      // Override only for synchronous native message formatting. Other UI,
      // focus, ad impressions and the render timer still see a closed panel.
      const own = Object.getOwnPropertyDescriptor(this, 'isChatOpen');
      const receiving = () => true;
      this.isChatOpen = receiving;
      try { return original.apply(this, args); }
      finally {
        if (this.isChatOpen === receiving) {
          if (own) Object.defineProperty(this, 'isChatOpen', own);
          else delete this.isChatOpen;
        }
        if (this.aChatDom.length > limit) this.aChatDom.splice(0, this.aChatDom.length - limit);
      }
    });
    wrap('closeChat', original => function (...args) {
      if (!enabled() || !Array.isArray(this.aChatDom)) return original.apply(this, args);
      const pending = this.aChatDom.slice(-limit);
      const result = original.apply(this, args);
      // closeChat clears pending render entries, including messages received
      // just before closing. Channel changes/clearChat still clear normally.
      if (Array.isArray(this.aChatDom) && this.aChatDom.length === 0) this.aChatDom.push(...pending);
      return result;
    });
    return { chat, stop() {
      for (const [name, own] of originals) if (chat[name] === wrappers.get(name)) {
        if (own) Object.defineProperty(chat, name, own);
        else delete chat[name];
      }
    } };
  }

  function sync() {
    const chat = enabled() ? window.liveView?.controller?.chatContainer : null;
    if (binding?.chat === chat) return;
    binding?.stop(); binding = null;
    if (chat) binding = attach(chat);
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [flag] });
  // The native controller can be initialized late or replaced on navigation.
  setInterval(sync, 1000);
  sync();
})();
