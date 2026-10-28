// The current CHZZK tunnel consumes bytes with its own parser, bypassing JSON.parse.
(() => {
  if (globalThis.__chzzkQualityBridge) return;
  globalThis.__chzzkQualityBridge = true;
  const status = { version: "0.6.1", enabled: false, tunnelResponses: 0, metadataResponses: 0, repairs: 0, reason: "metadata-wait" };
  const publish = () => document.dispatchEvent(new CustomEvent("chzzk-tools:quality-status", { detail: JSON.stringify(status) }));
  document.addEventListener("chzzk-tools:quality-config", event => {
    status.enabled = event.detail === true;
    publish();
  });
  document.addEventListener("chzzk-tools:quality-query", publish);
  const decoder = new TextDecoder("utf-8", { fatal: true }), encoder = new TextEncoder();
  const aadLabel = encoder.encode("gfp-tunnel-response-v1");
  const bytesOf = value => ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
  function isMetadataResponse(algorithm) {
    if (String(algorithm?.name).toUpperCase() !== "AES-GCM" || !algorithm.additionalData) return false;
    try {
      const aad = bytesOf(algorithm.additionalData);
      return aad.length > aadLabel.length + 2 && (aad[0] * 256 + aad[1]) === aadLabel.length &&
        aadLabel.every((byte, i) => aad[i + 2] === byte);
    } catch { return false; }
  }
  function repair(buffer) {
    status.tunnelResponses++;
    if (!status.enabled) { status.reason = "disabled"; publish(); return buffer; }
    try {
      if (buffer.byteLength > 2 * 1024 * 1024) return buffer;
      const text = decoder.decode(buffer), value = JSON.parse(text);
      if (Object.hasOwn(value || {}, "code") && value.code !== 200) return buffer;
      const media = value?.code === 200 ? value.content : value;
      const live = Number.isSafeInteger(media?.liveId) && media.liveId > 0 && typeof media.liveTitle === "string";
      const vod = Number.isSafeInteger(media?.videoNo) && media.videoNo > 0 && typeof media.videoTitle === "string";
      if ((!live && !vod) || !/^[a-f0-9]{32}$/i.test(media.channel?.channelId || "")) {
        status.reason = "other-response"; publish(); return buffer;
      }
      status.metadataResponses++;
      // Change only an unambiguous flag token; retain all other bytes and numeric precision.
      const matches = [...text.matchAll(/(?<!\\)"dab"\s*:\s*true\b/g)];
      if (media.dab !== true || matches.length !== 1) {
        status.reason = media.dab === false ? "already-clear" : "unrecognized-flag";
        publish(); return buffer;
      }
      const end = matches[0].index + matches[0][0].length;
      const replacement = text.slice(0, end - 4) + "false" + text.slice(end);
      const candidate = JSON.parse(replacement);
      if ((candidate.code === 200 ? candidate.content : candidate).dab !== false) return buffer;
      const prefix = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 3));
      const bom = prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf ? "\ufeff" : "";
      const repaired = encoder.encode(bom + replacement).buffer;
      status.repairs++; status.reason = "repaired"; publish(); return repaired;
    } catch { status.reason = "unrecognized-response"; publish(); return buffer; }
  }
  const subtle = globalThis.crypto?.subtle, decrypt = subtle?.decrypt;
  if (decrypt) {
    try {
      Object.defineProperty(subtle, "decrypt", { configurable: true, writable: true, value: function (algorithm) {
        const result = Reflect.apply(decrypt, this, arguments);
        return isMetadataResponse(algorithm) ? result.then(repair) : result;
      } });
    } catch { status.reason = "hook-unavailable"; }
  } else status.reason = "hook-unavailable";
  publish();
  document.dispatchEvent(new Event("chzzk-tools:quality-ready"));
})();
