// Runs inside the original YouTube chat iframe so its own minimum widths can reflow.
(() => {
  if (globalThis.__chzzkYoutubeChatLayout) return;
  globalThis.__chzzkYoutubeChatLayout = true;
  let enabled = true;
  const style = document.createElement("style"); style.id = "ct-yt-chat-content-style";
  style.textContent = `
    html,body,yt-live-chat-app,yt-live-chat-renderer,yt-live-chat-replay-renderer {
      min-width:0!important;max-width:100%!important;width:100%!important;box-sizing:border-box!important;
    }
    yt-live-chat-renderer :is(#contents,#body,#chat,#item-list,#item-scroller,#items,#input-panel),
    yt-live-chat-item-list-renderer,yt-live-chat-text-message-renderer {
      min-width:0!important;max-width:100%!important;box-sizing:border-box!important;
    }
    yt-live-chat-text-message-renderer #content {min-width:0!important;overflow-wrap:anywhere!important}
    yt-live-chat-text-message-renderer #message {white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}
    yt-live-chat-renderer :is(textarea,input) {min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
    @media(max-width:300px) {
      yt-live-chat-text-message-renderer {padding-inline:4px!important}
      yt-live-chat-text-message-renderer #author-photo {display:none!important}
      yt-live-chat-text-message-renderer #author-name {white-space:normal!important;overflow-wrap:anywhere!important}
      yt-live-chat-header-renderer,yt-live-chat-message-input-renderer {min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
    }
  `;
  function sync() {
    if (enabled && !style.isConnected) document.documentElement.append(style);
    else if (!enabled) style.remove();
  }
  chrome.storage.local.get("features").then(data => { enabled = data.features?.youtubeWide !== false; sync(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.features) { enabled = changes.features.newValue?.youtubeWide !== false; sync(); }
  });
  window.addEventListener("keydown", event => {
    if (enabled && window.parent !== window && event.code === "Escape" && !event.repeat &&
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      window.parent.postMessage({ type: "ct-youtube-exit-theater" }, location.origin);
    }
  }, true);
})();
