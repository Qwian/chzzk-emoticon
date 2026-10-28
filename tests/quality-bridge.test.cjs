const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = name => readFileSync(join(__dirname, '..', name), 'utf8');
function aad(label = 'gfp-tunnel-response-v1') {
  const bytes = new TextEncoder().encode(label), out = new Uint8Array(2 + bytes.length + 12);
  out[1] = bytes.length; out.set(bytes, 2); return out;
}
function fixture(features, reverse = false) {
  const document = new EventTarget();
  class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init.detail; } }
  const listeners = [], nativeCalls = [];
  const subtle = { decrypt(...args) { nativeCalls.push(args); return args[1] === 'fail' ? Promise.reject(Error('decrypt failure')) : Promise.resolve(args[2]); } };
  const context = vm.createContext({ document, CustomEvent, Event, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
    crypto: { subtle }, chrome: { storage: { local: { get: async () => ({ features }) }, onChanged: { addListener: fn => listeners.push(fn) } } } });
  for (const file of reverse ? ['quality-settings.js', 'quality-bridge.js'] : ['quality-bridge.js', 'quality-settings.js']) vm.runInContext(source(file), context);
  return { context, listeners, nativeCalls, decrypt: (text, algorithm = { name: 'AES-GCM', additionalData: aad() }, key = null) => subtle.decrypt(algorithm, key, typeof text === 'string' ? new TextEncoder().encode(text).buffer : text) };
}
const media = () => ({ liveId: 123, liveTitle: 'live', channel: { channelId: 'a'.repeat(32) }, dab: true,
  livePlaybackJson: '{"media":[{"path":"https://example.test/original","p2pPath":"original"}]}',
  adult: true, paidProduct: { required: true }, userAdultStatus: 'NOT_ADULT', playerAdDisplayResponse: { preRoll: true } });
const decode = buffer => new TextDecoder().decode(buffer);
for (const reverse of [false, true]) test(`tunnel repair and settings order ${reverse}`, async () => {
  const f = fixture(undefined, reverse); await Promise.resolve();
  const text = JSON.stringify({ code: 200, content: media() });
  const result = decode(await f.decrypt(text));
  assert.equal(result, text.replace('"dab":true', '"dab":false'));
  assert.equal(f.context.__chzzkQualityStatus.repairs, 1);
  f.listeners.forEach(fn => fn({ features: { newValue: { adblockQuality: false } } }, 'local'));
  assert.equal(decode(await f.decrypt(text)), text);
});
test('only the recognized tunnel and metadata are changed, including VOD', async () => {
  const f = fixture(); await Promise.resolve();
  const text = JSON.stringify(media());
  for (const algorithm of [{ name: 'AES-CBC' }, { name: 'AES-GCM' }, { name: 'AES-GCM', additionalData: aad('other') },
    { name: 'AES-GCM', additionalData: new Uint8Array([0, 255]) }]) assert.equal(decode(await f.decrypt(text, algorithm)), text);
  for (const value of [{ dab: true }, { code: 403, content: media() }, { ...media(), channel: { channelId: 'bad' } }, { message: media() },
    { ...media(), nested: { dab: true } }, { ...media(), dab: 'true' }]) {
    const text = JSON.stringify(value); assert.equal(decode(await f.decrypt(text)), text);
  }
  const vod = JSON.stringify({ ...media(), liveId: undefined, videoNo: 456, videoTitle: 'vod' });
  assert.equal(JSON.parse(decode(await f.decrypt(vod))).dab, false);
  assert.equal(vm.runInContext('JSON.parse(`{"dab":true}`).dab', f.context), true);
});
test('native decrypt failures, non-JSON, binary, precision and BOM survive', async () => {
  const f = fixture(); await Promise.resolve();
  const text = JSON.stringify(media()).replace('"liveId":123', '"hugeId":900719925474099312345,"liveId":123');
  assert.equal(decode(await f.decrypt(text)), text.replace('"dab":true', '"dab":false'));
  for (const text of ['not json', '{']) assert.equal(decode(await f.decrypt(text)), text);
  const escapedText = JSON.stringify({ ...media(), title: 'quoted "dab":true' });
  assert.equal(decode(await f.decrypt(escapedText)), escapedText.replace('"dab":true', '"dab":false'));
  const escapedKey = JSON.stringify({ ...media(), nested: { dab: true } }).replace('"dab":true', '"\\u0064ab":true');
  assert.equal(decode(await f.decrypt(escapedKey)), escapedKey);
  const bytes = new Uint8Array([255, 0, 128]); assert.deepEqual(new Uint8Array(await f.decrypt(bytes.buffer)), bytes);
  const bom = new TextEncoder().encode('\ufeff' + JSON.stringify(media()));
  const result = new Uint8Array(await f.decrypt(bom.buffer)); assert.deepEqual([...result.slice(0, 3)], [239, 187, 191]);
  await assert.rejects(f.decrypt(text, { name: 'AES-GCM', additionalData: aad() }, 'fail'), /decrypt failure/);
  assert.equal(f.nativeCalls.at(-1)[1], 'fail');
});
