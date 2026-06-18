"use strict";
/* ============================================================
 * storage.js — localStorage 读写封装
 * ============================================================ */
window.Store = (function () {
  function loadJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); }
    catch (e) { U.toast('保存失败：本地存储已满'); }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  return { loadJSON, saveJSON, remove };
})();
