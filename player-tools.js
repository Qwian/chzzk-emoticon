(() => {
  if (globalThis.__chzzkPlayerTools) return;
  globalThis.__chzzkPlayerTools = true;
  const core = globalThis.ChzzkTools;
  let settings = core.features();
  let activeMain = null, lastUrl = "", lastNormal = null, adActive = false;
  let margin = 1.5, lastSeek = -Infinity, cooldown = 0, stableSince = performance.now();
  let heldUntil = 0, ownedRate = null;
  let ownSeekTarget = null;
  const patches = new Map();
  const adRates = new Map();
  const localAdMute = new WeakMap();
  let beforeAdAudio = null, userChangedAdAudio = false;
  let status = "플레이어 대기";

  function markAdMute(video, value) {
    if (video.matches?.("#midAdVideoContainer video, #preAdVideoContainer video")) {
      localAdMute.set(video, { value, until: performance.now() + 1500 });
    }
  }
  // The ad SDK mirrors volumechange to the site's shared mute setting. Keep our ad-only change local.
  window.addEventListener("volumechange", event => {
    const owned = localAdMute.get(event.target);
    if (owned && owned.until > performance.now() && event.target.muted === owned.value) event.stopImmediatePropagation();
  }, true);
  document.addEventListener("pointerdown", event => {
    if (adActive && event.isTrusted && event.target.closest?.(".pzp-pc__volume-control,button[aria-label*='음소거']")) userChangedAdAudio = true;
  }, true);
  document.addEventListener("keydown", event => {
    if (!adActive || !event.isTrusted || event.target.closest?.("input,textarea,[contenteditable='true']")) return;
    if (event.code === "KeyM" && !event.ctrlKey && !event.altKey && !event.metaKey ||
        event.target.closest?.(".pzp-pc__volume-control")) userChangedAdAudio = true;
  }, true);

  function ranges(value) {
    return Array.from({ length: value.length }, (_, i) => [value.start(i), value.end(i)]);
  }
  function patch(element, key, value) {
    let entries = patches.get(element);
    if (!entries) patches.set(element, entries = new Map());
    if (!entries.has(key)) entries.set(key, { original: element[key], written: value });
    const entry = entries.get(key);
    // Respect a user's volume/mute changes made while the ad is playing.
    if (entry.written !== element[key]) entry.original = element[key];
    if (key === "muted") markAdMute(element, value);
    if (element[key] !== value) element[key] = value;
    entry.written = value;
  }
  function restorePatches() {
    for (const video of adRates.keys()) releaseAdRate(video);
    for (const [el, entries] of patches) for (const [key, entry] of entries) {
      if (el[key] === entry.written) {
        if (key === "muted") markAdMute(el, entry.original);
        el[key] = entry.original;
      }
    }
    patches.clear();
    document.querySelectorAll(".chzzk-tools-ad-mini, .chzzk-tools-main-full").forEach(el =>
      el.classList.remove("chzzk-tools-ad-mini", "chzzk-tools-main-full"));
  }
  function restoreRate() {
    if (activeMain && ownedRate !== null && activeMain.playbackRate === ownedRate) activeMain.playbackRate = 1;
    ownedRate = null;
  }
  function setRate(rate) {
    if (activeMain.playbackRate !== rate) activeMain.playbackRate = rate;
    ownedRate = rate;
  }
  function suspend(reason, milliseconds = 15000) {
    restoreRate();
    cooldown = performance.now() + milliseconds;
    stableSince = performance.now();
    status = reason;
  }
  function waiting() {
    if (adActive || !settings.catchUp || activeMain?.paused || activeMain?.seeking) return;
    margin = Math.min(6, margin + 0.75);
    suspend("버퍼 회복 중 · 여유 " + margin.toFixed(1) + "초");
  }
  function externalRate() {
    if (ownedRate !== null && activeMain?.playbackRate !== ownedRate) {
      ownedRate = null;
      heldUntil = performance.now() + 30000;
      status = "외부 배속 변경 · 30초 대기";
    }
  }
  function seeking() {
    if (ownSeekTarget !== null && Math.abs(activeMain.currentTime - ownSeekTarget) < 0.5) return;
    ownSeekTarget = null;
    restoreRate(); heldUntil = performance.now() + 30000;
    status = "위치 이동 감지 · 자동 따라잡기만 30초 대기";
  }
  function seeked() { ownSeekTarget = null; }
  function sourceChanged() {
    ownSeekTarget = null;
    suspend("영상 전환 · 재생 안정화 중", 5000);
  }
  function bind(main) {
    if (activeMain === main) return;
    restoreRate();
    if (activeMain) {
      activeMain.removeEventListener("waiting", waiting);
      activeMain.removeEventListener("ratechange", externalRate);
      activeMain.removeEventListener("seeking", seeking);
      activeMain.removeEventListener("seeked", seeked);
      activeMain.removeEventListener("loadedmetadata", sourceChanged);
    }
    activeMain = main; margin = 1.5; lastNormal = null;
    beforeAdAudio = null;
    cooldown = performance.now() + 5000;
    stableSince = performance.now();
    ownSeekTarget = null;
    if (main) {
      main.addEventListener("waiting", waiting);
      main.addEventListener("ratechange", externalRate);
      main.addEventListener("seeking", seeking);
      main.addEventListener("seeked", seeked);
      main.addEventListener("loadedmetadata", sourceChanged);
    }
  }
  const style = document.createElement("style");
  style.textContent = `
    .chzzk-tools-ad-mini {position:absolute!important;inset:12px 12px auto auto!important;
      width:26%!important;height:auto!important;aspect-ratio:16/9!important;z-index:50!important;
      overflow:hidden!important;box-shadow:0 0 0 1px #9998!important;}
    .chzzk-tools-main-full {position:absolute!important;inset:0!important;width:100%!important;height:100%!important;}
  `;
  document.documentElement.append(style);

  function announce(text) {
    const detail = { text };
    document.dispatchEvent(new CustomEvent("chzzk-tools:player-status", { detail }));
  }
  function releaseAdRate(video) {
    adRates.get(video)?.abort.abort(); adRates.delete(video);
    delete video.dataset.chzzkToolsAdSpeedState;
  }
  function writeAdRate(video, state, rate) {
    try {
      patch(video, "playbackRate", rate); state.lastWritten = rate;
      if (Math.abs(video.playbackRate - rate) > 0.001) { state.released = true; state.reason = "플레이어 배속 유지"; }
    } catch {
      state.safe = true; state.reason = "배속 적용 실패 · 1배속";
      try { patch(video, "playbackRate", 1); state.lastWritten = 1; }
      catch { state.released = true; state.reason = "플레이어 배속 유지"; }
    }
    video.dataset.chzzkToolsAdSpeedState = state.reason;
  }
  function adRate(video) {
    const now = performance.now(), time = video.currentTime;
    let state = adRates.get(video);
    if (state && (state.source !== video.currentSrc || state.reset)) { releaseAdRate(video); state = null; }
    if (!state) {
      state = { source: video.currentSrc, time, progressAt: now, waitingAt: null, safe: false,
        conflicts: 0, lastWritten: null, released: false, reason: "", abort: new AbortController() };
      adRates.set(video, state);
      video.addEventListener("waiting", () => {
        if (state.released || video.paused || video.seeking || video.ended) return;
        state.waitingAt ??= performance.now(); state.reason = "버퍼 대기 · 1배속";
        writeAdRate(video, state, 1);
      }, { signal: state.abort.signal });
      for (const name of ["loadedmetadata", "emptied"]) video.addEventListener(name, () => { state.reset = true; }, { signal: state.abort.signal });
    }
    if (state.lastWritten !== null && Math.abs(video.playbackRate - state.lastWritten) > 0.001) {
      state.conflicts++;
      if (state.conflicts >= 2) { state.released = true; state.reason = "플레이어의 배속 변경 반복 · 강제 배속 중단"; }
    }
    if (video.paused || video.seeking) { state.progressAt = now; state.waitingAt = null; }
    else {
      if (Number.isFinite(time) && time > state.time + 0.01) { state.progressAt = now; state.waitingAt = null; }
      if (!state.safe && (now - state.progressAt >= 2000 || state.waitingAt !== null && now - state.waitingAt >= 1000)) {
        state.safe = true; state.reason = "재생 멈춤 감지 · 이 광고는 1배속";
      }
    }
    state.time = time;
    if (state.released) { video.dataset.chzzkToolsAdSpeedState = state.reason; return state.reason; }
    let rate = settings.adSpeed;
    if (state.safe || video.readyState < 3 || state.waitingAt !== null) {
      rate = 1;
      if (!state.safe) state.reason = "버퍼 대기 · 1배속";
    } else {
      state.reason = "";
      const buffer = ranges(video.buffered).find(([start, end]) => start <= time + 0.05 && end >= time);
      const complete = buffer && Number.isFinite(video.duration) && video.duration > 0 && buffer[1] >= video.duration - 0.15;
      if (buffer && !complete) {
        const ahead = buffer[1] - time;
        while (rate > 1 && ahead < rate * 2) rate = Math.max(1, rate / 2);
        if (rate < settings.adSpeed) state.reason = `버퍼 여유에 맞춰 ${rate}배속`;
      }
    }
    writeAdRate(video, state, rate);
    return state.reason;
  }
  function tick(force = false) {
    if (lastUrl !== location.href) {
      restorePatches(); restoreRate(); bind(null); lastUrl = location.href;
      adActive = false; heldUntil = 0; lastSeek = -Infinity;
    }
    // Never accelerate VOD, clip, homepage previews, or another channel's mini-player.
    if (!/^\/live\/[a-f0-9]{32}\/?$/i.test(location.pathname)) {
      restorePatches(); restoreRate(); bind(null); announce("라이브 페이지에서 사용"); return;
    }
    const mains = [...document.querySelectorAll("video.webplayer-internal-video")].filter(v => v.isConnected && v.getBoundingClientRect().width > 0);
    const main = mains.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    bind(main || null);
    const adVideos = wrapper => [...wrapper.querySelectorAll("#midAdVideoContainer video, #preAdVideoContainer video")];
    const visibleAdWrappers = [...document.querySelectorAll("#midAdPlayerWrapper, #preAdPlayerWrapper")]
      .filter(el => getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");
    const observedAds = new Set(visibleAdWrappers.flatMap(adVideos).filter(video => !video.ended));
    for (const video of adRates.keys()) if (!observedAds.has(video) || settings.adSpeed === 1) releaseAdRate(video);
    const speedNotes = settings.adSpeed === 1 ? [] : [...observedAds].map(adRate).filter(Boolean);
    const wrappers = visibleAdWrappers.filter(el => adVideos(el).some(v => !v.ended && v.readyState >= 2));
    if (visibleAdWrappers.length && !adActive) {
      beforeAdAudio = lastNormal ? { ...lastNormal } : main ? { muted: main.muted, volume: main.volume } : null;
      userChangedAdAudio = false; restoreRate(); adActive = true;
    }
    if (visibleAdWrappers.length && !wrappers.length) { announce(["광고 준비 중", ...new Set(speedNotes)].join(" · ")); return; }
    if (wrappers.length) {
      for (const wrapper of wrappers) {
        for (const video of adVideos(wrapper)) {
          if (settings.adMute) patch(video, "muted", true);
        }
        if (settings.adMini && main && !main.paused && main.readyState >= 2) {
          wrapper.classList.add("chzzk-tools-ad-mini");
          main.closest(".webplayer-internal-source-wrapper")?.classList.add("chzzk-tools-main-full");
        }
      }
      if (settings.mainAudio && main && beforeAdAudio && !beforeAdAudio.muted && !userChangedAdAudio) {
        main.muted = false;
      }
      status = [main?.paused ? "광고 처리 중 · 본방 재생 대기" : "광고 처리 중", ...new Set(speedNotes)].join(" · ");
      announce(status); return;
    }
    if (adActive) {
      restorePatches(); adActive = false;
      if (settings.adMute && main && beforeAdAudio && !userChangedAdAudio) {
        main.muted = beforeAdAudio.muted;
      }
      beforeAdAudio = null;
      suspend("광고 종료 · 재생 안정화 중", 5000);
    }
    if (!main) { announce("플레이어 대기"); return; }
    lastNormal = { muted: main.muted, volume: main.volume };
    if (!settings.catchUp) { restoreRate(); announce("자동 따라잡기 꺼짐"); return; }
    if (main.dataset.chzzkToolsManualRate) { restoreRate(); announce("수동 배속 사용 중 · 자동 따라잡기 대기"); return; }
    const now = performance.now();
    if (main.paused || main.seeking || main.readyState < 3) {
      restoreRate(); announce("일시정지 / 버퍼 대기"); return;
    }
    if (now < cooldown || now < heldUntil) { announce(status); return; }
    if (ownedRate === null && Math.abs(main.playbackRate - 1) > 0.001) {
      announce("사용자 배속 유지"); return;
    }
    if (now - stableSince > 60000) { margin = Math.max(0.75, margin - 0.25); stableSince = now; }
    const plan = core.planCatchUp({ time: main.currentTime, seekable: ranges(main.seekable), buffered: ranges(main.buffered), margin, lastSeek, now, force });
    if (plan.seek !== undefined) { ownSeekTarget = plan.seek; main.currentTime = plan.seek; lastSeek = now; cooldown = now + 4000; }
    setRate(plan.rate);
    status = plan.reason + (Number.isFinite(plan.gap) ? ` · 최신 버퍼까지 ${plan.gap.toFixed(1)}초` : "");
    announce(status);
  }
  chrome.storage.local.get("features").then(data => { settings = core.features(data.features); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    restorePatches(); restoreRate();
    settings = core.features(changes.features.newValue);
  });
  document.addEventListener("chzzk-tools:catch-up", () => {
    heldUntil = 0; cooldown = 0; lastSeek = -Infinity; tick(true);
  });
  // An intentional rewind must not be immediately undone by the automatic controller.
  document.addEventListener("keydown", e => {
    if (e.code !== "ArrowLeft" || e.target.closest?.("input,textarea,[contenteditable='true']")) return;
    restoreRate(); heldUntil = performance.now() + 30000; status = "되감기 · 30초 대기";
  }, true);
  window.setInterval(() => { try { tick(); } catch { restoreRate(); announce("플레이어 연결 대기"); } }, 1000);
  window.addEventListener("pagehide", () => { restorePatches(); restoreRate(); });
})();
