(() => {
  if (globalThis.ChzzkLayout || window.top !== window) return;
  function install({ feature, key, legacy, create }) {
    let controller = null, enabled = true, saved, lastSaved, stopped = false;
    const lifetime = new AbortController();
    const persist = value => {
      saved = value; lastSaved = JSON.stringify(value);
      try { chrome.storage.local.set({ [key]: value }).catch(failure); } catch (error) { failure(error); }
    };
    function failure(error) { if (/extension context invalidated/i.test(error?.message || "")) stop(); }
    function sync() {
      if (stopped || !document.body) return;
      if (!enabled || legacy()) { controller?.stop(); controller = null; }
      else if (!controller) controller = create(saved, persist);
    }
    function onStorage(changes, area) {
      if (stopped || area !== "local") return;
      if (changes.features) enabled = changes.features.newValue?.[feature] !== false;
      if (changes[key] && JSON.stringify(changes[key].newValue) !== lastSaved) {
        saved = changes[key].newValue; lastSaved = JSON.stringify(saved); controller?.stop(); controller = null;
      }
      sync();
    }
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches("style") || node.querySelector("style"))))) sync();
    });
    function stop() {
      if (stopped) return;
      stopped = true; controller?.stop(); controller = null; lifetime.abort(); observer.disconnect();
      try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* invalidated */ }
    }
    for (const [name, method] of [["keydown", "keydown"], ["keyup", "keyup"], ["click", "click"]]) {
      window.addEventListener(name, event => controller?.[method]?.(event), { capture: true, signal: lifetime.signal });
    }
    window.addEventListener("pagehide", event => { if (!event.persisted) stop(); }, { signal: lifetime.signal });
    window.addEventListener("pageshow", () => { sync(); controller?.sync?.(); }, { signal: lifetime.signal });
    const boot = () => {
      if (stopped) return;
      observer.observe(document.documentElement, { childList: true, subtree: true });
      try {
        chrome.storage.onChanged.addListener(onStorage);
        chrome.storage.local.get(["features", key]).then(data => {
          if (stopped) return;
          enabled = data.features?.[feature] !== false; saved = data[key]; lastSaved = JSON.stringify(saved); sync();
        }).catch(error => { failure(error); if (!stopped) sync(); });
      } catch (error) { failure(error); }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true, signal: lifetime.signal });
    else boot();
  }
  const typing = event => event.composedPath().some(node => node.isContentEditable || node.matches?.("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
  function divider({ id, width, apply, active, signal }) {
    const element = document.createElement("div"); element.id = id;
    element.setAttribute("role", "separator"); element.setAttribute("aria-label", "채팅 너비 조절"); element.setAttribute("aria-orientation", "vertical");
    element.title = "드래그: 채팅 폭 조절 · 방향키: 20px 조절 · Home/두 번 클릭: 기본 폭";
    let pointer = null;
    const finish = () => { if (pointer === null) return; const previous = pointer; pointer = null; if (element.hasPointerCapture(previous)) element.releasePointerCapture(previous); apply(width(), true); };
    element.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !active()) return;
      event.preventDefault(); pointer = event.pointerId; element.setPointerCapture(pointer);
    }, { signal });
    element.addEventListener("pointermove", event => { if (pointer === event.pointerId && active()) apply(innerWidth - event.clientX - 4); }, { signal });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) element.addEventListener(name, finish, { signal });
    element.addEventListener("dblclick", () => { if (active()) apply(360, true); }, { signal });
    element.addEventListener("keydown", event => {
      if (!active() || !["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); apply(event.key === "Home" ? 360 : width() + (event.key === "ArrowLeft" ? 20 : -20), true);
    }, { signal });
    return element;
  }
  globalThis.ChzzkLayout = Object.freeze({ install, typing, divider });
})();
