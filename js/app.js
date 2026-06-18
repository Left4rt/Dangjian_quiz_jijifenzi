"use strict";
/* ============================================================
 * app.js — 应用入口：路由分发 / 模态框分发 / 启动加载
 *   依赖顺序（见 index.html）：
 *     config → util → storage → state → bank → archive → quiz → views → app
 * ============================================================ */
window.App = (function () {
  const { el, clear } = U;
  const S = State.state;

  /* ---------------- 路由分发 ---------------- */
  function render() {
    const app = U.$('#app');
    clear(app);

    // 启动期：题库尚未加载完成，显示加载/错误屏
    if (S.booting) {
      renderBootScreen(app);
      window.scrollTo(0, 0);
      return;
    }

    switch (S.view) {
      case 'home':     Views.renderHome(app); break;
      case 'custom':   Views.renderCustom(app); break;
      case 'wrong':    Views.renderWrongBook(app); break;
      case 'favs':     Views.renderFavs(app); break;
      case 'banned':   Views.renderBanned(app); break;
      case 'practiced':Views.renderPracticed(app); break;
      case 'history':  Views.renderHistory(app); break;
      case 'settings': Views.renderSettings(app); break;
      case 'archive':  Views.renderArchive(app); break;
      case 'guide':    Views.renderGuide(app); break;
      case 'about':    Views.renderAbout(app); break;
      case 'quiz':     Quiz.renderQuiz(app); break;
      case 'summary':  Quiz.renderSummary(app); break;
      case 'review':   Quiz.renderReview(app); break;
      default:         Views.renderHome(app);
    }

    if (S.modal) renderModal();

    // 断点续做：仅在答题进行中持久化会话，离开答题即清除
    if (S.view === 'quiz' && S.session) State.saveResume();
    else State.clearResume();

    window.scrollTo(0, 0);
  }

  function go(view) {
    S.view = view;
    render();
    pushHistory(view);
  }

  /* ---------------- 模态框分发 ----------------
   * 底部抽屉：q-detail / navigator / import-archive / load-slot
   * 居中对话框：ban-confirm
   * 纯数据载体（不弹层）：__review__（由 review 视图直接读取 histRec）
   */
  function renderModal() {
    const oldM = U.$('#modal-overlay'); if (oldM) oldM.remove();
    const oldD = U.$('#dialog-overlay'); if (oldD) oldD.remove();
    if (!S.modal) return;

    const t = S.modal.type;
    if (t === '__review__') return; // 仅承载数据，不渲染浮层

    // 居中对话框（强操作二次确认）
    if (t === 'ban-confirm') {
      const inner = Quiz.buildBanConfirmDialog();
      if (!inner) return;
      const overlay = el('div', { id: 'dialog-overlay', class: 'dialog-overlay', onclick: (e) => {
        if (e.target === overlay) { S.modal = null; renderModal(); }
      } }, inner);
      document.body.appendChild(overlay);
      return;
    }

    // 底部抽屉
    let inner = null;
    if (t === 'q-detail')            inner = Views.buildQuestionDetailPanel();
    else if (t === 'navigator')      inner = Quiz.buildNavigatorPanel();
    else if (t === 'import-archive') inner = Views.buildImportArchivePanel();
    else if (t === 'load-slot')      inner = Views.buildLoadSlotPanel();
    if (!inner) return;

    const overlay = el('div', { id: 'modal-overlay', class: 'modal-overlay', onclick: (e) => {
      if (e.target === overlay) { S.modal = null; renderModal(); }
    } }, inner);
    document.body.appendChild(overlay);
  }

  /* ---------------- 启动加载屏 ---------------- */
  function renderBootScreen(app) {
    const main = el('main');
    if (S.bootError) {
      main.appendChild(el('div', { class: 'loader-screen' },
        el('div', { style: 'font-size:46px;margin-bottom:14px' }, '⚠️'),
        el('div', { style: 'font-size:17px;font-weight:700;color:var(--text)' }, '题库加载失败'),
        el('div', { class: 'err' }, S.bootError),
        el('div', { class: 'err', style: 'color:var(--text-muted)' },
          '若用 file:// 直接打开本文件，浏览器会因安全策略（CORS）禁止读取本地 JSON。'
          + '请将整个文件夹部署到 GitHub Pages，或在本地启动一个静态服务器后访问。'),
        el('div', { class: 'code-output', style: 'margin-top:14px;text-align:left' },
          'cd 项目目录\npython3 -m http.server 8000\n# 然后浏览器打开 http://localhost:8000/'),
        el('button', { class: 'btn btn-primary', style: 'margin-top:18px;max-width:240px', onclick: () => boot() }, '🔄 重试加载')
      ));
    } else {
      main.appendChild(el('div', { class: 'loader-screen' },
        el('div', { class: 'spinner' }),
        el('div', { style: 'font-size:15px' }, '正在加载题库…')
      ));
    }
    app.appendChild(main);
  }

  /* ---------------- 启动流程 ---------------- */
  async function boot() {
    S.booting = true;
    S.bootError = null;
    render();
    try {
      await Bank.load();
      S.booting = false;
      S.bootError = null;
      // 尝试恢复上次未完成的答题（应对微信等环境意外关闭）
      let resumed = false;
      try {
        const sess = State.loadResume();
        if (sess) { S.session = sess; S.view = 'quiz'; resumed = true; }
      } catch (e) { S.session = null; }
      if (!resumed) S.view = 'home';
      render();
      replaceHistory(S.view); // 让首条历史记录与实际起始视图一致
      if (resumed) U.toast('已恢复上次未完成的练习', 2600);
    } catch (e) {
      S.booting = true;
      S.bootError = (e && e.message) ? e.message : String(e);
      render();
    }
  }

  /* ---------------- 浏览器返回 / 前进键支持 ----------------
   * 采用“每个视图各占一条历史记录”的方式（与常见单页应用一致）：
   *   - 每次 go(view) 都 pushState({view}, '', '#view')，历史栈随浏览深度增长；
   *   - 浏览器返回/前进键触发 popstate，读取 e.state.view 切换到对应视图，
   *     于是返回键就是“回到上一个页面”，而不是直接退出程序；
   *   - 若有浮层（抽屉/对话框）打开，返回键先关闭浮层并把当前视图压回；
   *   - 答题进行中若已作答，返回前二次确认，避免误退丢失进度。
   */
  let histInstalled = false;

  function pushHistory(view) {
    try { history.pushState({ view: view }, '', '#' + view); } catch (e) {}
  }
  function replaceHistory(view) {
    try { history.replaceState({ view: view }, '', '#' + view); } catch (e) {}
  }

  function onPopState(e) {
    // 1) 有浮层 → 先关浮层，并把当前视图压回（本次返回用于关闭浮层）
    if (S.modal && S.modal.type !== '__review__') {
      S.modal = null; renderModal();
      pushHistory(S.view);
      return;
    }
    const target = (e && e.state && e.state.view) ? e.state.view : 'home';

    // 2) 答题进行中且已作答 → 自定义二次确认；先把 quiz 压回保持停留，确认后再离开
    if (S.view === 'quiz' && S.session) {
      const answered = (S.session.answers || []).filter(a => a !== null).length;
      if (answered > 0) {
        pushHistory('quiz'); // 先留在原页，避免历史栈错位
        const msg = S.session.isExam
          ? '考试进度（已答 ' + answered + ' 题）将不被保存。确定中途退出？'
          : '当前进度将不被保存（错题/收藏/刷题记录已保存）。确定退出？';
        U.confirm(msg, () => {
          S.session = null; S.modal = null;
          if (target !== 'quiz' && target !== 'summary' && target !== 'review') S.session = null;
          S.view = (target === 'quiz') ? 'home' : target;
          render();
        }, { title: '退出练习', okText: '退出' });
        return;
      }
      S.session = null;
    }

    // 3) 切换到目标视图（不再压栈）
    S.modal = null;
    if (target !== 'quiz' && target !== 'summary' && target !== 'review') S.session = null;
    S.view = target;
    render();
  }

  function installHistory() {
    if (histInstalled) return;
    histInstalled = true;
    replaceHistory(S.view || 'home');
    try { window.addEventListener('popstate', onPopState); } catch (e) {}
  }

  /* ---------------- 触摸优化（防误触缩放/双击放大） ---------------- */
  function installTouchGuards() {
    document.addEventListener('touchmove', function (e) {
      if (S.modal && e.target && !e.target.closest('.modal') && !e.target.closest('.dialog')) {
        e.preventDefault();
      }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, false);
  }

  installTouchGuards();
  installHistory();

  return { render, go, renderModal, boot };
})();

// 启动
App.boot();
