const replies = new Map(); let serial = 0, listener;
self.chrome = {
  runtime: { id: "test", onMessage: { addListener: fn => { listener = fn; } } },
  action: Object.fromEntries(["setBadgeBackgroundColor", "setBadgeTextColor", "setBadgeText", "setTitle"].map(method => [method, async details => postMessage({ kind: "action", method, details })])),
  tabs: { onRemoved: { addListener: () => {} }, onUpdated: { addListener: () => {} }, sendMessage: async (_tabId, message, options) => {
    const id = ++serial;
    return new Promise(resolve => { replies.set(id, resolve); postMessage({ kind: "deliver", id, message, options }); });
  } }
};
importScripts("../media-background.js");
onmessage = event => {
  const data = event.data;
  if (data.kind === "reply") { replies.get(data.id)?.(data.result); replies.delete(data.id); return; }
  listener(data.message, { id: "test", tab: { id: 1 }, frameId: data.frameId || 0 }, result => postMessage({ kind: "result", id: data.id, result }));
};
