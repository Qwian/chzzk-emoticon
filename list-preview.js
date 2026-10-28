(() => {
  if (globalThis.__chzzkListPreview) return;
  globalThis.__chzzkListPreview = true;
  let enabled = false, sidebarEnabled = false, active = null, hoverCard = null, hoverTimer = 0;
  const previewStyle = document.createElement("style");
    previewStyle.textContent = ".ct-sidebar-previewing [class*='_tooltip_']:not(.ct-preview-host){display:none!important}";
  document.documentElement.append(previewStyle);
  function cancelHover() { clearTimeout(hoverTimer); hoverTimer = 0; hoverCard = null; }
  function close() {
    const previous = active; active = null;
    if (!previous) return;
    clearTimeout(previous.timer); clearInterval(previous.adoptionTimer); previous.abort?.abort(); previous.hls?.destroy();
    if (previous.owned) { previous.video.pause(); previous.video.removeAttribute("src"); previous.video.load(); }
    else { previous.video.muted = previous.muted; previous.video.volume = previous.volume; if (previous.paused) previous.video.pause(); }
    previous.overlay?.remove(); previous.badge?.remove(); previous.playButton?.remove();
    releasePanel(previous); previous.card.classList.remove("ct-sidebar-previewing");
    previous.card.removeEventListener("pointerleave", previous.leave);
    if (previous.sidebar && hoverCard === previous.card) cancelHover();
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
  function existingPanel(info) {
    const platter = document.getElementById("cheese-follow-preview");
    const platterName = platter?.querySelector(".cheese-follow-preview-meta-name")?.textContent.trim();
    const visible = node => node?.isConnected && node.getBoundingClientRect().width > 0 &&
      getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden";
    if (visible(platter) && platterName === info.name.trim() &&
        platter.querySelector(".cheese-follow-preview-pin")?.getAttribute("aria-pressed") !== "true") {
      const mount = platter.querySelector(".cheese-follow-preview-body");
      if (mount) return { popup: platter, mount, borrowed: true };
    }
    const tooltip = info.card.querySelector("[class*='_tooltip_'],[role='tooltip']");
    if (visible(tooltip)) {
      const mount = document.createElement("div");
      mount.style.cssText = "position:relative;width:360px;max-width:calc(100vw - 32px);aspect-ratio:16/9;background:#000";
      return { popup: tooltip, mount, borrowed: true, addedMount: true };
    }
    return null;
  }
  function releasePanel(state) {
    if (!state.popup) return;
    state.popup.removeEventListener("pointerleave", state.popupLeave);
    state.popup.classList.remove("ct-preview-host");
    for (const saved of state.borrowedVideos || []) {
      saved.video.removeEventListener("play", saved.stop);
      saved.video.style.visibility = saved.visibility;
      saved.video.muted = saved.muted; saved.video.volume = saved.volume;
      // The other preview owns restarting its media when it next opens.
    }
    if (state.position !== undefined) { state.mount.style.position = state.position; delete state.position; }
    if (state.addedMount) state.mount.remove();
    if (!state.borrowed) state.popup.remove();
    state.borrowedVideos = [];
  }
  function attachPanel(state, panel) {
    Object.assign(state, { borrowed: false, addedMount: false }, panel);
    if (state.addedMount) state.popup.append(state.mount);
    state.popup.classList.add("ct-preview-host");
    if (getComputedStyle(state.mount).position === "static") { state.position = state.mount.style.position; state.mount.style.position = "relative"; }
    state.borrowedVideos = state.borrowed ? [...state.mount.querySelectorAll("video")].filter(video => video !== state.video).map(video => {
      const saved = { video, visibility: video.style.visibility, muted: video.muted, volume: video.volume };
      saved.stop = () => { video.muted = true; video.pause(); };
      video.style.visibility = "hidden"; video.addEventListener("play", saved.stop); saved.stop(); return saved;
    }) : [];
    state.popupLeave = event => { if (!state.card.contains(event.relatedTarget)) close(); };
    state.popup.addEventListener("pointerleave", state.popupLeave);
  }
  function adoptPanel(state) {
    if (active !== state || state.popup?.id === "cheese-follow-preview") return;
    const panel = existingPanel(state);
    if (!panel || panel.popup === state.popup) return;
    // A portal can appear after our metadata request. Move the same playing video;
    // never create a second player or retain the fallback window behind it.
    const elements = [state.overlay, state.badge, state.playButton].filter(Boolean);
    elements.forEach(element => element.remove()); releasePanel(state);
    delete state.title; delete state.tags; delete state.nameElement;
    attachPanel(state, panel); elements.forEach(element => state.mount.append(element));
  }
  function sidebarPanel(info) {
    const popup = document.createElement("aside"); popup.id = "chzzk-sidebar-preview";
    popup.setAttribute("aria-label", "채널 소리 미리보기");
    popup.style.cssText = "position:fixed;width:min(360px,calc(100vw - 16px));background:#181c21;color:#edf4f0;border:1px solid #73807766;border-radius:10px;box-shadow:0 10px 30px #0008;z-index:2147483646;overflow:hidden;font:12px/1.5 system-ui";
    const head = document.createElement("div"); head.style.cssText = "display:flex;align-items:center;padding:8px 10px;gap:10px";
    const name = document.createElement("strong"); name.textContent = info.name || "방송 미리보기"; name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "×"; button.setAttribute("aria-label", "미리보기 닫기");
    button.style.cssText = "border:0;border-radius:4px;color:inherit;background:#ffffff15;cursor:pointer;font:20px system-ui;width:26px;height:26px";
    button.addEventListener("click", close); head.append(name, button);
    const mount = document.createElement("div"); mount.style.cssText = "aspect-ratio:16/9;background:#000;position:relative";
    const meta = document.createElement("div"); meta.style.cssText = "padding:9px 11px";
    const title = document.createElement("div"), tags = document.createElement("div"); tags.style.cssText = "margin-top:4px;color:#a9bbb0;font-size:11px";
    title.textContent = "방송 정보를 불러오는 중…"; meta.append(title, tags); popup.append(head, mount, meta); document.documentElement.append(popup);
    const rect = info.card.getBoundingClientRect(), width = popup.getBoundingClientRect().width;
    popup.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.right + 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(innerHeight - 320, rect.top))}px`;
    return { popup, mount, title, tags, nameElement: name };
  }
  async function play(state) {
    if (active !== state) return;
    try {
      state.video.muted = false; state.video.volume = 1;
      await state.video.play();
      if (active === state) { state.playButton?.remove(); state.playButton = null; badge(state, state.sidebar ? "소리 켜짐 · 음량 100%" : "소리 켜짐 · 우클릭 종료"); }
    } catch {
      if (active !== state) return;
      badge(state, "소리 재생을 시작하려면 버튼을 눌러 주세요.");
      if (!state.playButton) {
        const button = document.createElement("button"); state.playButton = button; button.type = "button"; button.textContent = "소리 켜고 재생";
        button.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:12;pointer-events:auto;border:0;border-radius:7px;padding:10px 14px;background:#00dc91;color:#08291d;font:700 13px system-ui;cursor:pointer;white-space:nowrap";
        button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); play(state); }); state.mount.append(button);
      }
    }
  }
  async function open(info) {
    close();
    const native = !info.sidebar && info.card.querySelector("video:not([id*='AD'])");
    const state = { ...info, video: native || document.createElement("video"), owned: !native,
      paused: native?.paused, muted: native?.muted, volume: native?.volume, abort: new AbortController() };
    active = state;
    if (info.sidebar) {
      attachPanel(state, existingPanel(info) || sidebarPanel(info));
      state.adoptionTimer = setInterval(() => adoptPanel(state), 100);
    }
    state.leave = event => { if (!state.popup?.contains(event.relatedTarget)) close(); };
    info.card.addEventListener("pointerleave", state.leave);
    if (info.sidebar) info.card.classList.add("ct-sidebar-previewing");
    const label = document.createElement("span"); state.badge = label;
    label.style.cssText = "position:absolute;left:5px;bottom:5px;z-index:8;background:#10271deb;color:#ccffe0;padding:3px 7px;border-radius:4px;font:11px system-ui;pointer-events:none";
    state.mount.append(label); badge(state, "소리 켜고 미리보기 준비 중…");
    if (getComputedStyle(state.mount).position === "static") { state.position = state.mount.style.position; state.mount.style.position = "relative"; }
    state.video.muted = false; state.video.volume = 1;
    if (native) {
      await play(state);
      return;
    }
    const overlay = document.createElement("div"); state.overlay = overlay;
    overlay.id = `chzzk-tools-preview-${crypto.randomUUID()}`;
    overlay.style.cssText = "position:absolute;inset:0;background:#000;z-index:5;pointer-events:none;overflow:hidden";
    state.video.id = `${overlay.id}-video`; state.video.playsInline = true;
    state.video.style.cssText = "width:100%;height:100%;object-fit:contain";
    overlay.append(state.video); state.mount.append(overlay);
    state.video.addEventListener("playing", () => { if (active === state) badge(state, state.sidebar ? "소리 켜짐 · 음량 100%" : "소리 켜짐 · 우클릭 종료"); });
    state.timer = setTimeout(() => { if (active === state && !state.video.readyState) badge(state, "이 방송의 미리보기를 불러오지 못했습니다."); }, 8000);
    try {
      if (state.sidebar) {
        const channel = await globalThis.ChzzkChannels.get(state.channelId, { signal: state.abort.signal });
        if (active !== state) return;
        if (state.nameElement) state.nameElement.textContent = channel.name;
        if (state.title) state.title.textContent = channel.title || channel.name;
        if (state.tags) state.tags.textContent = [channel.category, Number.isFinite(channel.viewers) ? `${channel.viewers.toLocaleString("ko-KR")}명` : ""].filter(Boolean).join(" · ");
        if (!channel.openLive || !channel.liveId) { badge(state, "현재 방송 중이 아닙니다."); return; }
        state.liveId = channel.liveId;
      }
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
      if (globalThis.Hls?.isSupported()) {
        state.hls = new globalThis.Hls({ enableWorker: false, maxBufferLength: 8, backBufferLength: 4, capLevelToPlayerSize: false, autoStartLoad: false });
        state.hls.on(globalThis.Hls.Events.MANIFEST_PARSED, () => {
          if (active !== state) return;
          const levels = state.hls.levels;
          const best = levels.reduce((chosen, level, index) => {
            const current = levels[chosen];
            return !current || (level.height || 0) > (current.height || 0) ||
              ((level.height || 0) === (current.height || 0) && (level.bitrate || 0) > (current.bitrate || 0)) ? index : chosen;
          }, -1);
          // Select before starting fragment downloads; leave ABR free to recover on slow links.
          if (best >= 0) state.hls.startLevel = best;
          state.hls.startLoad(); play(state);
        });
        state.hls.on(globalThis.Hls.Events.ERROR, (_event, error) => { if (error.fatal && active === state) badge(state, "미리보기 재생 오류"); });
        state.hls.loadSource(source.path); state.hls.attachMedia(state.video);
      } else if (state.video.canPlayType("application/vnd.apple.mpegurl")) { state.video.src = source.path; await play(state); }
      else throw new Error();
    } catch { if (active === state) badge(state, "이 방송은 목록 미리보기를 제공하지 않거나 재생이 제한돼 있습니다."); }
  }
  function sidebarRow(target) {
    if (!globalThis.ChzzkChannels || !sidebarEnabled || target.closest?.(".ct-row-actions,.ct-list-tools,button")) return null;
    const section = target.closest?.("#sidebar nav[aria-label]");
    if (!section || !/^(팔로우|팔로잉|Following|보관 채널)$/i.test(section.getAttribute("aria-label"))) return null;
    const card = target.closest("li"); if (!card) return null;
    const link = [...card.querySelectorAll("a[href]")].find(a => {
      try { const url = new URL(a.href, location.href); return url.origin === location.origin && /^\/live\/[a-f0-9]{32}$/i.test(url.pathname); } catch { return false; }
    });
    if (!link) return null;
    const nameElement = card.querySelector("[data-channel-name], [class*='_name_'], .ct-saved-name");
    const nameCopy = nameElement?.cloneNode(true);
    nameCopy?.querySelectorAll(".ct-saved-label").forEach(node => node.remove());
    return { card, sidebar: true, channelId: new URL(link.href, location.href).pathname.split("/")[2],
      name: (nameElement?.getAttribute("data-channel-name") || nameCopy?.textContent || "방송 미리보기").trim().slice(0, 80) };
  }
  document.addEventListener("pointerover", event => {
    const info = sidebarRow(event.target); if (!info || info.card === hoverCard) return;
    cancelHover();
    if (active?.sidebar) close();
    hoverCard = info.card;
    hoverTimer = setTimeout(() => { hoverTimer = 0; if (hoverCard === info.card && info.card.isConnected && sidebarEnabled) open(info); }, 300);
  }, true);
  document.addEventListener("pointerout", event => {
    if (!hoverCard?.contains(event.target) || hoverCard.contains(event.relatedTarget) || active?.popup?.contains(event.relatedTarget)) return;
    cancelHover(); if (active?.sidebar) close();
  }, true);
  document.addEventListener("click", event => {
    if (event.button !== 0 || !event.target.closest?.("#sidebar a[href]")) return;
    cancelHover(); if (active?.sidebar) close();
  }, true);
  window.addEventListener("popstate", () => { cancelHover(); if (active?.sidebar) close(); });
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
  chrome.storage.local.get("features").then(data => { enabled = data.features?.listPreview !== false; sidebarEnabled = data.features?.sidebarPreview !== false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    enabled = changes.features.newValue?.listPreview !== false; sidebarEnabled = changes.features.newValue?.sidebarPreview !== false;
    if (!sidebarEnabled) cancelHover();
    if (active?.sidebar ? !sidebarEnabled : !enabled) close();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { cancelHover(); close(); } });
  document.addEventListener("dragstart", () => { if (active?.sidebar) { cancelHover(); close(); } }, true);
  window.addEventListener("pagehide", () => { cancelHover(); close(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelHover(); close(); } });
  window.setInterval(() => { if (active && !active.card.isConnected) close(); if (hoverCard && !hoverCard.isConnected) cancelHover(); }, 1000);
})();
