// Two browser pages share extension storage, but keep their own session storage.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/shiny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline') ? require('node:child_process').execFileSync('git', ['show', '4c50ae9:free-chat.js'], { cwd: root }) : null;
let browser, server;
const errors = [];
const state = page => page.locator('#ctfc-toggle').getAttribute('aria-pressed');
const settled = () => new Promise(resolve => setTimeout(resolve, 130));
(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(baseline && file === path.join(root,'free-chat.js') ? baseline : fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const platform of ['chzzk', 'soop']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const key = platform === 'chzzk' ? 'chzzkFreeChatLayout' : 'soopFreeChatLayout';
    const shared = { features: { freeChat: true }, [key]: { enabled: true, width: 280, height: 300, opacity: .45 } };
    const broadcast = async values => {
      const changes = {};
      for (const [name, value] of Object.entries(values)) {
        changes[name] = { oldValue: shared[name], newValue: value };
        shared[name] = structuredClone(value);
      }
      await Promise.all(context.pages().map(page => page.evaluate(changes => window.dispatchEvent(new CustomEvent('shared-storage', { detail: changes })), changes)));
    };
    await context.exposeBinding('readShared', () => structuredClone(shared));
    await context.exposeBinding('writeShared', (_, values) => broadcast(values));
    await context.addInitScript(() => {
      const listeners = new Set();
      window.addEventListener('shared-storage', event => listeners.forEach(fn => fn(event.detail, 'local')));
      window.freeChatStorage = { storage: { local: { get: () => window.readShared(), set: values => window.writeShared(values) },
        onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    });
    const open = async () => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/tests/free-chat-harness.html?manual' + (platform === 'soop' ? '&soop' : ''));
      await page.locator('#ctfc-toggle').waitFor();
      await settled();
      return page;
    };
    const first = await open(), second = await open();
    const previous = await state(second);
    await first.locator('#ctfc-toggle').click(); await settled();
    assert.notEqual(await state(first), previous);
    assert.equal(await state(second), previous, `${platform}: toggling the first tab changed the second tab`);
    assert.equal(previous, 'false', 'new tabs ignore the old global enabled flag');
    await first.reload(); await first.locator('#ctfc-toggle').waitFor(); await settled();
    assert.equal(await state(first), 'true', 'refresh preserves this tab');
    const third = await open();
    assert.equal(await state(third), 'false', 'a later tab starts off');
    await second.keyboard.press('Alt+Shift+C'); await settled();
    assert.equal(await state(second), 'true'); assert.equal(await state(first), 'true'); assert.equal(await state(third), 'false');
    await first.locator('.ctfc-disable').click(); await settled();
    assert.equal(await state(first), 'false'); assert.equal(await state(second), 'true');
    await broadcast({ [key]: { ...shared[key], enabled: false, width: 260, opacity: .6 } }); await settled();
    assert.equal(await state(second), 'true', 'shared layout updates preserve local enabled state');
    assert.equal(await state(first), 'false');
    assert.equal(await second.locator('#ctfc-alpha').inputValue(), '60');
    await broadcast({ features: { freeChat: false } }); await settled();
    assert.equal(await second.locator('#ctfc-toggle').count(), 0);
    await broadcast({ features: { freeChat: true } }); await settled();
    assert.equal(await state(second), 'true'); assert.equal(await state(first), 'false');
    await second.evaluate(() => { const old = chat(); old.insertAdjacentHTML('afterend', sideHTML()); old.remove(); }); await settled();
    assert.equal(await state(second), 'true', 'replacement chat retains the tab state');
    await second.locator('.ctfc-disable').click(); await settled();
    assert.ok(!Object.hasOwn(shared[key], 'enabled'), 'new shared layouts omit the tab flag');
    await second.reload(); await second.locator('#ctfc-toggle').waitFor(); await settled();
    assert.equal(await state(second), 'false', 'off also survives refresh');
    assert.equal(await second.locator('[contenteditable]').textContent(), '작성 중 문장');
    const startup = await context.newPage();
    startup.on('pageerror', error => errors.push(error.message));
    await startup.goto(base + '/tests/free-chat-harness.html?manual&invalidate-startup' + (platform === 'soop' ? '&soop' : ''));
    await startup.waitForFunction(() => window.invalidatedProfileSaves > 0);
    await settled();
    assert.equal(await startup.locator('#ctfc-toggle,.ctfc-toolbar,#ctfc-style').count(),0,`${platform}: startup invalidation left an orphaned controller`);
    assert.equal(await startup.locator('[contenteditable]').textContent(),'작성 중 문장');
    await startup.close();
    for (const boundary of ['measurement', 'placement', 'release']) {
    const interrupted = await open();
    await interrupted.evaluate(boundary => {
      const disable = () => window.dispatchEvent(new CustomEvent('shared-storage', { detail: { features: { newValue: { freeChat: false } } } }));
      if (boundary !== 'measurement') {
        const original = ChzzkViewControls, method = boundary === 'placement' ? 'place' : 'release';
        let once = true;
        globalThis.ChzzkViewControls = { ...original, [method](...args) {
          const result = original[method](...args);
          if (once) { once = false; disable(); }
          return result;
        } };
        if (boundary === 'release') { disable(); return; }
        window.dispatchEvent(new Event('resize')); return;
      }
      const side = chat(), measure = side.getBoundingClientRect;
      side.getBoundingClientRect = function (...args) {
        this.getBoundingClientRect = measure;
        disable();
        return measure.apply(this, args);
      };
      window.dispatchEvent(new Event('resize'));
    }, boundary);
    await settled();
    assert.deepEqual(errors, [], `${platform}: ${boundary} continued after teardown`);
    assert.equal(await interrupted.locator('#ctfc-toggle,.ctfc-toolbar,#ctfc-style').count(), 0);
    assert.equal(await interrupted.locator('[contenteditable]').textContent(), '작성 중 문장');
    await interrupted.close();
    }
    for (const trigger of ['resize', 'pointer']) {
      const invalidated = await open();
      await invalidated.evaluate(trigger => {
        chrome.storage.local.set = () => { throw Error('Extension context invalidated'); };
        // A monitor change saves its profile synchronously. Invalidated storage
        // tears down the controller while render/pointerDown is still running.
        screenWidth = 2560;
        if (trigger === 'resize') window.dispatchEvent(new Event('resize'));
        else gesture(document.querySelector('.ctfc-dock-handle'), 0, 0);
      }, trigger);
      await settled();
      assert.deepEqual(errors, [], `${platform}: ${trigger} accessed a mount after invalidation`);
      assert.equal(await invalidated.locator('#ctfc-toggle,.ctfc-toolbar,#ctfc-style').count(), 0, `${platform}: ${trigger} resurrected stopped controls`);
      assert.equal(await invalidated.locator('[contenteditable]').textContent(), '작성 중 문장');
      await invalidated.close();
    }
    assert.deepEqual(errors, [], `${platform}: a monitor change accessed a mount after invalidation`);
    console.log(platform + ': tab isolation, refresh, new tabs, shortcuts, shared layouts, feature restart and DOM replacement passed');
    await context.close();
  }
  assert.deepEqual(errors, []);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
});
