// Isolated document-start companion: read preferences before the page's metadata request completes.
(() => {
  let enabled = false;
  document.addEventListener("chzzk-tools:quality-status", event => {
    try {
      const value = JSON.parse(event.detail);
      globalThis.__chzzkQualityStatus = {
        version: String(value.version).slice(0, 16), enabled: value.enabled === true,
        tunnelResponses: Number(value.tunnelResponses) || 0, metadataResponses: Number(value.metadataResponses) || 0,
        repairs: Number(value.repairs) || 0, reason: String(value.reason).slice(0, 40)
      };
    } catch { /* No page payload or credentials are retained. */ }
  });
  const publish = () => document.dispatchEvent(new CustomEvent("chzzk-tools:quality-config", { detail: enabled }));
  document.addEventListener("chzzk-tools:quality-ready", publish);
  chrome.storage.local.get("features").then(data => {
    enabled = data.features?.adblockQuality !== false;
    publish();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    enabled = changes.features.newValue?.adblockQuality !== false;
    publish();
  });
})();
