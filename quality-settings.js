// Isolated document-start companion: read preferences before the page's metadata request completes.
(() => {
  let enabled = false;
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
