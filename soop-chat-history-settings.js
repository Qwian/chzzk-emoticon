// The receive queue is independent of chat overlay/layout preferences.
(() => {
  if (window.top !== window || globalThis.__chzzkSoopChatHistorySettings) return;
  globalThis.__chzzkSoopChatHistorySettings = true;
  const flag = 'data-chzzk-soop-chat-history';
  let stopped = false, changed = false;
  const apply = features => {
    if (!stopped) document.documentElement.toggleAttribute(flag, features?.soopChatHistory !== false);
  };
  function stop() {
    stopped = true;
    document.documentElement.removeAttribute(flag);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* context gone */ }
  }
  function onStorage(changes, area) {
    if (area !== 'local' || !changes.features) return;
    changed = true; apply(changes.features.newValue);
  }
  try {
    chrome.storage.onChanged.addListener(onStorage);
    chrome.storage.local.get('features').then(data => {
      if (!changed) apply(data.features);
    }).catch(stop);
  } catch { stop(); }
})();
