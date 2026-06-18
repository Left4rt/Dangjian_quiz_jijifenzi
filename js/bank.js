"use strict";
/* ============================================================
 * bank.js — 题库加载器
 *  · 从 bank/manifest.json 读取题库清单
 *  · 拉取每个 enabled 题库文件并规范化
 *  · 题目 ID 管理：未带 id 的题目自动生成稳定 id（bankId__type__序号）
 *  · 去重：题干完全一致的题目刷题时自动剔除（保留首个；若重复题解析更长则保留最长解析）
 * ============================================================ */
window.Bank = (function () {
  const TYPE_ORDER = CFG.TYPE_ORDER;

  let loaded = false;
  let dedup = { single: [], multi: [], tf: [], fill: [] }; // 去重后的有效题
  let byId = {};            // 规范 id -> question
  let aliasToCanonical = {}; // 任意 id -> 规范 id（兼容跨设备/老存档引用）
  let stats = { banks: [], totalRaw: 0, totalUnique: 0, duplicates: 0 };

  function fetchJSON(url) {
    const bust = (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
    return fetch(url + bust, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
      return r.json();
    });
  }

  function normalizeQuestion(q, type, bankId, idx) {
    const out = {
      type: type,
      question: String(q.question || '').trim(),
      answer: q.answer != null ? q.answer : '',
      explanation: q.explanation || '',
      bankId: bankId,
    };
    if (q.options) out.options = q.options;
    if (q.aliases) out.aliases = q.aliases;
    out.id = q.id || `${bankId}__${type}__${String(idx + 1).padStart(4, '0')}`;
    return out;
  }

  async function load() {
    const manifest = await fetchJSON(CFG.MANIFEST);
    const banks = (manifest.banks || []).filter(b => b.enabled !== false);
    const raw = { single: [], multi: [], tf: [], fill: [] };
    stats = { banks: [], totalRaw: 0, totalUnique: 0, duplicates: 0 };

    for (const b of banks) {
      let data;
      try {
        data = await fetchJSON(CFG.BANK_BASE + b.file);
      } catch (e) {
        stats.banks.push({ id: b.id, title: b.title, count: 0, error: e.message });
        continue;
      }
      const qs = data.questions || data; // 兼容直接是 {single:[],...} 的文件
      let cnt = 0;
      for (const t of TYPE_ORDER) {
        (qs[t] || []).forEach((q, i) => {
          if (!q || !q.question) return;
          raw[t].push(normalizeQuestion(q, t, b.id, i));
          cnt++;
        });
      }
      stats.banks.push({ id: b.id, title: b.title || data.title || b.id, count: cnt });
      stats.totalRaw += cnt;
    }

    // 去重
    dedup = { single: [], multi: [], tf: [], fill: [] };
    byId = {};
    aliasToCanonical = {};
    const seen = {}; // type|norm -> canonical id
    for (const t of TYPE_ORDER) {
      for (const q of raw[t]) {
        const key = t + '|' + U.normText(q.question);
        if (seen[key]) {
          aliasToCanonical[q.id] = seen[key]; // 重复题 -> 指向已保留题
          stats.duplicates++;
          // 需求1：仅解析不同的两道题视为同一题，展示时只保留最长的解析。
          // 这里在去重阶段把重复题里更长的解析“上提”到已保留的规范题上，
          // 不改动题库文件本身，仅影响内存中用于展示的对象。
          const canon = byId[seen[key]];
          if (canon && (q.explanation || '').length > (canon.explanation || '').length) {
            canon.explanation = q.explanation;
          }
          continue;
        }
        seen[key] = q.id;
        aliasToCanonical[q.id] = q.id;
        byId[q.id] = q;
        dedup[t].push(q);
      }
    }
    stats.totalUnique = TYPE_ORDER.reduce((s, t) => s + dedup[t].length, 0);
    loaded = true;
    return stats;
  }

  function isLoaded() { return loaded; }
  function getStats() { return stats; }

  function getAllQuestions() {
    return { single: dedup.single.slice(), multi: dedup.multi.slice(), tf: dedup.tf.slice(), fill: dedup.fill.slice() };
  }
  function getActiveQuestions() { // 排除已斩
    const out = { single: [], multi: [], tf: [], fill: [] };
    for (const t of TYPE_ORDER) out[t] = dedup[t].filter(q => !State.isBanned(q.id));
    return out;
  }
  function getCounts() { return Object.fromEntries(TYPE_ORDER.map(t => [t, dedup[t].length])); }
  function getActiveCounts() {
    const a = getActiveQuestions();
    return Object.fromEntries(TYPE_ORDER.map(t => [t, a[t].length]));
  }
  function findById(qid) {
    if (byId[qid]) return byId[qid];
    const canon = aliasToCanonical[qid];
    if (canon && byId[canon]) return byId[canon];
    return null;
  }
  // 把任意 id（可能来自旧版/其它设备）解析为当前规范 id；解析不到则原样返回
  function resolveId(qid) { return aliasToCanonical[qid] || qid; }

  return {
    load, isLoaded, getStats,
    getAllQuestions, getActiveQuestions, getCounts, getActiveCounts,
    findById, resolveId,
  };
})();
