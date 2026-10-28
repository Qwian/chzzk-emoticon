(() => {
  const core = globalThis.ChzzkTools;
  let settings = { adAutoSkip: false }, attempts = new WeakMap();
  function visible(element) {
    if (!element.isConnected || !element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.classList.contains("hide") || style.display === "none" ||
          style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function tick() {
    if (!settings.adAutoSkip || !/^\/(?:live\/[a-f0-9]{32}|video\/\d+)\/?$/i.test(location.pathname)) return;
    for (const wrapper of document.querySelectorAll("#midAdPlayerWrapper, #preAdPlayerWrapper")) {
      const video = wrapper.querySelector("#midAdVideoContainer video, #preAdVideoContainer video");
      const buttons = wrapper.querySelectorAll('button[data-role="skipBtn"], button[aria-label="광고 SKIP"]');
      for (const button of buttons) {
        if (!video || video.ended || video.readyState < 2 || !visible(button) ||
            button.matches(':disabled,[aria-disabled="true"]') || button.closest('[inert],[aria-hidden="true"]') ||
            /\d|초\s*후|후\s*(?:SKIP|건너뛰기)|countdown/i.test(button.textContent)) {
          attempts.delete(button); continue;
        }
        const previous = attempts.get(button);
        const state = previous?.source === video.currentSrc ? previous : { source: video.currentSrc, count: 0, time: -Infinity };
        if (state.count >= 3 || performance.now() - state.time < 1000) continue;
        state.count++; state.time = performance.now(); attempts.set(button, state);
        button.click();
      }
    }
  }
  chrome.storage.local.get("features").then(data => { settings = core.features(data.features); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    settings = core.features(changes.features.newValue); attempts = new WeakMap();
  });
  const timer = window.setInterval(tick, 250);
  window.addEventListener("pagehide", () => window.clearInterval(timer));
})();
