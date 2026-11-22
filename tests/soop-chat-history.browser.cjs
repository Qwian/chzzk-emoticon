// Passive live verification in an isolated unpacked-extension profile.
// Never type in chat or call any native send method.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/shiny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), artifacts = path.join(root, 'artifacts');
let publicUrl = process.argv.find(arg => arg.startsWith('https://play.sooplive.'));
const live = process.argv.includes('--public') || !!publicUrl;
const whaleRoot = 'C:/Program Files/Naver/Naver Whale/Application';
const whaleVersion = fs.readdirSync(whaleRoot).filter(name => /^\d+(?:\.\d+)+$/.test(name))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).find(name => fs.existsSync(path.join(whaleRoot, name, 'whale.exe')));
let context, profile, diagnosticPage;
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
  await worker.evaluate(() => chrome.storage.local.set({ features: { freeChat: false, soopChatHistory: true } }));
  const page = await context.newPage();
  diagnosticPage = page;
  page.setDefaultTimeout(10000);
  const extensionErrors = [];
  page.on('pageerror', error => { if (/chrome-extension:/.test(error.stack)) extensionErrors.push(error.message); });
  if (!live) {
    const fixtureUrl = 'https://play.sooplive.com/history-fixture/1';
    await page.route(fixtureUrl, route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, 'soop-chat-history-fixture.html'), 'utf8') }));
    await page.goto(fixtureUrl);
    await page.waitForFunction(() => window.liveView?.controller.chatContainer.msg.toString().includes('receiving'));
    await page.evaluate(() => { const chat=liveView.controller.chatContainer; for(let i=0;i<20;i++)chat.msg('text '+i);chat.ogq('emote'); });
    assert.equal(await page.locator('#messages p').count(),0);
    assert.equal(await page.evaluate(() => liveView.controller.chatContainer.isChatOpen()),false);
    await page.locator('#open').click();await page.waitForFunction(() => document.querySelectorAll('#messages p').length===21);
    await page.locator('#close').click();
    await page.evaluate(() => { const chat=liveView.controller.chatContainer; for(let i=0;i<1000;i++)chat.msg(String(i)); });
    assert.equal(await page.evaluate(() => liveView.controller.chatContainer.aChatDom.length),300);
    assert.equal(await page.evaluate(() => liveView.controller.chatContainer.aChatDom[0]),'700');
    await page.evaluate(() => { const chat=liveView.controller.chatContainer;chat.blocked=true;chat.msg('blocked');chat.clearChat();chat.blocked=false;chat.msg('new channel'); });
    await page.locator('#open').click();await page.waitForFunction(() => document.querySelector('#messages').textContent==='new channel');
    assert.equal(await page.locator('[contenteditable]').textContent(),'작성 중 문장');
    const popup=await context.newPage();await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
    await popup.locator('.feature-panel summary').click();
    await popup.locator('#feature-soopChatHistory').uncheck();
    await page.waitForFunction(() => !liveView.controller.chatContainer.msg.toString().includes('receiving'));
    await page.locator('#close').click();await page.evaluate(() => liveView.controller.chatContainer.msg('disabled'));
    assert.equal(await page.evaluate(() => liveView.controller.chatContainer.aChatDom.length),0);
    await popup.locator('#feature-soopChatHistory').check();
    await page.waitForFunction(() => liveView.controller.chatContainer.msg.toString().includes('receiving'));
    assert.equal(await popup.locator('#feature-freeChat').isChecked(),false);
    await page.evaluate(() => { liveView.controller.chatContainer=makeChat(); });
    await page.waitForFunction(() => liveView.controller.chatContainer.msg.toString().includes('receiving'));
    await page.evaluate(() => liveView.controller.chatContainer.msg('replacement'));
    assert.equal(await page.evaluate(() => liveView.controller.chatContainer.aChatDom[0]),'replacement');
    assert.deepEqual(extensionErrors,[]);
    Object.assign(report,{fixture:true,initiallyClosed:true,reopen:true,boundedQueue:true,nativeClearAndFilter:true,popupToggle:true,independentOfLayout:true,controllerReplacement:true,extensionErrors});
    fs.writeFileSync(path.join(artifacts,`soop-history-fixture-${report.version}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
  }
  if (!publicUrl) {
    await page.goto('https://www.sooplive.com/',{waitUntil:'domcontentloaded'});
    await page.locator('a[href^="https://play.sooplive.com/"]').first().waitFor();
    publicUrl=await page.evaluate(() => {
      const urls=[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(href=>/^https:\/\/play\.sooplive\.com\/[a-z0-9_-]+(?:\/\d+)?$/i.test(href));
      // The first channel link is the live popular/sidebar entry. Full-number
      // promotional links can still point at an already ended broadcast.
      return urls.find(url=>! /\/\d+$/.test(url))||urls[0];
    });
  }
  await context.addInitScript(() => { if (location.hostname.startsWith('play.sooplive.')) localStorage.setItem('webplayer','list_open'); });
  report.publicUrl=publicUrl;
  console.log('Checking initially closed live panel: '+publicUrl);
  await page.goto(publicUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.liveView?.controller?.chatContainer?.aChatDom &&
    document.documentElement.hasAttribute('data-chzzk-soop-chat-history'), null, { timeout: 45000 });
  await page.waitForFunction(() => window.liveView.controller.chatContainer.msg.toString().includes('receiving'), null, { timeout: 10000 });
  // The profile starts with the native panel closed; never open it before reception.
  assert.equal(await page.evaluate(() => window.liveView.controller.chatContainer.isChatOpen()),false,'native panel did not start closed');
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
  await worker.evaluate(() => chrome.storage.local.set({ features: { freeChat: false, soopChatHistory: false } }));
  await page.waitForFunction(() => !window.liveView.controller.chatContainer.msg.toString().includes('receiving'));
  await page.evaluate(() => window.liveView.controller.chatContainer.closeChat());
  await page.waitForTimeout(4000);
  report.baselineClosedQueue = await page.evaluate(() => window.liveView.controller.chatContainer.aChatDom.length);
  assert.equal(report.baselineClosedQueue,0);
  assert.deepEqual(extensionErrors,[]);
  Object.assign(report,{initiallyClosed:true,independentOfLayout:true,extensionErrors});
  await page.screenshot({ path: path.join(artifacts, `soop-history-live-${report.version}.png`) });
  fs.writeFileSync(path.join(artifacts, `soop-history-live-${report.version}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(async error => {
  if (live && diagnosticPage) {
    report.failure=await diagnosticPage.evaluate(() => ({url:location.href,title:document.title,
      chatPresent:!!window.liveView?.controller?.chatContainer,
      queue:window.liveView?.controller?.chatContainer?.aChatDom?.length,
      chatOpen:window.liveView?.controller?.chatContainer?.isChatOpen?.(),
      socketConnected:window.livePlayer?.chatSocket?.isConnected,
      socketJoined:window.livePlayer?.chatSocket?._isChannelJoined,
      ended:window.liveView?.controller?.chatContainer?.isBroadAndChatEnded,
      modal:document.querySelector('#modal')?.innerText,
      videos:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,readyState:v.readyState}))
    })).catch(()=>({unavailable:true}));
    fs.writeFileSync(path.join(artifacts,`soop-history-live-${report.version}-failure.json`),JSON.stringify(report,null,2));
    console.error(JSON.stringify(report));
  }
  console.error(error); process.exitCode = 1;
}).finally(async () => {
  await context?.close();
  if (profile) {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== artifacts || !path.basename(resolved).startsWith('soop-history-profile-')) throw Error('Unsafe cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
