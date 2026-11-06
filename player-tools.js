(() => {
  if (globalThis.__chzzkPlayerTools) return;
  globalThis.__chzzkPlayerTools = true;
  const core = globalThis.ChzzkTools;
  let settings = core.features();
  let activeMain = null, lastUrl = "", lastNormal = null, adActive = false;
  let profile = core.catchUpProfile(settings.catchUpMode);
  let margin = profile.initialMargin, cooldown = 0;
  let lastCatchUp = -Infinity;
  let bufferRecovery = false;
  let ownedRate = null;
  const patches = new Map();
  const adRates = new Map();
  const localAdMute = new WeakMap();
  let beforeAdAudio = null, userChangedAdAudio = false, audioRecovery = null;
  let status = "플레이어 대기";

  function markAdMute(video, value) {
    if (video.matches?.("#midAdVideoContainer video, #preAdVideoContainer video, .webplayer-internal-core-ad-ui video")) {
      // Detached SDK ads no longer send volumechange through window.
      if (!localAdMute.has(video)) video.addEventListener("volumechange", stopOwnedMute, true);
      localAdMute.set(video, { value, until: performance.now() + 1500 });
    }
  }
  // The ad SDK mirrors volumechange to the site's shared mute setting. Keep our ad-only change local.
  function stopOwnedMute(event) {
    const owned = localAdMute.get(event.target);
    if (owned && owned.until > performance.now() && event.target.muted === owned.value) event.stopImmediatePropagation();
  }
  window.addEventListener("volumechange", stopOwnedMute, true);
  document.addEventListener("pointerdown", event => {
    if ((adActive || audioRecovery) && event.isTrusted && event.target.closest?.(".pzp-pc__volume-control,button[aria-label*='음소거']")) { userChangedAdAudio = true; audioRecovery = null; }
  }, true);
  document.addEventListener("keydown", event => {
    if ((!adActive && !audioRecovery) || !event.isTrusted || event.target.closest?.("input,textarea,[contenteditable='true']")) return;
    if (event.code === "KeyM" && !event.ctrlKey && !event.altKey && !event.metaKey ||
        event.target.closest?.(".pzp-pc__volume-control")) { userChangedAdAudio = true; audioRecovery = null; }
  }, true);
  function repairAudio() {
    if (!audioRecovery) return;
    if (performance.now() > audioRecovery.until || userChangedAdAudio || !settings.adMute) { audioRecovery = null; return; }
    if (adActive || !activeMain) return;
    const audio = audioRecovery.audio;
    if (activeMain.muted !== audio.muted) activeMain.muted = audio.muted;
    if (activeMain.volume !== audio.volume) activeMain.volume = audio.volume;
  }

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
    clearAdLayout();
  }
  function clearAdLayout() {
    document.querySelectorAll(".chzzk-tools-ad-mini,.chzzk-tools-main-full,.chzzk-tools-ad-visible").forEach(el =>
      el.classList.remove("chzzk-tools-ad-mini", "chzzk-tools-main-full", "chzzk-tools-ad-visible"));
  }
  function restoreRate() {
    if (activeMain && ownedRate !== null && activeMain.playbackRate === ownedRate) activeMain.playbackRate = 1;
    ownedRate = null;
  }
  function setRate(rate) {
    if (activeMain.playbackRate !== rate) activeMain.playbackRate = rate;
    ownedRate = rate;
  }
  function setCatchUpOwnership(main, enabled) {
    if (!main) return;
    const previous = main.dataset.chzzkToolsCatchUp === "true";
    if (enabled) {
      main.dataset.chzzkToolsCatchUp = "true";
      delete main.dataset.chzzkToolsManualRate;
    } else delete main.dataset.chzzkToolsCatchUp;
    if (previous !== enabled) main.dispatchEvent(new CustomEvent("chzzk-tools:catch-up-owner", { bubbles: true }));
  }
  function suspend(reason, milliseconds = profile.recoveryDelay) {
    restoreRate();
    bufferRecovery = false;
    cooldown = performance.now() + milliseconds;
    status = reason;
  }
  function waiting() {
    if (adActive || !settings.catchUp || activeMain?.paused || activeMain?.seeking) return;
    suspend("버퍼 회복 중 · 여유 " + margin.toFixed(1) + "초");
    bufferRecovery = true;
  }
  function sourceChanged() {
    suspend("영상 전환 · 재생 안정화 중", profile.startDelay);
  }
  function bind(main) {
    if (activeMain === main) return;
    restoreRate();
    setCatchUpOwnership(activeMain, false);
    if (activeMain) {
      activeMain.removeEventListener("waiting", waiting);
      activeMain.removeEventListener("loadedmetadata", sourceChanged);
      activeMain.removeEventListener("volumechange", repairAudio);
      for (const name of ["progress", "timeupdate", "playing", "canplay", "ratechange"]) activeMain.removeEventListener(name, refreshCatchUp);
    }
    activeMain = main; margin = profile.initialMargin; lastNormal = null;
    if (!adActive) beforeAdAudio = null;
    cooldown = performance.now() + profile.startDelay; bufferRecovery = false; lastCatchUp = -Infinity;
    if (main) {
      main.addEventListener("waiting", waiting);
      main.addEventListener("loadedmetadata", sourceChanged);
      main.addEventListener("volumechange", repairAudio);
      for (const name of ["progress", "timeupdate", "playing", "canplay", "ratechange"]) main.addEventListener(name, refreshCatchUp);
    }
  }
  const style = document.createElement("style");
  style.textContent = `
    .chzzk-tools-ad-mini {position:absolute!important;inset:12px 12px auto auto!important;
      width:26%!important;height:auto!important;aspect-ratio:16/9!important;z-index:50!important;
      overflow:hidden!important;box-shadow:0 0 0 1px #9998!important;}
    .chzzk-tools-main-full {position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
      max-width:none!important;max-height:none!important;transform:none!important;visibility:visible!important;opacity:1!important;}
    /* Native miniplayer rules use fixed positioning and !important. The live
       layout is a sibling of the mid-ad wrapper, outside the video ancestors. */
    #live_player_layout.chzzk-tools-main-full,
    #midAdPlayerWrapper.chzzk-tools-main-full,
    #preAdPlayerWrapper.chzzk-tools-main-full {position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:0!important;}
    #midAdPlayerWrapper #midAdVideoContainer.chzzk-tools-ad-mini,
    #preAdPlayerWrapper #preAdVideoContainer.chzzk-tools-ad-mini {width:26%!important;height:auto!important;}
    .chzzk-tools-ad-visible {display:block!important;visibility:visible!important;opacity:1!important;}
    .webplayer-internal-core-ad-ui.chzzk-tools-ad-visible {inset:0!important;width:100%!important;height:100%!important;z-index:100!important;}
  `;
  if (document.documentElement) document.documentElement.append(style);
  else document.addEventListener('DOMContentLoaded', () => document.documentElement.append(style), { once: true });

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
    const ads = globalThis.ChzzkAdDom;
    if (!ads) { announce("플레이어 연결 대기"); return; }
    if (lastUrl !== location.href) {
      audioRecovery = null; beforeAdAudio = null;
      ads.wrappers();
      restorePatches(); restoreRate(); bind(null); lastUrl = location.href;
      adActive = false;
    }
    const live = /^\/live\/[a-f0-9]{32}\/?$/i.test(location.pathname);
    const vod = /^\/video\/\d+\/?$/i.test(location.pathname);
    if (!live && !vod) {
      restorePatches(); restoreRate(); bind(null); announce("라이브 페이지에서 사용"); return;
    }
    const mains = [...document.querySelectorAll("video.webplayer-internal-video")].filter(v => v.isConnected && v.getBoundingClientRect().width > 0);
    const main = mains.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    bind(main || null);
    setCatchUpOwnership(activeMain, live && settings.catchUp);
    clearAdLayout();
    const adVideos = ads.videos;
    const visibleAdWrappers = ads.wrappers(true);
    const pendingAdWrappers = visibleAdWrappers.filter(wrapper => {
      const videos = adVideos(wrapper); return !videos.length || videos.some(video => !video.ended);
    });
    const observedAds = new Set(visibleAdWrappers.flatMap(adVideos).filter(video => !video.ended));
    for (const video of adRates.keys()) if (!observedAds.has(video) || settings.adSpeed === 1) releaseAdRate(video);
    const speedNotes = settings.adSpeed === 1 ? [] : [...observedAds].map(adRate).filter(Boolean);
    const wrappers = visibleAdWrappers.filter(el => adVideos(el).some(v => !v.ended && v.readyState >= 2));
    if (pendingAdWrappers.length && !adActive) {
      audioRecovery = null;
      beforeAdAudio = lastNormal ? { ...lastNormal } : main ? { muted: main.muted, volume: main.volume } : null;
      userChangedAdAudio = false; restoreRate(); adActive = true;
    }
    // Mute during preparation, before readyState reaches HAVE_CURRENT_DATA.
    if (settings.adMute) for (const video of ads.audioVideos?.() || observedAds) patch(video, "muted", true);
    if (pendingAdWrappers.length && !wrappers.length) { announce(["광고 준비 중", ...new Set(speedNotes)].join(" · ")); return; }
    if (wrappers.length) {
      for (const wrapper of wrappers) {
        if (ads.sdk(wrapper) && wrapper.isConnected) {
          // Reveal only the path of an actual SDK ad; keep its native controls intact.
          for (const video of adVideos(wrapper).filter(video => video.currentSrc && !video.ended && video.readyState >= 2)) {
            for (let element = video; element && wrapper.contains(element); element = element.parentElement) {
              element.classList.add("chzzk-tools-ad-visible");
              if (element === wrapper) break;
            }
          }
        } else if (live && settings.adMini) {
          // CHZZK puts a second live-content video beside the ad container.
          // Shrinking their shared wrapper also shrinks that live picture.
          const midMain = wrapper.querySelector('video#midPlayer');
          const liveMain = midMain && !midMain.paused && midMain.readyState >= 2 ? midMain : main;
          if (!liveMain || liveMain.paused || liveMain.readyState < 2) continue;
          const adSurface = wrapper.querySelector('#midAdVideoContainer,#preAdVideoContainer');
          if (!adSurface || adSurface.contains(liveMain)) continue;
          adSurface.classList.add("chzzk-tools-ad-mini");
          if (midMain || wrapper.contains(liveMain)) wrapper.classList.add("chzzk-tools-main-full");
          // Restore every content ancestor, including a shared ad wrapper.
          const playerRoot = wrapper.closest('.pzp') || wrapper.parentElement;
          for (const video of new Set([main, liveMain])) {
            const liveLayout = video?.closest('#live_player_layout');
            for (let element = video; element && element !== playerRoot; element = element.parentElement) {
              element.classList.add("chzzk-tools-main-full");
              if (liveLayout ? element === liveLayout : element.matches('.pzp-pc__video')) break;
            }
          }
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
      if (settings.adMute && beforeAdAudio && !userChangedAdAudio) {
        audioRecovery = { audio: { ...beforeAdAudio }, until: performance.now() + 5000 };
        repairAudio();
      }
      beforeAdAudio = null;
      suspend("광고 종료 · 재생 안정화 중", profile.adDelay);
    }
    if (!main) { announce("플레이어 대기"); return; }
    repairAudio();
    lastNormal = { muted: main.muted, volume: main.volume };
    catchUp(main, live, force);
  }
  function catchUp(main, live, force = false) {
    if (!live) { restoreRate(); announce("다시보기 · 광고 표시 복구 대기"); return; }
    if (!settings.catchUp) { restoreRate(); announce("자동 따라잡기 꺼짐"); return; }
    setCatchUpOwnership(main, true);
    const now = performance.now();
    if (main.paused || main.seeking || main.readyState < 3) {
      restoreRate(); announce("일시정지 / 버퍼 대기"); return;
    }
    if (now < cooldown) { announce(status); return; }
    bufferRecovery = false;
    const plan = core.planCatchUp({ time: main.currentTime, seekable: ranges(main.seekable), buffered: ranges(main.buffered), force, mode: settings.catchUpMode });
    if (plan.seek !== undefined) { main.currentTime = plan.seek; cooldown = now + profile.seekCooldown; }
    setRate(plan.rate);
    status = plan.reason + (Number.isFinite(plan.gap) ? ` · 최신 버퍼까지 ${plan.gap.toFixed(1)}초` : "");
    announce(status);
  }
  // Media events avoid waiting for the DOM/ad polling interval. Keep this path
  // lightweight: no document scans, ad layout writes or new polling timer.
  function refreshCatchUp(event) {
    if (!profile.eventDriven || !activeMain || adActive || lastUrl !== location.href || !/^\/live\/[a-f0-9]{32}\/?$/i.test(location.pathname)) return;
    if (bufferRecovery && activeMain.readyState >= 3 && ["playing", "canplay"].includes(event?.type)) {
      bufferRecovery = false; cooldown = 0;
    }
    const now = performance.now();
    if (now - lastCatchUp < 100) return;
    lastCatchUp = now;
    try { catchUp(activeMain, true, false); }
    catch { restoreRate(); }
  }
  function applySettings(value) {
    const next = core.features(value);
    if (next.catchUpMode !== settings.catchUpMode) {
      restoreRate();
      profile = core.catchUpProfile(next.catchUpMode);
      margin = profile.initialMargin; lastCatchUp = -Infinity;
      suspend("따라잡기 여유 변경 · " + next.catchUpMode + "초", profile.startDelay);
    }
    settings = next;
  }
  chrome.storage.local.get("features").then(data => { applySettings(data.features); refreshAds(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    restorePatches(); restoreRate();
    applySettings(changes.features.newValue);
    if (!settings.adMute) audioRecovery = null;
    refreshAds();
  });
  document.addEventListener("chzzk-tools:catch-up", () => {
    cooldown = 0; tick(true);
  });
  function refreshAds() { try { tick(); } catch { restoreRate(); announce("플레이어 연결 대기"); } }
  document.addEventListener('chzzk-tools:ad-dom-change', refreshAds);
  window.setInterval(refreshAds, 1000);
  window.addEventListener("pagehide", () => { audioRecovery = null; restorePatches(); restoreRate(); setCatchUpOwnership(activeMain, false); });
})();
