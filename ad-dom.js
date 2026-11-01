(() => {
  const selector = '#midAdPlayerWrapper,#preAdPlayerWrapper,.webplayer-internal-core-ad-ui';
  const sdk = wrapper => wrapper.matches('.webplayer-internal-core-ad-ui');
  const videos = wrapper => [...wrapper.querySelectorAll(sdk(wrapper)
    ? 'video[data-role="videoEl"],video[title="Advertisement"]'
    : '#midAdVideoContainer video,#preAdVideoContainer video')];
  function active(wrapper) {
    if (sdk(wrapper)) {
      // SDK also creates empty/autoplay-probe videos. They are not an active ad.
      return Boolean(wrapper.closest('.pzp-pc--adbreak') && videos(wrapper).some(video =>
        video.currentSrc && !video.ended && video.readyState >= 2));
    }
    for (let element = wrapper; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (element.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  globalThis.ChzzkAdDom = Object.freeze({ selector, sdk, videos, active,
    wrappers: () => [...document.querySelectorAll(selector)].filter(active) });
})();
