"use strict";
/* ============================================================
 * util.js — 通用工具（DOM 构造、提示、随机、日期、文本归一）
 * ============================================================ */
window.U = (function () {
  const $ = sel => document.querySelector(sel);

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k.startsWith('on')) e.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x && e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x));
      else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function toast(msg, ms = 2000) {
    const t = el('div', { class: 'toast' }, msg);
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, ms);
  }

  function _removeOverlay(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }

  /* 自定义确认框：替代原生 confirm()（微信等内置浏览器常屏蔽原生弹窗，导致确认操作失效）。
   * 用法：U.confirm('确定删除？', () => {真正执行}, { danger:true, title, okText, onCancel }) */
  function confirm(message, onOk, opts) {
    opts = opts || {};
    const danger = opts.danger !== false; // 默认确定键为警示色
    const overlay = el('div', { class: 'dialog-overlay' });
    const cancelBtn = el('button', { class: 'btn' }, opts.cancelText || '取消');
    const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-bad' : 'btn-primary') }, opts.okText || '确定');
    cancelBtn.addEventListener('click', () => { _removeOverlay(overlay); if (opts.onCancel) opts.onCancel(); });
    okBtn.addEventListener('click', () => { _removeOverlay(overlay); if (onOk) onOk(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { _removeOverlay(overlay); if (opts.onCancel) opts.onCancel(); } });
    overlay.appendChild(el('div', { class: 'dialog' },
      el('div', { class: 'dialog-icon' }, opts.icon || (danger ? '⚠️' : '❓')),
      el('h3', {}, opts.title || '请确认'),
      el('div', { class: 'dialog-msg' }, message),
      el('div', { class: 'dialog-actions' }, cancelBtn, okBtn)));
    document.body.appendChild(overlay);
  }

  /* 自定义输入框：替代原生 prompt()。用法：U.prompt('标题', 默认值, (value)=>{...}, {placeholder}) */
  function prompt(message, defaultValue, onOk, opts) {
    opts = opts || {};
    const overlay = el('div', { class: 'dialog-overlay' });
    const input = el('input', {
      type: 'text', value: defaultValue || '', placeholder: opts.placeholder || '',
      style: 'width:100%;padding:11px 12px;border:1px solid var(--border-strong);border-radius:8px;background:var(--panel-2);color:var(--text);font-size:15px;box-sizing:border-box'
    });
    const cancelBtn = el('button', { class: 'btn' }, '取消');
    const okBtn = el('button', { class: 'btn btn-primary' }, opts.okText || '确定');
    cancelBtn.addEventListener('click', () => { _removeOverlay(overlay); if (opts.onCancel) opts.onCancel(); });
    okBtn.addEventListener('click', () => { const v = input.value; _removeOverlay(overlay); if (onOk) onOk(v); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { _removeOverlay(overlay); if (opts.onCancel) opts.onCancel(); } });
    overlay.appendChild(el('div', { class: 'dialog' },
      el('h3', {}, opts.title || '请输入'),
      message ? el('div', { class: 'dialog-msg' }, message) : null,
      input,
      el('div', { class: 'dialog-actions', style: 'margin-top:14px' }, cancelBtn, okBtn)));
    document.body.appendChild(overlay);
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);
  }

  function shuffle(arr) {
    arr = arr.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 题干归一化：用于去重 & 防重复导入（去空白/标点/全半角差异）
  function normText(s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[，。、；：（）()【】《》""''.,;:?!？！\-—_~·]/g, '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  }

  function topbar(title, opts = {}) {
    return el('div', { class: 'topbar' + (opts.exam ? ' exam-mode' : '') },
      opts.back ? el('button', { class: 'icon-btn', onclick: opts.back, 'aria-label': '返回' }, '←') : null,
      el('div', { class: 'title' }, title),
      ...(opts.actions || [])
    );
  }

  return { $, el, clear, toast, confirm, prompt, shuffle, sample, fmtDate, normText, topbar };
})();
