"use strict";
/* ============================================================
 * state.js — 全局状态 + 用户数据操作
 * 用户痕迹：错题(wrongBook)、收藏(favs)、斩题(banned)、
 *           历史(history)、刷过的题(practiced)、设置(settings)、存档槽(slots)
 * ============================================================ */
window.State = (function () {
  const LS = CFG.LS;

  const defaultSettings = {
    includePracticed: true, // 随机刷题是否包含已刷过的题
  };

  const state = {
    view: 'home',
    booting: true,
    bootError: null,
    session: null,
    modal: null,

    wrongBook: Store.loadJSON(LS.WRONG, {}),
    favs:      Store.loadJSON(LS.FAVS, []),
    banned:    Store.loadJSON(LS.BANNED, {}),
    history:   Store.loadJSON(LS.HISTORY, []),
    practiced: Store.loadJSON(LS.PRACTICED, {}),
    settings:  Object.assign({}, defaultSettings, Store.loadJSON(LS.SETTINGS, {})),
    slots:     Store.loadJSON(LS.SLOTS, []),
  };

  /* ---------- 设置 ---------- */
  function setSetting(k, v) { state.settings[k] = v; Store.saveJSON(LS.SETTINGS, state.settings); }

  /* ---------- 错题本（做对保留，仅手动移除） ---------- */
  function recordWrong(qid, userAns) {
    const rec = state.wrongBook[qid] || { count: 0 };
    rec.count = (rec.count || 0) + 1;
    rec.lastWrong = new Date().toISOString();
    rec.lastUserAns = userAns;
    state.wrongBook[qid] = rec;
    Store.saveJSON(LS.WRONG, state.wrongBook);
  }
  function markWrongCorrect(qid) {
    const rec = state.wrongBook[qid];
    if (rec) {
      rec.lastCorrect = new Date().toISOString();
      rec.correctCount = (rec.correctCount || 0) + 1;
      Store.saveJSON(LS.WRONG, state.wrongBook);
    }
  }
  function removeWrong(qid) { if (state.wrongBook[qid]) { delete state.wrongBook[qid]; Store.saveJSON(LS.WRONG, state.wrongBook); } }
  function clearWrong() { state.wrongBook = {}; Store.saveJSON(LS.WRONG, state.wrongBook); }
  function wrongQids() {
    return Object.keys(state.wrongBook).sort((a, b) => (state.wrongBook[b].count || 0) - (state.wrongBook[a].count || 0));
  }

  /* ---------- 收藏（仅手动取消） ---------- */
  function isFav(qid) { return state.favs.includes(qid); }
  function toggleFav(qid) {
    const i = state.favs.indexOf(qid);
    if (i >= 0) state.favs.splice(i, 1); else state.favs.push(qid);
    Store.saveJSON(LS.FAVS, state.favs);
    return i < 0;
  }
  function clearFavs() { state.favs = []; Store.saveJSON(LS.FAVS, state.favs); }

  /* ---------- 斩题 ---------- */
  function isBanned(qid) { return !!state.banned[qid]; }
  function banQuestion(qid) { state.banned[qid] = { bannedAt: new Date().toISOString() }; Store.saveJSON(LS.BANNED, state.banned); }
  function unbanQuestion(qid) { if (state.banned[qid]) { delete state.banned[qid]; Store.saveJSON(LS.BANNED, state.banned); } }
  function clearBanned() { state.banned = {}; Store.saveJSON(LS.BANNED, state.banned); }
  function bannedQids() {
    return Object.keys(state.banned).sort((a, b) => (state.banned[b].bannedAt || '').localeCompare(state.banned[a].bannedAt || ''));
  }

  /* ---------- 刷过的题（practiced） ---------- */
  function recordPracticed(qid, correct) {
    const rec = state.practiced[qid] || { count: 0 };
    rec.count = (rec.count || 0) + 1;
    rec.lastAt = new Date().toISOString();
    rec.lastCorrect = !!correct;
    state.practiced[qid] = rec;
    Store.saveJSON(LS.PRACTICED, state.practiced);
  }
  function isPracticed(qid) { return !!state.practiced[qid]; }
  function clearPracticed() { state.practiced = {}; Store.saveJSON(LS.PRACTICED, state.practiced); }
  function practicedQids() {
    return Object.keys(state.practiced).sort((a, b) => (state.practiced[b].lastAt || '').localeCompare(state.practiced[a].lastAt || ''));
  }

  /* ---------- 历史 ---------- */
  function recordHistory(rec) {
    state.history.unshift(rec);
    if (state.history.length > 200) state.history = state.history.slice(0, 200);
    Store.saveJSON(LS.HISTORY, state.history);
  }
  function clearHistory(mode) {
    if (mode) state.history = state.history.filter(h => h.mode !== mode);
    else state.history = [];
    Store.saveJSON(LS.HISTORY, state.history);
  }

  /* ---------- 存档槽 ---------- */
  function saveSlots() { Store.saveJSON(LS.SLOTS, state.slots); }

  /* ---------- 断点续做（防止微信等内置浏览器意外关闭后丢失进度） ----------
   * 注意：会话对象在答题时会挂载临时 DOM 引用（_opts/_tfBtns/_fillInput 等），
   * 直接序列化整个 session 会因循环引用失败。这里只持久化“题目 id + 作答”，
   * 恢复时再用 Bank.findById 重新取回题目对象。
   */
  function saveResume() {
    const s = state.session;
    if (!s || !s.questions || !s.questions.length) { Store.remove(LS.RESUME); return; }
    const snap = {
      at: Date.now(),
      mode: s.mode, isExam: !!s.isExam, index: s.index || 0, startedAt: s.startedAt,
      items: s.questions.map((q, i) => ({ id: q.id, ans: s.answers[i] || null })),
    };
    Store.saveJSON(LS.RESUME, snap);
  }
  function clearResume() { Store.remove(LS.RESUME); }
  function loadResume() {
    const r = Store.loadJSON(LS.RESUME, null);
    if (!r || !r.items || !r.items.length) return null;
    if (Date.now() - (r.at || 0) > 12 * 3600 * 1000) { Store.remove(LS.RESUME); return null; }
    const Bank = window.Bank;
    const questions = [], answers = [];
    for (const it of r.items) {
      const q = (Bank && Bank.findById) ? Bank.findById(it.id) : null;
      if (!q) continue; // 题库已变动、找不到则跳过该题
      questions.push(q);
      answers.push(it.ans || null);
    }
    if (!questions.length) { Store.remove(LS.RESUME); return null; }
    const answered = answers.filter(a => a !== null).length;
    if (answered >= questions.length) { Store.remove(LS.RESUME); return null; } // 已答完则不恢复
    return {
      mode: r.mode, isExam: !!r.isExam, questions, answers,
      answered: false, index: Math.min(r.index || 0, questions.length - 1),
      startedAt: r.startedAt,
    };
  }

  return {
    state, setSetting,
    recordWrong, markWrongCorrect, removeWrong, clearWrong, wrongQids,
    isFav, toggleFav, clearFavs,
    isBanned, banQuestion, unbanQuestion, clearBanned, bannedQids,
    recordPracticed, isPracticed, clearPracticed, practicedQids,
    recordHistory, clearHistory,
    saveSlots,
    saveResume, clearResume, loadResume,
  };
})();
