// Based on the user's YT Fake Fullscreen 4.0; the original live-chat iframe stays in place.
(() => {
  if (!globalThis.ChzzkLayout || globalThis.__chzzkYoutubeLayout) return;
  globalThis.__chzzkYoutubeLayout = true;
  const legacy = () => [...document.querySelectorAll("style")].some(style => style.textContent.includes("body.fakefs-on") && style.textContent.includes("#masthead-container"));
  ChzzkLayout.install({ feature: "youtubeWide", key: "youtubeWideLayout", legacy, create });
  function create(initial, persist) {
    const root = document.documentElement, body = document.body, life = new AbortController(), signal = life.signal;
    let preferredWidth = Number(initial?.chatWidth) || 360, frame = 0, peekTimer = 0, disposed = false, nativeClick = false;
    let watch = null, chat = null, player = null;
    const tags = new Set(), pressed = new Set();
    const style = document.createElement("style"); style.id = "ct-yt-style";
    style.textContent = `
      body.ct-yt-wide #masthead-container{position:fixed!important;top:0!important;left:0!important;right:0!important;transform:translateY(-100%)!important;transition:transform .18s ease!important;z-index:100000!important}
      body.ct-yt-wide.ct-yt-peek #masthead-container{transform:translateY(0)!important}
      body.ct-yt-wide ytd-page-manager#page-manager{margin-top:0!important}
      body.ct-yt-wide ytd-watch-flexy[theater] :is(#player-full-bleed-container,#player-container-outer,#player-container-inner,#full-bleed-container){height:100vh!important;height:100dvh!important;min-height:100dvh!important;max-height:100dvh!important}
      body.ct-yt-wide{overflow-x:hidden!important;scrollbar-width:none!important}
      body.ct-yt-wide::-webkit-scrollbar,html:has(body.ct-yt-wide)::-webkit-scrollbar{display:none!important;width:0!important}
      html:has(body.ct-yt-wide){scrollbar-width:none!important}
      html:has(body.ct-yt-chat){overflow:hidden!important}
      body.ct-yt-chat [data-ct-yt-path]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;content-visibility:visible!important}
      body.ct-yt-chat [data-ct-yt-player]{position:fixed!important;inset:0 auto 0 0!important;width:calc(100vw - var(--ct-yt-chat-width) - 8px)!important;height:100dvh!important;min-width:0!important;max-width:none!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;z-index:99990!important;background:#000!important}
      body.ct-yt-chat [data-ct-yt-player] :is(#player-container-outer,#player-container-inner,#full-bleed-container){width:100%!important;max-width:none!important;min-width:0!important;height:100%!important;min-height:0!important;max-height:none!important}
      body.ct-yt-chat [data-ct-yt-chat]{display:flex!important;flex-direction:column!important;position:fixed!important;inset:0 0 0 auto!important;width:var(--ct-yt-chat-width)!important;min-width:0!important;max-width:none!important;height:100dvh!important;max-height:none!important;margin:0!important;padding:0!important;z-index:99991!important;box-sizing:border-box!important;background:var(--yt-spec-base-background,#0f0f0f)!important}
      body.ct-yt-chat [data-ct-yt-chat] #chatframe{flex:1 1 0!important;min-height:0!important;min-width:0!important;width:100%!important;height:100%!important;max-width:none!important;border:0!important}
      body.ct-yt-chat [data-ct-yt-chat] #show-hide-button{flex:0 0 auto!important}
      #ct-yt-divider{display:none;position:fixed;top:0;bottom:0;right:var(--ct-yt-chat-width);width:8px;background:#242a34;z-index:99992;cursor:col-resize;touch-action:none}
      body.ct-yt-chat #ct-yt-divider{display:block}
      #ct-yt-divider:hover,#ct-yt-divider:focus-visible{background:#37b594}
      #ct-yt-divider::after{content:'';position:absolute;top:calc(50% - 24px);left:3px;width:2px;height:48px;background:#aab1c2;border-radius:2px}
    `;
    document.head.append(style);
    const active = () => body.classList.contains("ct-yt-wide");
    const width = () => parseFloat(root.style.getPropertyValue("--ct-yt-chat-width")) || preferredWidth;
    function applyWidth(value, store = false) {
      const actual = Math.round(Math.max(1, Math.min(Math.max(1, innerWidth - 9), value)));
      root.style.setProperty("--ct-yt-chat-width", actual + "px");
      divider.setAttribute("aria-valuemin", "1"); divider.setAttribute("aria-valuemax", String(Math.max(1, innerWidth - 9))); divider.setAttribute("aria-valuenow", String(actual));
      if (store) { preferredWidth = actual; persist({ chatWidth: preferredWidth }); }
    }
    const divider = ChzzkLayout.divider({ id: "ct-yt-divider", width, apply: applyWidth, active: () => body.classList.contains("ct-yt-chat"), signal });
    body.append(divider);
    function clearTags() { for (const element of tags) for (const attr of ["data-ct-yt-path", "data-ct-yt-player", "data-ct-yt-chat"]) element.removeAttribute(attr); tags.clear(); }
    function mark(element, name) { if (element) { element.setAttribute("data-ct-yt-" + name, ""); tags.add(element); } }
    function sync() {
      frame = 0; if (disposed) return;
      const nextWatch = location.pathname === "/watch" ? document.querySelector("ytd-watch-flexy") : null;
      const nextChat = nextWatch?.querySelector("ytd-live-chat-frame#chat, ytd-live-chat-frame");
      const nextPlayer = nextWatch?.querySelector("#player-full-bleed-container");
      if (watch !== nextWatch || chat !== nextChat || player !== nextPlayer) { clearTags(); watch = nextWatch; chat = nextChat; player = nextPlayer; }
      const on = Boolean(watch?.hasAttribute("theater") && !document.fullscreenElement);
      const dock = Boolean(on && player?.isConnected && chat?.isConnected && !chat.hasAttribute("collapsed") && !chat.hidden);
      body.classList.toggle("ct-yt-wide", on); body.classList.toggle("ct-yt-chat", dock);
      if (dock) {
        mark(player, "player"); mark(chat, "chat");
        for (const start of [player.parentElement, chat.parentElement]) for (let element = start; element && element !== root; element = element.parentElement) mark(element, "path");
      } else clearTags();
      if (!on) { clearTimeout(peekTimer); body.classList.remove("ct-yt-peek"); }
      divider.tabIndex = dock ? 0 : -1; divider.setAttribute("aria-hidden", String(!dock)); applyWidth(preferredWidth);
    }
    function schedule() { if (!disposed && !frame) frame = requestAnimationFrame(sync); }
    function armHide() { clearTimeout(peekTimer); peekTimer = setTimeout(() => body.classList.remove("ct-yt-peek"), 2000); }
    const masthead = target => target?.closest?.("#masthead-container");
    window.addEventListener("wheel", event => { if (active() && event.deltaY < 0) { body.classList.add("ct-yt-peek"); armHide(); } }, { passive: true, signal });
    document.addEventListener("pointerover", event => { if (active() && masthead(event.target)) { clearTimeout(peekTimer); body.classList.add("ct-yt-peek"); } }, { capture: true, signal });
    document.addEventListener("pointerout", event => { if (active() && masthead(event.target) && !masthead(event.relatedTarget)) armHide(); }, { capture: true, signal });
    for (const name of ["yt-navigate-finish", "yt-page-data-updated"]) window.addEventListener(name, schedule, { signal });
    window.addEventListener("popstate", schedule, { signal }); window.addEventListener("resize", () => applyWidth(preferredWidth), { signal });
    document.addEventListener("fullscreenchange", schedule, { signal });
    const relevant = "ytd-watch-flexy,ytd-live-chat-frame,#player-full-bleed-container";
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant))))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["theater", "collapsed", "hidden"] });
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    sync();
    return { sync: schedule,
      keydown(event) {
        if (location.pathname !== "/watch" || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || ChzzkLayout.typing(event) || !["KeyF", "KeyT"].includes(event.code)) return;
        const button = document.querySelector(event.code === "KeyF" ? ".ytp-size-button" : ".ytp-fullscreen-button");
        if (!button) return;
        consume(event); pressed.add(event.code); if (event.repeat) return;
        nativeClick = event.code === "KeyT";
        try { button.click(); } finally { nativeClick = false; }
      },
      keyup(event) { if (pressed.delete(event.code)) consume(event); },
      click(event) {
        if (nativeClick || location.pathname !== "/watch" || document.fullscreenElement || !event.target.closest?.(".ytp-fullscreen-button")) return;
        const size = document.querySelector(".ytp-size-button"); if (!size) return;
        consume(event); size.click();
      },
      stop() { disposed = true; cancelAnimationFrame(frame); clearTimeout(peekTimer); pressed.clear(); life.abort(); observer.disconnect(); clearTags(); body.classList.remove("ct-yt-wide", "ct-yt-peek", "ct-yt-chat"); root.style.removeProperty("--ct-yt-chat-width"); divider.remove(); style.remove(); }
    };
  }
})();
