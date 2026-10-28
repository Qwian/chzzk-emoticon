(() => {
  const core = globalThis.ChzzkTools;
  let settings = core.features(), attempts = new WeakMap();
  const hiddenNotices = new Map();
  function restoreNotices() {
    for (const [element, display] of hiddenNotices) if (element.isConnected) element.style.display = display;
    hiddenNotices.clear();
  }
  function tick() {
    if (settings.dismissAdNotice) {
      const notices = new Set(document.querySelectorAll('[data-nlog-area="ad_blocking_info_layer"]'));
      for (const link of document.querySelectorAll('a[href*="help.naver.com/alias/navergame/chzzkars49"]')) {
        let node = link;
        for (let i = 0; node && i < 8; i++, node = node.parentElement) {
          if (node.querySelector("button") && /광고.*차단|차단.*광고/.test(node.textContent)) { notices.add(node); break; }
        }
      }
      for (const element of notices) {
        if (!hiddenNotices.has(element)) hiddenNotices.set(element, element.style.display);
        element.style.display = "none";
      }
      for (const element of hiddenNotices.keys()) if (!element.isConnected) hiddenNotices.delete(element);
    }
    if (!settings.highestQuality || !/^\/(live|video)\//.test(location.pathname)) return;
    if ([...document.querySelectorAll("main p")].some(element => /브라우저 확장 프로그램을 먼저 설치/.test(element.textContent))) return;
    for (const player of document.querySelectorAll(".pzp")) {
      const video = player.querySelector("video.webplayer-internal-video");
      if (!video) continue;
      const items = [...player.querySelectorAll(".pzp-ui-setting-quality-item")].filter(item =>
        !item.matches("[aria-disabled='true'],[disabled]") && !/disabled|locked/.test(item.className));
      const score = item => Number(item.textContent.match(/(\d{3,4})p/i)?.[1] || 0) * 1000 +
        Number(item.textContent.match(/(\d+)\s*fps/i)?.[1] || 0);
      const best = items.sort((a, b) => score(b) - score(a))[0];
      if (!best || !score(best) || best.classList.contains("pzp-ui-setting-pane-item--checked")) continue;
      const state = attempts.get(video) || { count: 0, time: -Infinity, source: video.currentSrc };
      if (state.source !== video.currentSrc) { state.count = 0; state.source = video.currentSrc; }
      if (state.count >= 3 || performance.now() - state.time < 15000) continue;
      state.count++; state.time = performance.now(); attempts.set(video, state);
      best.click();
    }
  }
  chrome.storage.local.get("features").then(data => { settings = core.features(data.features); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    settings = core.features(changes.features.newValue); attempts = new WeakMap();
    if (!settings.dismissAdNotice) restoreNotices();
  });
  document.addEventListener("chzzk-tools:player-status", event => {
    if (event.detail?.text?.startsWith("광고 종료")) attempts = new WeakMap();
  });
  window.setInterval(tick, 1500);
  window.addEventListener("pagehide", restoreNotices);
})();
