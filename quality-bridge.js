// Runs before CHZZK parses live/VOD metadata in the MAIN world.
(() => {
  if (globalThis.__chzzkQualityBridge) return;
  globalThis.__chzzkQualityBridge = true;
  let enabled = false;
  document.addEventListener("chzzk-tools:quality-config", event => {
    enabled = event.detail === true;
  });

  function repair(value) {
    if (!enabled || !value || typeof value !== "object") return value;
    const media = value.code === 200 ? value.content : value;
    if (!media || typeof media !== "object" || media.dab !== true) return value;
    if (!/^[a-f0-9]{32}$/i.test(media.channel?.channelId || "")) return value;
    const live = Number.isSafeInteger(media.liveId) && media.liveId > 0 && typeof media.liveTitle === "string";
    const vod = Number.isSafeInteger(media.videoNo) && media.videoNo > 0 && typeof media.videoTitle === "string";
    // Only the observed client-side ad-block flag; never touch streams, account/access checks or P2P.
    if (live || vod) media.dab = false;
    return value;
  }

  const parse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const value = Reflect.apply(parse, this, arguments);
    // Preserve custom reviver semantics and avoid examining ordinary chat/settings JSON.
    return typeof text === "string" && text.includes('"dab"') && reviver === undefined ? repair(value) : value;
  };
  const responseJson = Response.prototype.json;
  Response.prototype.json = function () {
    const result = Reflect.apply(responseJson, this, arguments);
    let target = false;
    try {
      const url = new URL(this.url);
      target = url.origin === "https://api.chzzk.naver.com" &&
        /^\/service\/v[\d.]+\/(?:channels\/[a-f0-9]{32}\/live-detail(?:-meta)?|videos\/\d+)\/?$/i.test(url.pathname);
    } catch { /* Synthetic and non-network responses pass through. */ }
    return target ? result.then(repair) : result;
  };
  document.dispatchEvent(new Event("chzzk-tools:quality-ready"));
})();
