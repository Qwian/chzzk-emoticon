(() => {
  // Run at document_start for detached ads, and again before idle consumers as a fallback.
  if (globalThis.ChzzkAdDom) return;
  const selector = '#midAdPlayerWrapper,#preAdPlayerWrapper,.webplayer-internal-core-ad-ui';
  const retained = new Map();
  const watched = new WeakSet();
  const sdk = wrapper => wrapper.matches('.webplayer-internal-core-ad-ui');
  const videos = wrapper => {
    const isSdk = sdk(wrapper);
    const candidates = [...wrapper.querySelectorAll(isSdk
      ? 'video[data-role="videoEl"],video[title="Advertisement"]'
      : '#midAdVideoContainer video,#preAdVideoContainer video')];
    return isSdk ? candidates.filter(video => {
      const source = video.currentSrc || video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src');
      return source && !/^data:/i.test(source);
    }) : candidates;
  };
  function player(wrapper) {
    return wrapper.closest('.pzp') || retained.get(wrapper)?.parent.closest?.('.pzp') || null;
  }
  function remember(wrapper, parent) {
    if (!parent) return;
    if (!watched.has(wrapper)) {
      watched.add(wrapper); observer.observe(wrapper, observation);
      const owner = wrapper.closest('.pzp') || parent.closest?.('.pzp');
      if (owner) observer.observe(owner, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
    }
    if (!sdk(wrapper)) return;
    if (!retained.has(wrapper)) {
      const abort = new AbortController();
      retained.set(wrapper, { parent, path: location.pathname, abort });
      for (const name of mediaEvents) wrapper.addEventListener(name, event => {
        if (!wrapper.isConnected && event.target.matches?.('video')) changed();
      }, { capture: true, signal: abort.signal });
    }
  }
  // AdGuard's Korean filter removes core-ad-ui, while the SDK keeps using its
  // detached container. Observe from document_start, including insert/remove
  // pairs in the same task, before the SDK later appends and plays its ad.
  function collect(node, parent) {
    if (node.nodeType !== 1) return;
    if (node.matches(selector)) remember(node, parent);
    node.querySelectorAll(selector).forEach(wrapper => remember(wrapper, wrapper.parentElement));
  }
  const changed = () => document.dispatchEvent(new Event('chzzk-tools:ad-dom-change'));
  const mediaEvents = ['loadstart', 'loadedmetadata', 'loadeddata', 'play', 'playing', 'volumechange'];
  const observation = { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['src', 'class', 'style', 'hidden'] };
  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        collect(node, record.target);
        if (node.nodeType === 1 && (node.matches('video,source,' + selector) || node.querySelector('video,source,' + selector))) relevant = true;
      }
      if (record.type === 'attributes') {
        const target = record.target;
        if (record.attributeName === 'src' && target.matches('video,source') ||
            ['style', 'hidden'].includes(record.attributeName) && target.matches(selector) ||
            record.attributeName === 'class' && target.matches('.pzp') &&
              /(?:^|\s)pzp-pc--adbreak(?:\s|$)/.test(record.oldValue || '') !== target.classList.contains('pzp-pc--adbreak')) relevant = true;
      }
    }
    if (relevant) changed();
  });
  observer.observe(document, { childList: true, subtree: true });
  for (const name of mediaEvents) window.addEventListener(name, event => {
    if (event.target.matches?.('video') && event.target.closest(selector)) changed();
  }, true);
  document.querySelectorAll(selector).forEach(wrapper => remember(wrapper, wrapper.parentElement));
  function active(wrapper, preparing = false) {
    if (sdk(wrapper)) {
      // SDK also creates empty/autoplay-probe videos. They are not an active ad.
      const owner = player(wrapper);
      return Boolean(owner?.isConnected && owner.matches('.pzp-pc--adbreak') && videos(wrapper).some(video =>
        !video.ended && (preparing || video.readyState >= 2)));
    }
    for (let element = wrapper; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (element.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function allWrappers() {
    for (const [wrapper, entry] of retained) {
      if (entry.path === location.pathname && player(wrapper)?.isConnected) continue;
      // Do not let an abandoned, invisible ad keep playing after SPA navigation.
      if (!wrapper.isConnected) videos(wrapper).forEach(video => { if (!video.paused) video.pause(); });
      entry.abort.abort();
      retained.delete(wrapper);
    }
    return [...new Set([...document.querySelectorAll(selector), ...retained.keys()])];
  }
  const wrappers = (preparing = false) => allWrappers().filter(wrapper => active(wrapper, preparing));
  // A real SDK source can load before the player raises its adbreak flag.
  // Pre-mute that source without classifying an empty probe or a prefetched ad as playing.
  const audioVideos = () => allWrappers().flatMap(wrapper => {
    if (active(wrapper, true)) return videos(wrapper).filter(video => !video.ended);
    if (sdk(wrapper) && player(wrapper)?.isConnected) return videos(wrapper).filter(video => !video.ended && video.readyState < 2);
    return [];
  });
  globalThis.ChzzkAdDom = Object.freeze({ selector, sdk, videos, active, wrappers, audioVideos });
  changed();
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    observer.disconnect();
    for (const wrapper of retained.keys()) if (!wrapper.isConnected) {
      videos(wrapper).forEach(video => { if (!video.paused) video.pause(); });
    }
    for (const entry of retained.values()) entry.abort.abort();
    retained.clear();
  });
})();
