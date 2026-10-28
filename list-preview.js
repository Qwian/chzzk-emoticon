(() => {
  if (globalThis.__chzzkListPreview) return;
  globalThis.__chzzkListPreview = true;
  let enabled = true, active = null;
  function close() {
    const previous = active; active = null;
    if (!previous) return;
    clearTimeout(previous.timer); previous.abort?.abort(); previous.hls?.destroy();
    if (previous.owned) { previous.video.pause(); previous.video.removeAttribute("src"); previous.video.load(); }
    else { previous.video.muted = previous.muted; previous.video.volume = previous.volume; if (previous.paused) previous.video.pause(); }
    previous.overlay?.remove(); previous.badge?.remove();
    previous.card.removeEventListener("pointerleave", close);
    if (previous.position !== undefined) previous.mount.style.position = previous.position;
    if (previous.soop) document.dispatchEvent(new CustomEvent("chzzk-tools:soop-preview", { detail: { action: "close" } }));
  }
  function identify(target) {
    if (location.hostname === "chzzk.naver.com" && /^\/(live|video)\//.test(location.pathname)) return null;
    const card = target.closest?.("li[data-broadcast-id],[data-nlog-area='live_list.item'],li,article");
    if (!card || card.closest("#sidebar,nav")) return null;
    const links = [...card.querySelectorAll("a[href]")];
    for (const link of links) {
      const url = new URL(link.href, location.href);
      if (url.hostname === "chzzk.naver.com" && /^\/live\/[a-f0-9]{32}$/i.test(url.pathname)) {
        const image = card.querySelector("img[src*='/thumbnail/']");
        const region = image?.parentElement.closest('[class*="thumbnail"], [class*="thumb"]') ||
          card.querySelector('a[href*="/live/"] [class*="thumbnail"]');
        if (!region || !region.contains(target)) continue;
        const metadata = card.querySelector("[data-nlog-params]") || card.closest("[data-nlog-params]") || card;
        let liveId;
        try { liveId = JSON.parse(metadata.getAttribute("data-nlog-params") || "{}").content_id; } catch { /* no metadata */ }
        liveId ||= image?.src.match(/\/live\/(\d+)\//)?.[1];
        if (!/^\d+$/.test(String(liveId || ""))) continue;
        return { card, mount: region, liveId };
      }
      const match = url.pathname.match(/^\/([a-z0-9_-]+)\/(\d+)\/?$/i);
      if (/^play\.sooplive\.(com|co\.kr)$/.test(url.hostname) && match) {
        const region = card.querySelector(".thumbs-box");
        if (!region || !region.contains(target)) continue;
        return { card, mount: region, streamer: match[1], broadcast: match[2], soop: true };
      }
    }
    return null;
  }
  function badge(state, message) { if (state.badge) state.badge.textContent = message; }
  async function open(info) {
    close();
    const native = info.card.querySelector("video:not([id*='AD'])");
    const state = { ...info, video: native || document.createElement("video"), owned: !native,
      paused: native?.paused, muted: native?.muted, volume: native?.volume, abort: new AbortController() };
    active = state;
    info.card.addEventListener("pointerleave", close);
    const label = document.createElement("span"); state.badge = label;
    label.style.cssText = "position:absolute;left:5px;bottom:5px;z-index:8;background:#10271deb;color:#ccffe0;padding:3px 7px;border-radius:4px;font:11px system-ui;pointer-events:none";
    state.mount.append(label); badge(state, "소리 켜고 미리보기 준비 중…");
    if (getComputedStyle(state.mount).position === "static") { state.position = state.mount.style.position; state.mount.style.position = "relative"; }
    state.video.muted = false; state.video.volume = 1;
    if (native) {
      try { await native.play(); badge(state, "소리 켜짐 · 우클릭 종료"); } catch { badge(state, "미리보기 재생이 허용되지 않았습니다."); }
      return;
    }
    const overlay = document.createElement("div"); state.overlay = overlay;
    overlay.id = `chzzk-tools-preview-${crypto.randomUUID()}`;
    overlay.style.cssText = "position:absolute;inset:0;background:#000;z-index:5;pointer-events:none;overflow:hidden";
    state.video.id = `${overlay.id}-video`; state.video.playsInline = true;
    state.video.style.cssText = "width:100%;height:100%;object-fit:contain";
    overlay.append(state.video); state.mount.append(overlay);
    state.video.addEventListener("playing", () => { if (active === state) badge(state, "소리 켜짐 · 우클릭 종료"); });
    state.timer = setTimeout(() => { if (active === state && !state.video.readyState) badge(state, "이 방송의 미리보기를 불러오지 못했습니다."); }, 8000);
    try {
      if (state.soop) {
        state.requestId = crypto.randomUUID();
        document.dispatchEvent(new CustomEvent("chzzk-tools:soop-preview", { detail: {
          action: "open", requestId: state.requestId, parentId: overlay.id, videoId: state.video.id,
          streamer: state.streamer, broadcast: state.broadcast
        } }));
        return;
      }
      const response = await fetch(`https://api.chzzk.naver.com/service/v1/live/${state.liveId}/auto-play-info`, { credentials: "include", signal: state.abort.signal });
      if (!response.ok) throw new Error();
      const body = await response.json(), data = body.content;
      const playback = JSON.parse(data?.livePlaybackJson || data?.previewPlaybackJson || "{}");
      const source = playback.media?.find(media => media.mediaId === "HLS") || playback.media?.find(media => media.protocol === "HLS");
      if (!source?.path || !source.path.startsWith("https://") || active !== state) throw new Error();
      if (state.video.canPlayType("application/vnd.apple.mpegurl")) state.video.src = source.path;
      else if (globalThis.Hls?.isSupported()) {
        state.hls = new globalThis.Hls({ enableWorker: false, maxBufferLength: 8, backBufferLength: 4, capLevelToPlayerSize: true });
        state.hls.loadSource(source.path); state.hls.attachMedia(state.video);
        state.hls.on(globalThis.Hls.Events.ERROR, (_event, error) => { if (error.fatal && active === state) badge(state, "미리보기 재생 오류"); });
      } else throw new Error();
      await state.video.play();
    } catch { if (active === state) badge(state, "이 방송은 목록 미리보기를 제공하지 않거나 재생이 제한돼 있습니다."); }
  }
  window.addEventListener("contextmenu", event => {
    if (!enabled || event.shiftKey || event.ctrlKey || event.metaKey || event.target.closest?.("input,textarea,[contenteditable='true']")) return;
    const info = identify(event.target); if (!info) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (active?.card === info.card) close(); else open(info);
  }, true);
  document.addEventListener("chzzk-tools:soop-preview-result", event => {
    if (active?.requestId !== event.detail?.requestId) return;
    if (!event.detail.ok) badge(active, event.detail.message || "미리보기를 재생하지 못했습니다.");
  });
  chrome.storage.local.get("features").then(data => { enabled = data.features?.listPreview !== false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    enabled = changes.features.newValue?.listPreview !== false; if (!enabled) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  window.addEventListener("pagehide", close);
  document.addEventListener("visibilitychange", () => { if (document.hidden) close(); });
  window.setInterval(() => { if (active && !active.card.isConnected) close(); }, 1000);
})();
