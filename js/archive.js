"use strict";
/* ============================================================
 * archive.js — 跨设备存档
 *  · 把用户全部痕迹（错题/收藏/斩题/历史/刷题记录/设置）编译成一段字符串
 *  · 任意设备粘贴字符串即可：覆盖 / 合并 / 新建存档
 *  · 多存档槽管理（保存、导出、加载、删除、重命名）
 *
 * 存档码格式（按前缀识别，向后兼容）：
 *   DJC1:<base64(gzip(紧凑JSON))>   —— 新：紧凑定长格式（默认导出）
 *   DJC0:<base64(紧凑JSON)>          —— 新：紧凑格式（环境不支持压缩时）
 *   DJZ1:<base64(gzip(完整JSON))>   —— 旧：完整格式（仍可导入）
 *   DJB1:<base64(完整JSON)>          —— 旧：完整格式（仍可导入）
 *
 * 为何要紧凑格式？
 *   旧格式把“答题历史”里的每道题题干/选项/解析全文都写进存档码，
 *   于是码长会随做题量线性膨胀（重度用户可达数十万字符，无法复制）。
 *   紧凑格式改用“按题库分组的位图(bitset)”记录哪些题被刷过/做错/收藏/斩掉，
 *   码长只与题库规模相关、几乎不随做题量增长（题库 1600 题时满状态也仅 ~2KB 字符），
 *   且因为按 题库id__题型__序号 定位，向后只增的题库更新不会使旧码失效。
 * ============================================================ */
window.Archive = (function () {
  const S = State.state;

  /* ---------- 字节 / base64 / gzip ---------- */
  function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function gzip(bytes) {
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  async function gunzip(bytes) {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  const canGzip = (typeof CompressionStream !== 'undefined');

  /* ---------- 构建存档对象（内存中始终保留完整信息，供本机存档槽使用） ---------- */
  function buildArchive() {
    return {
      v: CFG.ARCHIVE_VERSION,
      app: 'djquiz',
      exportedAt: new Date().toISOString(),
      data: {
        wrongBook: S.wrongBook,
        favs: S.favs,
        banned: S.banned,
        history: S.history.slice(0, 120),
        practiced: S.practiced,
        settings: S.settings,
      },
    };
  }

  /* ============================================================
   *  紧凑位图编码（DJC1）
   * ============================================================ */
  const QID_RE = /^(.+)__(single|multi|tf|fill)__(\d+)$/;
  function parseQid(qid) {
    const m = QID_RE.exec(String(qid));
    if (!m) return null;
    return { bank: m[1], type: m[2], seq: parseInt(m[3], 10) };
  }
  function pad4(n) { return String(n).padStart(4, '0'); }

  // 一组 qid -> {g:{ "bank|type": base64(bitset) }, x:[无法解析的原始id]}
  function encodeMembership(qids) {
    const groups = {}, extra = [];
    for (const q of qids) {
      const p = parseQid(q);
      if (!p) { extra.push(q); continue; }
      const k = p.bank + '|' + p.type;
      (groups[k] || (groups[k] = [])).push(p.seq);
    }
    const g = {};
    for (const k in groups) {
      const seqs = groups[k];
      let mx = 0; for (const s of seqs) if (s > mx) mx = s;
      const ba = new Uint8Array((mx + 7) >> 3);
      for (const s of seqs) ba[(s - 1) >> 3] |= (1 << ((s - 1) & 7));
      g[k] = bytesToB64(ba);
    }
    const res = { g };
    if (extra.length) res.x = extra;
    return res;
  }
  // 还原为“规范顺序”的 qid 数组（顺序需与编码端一致：组键升序、位升序、extra 末尾）
  function decodeMembership(obj) {
    const out = [];
    const g = (obj && obj.g) || {};
    const keys = Object.keys(g).sort();
    for (const k of keys) {
      const sep = k.lastIndexOf('|');
      const bank = k.slice(0, sep), type = k.slice(sep + 1);
      const ba = b64ToBytes(g[k]);
      for (let bi = 0; bi < ba.length; bi++) {
        const byte = ba[bi];
        if (!byte) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << bit)) out.push(bank + '__' + type + '__' + pad4(bi * 8 + bit + 1));
        }
      }
    }
    if (obj && obj.x) for (const x of obj.x) out.push(x);
    return out;
  }

  // 完整 archive 对象 -> 紧凑 payload（普通对象）
  function toCompactPayload(obj) {
    const d = (obj && obj.data) || {};
    const wrong = d.wrongBook || {}, pract = d.practiced || {}, banned = d.banned || {}, favs = d.favs || [];
    const prKeys = Object.keys(pract).sort();
    const wrKeys = Object.keys(wrong).sort();
    const prEnc = encodeMembership(prKeys);
    const wrEnc = encodeMembership(wrKeys);
    // 计数需按“解码后的规范顺序”对齐
    const prOrder = decodeMembership(prEnc);
    const wrOrder = decodeMembership(wrEnc);
    const payload = {
      v: 5,
      t: obj && obj.exportedAt ? Date.parse(obj.exportedAt) || 0 : Date.now(),
      st: (d.settings && d.settings.includePracticed === false) ? 0 : 1,
      pr: prEnc,
      wr: wrEnc,
      fv: encodeMembership(favs.slice()),
      bn: encodeMembership(Object.keys(banned)),
      prc: prOrder.map(q => (pract[q] && pract[q].count) || 1),
      wc: wrOrder.map(q => (wrong[q] && wrong[q].count) || 1),
      wcc: wrOrder.map(q => (wrong[q] && wrong[q].correctCount) || 0),
      // 历史仅保留成绩摘要（不含逐题明细），上限 60 条，确保码长有界
      h: (d.history || []).slice(0, 60).map(h => [
        Math.round(h.pct || 0), h.total || 0, h.ok || 0,
        h.finishedAt || '', h.mode === 'exam' ? 'e' : 'n', h.submode || '',
      ]),
    };
    return payload;
  }

  // 紧凑 payload -> 完整 data 结构（与旧格式兼容，供 applyOverwrite/applyMerge 使用）
  function fromCompactPayload(p) {
    const prOrder = decodeMembership(p.pr || {});
    const wrOrder = decodeMembership(p.wr || {});
    const prc = p.prc || [], wc = p.wc || [], wcc = p.wcc || [];
    const practiced = {}, wrongBook = {};
    prOrder.forEach((q, i) => { practiced[q] = { count: prc[i] != null ? prc[i] : 1, lastCorrect: true }; });
    wrOrder.forEach((q, i) => { wrongBook[q] = { count: wc[i] != null ? wc[i] : 1, correctCount: wcc[i] || 0 }; });
    const banned = {};
    decodeMembership(p.bn || {}).forEach(q => { banned[q] = { bannedAt: '' }; });
    const favs = decodeMembership(p.fv || {});
    const history = (p.h || []).map(a => ({
      pct: a[0] || 0, total: a[1] || 0, ok: a[2] || 0, bad: (a[1] || 0) - (a[2] || 0), skip: 0,
      finishedAt: a[3] || '', startedAt: a[3] || '', mode: a[4] === 'e' ? 'exam' : 'normal',
      submode: a[5] || (a[4] === 'e' ? 'exam' : 'normal'),
      summaryOnly: true, // 来自存档码，无逐题明细
    }));
    return {
      v: 5, app: 'djquiz',
      exportedAt: p.t ? new Date(p.t).toISOString() : new Date().toISOString(),
      data: { wrongBook, favs, banned, practiced, history, settings: { includePracticed: p.st !== 0 } },
    };
  }

  /* ---------- 编码 / 解码 ---------- */
  async function encode(obj) {
    // 默认导出为紧凑格式（短、定长、不随做题量膨胀）
    const payload = toCompactPayload(obj);
    const bytes = enc.encode(JSON.stringify(payload));
    if (canGzip) {
      try {
        const gz = await gzip(bytes);
        return CFG.ARCHIVE_PREFIX_COMPACT_GZIP + bytesToB64(gz);
      } catch (e) { /* fall through */ }
    }
    return CFG.ARCHIVE_PREFIX_COMPACT_PLAIN + bytesToB64(bytes);
  }

  async function decode(str) {
    str = String(str || '').trim().replace(/\s+/g, '');
    // 新：紧凑格式
    if (str.startsWith(CFG.ARCHIVE_PREFIX_COMPACT_GZIP)) {
      const body = str.slice(CFG.ARCHIVE_PREFIX_COMPACT_GZIP.length);
      const bytes = await gunzip(b64ToBytes(body));
      return fromCompactPayload(JSON.parse(dec.decode(bytes)));
    }
    if (str.startsWith(CFG.ARCHIVE_PREFIX_COMPACT_PLAIN)) {
      const body = str.slice(CFG.ARCHIVE_PREFIX_COMPACT_PLAIN.length);
      return fromCompactPayload(JSON.parse(dec.decode(b64ToBytes(body))));
    }
    // 旧：完整格式（向后兼容，保证此前生成的存档码照常使用）
    if (str.startsWith(CFG.ARCHIVE_PREFIX_GZIP)) {
      const body = str.slice(CFG.ARCHIVE_PREFIX_GZIP.length);
      const bytes = await gunzip(b64ToBytes(body));
      return JSON.parse(dec.decode(bytes));
    }
    if (str.startsWith(CFG.ARCHIVE_PREFIX_PLAIN)) {
      const body = str.slice(CFG.ARCHIVE_PREFIX_PLAIN.length);
      return JSON.parse(dec.decode(b64ToBytes(body)));
    }
    throw new Error('无法识别的存档码（前缀不正确）');
  }

  /* ---------- 预览 ---------- */
  function preview(obj) {
    if (!obj || !obj.data) throw new Error('存档内容损坏');
    const d = obj.data;
    return {
      version: obj.v,
      exportedAt: obj.exportedAt,
      wrong: Object.keys(d.wrongBook || {}).length,
      favs: (d.favs || []).length,
      banned: Object.keys(d.banned || {}).length,
      practiced: Object.keys(d.practiced || {}).length,
      history: (d.history || []).length,
    };
  }

  /* ---------- 应用：覆盖 / 合并 ---------- */
  function resolveKeys(obj) { // 把对象键名解析为当前题库的规范 id
    const out = {};
    for (const k in obj) out[Bank.resolveId(k)] = obj[k];
    return out;
  }

  function applyOverwrite(obj) {
    const d = obj.data || {};
    S.wrongBook = resolveKeys(d.wrongBook || {});
    S.favs = (d.favs || []).map(Bank.resolveId);
    S.banned = resolveKeys(d.banned || {});
    S.practiced = resolveKeys(d.practiced || {});
    S.history = (d.history || []).slice(0, 200);
    if (d.settings) S.settings = Object.assign({}, S.settings, d.settings);
    persistAll();
  }

  function applyMerge(obj) {
    const d = obj.data || {};
    // wrongBook
    const inWrong = resolveKeys(d.wrongBook || {});
    for (const qid in inWrong) {
      const a = S.wrongBook[qid], b = inWrong[qid];
      if (!a) { S.wrongBook[qid] = b; }
      else {
        a.count = (a.count || 0) + (b.count || 0);
        a.correctCount = (a.correctCount || 0) + (b.correctCount || 0);
        if ((b.lastWrong || '') > (a.lastWrong || '')) { a.lastWrong = b.lastWrong; a.lastUserAns = b.lastUserAns; }
        if ((b.lastCorrect || '') > (a.lastCorrect || '')) a.lastCorrect = b.lastCorrect;
      }
    }
    // favs (union)
    (d.favs || []).map(Bank.resolveId).forEach(id => { if (!S.favs.includes(id)) S.favs.push(id); });
    // banned (union)
    const inBan = resolveKeys(d.banned || {});
    for (const qid in inBan) if (!S.banned[qid]) S.banned[qid] = inBan[qid];
    // practiced
    const inPr = resolveKeys(d.practiced || {});
    for (const qid in inPr) {
      const a = S.practiced[qid], b = inPr[qid];
      if (!a) S.practiced[qid] = b;
      else {
        a.count = (a.count || 0) + (b.count || 0);
        if ((b.lastAt || '') > (a.lastAt || '')) { a.lastAt = b.lastAt; a.lastCorrect = b.lastCorrect; }
      }
    }
    // history (concat + dedup by finishedAt)
    const seen = new Set(S.history.map(h => h.finishedAt));
    (d.history || []).forEach(h => { if (h.finishedAt && !seen.has(h.finishedAt)) { S.history.push(h); seen.add(h.finishedAt); } });
    S.history.sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''));
    S.history = S.history.slice(0, 200);
    persistAll();
  }

  function persistAll() {
    Store.saveJSON(CFG.LS.WRONG, S.wrongBook);
    Store.saveJSON(CFG.LS.FAVS, S.favs);
    Store.saveJSON(CFG.LS.BANNED, S.banned);
    Store.saveJSON(CFG.LS.PRACTICED, S.practiced);
    Store.saveJSON(CFG.LS.HISTORY, S.history);
    Store.saveJSON(CFG.LS.SETTINGS, S.settings);
  }

  /* ---------- 存档槽 ---------- */
  function saveCurrentAsSlot(name) {
    const slot = {
      id: 'slot_' + Date.now(),
      name: name || ('存档 ' + U.fmtDate(new Date().toISOString())),
      createdAt: new Date().toISOString(),
      archive: buildArchive(),
    };
    S.slots.unshift(slot);
    State.saveSlots();
    return slot;
  }
  function saveArchiveAsSlot(obj, name) {
    const slot = {
      id: 'slot_' + Date.now(),
      name: name || ('导入存档 ' + U.fmtDate(new Date().toISOString())),
      createdAt: new Date().toISOString(),
      archive: obj,
    };
    S.slots.unshift(slot);
    State.saveSlots();
    return slot;
  }
  function getSlot(id) { return S.slots.find(s => s.id === id); }
  function deleteSlot(id) { S.slots = S.slots.filter(s => s.id !== id); State.saveSlots(); }
  function renameSlot(id, name) { const s = getSlot(id); if (s) { s.name = name; State.saveSlots(); } }

  return {
    buildArchive, encode, decode, preview,
    applyOverwrite, applyMerge,
    saveCurrentAsSlot, saveArchiveAsSlot, getSlot, deleteSlot, renameSlot,
    canGzip,
  };
})();
