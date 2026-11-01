(() => {
  if (globalThis.ChzzkAdDom) return;
  const selector = '#midAdPlayerWrapper,#preAdPlayerWrapper,.webplayer-internal-core-ad-ui';
  const retained = new Map();
  const sdk = wrapper => wrapper.matches('.webplayer-internal-core-ad-ui');
  const videos = wrapper => {
    const isSdk = sdk(wrapper);
    const candidates = [...wrapper.querySelectorAll(isSdk
      ? 'video[data-role="videoEl"],video[title="Advertisement"]'
      : '#midAdVideoContainer video,#preAdVideoContainer video')];
    return isSdk ? candidates.filter(video => video.currentSrc && !/^data:/i.test(video.currentSrc)) : candidates;
  };
  function player(wrapper) {
    return wrapper.closest('.pzp') || retained.get(wrapper)?.parent.closest?.('.pzp') || null;
  }
  function remember(wrapper, parent) {
    if (!sdk(wrapper) || !parent) return;
    if (!retained.has(wrapper)) retained.set(wrapper, { parent, path: location.pathname });
  }
  // AdGuard's Korean filter removes core-ad-ui, while the SDK keeps using its
  // detached container. Observe from document_start, including insert/remove
  // pairs in the same task, before the SDK later appends and plays its ad.
  function collect(node, parent) {
    if (node.nodeType !== 1) return;
    if (node.matches(selector)) remember(node, parent);
    node.querySelectorAll(selector).forEach(wrapper => remember(wrapper, wrapper.parentElement));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) collect(node, record.target);
      for (const node of record.removedNodes) collect(node, record.target);
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  document.querySelectorAll(selector).forEach(wrapper => remember(wrapper, wrapper.parentElement));
  function active(wrapper) {
    if (sdk(wrapper)) {
      // SDK also creates empty/autoplay-probe videos. They are not an active ad.
      const owner = player(wrapper);
      return Boolean(owner?.isConnected && owner.matches('.pzp-pc--adbreak') && videos(wrapper).some(video =>
        video.currentSrc && !video.ended && video.readyState >= 2));
    }
    for (let element = wrapper; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (element.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function wrappers() {
    for (const [wrapper, entry] of retained) {
      if (entry.path === location.pathname && player(wrapper)?.isConnected) continue;
      // Do not let an abandoned, invisible ad keep playing after SPA navigation.
      if (!wrapper.isConnected) videos(wrapper).forEach(video => { if (!video.paused) video.pause(); });
      retained.delete(wrapper);
    }
    return [...new Set([...document.querySelectorAll(selector), ...retained.keys()])].filter(active);
  }
  globalThis.ChzzkAdDom = Object.freeze({ selector, sdk, videos, active, wrappers });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    observer.disconnect();
    for (const wrapper of retained.keys()) if (!wrapper.isConnected) {
      videos(wrapper).forEach(video => { if (!video.paused) video.pause(); });
    }
    retained.clear();
  });
})();
