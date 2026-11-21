/* DF 報告格式 v1；純瀏覽器 script 與 Node 共用，沒有網路或儲存副作用。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DFReport = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const SCHEMA_VERSION = 1;
  const MAX_PAYLOAD_BYTES = 512 * 1024;
  const MAX_JSON_BYTES = 2 * 1024 * 1024;
  const DOWNLOAD_MESSAGE = '報告過大，請下載報告檔交給老師';
  const encoder = new TextEncoder();
  const text = 'text', bool = 'boolean', number = 'number', scalar = 'scalar';
  const nullableText = { nullable: text };
  const list = (item, max) => ({ item, max });
  const exif = { time:text, make:text, model:text, dim:text, ori:text };
  const evidence = { fact:text, interp:text, exif };
  const batch2 = { key:text, rel:text, why:text, exif };
  const timeline = {};
  for (const key of ['11:04','11:08','11:16','11:22–11:23','11:26','11:32','11:35','11:38','11:50']) {
    timeline[key] = { text, src:list(text, 100) };
  }
  const ev = {}, ev2 = {};
  for (const key of ['E01','E02','E03','E04','E06','E07']) ev[key] = evidence;
  for (const key of ['E05','E07F','E08','SUP']) ev2[key] = batch2;
  // 只從已知路徑重建物件；未知欄位連同匯入的教材／登入資料都不複製。
  const fields = {
    app:text, appVersion:text, version:text, cls:scalar, seat:scalar, started:text,
    briefed:bool, round2:bool,
    susp:list({ text, ev:list(text,100), want:text, conf:text }, 1000),
    pred:{ t:text, f:text }, s2:{ unlockedAt:nullableText }, problem:text,
    l01:{ time:text, make:text, model:text, ok:bool }, ev, timeline,
    h1:{ cause:text, effect:text, ev:list(text,100), unsure:text,
      checks:list(bool,4), submittedAt:nullableText },
    b2:{ unlockedAt:nullableText, ev:ev2, hints:list({ level:number, at:text },20000) },
    h2:{ decision:text, reason:text, ev:list(text,100), now:text },
    concl:{ best:text, ev:list(text,100), can:text, cannot:text, cbecause:text,
      misled:text, want:text, wantWhy:text, doneAt:nullableText },
    gallery:{ comments:list({ seat:scalar, stance:text, ev:text, text, at:text },1000), after:text, done:bool },
    reveal:{ unlockedAt:nullableText, finalAt:nullableText, tlnote:text,
      r1:text, r2:text, r3:text, r4:text, calc:{ t:text, i:text, s:text, ok:bool } },
    exports:list(text,20000), log:list({ t:text, e:text, d:scalar },20000)
  };
  function invalid() { throw new Error('報告格式不正確'); }
  function copy(value, spec, enforceLimits) {
    if (typeof spec === 'string') {
      const valid = spec === text ? typeof value === 'string'
        : spec === bool ? typeof value === 'boolean'
        : spec === number ? typeof value === 'number' && Number.isFinite(value)
        : value === null || typeof value === 'string' || typeof value === 'boolean'
          || (typeof value === 'number' && Number.isFinite(value));
      if (!valid) invalid();
      return value;
    }
    if ('nullable' in spec) return value === null ? null : copy(value, spec.nullable, enforceLimits);
    if ('item' in spec) {
      if (!Array.isArray(value) || (enforceLimits && value.length > spec.max)) invalid();
      return value.map(item => copy(item, spec.item, enforceLimits));
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const result = {};
    for (const key of Object.keys(spec)) {
      if (Object.prototype.hasOwnProperty.call(value,key) && value[key] !== undefined) {
        result[key] = copy(value[key], spec[key], enforceLimits);
      }
    }
    return result;
  }
  function select(state, enforceLimits = false) {
    if (!state || state.app !== 'DF-investigation'
        || typeof state.appVersion !== 'string' || typeof state.version !== 'string') invalid();
    return copy(state, fields, enforceLimits);
  }
  function serialize(state, enforceLimits = false) {
    // 與舊 HTML 報告相同的 script 結束標籤跳脫，亦可安全放入 df-report。
    return JSON.stringify(select(state, enforceLimits)).replace(/<\//g, '<\\/');
  }
  const utf8Bytes = value => encoder.encode(value).byteLength;
  const asciiJSON = json => json.replace(/[\u007f-\uffff]/g,
    ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4,'0'));
  function downloadResult(reason) { return { ok:false, action:'download', reason, message:DOWNLOAD_MESSAGE }; }
  function base64(bytes) {
    let binary = '';
    for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  function unbase64(value) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid();
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    if (base64(bytes) !== value) invalid();
    return bytes;
  }
  async function readLimited(stream, limit) {
    const reader = stream.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel().catch(() => {});
          throw new Error('報告解碼超過容量上限');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return bytes;
  }
  async function encode(state) {
    let json;
    try { json = serialize(state, true); }
    catch (error) { return downloadResult('invalid-report'); }
    if (utf8Bytes(json) > MAX_JSON_BYTES) return downloadResult('json-too-large');
    let payload = asciiJSON(json), encoding = 'ascii-json';
    if (payload.length > MAX_PAYLOAD_BYTES) {
      // 上傳端也需能解碼，否則改用既有本機下載流程。
      if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
        return downloadResult('compression-unavailable');
      }
      try {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const bytes = await readLimited(stream, MAX_PAYLOAD_BYTES / 4 * 3);
        payload = base64(bytes); encoding = 'gzip-base64';
      } catch (error) { return downloadResult('compression-failed-or-too-large'); }
    }
    if (payload.length > MAX_PAYLOAD_BYTES) return downloadResult('payload-too-large');
    return { ok:true, schemaVersion:SCHEMA_VERSION, encoding, payload };
  }
  async function decode(envelope) {
    if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION
        || !['ascii-json','gzip-base64'].includes(envelope.encoding)
        || typeof envelope.payload !== 'string' || !envelope.payload.length
        || envelope.payload.length > MAX_PAYLOAD_BYTES
        || /[^\x20-\x7e]/.test(envelope.payload)) invalid();
    let json;
    if (envelope.encoding === 'ascii-json') json = envelope.payload;
    else {
      if (typeof DecompressionStream !== 'function') throw new Error('此環境無法解壓報告，請使用報告檔');
      const stream = new Blob([unbase64(envelope.payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
      const bytes = await readLimited(stream, MAX_JSON_BYTES);
      json = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }
    if (utf8Bytes(json) > MAX_JSON_BYTES) throw new Error('報告解碼超過容量上限');
    return select(JSON.parse(json), true);
  }
  return Object.freeze({ SCHEMA_VERSION, MAX_PAYLOAD_BYTES, MAX_JSON_BYTES,
    DOWNLOAD_MESSAGE, select, serialize, encode, decode });
});
