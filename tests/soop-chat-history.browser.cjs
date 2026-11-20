// Passive live verification in an isolated unpacked-extension profile.
// Never type in chat or call any native send method.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/shiny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), artifacts = path.join(root, 'artifacts');
const publicUrl = process.argv.find(arg => arg.startsWith('https://play.sooplive.'));
if (!publicUrl) throw Error('Pass a current public SOOP broadcast URL');
const whaleRoot = 'C:/Program Files/Naver/Naver Whale/Application';
const whaleVersion = fs.readdirSync(whaleRoot).filter(name => /^\d+(?:\.\d+)+$/.test(name))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).find(name => fs.existsSync(path.join(whaleRoot, name, 'whale.exe')));
let context, profile;
const report = {};
(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  profile = fs.mkdtempSync(path.join(artifacts, 'soop-history-profile-'));
  context = await chromium.launchPersistentContext(profile, {
    executablePath: path.join(whaleRoot, whaleVersion, 'whale.exe'), headless: true,
    viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  report.version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const page = await context.newPage();
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.liveView?.controller?.chatContainer?.aChatDom &&
    document.documentElement.hasAttribute('data-chzzk-soop-chat-history'), null, { timeout: 45000 });
  await page.waitForFunction(() => window.liveView.controller.chatContainer.msg.toString().includes('receiving'), null, { timeout: 10000 });
  // Establish native live reception first, then compare hidden-panel behavior.
  await page.waitForFunction(() => window.liveView.controller.chatContainer.$Chat?.children().length > 5, null, { timeout: 60000 });
  await worker.evaluate(() => chrome.storage.local.set({ features: { freeChat: false } }));
  await page.waitForFunction(() => !window.liveView.controller.chatContainer.msg.toString().includes('receiving'));
  await page.evaluate(() => window.liveView.controller.chatContainer.closeChat());
  await page.waitForTimeout(4000);
  report.baselineClosedQueue = await page.evaluate(() => window.liveView.controller.chatContainer.aChatDom.length);
  assert.equal(report.baselineClosedQueue, 0, 'native closed panel unexpectedly retained messages');
  await worker.evaluate(() => chrome.storage.local.set({ features: { freeChat: true } }));
  await page.waitForFunction(() => window.liveView.controller.chatContainer.msg.toString().includes('receiving'));
  await page.waitForFunction(() => window.liveView.controller.chatContainer.aChatDom.length >= 3, null, { timeout: 45000 });
  report.hidden = await page.evaluate(() => {
    const chat = window.liveView.controller.chatContainer;
    window.__historyExpected = chat.aChatDom.slice();
    return { queue: chat.aChatDom.length, open: chat.isChatOpen(), classOpen: document.querySelector('#webplayer').classList.contains('chat_open') };
  });
  assert.equal(report.hidden.open, false); assert.equal(report.hidden.classOpen, false);
  // Native openChat only changes the panel; it does not send messages.
  await page.evaluate(() => window.liveView.controller.chatContainer.openChat());
  await page.waitForFunction(() => window.liveView.controller.chatContainer.aChatDom.length === 0, null, { timeout: 10000 });
  report.reopened = await page.evaluate(() => {
    const chat = window.liveView.controller.chatContainer;
    const output = chat.$Chat.get(0).textContent;
    return { open: chat.isChatOpen(), retainedMessages: window.__historyExpected.filter(html => {
      const node = document.createElement('div'); node.innerHTML = html;
      return node.textContent.trim() && output.includes(node.textContent.trim());
    }).length };
  });
  assert.equal(report.reopened.open, true); assert.ok(report.reopened.retainedMessages > 0);
  await page.screenshot({ path: path.join(artifacts, 'soop-history-live-0.10.33.png') });
  report.nativeFiltering = await page.evaluate(() => window.liveView.controller.chatContainer.msg.toString().includes('original.apply'));
  fs.writeFileSync(path.join(artifacts, 'soop-history-live-0.10.33.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await context?.close();
  if (profile) {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== artifacts || !path.basename(resolved).startsWith('soop-history-profile-')) throw Error('Unsafe cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
