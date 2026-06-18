"use strict";
/* ============================================================
 * views.js — 页面视图（主页、错题、收藏、斩题、刷题记录、历史、
 *            自定义抽题、设置、存档、出题指南、关于）+ 弹层
 * ============================================================ */
window.Views = (function () {
  const { el, clear, toast } = U;
  const S = State.state;
  const TYPE_ORDER = CFG.TYPE_ORDER, TYPE_NAMES = CFG.TYPE_NAMES;

  /* ================= 主页 ================= */
  function renderHome(app) {
    app.appendChild(U.topbar('★ 党建理论刷题', {
      actions: [
        el('button', { class: 'icon-btn', onclick: () => App.go('settings'), 'aria-label': '设置' }, '⚙'),
        el('button', { class: 'icon-btn', onclick: () => App.go('about'), 'aria-label': '关于' }, 'ⓘ'),
      ]
    }));
    const main = el('main');

    main.appendChild(el('div', { class: 'stage-banner' }, `当前阶段：${CFG.STAGE}`));
    main.appendChild(el('div', { class: 'page-title' }, '欢迎使用'));
    main.appendChild(el('div', { class: 'page-sub' }, '选择练习模式开始'));

    main.appendChild(el('div', { class: 'mode-card normal', onclick: () => App.go('custom') },
      el('div', { class: 'ico' }, '📖'),
      el('div', { class: 'info' }, el('div', { class: 'ttl' }, '模拟刷题'), el('div', { class: 'desc' }, '选答即判，立即看答案与解析，错题自动入错题本')),
      el('div', { class: 'arrow' }, '›')));
    main.appendChild(el('div', { class: 'mode-card exam', onclick: () => Quiz.startExam() },
      el('div', { class: 'ico' }, '📝'),
      el('div', { class: 'info' }, el('div', { class: 'ttl' }, '真实考试'), el('div', { class: 'desc' }, '100 题模拟真考，提交后才显示成绩与答案')),
      el('div', { class: 'arrow' }, '›')));

    // 存档同步（醒目独立入口）
    main.appendChild(el('div', { class: 'mode-card archive-card', onclick: () => App.go('archive') },
      el('div', { class: 'ico' }, '💾'),
      el('div', { class: 'info' }, el('div', { class: 'ttl' }, '存档同步'), el('div', { class: 'desc' }, '换设备时一键生成 / 导入存档码，同步全部刷题进度')),
      el('div', { class: 'arrow' }, '›')));

    // 题库概况
    const counts = Bank.getCounts(), activeCounts = Bank.getActiveCounts();
    const total = TYPE_ORDER.reduce((s, t) => s + counts[t], 0);
    const activeTotal = TYPE_ORDER.reduce((s, t) => s + activeCounts[t], 0);
    const banned = total - activeTotal;
    const st = Bank.getStats();
    const statCard = el('div', { class: 'card' }, el('h3', {}, '题库概况'),
      ...TYPE_ORDER.map(t => el('div', { class: 'stat-row' }, el('span', {}, TYPE_NAMES[t]), el('span', { class: 'v' }, banned > 0 ? `${activeCounts[t]} / ${counts[t]}` : `${counts[t]} 题`))),
      el('div', { class: 'stat-row stat-total' }, el('span', {}, '合计'), el('span', { class: 'v' }, banned > 0 ? `${activeTotal} / ${total} 题` : `${total} 题`)),
      st.duplicates > 0 ? el('div', { style: 'margin-top:6px;font-size:12px;color:var(--text-faded);text-align:right' }, `（自动去重 ${st.duplicates} 题）`) : null,
      banned > 0 ? el('div', { style: 'margin-top:2px;font-size:12px;color:var(--text-faded);text-align:right' }, `（已斩 ${banned} 题不参与抽题）`) : null,
      total === 0 ? el('div', { style: 'margin-top:8px;font-size:13px;color:var(--text-muted);line-height:1.6' }, '题库待添加：请在 bank/ 文件夹放入题库文件并在 manifest.json 登记后即可练习（详见“如何新增题目”）。') : null);
    main.appendChild(statCard);

    // 我的数据
    const wn = State.wrongQids().length, fn = S.favs.length, bn = State.bannedQids().length, pn = State.practicedQids().length, hn = S.history.length;
    const dataRow = el('div', { class: 'card' }, el('h3', {}, '我的数据'));
    const items = [
      { icon: '📝', label: '错题本', count: wn, color: 'var(--bad)', view: 'wrong' },
      { icon: '⭐', label: '收藏夹', count: fn, color: 'var(--gold-dark)', view: 'favs' },
      { icon: '🚫', label: '斩题库', count: bn, color: 'var(--ban)', view: 'banned' },
      { icon: '🔖', label: '刷题记录', count: pn, color: 'var(--gold-dark)', view: 'practiced' },
      { icon: '📈', label: '答题历史', count: hn, color: 'var(--primary)', view: 'history' },
      { icon: '💾', label: '存档同步', count: S.slots.length, color: 'var(--ok)', view: 'archive' },
    ];
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px' });
    items.forEach(it => grid.appendChild(el('div', { class: 'data-cell', onclick: () => App.go(it.view) },
      el('div', { class: 'ico' }, it.icon), el('div', { class: 'num', style: `color:${it.color}` }, String(it.count)), el('div', { class: 'lab' }, it.label))));
    dataRow.appendChild(grid);
    main.appendChild(dataRow);

    if (wn > 0) main.appendChild(el('button', { class: 'btn btn-outline-bad', onclick: () => Quiz.startSession('wrong') }, `🔄 重做错题（${wn}）`));
    if (fn > 0) main.appendChild(el('button', { class: 'btn btn-outline-star', onclick: () => Quiz.startSession('fav') }, `🔁 重做收藏（${fn}）`));

    main.appendChild(el('div', { class: 'help' },
      el('strong', {}, '💡 使用说明'),
      el('ul', {},
        el('li', {}, '模拟刷题：可自定义题型与数量，选答即时判分并显示答案解析，答错自动收入“错题本”'),
        el('li', {}, '真实考试：100 题模拟真考，提交后统一显示成绩与解析，适合检验复习效果'),
        el('li', {}, '答题中点击 ⭐ 收藏重点题、点击 🚫 把不想再做的题“斩”掉（不再抽到）'),
        el('li', {}, '“错题本 / 收藏夹”可随时一键重做；“刷题记录”可在设置里选择是否再次抽到已刷过的题'),
        el('li', {}, '换手机或换浏览器后进度不会自动同步，用首页“存档同步”生成存档码、在新设备导入即可'))));
    app.appendChild(main);
  }

  /* ================= 自定义抽题 ================= */
  function renderCustom(app) {
    app.appendChild(U.topbar('开始模拟刷题', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '设置抽题数量'));
    main.appendChild(el('div', { class: 'page-sub' }, S.settings.includePracticed ? '默认 100 题（40+20+20+20）' : '已关闭“包含刷过的题”，仅从未刷题中抽'));
    // 可用数：根据 includePracticed 决定
    const pool = (function () {
      const a = Bank.getActiveQuestions();
      if (S.settings.includePracticed) return a;
      const o = { single: [], multi: [], tf: [], fill: [] };
      for (const t of TYPE_ORDER) o[t] = a[t].filter(q => !State.isPracticed(q.id));
      return o;
    })();
    const counts = Object.fromEntries(TYPE_ORDER.map(t => [t, pool[t].length]));
    const quota = Object.assign({}, CFG.DEFAULT_QUOTA);
    for (const t of TYPE_ORDER) quota[t] = Math.min(quota[t], counts[t]);
    const card = el('div', { class: 'card' });
    TYPE_ORDER.forEach(t => {
      const f = el('div', { class: 'field' });
      f.appendChild(el('label', {}, `${TYPE_NAMES[t]}（可用 ${counts[t]}）`));
      const stepper = el('div', { class: 'stepper' });
      const input = el('input', { type: 'text', inputmode: 'numeric', value: String(quota[t]) });
      const minus = el('button', { onclick: () => { let v = (parseInt(input.value) || 0) - 1; v = Math.max(0, v); input.value = v; quota[t] = v; } }, '−');
      const plus = el('button', { onclick: () => { let v = (parseInt(input.value) || 0) + 1; v = Math.min(counts[t], v); input.value = v; quota[t] = v; } }, '+');
      input.addEventListener('input', () => { let v = parseInt(input.value) || 0; v = Math.max(0, Math.min(counts[t], v)); quota[t] = v; });
      input.addEventListener('blur', () => { input.value = String(quota[t]); });
      stepper.append(minus, input, plus); f.appendChild(stepper); card.appendChild(f);
    });
    main.appendChild(card);
    main.appendChild(el('button', { class: 'btn btn-primary', onclick: () => { if (Object.values(quota).every(v => v === 0)) { toast('至少抽取 1 道题'); return; } Quiz.startSession('normal', quota); } }, '📖 开始模拟刷题'));
    main.appendChild(el('button', { class: 'btn', onclick: () => App.go('home') }, '取消'));
    app.appendChild(main);
  }

  /* ================= 错题本 ================= */
  function renderWrongBook(app) {
    app.appendChild(U.topbar('错题本', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '📝 错题本'));
    const ids = State.wrongQids();
    if (!ids.length) { main.appendChild(el('div', { class: 'list-empty' }, el('div', { class: 'icon' }, '🎉'), el('div', {}, '暂无错题，继续保持！'))); app.appendChild(main); return; }
    main.appendChild(el('div', { class: 'page-sub' }, `共 ${ids.length} 道错题，做对后仍保留，需手动移除`));
    main.appendChild(el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => Quiz.startSession('wrong'), style: 'flex:1' }, '🔄 全部重做'),
      el('button', { class: 'btn btn-outline-bad btn-sm', onclick: () => { U.confirm(`确定清空所有 ${ids.length} 道错题？不可恢复。`, () => { State.clearWrong(); toast('已清空错题本'); App.render(); }); }, style: 'flex:1' }, '🗑 清空')));
    ids.forEach(qid => {
      const q = Bank.findById(qid); if (!q) return;
      const rec = S.wrongBook[qid], hasC = rec.correctCount && rec.correctCount > 0;
      main.appendChild(el('div', { class: 'q-item', onclick: () => showQuestionDetail(qid, 'wrong') },
        el('div', { class: 'meta' }, el('span', { class: 'qtype-mini' }, TYPE_NAMES[q.type]),
          el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
            State.isFav(qid) ? el('span', { style: 'color:var(--gold)' }, '★') : null,
            hasC ? el('span', { class: 'badge-ok' }, `已订正 ${rec.correctCount}`) : null,
            el('span', { class: 'badge-bad' }, `错 ${rec.count} 次`))),
        el('div', { class: 'text' }, q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question)));
    });
    app.appendChild(main);
  }

  /* ================= 收藏夹 ================= */
  function renderFavs(app) {
    app.appendChild(U.topbar('收藏夹', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '⭐ 收藏夹'));
    const ids = S.favs.slice();
    if (!ids.length) { main.appendChild(el('div', { class: 'list-empty' }, el('div', { class: 'icon' }, '⭐'), el('div', {}, '暂无收藏题目'), el('div', { style: 'font-size:13px;margin-top:8px;color:var(--text-faded)' }, '答题时点击右上角 ☆ 即可收藏'))); app.appendChild(main); return; }
    main.appendChild(el('div', { class: 'page-sub' }, `共 ${ids.length} 道，做对后仍保留，需手动取消`));
    main.appendChild(el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
      el('button', { class: 'btn btn-outline-star btn-sm', onclick: () => Quiz.startSession('fav'), style: 'flex:1' }, '🔁 全部重做'),
      el('button', { class: 'btn btn-outline-bad btn-sm', onclick: () => { U.confirm(`确定清空所有 ${ids.length} 道收藏？`, () => { State.clearFavs(); toast('已清空收藏夹'); App.render(); }); }, style: 'flex:1' }, '🗑 清空')));
    ids.forEach(qid => {
      const q = Bank.findById(qid); if (!q) return;
      main.appendChild(el('div', { class: 'q-item', onclick: () => showQuestionDetail(qid, 'fav') },
        el('div', { class: 'meta' }, el('span', { class: 'qtype-mini' }, TYPE_NAMES[q.type]),
          el('div', { style: 'display:flex;gap:6px;align-items:center' }, S.wrongBook[qid] ? el('span', { class: 'badge-bad' }, `错 ${S.wrongBook[qid].count} 次`) : null, el('span', { style: 'color:var(--gold);font-size:16px' }, '★'))),
        el('div', { class: 'text' }, q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question)));
    });
    app.appendChild(main);
  }

  /* ================= 斩题库 ================= */
  function renderBanned(app) {
    app.appendChild(U.topbar('斩题库', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '🚫 斩题库'));
    const ids = State.bannedQids();
    if (!ids.length) { main.appendChild(el('div', { class: 'list-empty' }, el('div', { class: 'icon' }, '🚫'), el('div', {}, '暂无已斩题目'), el('div', { style: 'font-size:13px;margin-top:8px;color:var(--text-faded)' }, '答题时点击右上角 🚫 可斩掉过于简单的题'))); app.appendChild(main); return; }
    main.appendChild(el('div', { class: 'page-sub' }, `共 ${ids.length} 道已斩题目，不会出现在随机抽题中`));
    main.appendChild(el('div', { class: 'confirm-banner' }, '点击题目查看详情；在详情中可“撤销斩题”使其重新参与抽题。'));
    main.appendChild(el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
      el('button', { class: 'btn btn-outline-ban btn-sm', onclick: () => { U.confirm(`确定撤销所有 ${ids.length} 道已斩题目？`, () => { State.clearBanned(); toast('已全部撤销斩题'); App.render(); }); }, style: 'flex:1' }, '↩️ 全部撤销')));
    ids.forEach(qid => {
      const q = Bank.findById(qid); if (!q) return; const rec = S.banned[qid];
      main.appendChild(el('div', { class: 'q-item', onclick: () => showQuestionDetail(qid, 'banned') },
        el('div', { class: 'meta' }, el('span', { class: 'qtype-mini' }, TYPE_NAMES[q.type]),
          el('div', { style: 'display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-faded)' }, el('span', { class: 'badge-ban' }, '🚫 已斩'), rec.bannedAt ? el('span', {}, U.fmtDate(rec.bannedAt)) : null)),
        el('div', { class: 'text' }, q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question)));
    });
    app.appendChild(main);
  }

  /* ================= 刷题记录 ================= */
  function renderPracticed(app) {
    app.appendChild(U.topbar('刷题记录', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '🔖 刷题记录'));
    const ids = State.practicedQids();
    if (!ids.length) { main.appendChild(el('div', { class: 'list-empty' }, el('div', { class: 'icon' }, '🔖'), el('div', {}, '暂无刷题记录'))); app.appendChild(main); return; }
    main.appendChild(el('div', { class: 'page-sub' }, `已刷过 ${ids.length} 道题`));
    main.appendChild(el('div', { class: 'switch-row', style: 'background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:14px' },
      el('div', {}, el('div', { class: 'sw-label' }, '随机刷题包含已刷过的题'), el('div', { class: 'sw-desc' }, '关闭后随机/考试只抽未刷过的题')),
      buildSwitch(S.settings.includePracticed, on => { State.setSetting('includePracticed', on); toast(on ? '已包含刷过的题' : '已排除刷过的题', 1200); })));
    main.appendChild(el('div', { class: 'btn-row', style: 'margin-bottom:14px' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => Quiz.startSession('practiced'), style: 'flex:1' }, '🔁 重做刷过的题'),
      el('button', { class: 'btn btn-outline-bad btn-sm', onclick: () => { U.confirm(`确定清除全部 ${ids.length} 条刷题记录？清除后这些题会重新被视为“未刷”。`, () => { State.clearPracticed(); toast('已清除刷题记录'); App.render(); }); }, style: 'flex:1' }, '🗑 清除记录')));
    ids.slice(0, 300).forEach(qid => {
      const q = Bank.findById(qid); if (!q) return; const rec = S.practiced[qid];
      main.appendChild(el('div', { class: 'q-item', onclick: () => showQuestionDetail(qid, 'practiced') },
        el('div', { class: 'meta' }, el('span', { class: 'qtype-mini' }, TYPE_NAMES[q.type]),
          el('div', { style: 'display:flex;gap:6px;align-items:center' },
            el('span', { class: rec.lastCorrect ? 'badge-ok' : 'badge-bad' }, rec.lastCorrect ? '上次对' : '上次错'),
            el('span', { class: 'badge-practiced' }, `刷 ${rec.count} 次`))),
        el('div', { class: 'text' }, q.question.length > 80 ? q.question.slice(0, 80) + '…' : q.question)));
    });
    if (ids.length > 300) main.appendChild(el('div', { style: 'text-align:center;color:var(--text-faded);font-size:12px;padding:8px' }, `仅显示最近 300 条（共 ${ids.length} 条）`));
    app.appendChild(main);
  }

  /* ================= 历史 ================= */
  let historyTab = 'normal';
  function renderHistory(app) {
    app.appendChild(U.topbar('答题历史', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '📈 答题历史'));
    const tabs = el('div', { class: 'history-tabs' });
    ['normal', 'exam'].forEach(m => tabs.appendChild(el('button', { class: historyTab === m ? 'active' + (m === 'exam' ? ' exam-tab' : '') : '', onclick: () => { historyTab = m; App.render(); } }, m === 'normal' ? '📖 模拟刷题' : '📝 真实考试')));
    main.appendChild(tabs);
    const records = S.history.filter(h => h.mode === historyTab);
    if (!records.length) { main.appendChild(el('div', { class: 'list-empty' }, el('div', { class: 'icon' }, historyTab === 'exam' ? '📝' : '📖'), el('div', {}, '暂无' + (historyTab === 'exam' ? '考试' : '刷题') + '记录'))); app.appendChild(main); return; }
    const avg = records.reduce((s, r) => s + r.pct, 0) / records.length, best = Math.max(...records.map(r => r.pct));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, '统计'), el('div', { style: 'display:flex;justify-content:space-around;text-align:center' },
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--primary)' }, String(records.length)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '次数')),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--primary)' }, `${avg.toFixed(0)}%`), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '平均分')),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--ok)' }, `${best.toFixed(0)}%`), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '最高分')))));
    records.forEach(rec => {
      const realIdx = S.history.indexOf(rec), cls = rec.pct >= 80 ? 'high' : (rec.pct >= 60 ? 'mid' : 'low');
      const sub = rec.mode === 'exam' ? '真实考试模式' : (rec.submode === 'wrong' ? '错题重做' : rec.submode === 'fav' ? '收藏重做' : rec.submode === 'practiced' ? '刷题记录重做' : '模拟刷题');
      main.appendChild(el('div', { class: 'history-item', onclick: () => showHistoryDetail(realIdx) },
        el('div', { class: 'pct-badge ' + cls }, `${rec.pct.toFixed(0)}%`),
        el('div', { class: 'info' }, el('div', { class: 'top' }, `${rec.ok}/${rec.total} 题`, rec.mode === 'exam' ? el('span', { class: 'exam-mark' }, '考试') : null), el('div', { class: 'sub' }, `${sub}　·　${U.fmtDate(rec.finishedAt)}`))));
    });
    main.appendChild(el('button', { class: 'btn btn-outline-bad', style: 'margin-top:14px', onclick: () => { U.confirm(`确定清空所有${historyTab === 'exam' ? '考试' : '刷题'}记录？`, () => { State.clearHistory(historyTab); toast('已清空记录'); App.render(); }); } }, `清空${historyTab === 'exam' ? '考试' : '刷题'}记录`));
    app.appendChild(main);
  }
  function showHistoryDetail(idx) { const rec = S.history[idx]; if (!rec) return; S.modal = { type: '__review__', histRec: rec }; App.go('review'); }

  /* ================= 设置 ================= */
  function buildSwitch(on, onToggle) {
    const sw = el('div', { class: 'switch' + (on ? ' on' : '') });
    sw.addEventListener('click', () => { on = !on; sw.classList.toggle('on', on); onToggle(on); });
    return sw;
  }
  function renderSettings(app) {
    app.appendChild(U.topbar('设置', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '⚙ 设置'));
    const card = el('div', { class: 'card' }, el('h3', {}, '刷题偏好'));
    card.appendChild(el('div', { class: 'switch-row' },
      el('div', {}, el('div', { class: 'sw-label' }, '随机刷题包含已刷过的题'), el('div', { class: 'sw-desc' }, '关闭后，随机抽题与真实考试只抽未刷过的题')),
      buildSwitch(S.settings.includePracticed, on => { State.setSetting('includePracticed', on); toast(on ? '已开启' : '已关闭', 1000); })));
    main.appendChild(card);

    main.appendChild(el('div', { class: 'card' }, el('h3', {}, '数据'),
      el('button', { class: 'btn btn-sm', style: 'width:100%;margin-bottom:8px', onclick: () => App.go('archive') }, '💾 存档同步（导出 / 导入）'),
      el('button', { class: 'btn btn-sm', style: 'width:100%', onclick: () => App.go('guide') }, '📦 如何新增题目（出题指南）')));

    main.appendChild(el('div', { class: 'card' }, el('h3', {}, '重置'),
      el('div', { class: 'about-text', style: 'margin-bottom:10px' }, el('p', {}, '清除本机全部痕迹：错题、收藏、斩题、刷题记录、历史、存档槽与设置。题库本身不受影响。')),
      el('button', { class: 'btn btn-outline-bad', onclick: () => {
        U.confirm('确定清空本机所有数据？此操作不可恢复！建议先到“存档同步”导出备份。', () => {
          Object.values(CFG.LS).forEach(Store.remove);
          S.wrongBook = {}; S.favs = []; S.banned = {}; S.history = []; S.practiced = {}; S.slots = [];
          S.settings = { includePracticed: true };
          toast('已重置全部数据'); App.go('home');
        });
      } }, '清空全部数据')));
    app.appendChild(main);
  }

  /* ================= 存档同步 ================= */
  function renderArchive(app) {
    app.appendChild(U.topbar('存档同步', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '💾 存档同步'));
    main.appendChild(el('div', { class: 'page-sub' }, '此功能主要用于跨设备同步刷题进度：在本设备点击下方“生成存档码”，再到另一台设备“导入存档码”即可' + (Archive.canGzip ? '' : '（当前环境不支持压缩，存档码会偏长）')));

    // 当前进度概况
    const cur = Archive.preview(Archive.buildArchive());
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, '当前进度'),
      ...[['错题', cur.wrong], ['收藏', cur.favs], ['斩题', cur.banned], ['刷题记录', cur.practiced], ['历史', cur.history]].map(([k, v]) =>
        el('div', { class: 'stat-row' }, el('span', {}, k), el('span', { class: 'v' }, `${v}`)))));

    // 导出
    const exportCard = el('div', { class: 'card' }, el('h3', {}, '导出当前进度为字符串'));
    const ta = el('textarea', { class: 'code-output', readonly: 'readonly', placeholder: '点击下方“生成存档码”', rows: '5' });
    exportCard.appendChild(ta);
    exportCard.appendChild(el('div', { class: 'btn-row', style: 'margin-top:10px' },
      el('button', { class: 'btn btn-primary btn-sm', style: 'flex:1', onclick: async () => { ta.value = '生成中…'; try { ta.value = await Archive.encode(Archive.buildArchive()); toast('已生成，可复制'); } catch (e) { ta.value = ''; toast('生成失败：' + e.message); } } }, '🧬 生成存档码'),
      el('button', { class: 'btn btn-sm', style: 'flex:1', onclick: () => { if (!ta.value || ta.value === '生成中…') { toast('请先生成'); return; } ta.select(); try { navigator.clipboard.writeText(ta.value); toast('已复制到剪贴板'); } catch (e) { document.execCommand && document.execCommand('copy'); toast('已选中，请手动复制'); } } }, '📋 复制')));
    main.appendChild(exportCard);

    // 导入
    const importCard = el('div', { class: 'card' }, el('h3', {}, '导入存档码'));
    const inTa = el('textarea', { class: 'code-output', placeholder: '在此粘贴存档码（DJZ1: 或 DJB1: 开头）', rows: '5' });
    importCard.appendChild(inTa);
    importCard.appendChild(el('button', { class: 'btn btn-primary', style: 'margin-top:10px', onclick: async () => {
      const str = inTa.value.trim(); if (!str) { toast('请粘贴存档码'); return; }
      let obj; try { obj = await Archive.decode(str); Archive.preview(obj); } catch (e) { toast('解析失败：' + e.message, 3000); return; }
      S.modal = { type: 'import-archive', obj }; App.renderModal();
    } }, '🔍 识别并预览'));
    main.appendChild(importCard);

    // 存档槽管理
    const slotCard = el('div', { class: 'card' }, el('h3', {}, '本机存档槽'));
    slotCard.appendChild(el('button', { class: 'btn btn-sm', style: 'width:100%;margin-bottom:10px', onclick: () => {
      U.prompt('为当前进度的存档命名：', '存档 ' + U.fmtDate(new Date().toISOString()), (name) => {
        Archive.saveCurrentAsSlot((name || '').trim() || undefined); toast('已保存为存档槽'); App.render();
      });
    } }, '➕ 保存当前进度为新存档'));
    if (!S.slots.length) slotCard.appendChild(el('div', { style: 'color:var(--text-faded);font-size:13px;text-align:center;padding:10px' }, '暂无存档槽'));
    S.slots.forEach(slot => {
      const pv = Archive.preview(slot.archive);
      slotCard.appendChild(el('div', { class: 'slot-item' },
        el('div', { class: 'slot-top' }, el('div', { class: 'slot-name' }, slot.name), el('div', { class: 'slot-meta' }, U.fmtDate(slot.createdAt))),
        el('div', { class: 'slot-meta' }, `错题 ${pv.wrong}・收藏 ${pv.favs}・斩题 ${pv.banned}・刷题 ${pv.practiced}・历史 ${pv.history}`),
        el('div', { class: 'slot-actions' },
          el('button', { class: 'btn btn-sm btn-outline-primary', onclick: () => { S.modal = { type: 'load-slot', slotId: slot.id }; App.renderModal(); } }, '载入'),
          el('button', { class: 'btn btn-sm', onclick: async () => { const code = await Archive.encode(slot.archive); if (navigator.clipboard) { navigator.clipboard.writeText(code).then(() => toast('该存档码已复制')).catch(() => U.prompt('复制存档码：', code, null)); } else { U.prompt('复制存档码：', code, null); } } }, '导出'),
          el('button', { class: 'btn btn-sm', onclick: () => { U.prompt('重命名：', slot.name, (n) => { Archive.renameSlot(slot.id, (n || '').trim() || slot.name); App.render(); }); } }, '改名'),
          el('button', { class: 'btn btn-sm btn-outline-bad', onclick: () => { U.confirm('删除该存档槽？', () => { Archive.deleteSlot(slot.id); toast('已删除'); App.render(); }); } }, '删除'))));
    });
    main.appendChild(slotCard);
    app.appendChild(main);
  }

  /* ================= 出题指南 ================= */
  function renderGuide(app) {
    app.appendChild(U.topbar('出题指南', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, '📦 如何新增题目'));
    main.appendChild(el('div', { class: 'page-sub' }, '把题目整理成 JSON 放进 bank 文件夹并登记到 manifest.json 即可'));

    main.appendChild(el('div', { class: 'help', style: 'border-left:4px solid var(--primary)' },
      el('strong', {}, '⚙️ 本页面向开发者 / 题库维护者'),
      el('div', { style: 'margin-top:4px;font-size:13px;line-height:1.7;color:var(--text-muted)' },
        '本页介绍如何在项目源码中新增、维护题库，涉及 JSON 文件与部署操作，主要供搭建和维护本程序的开发者阅读。普通刷题用户无需进行任何设置，可直接返回首页开始练习。')));

    const s1 = el('div', { class: 'guide-section' }, el('h4', {}, '步骤一：新建题库 JSON 文件'));
    s1.appendChild(el('div', { class: 'about-text' }, el('p', {}, '在 bank/ 文件夹下新建 setN.json（如 set4.json）。文件结构如下：')));
    s1.appendChild(el('div', { class: 'code-block' },
`{
  "id": "set4",
  "title": "我的新题库",
  "questions": {
    "single": [
      { "question": "题干（  ）", "options": {"A":"…","B":"…","C":"…","D":"…"},
        "answer": "A", "explanation": "讲清知识点并辨析相似干扰项" }
    ],
    "multi": [ { "question":"…","options":{…},"answer":"ABCD","explanation":"…" } ],
    "tf":    [ { "question":"…","answer":"正确","explanation":"点明正确/错误依据" } ],
    "fill":  [ { "question":"…","answer":"答案","aliases":["别名"],"explanation":"…" } ]
  }
}`));
    main.appendChild(s1);

    const s2 = el('div', { class: 'guide-section' }, el('h4', {}, '步骤二：登记到 manifest.json'));
    s2.appendChild(el('div', { class: 'code-block' },
`{
  "schemaVersion": 1,
  "updatedAt": "2026-06-14",
  "banks": [
    { "id":"set1", "file":"set1.json", "title":"模拟题1", "enabled": true },
    { "id":"set4", "file":"set4.json", "title":"我的新题库", "enabled": true }
  ]
}`));
    main.appendChild(s2);

    const s3 = el('div', { class: 'guide-section' }, el('h4', {}, '关键规则'));
    s3.appendChild(el('div', { class: 'help' }, el('ul', {},
      el('li', {}, 'answer：单选填字母如 "A"；多选连写如 "ABCD"；判断填 "正确"/"错误"；填空填答案文本'),
      el('li', {}, 'explanation：建议每题都写，讲清知识点并辨析易混的相似概念'),
      el('li', {}, 'id 可省略：程序会按“题库id__题型__序号”自动生成稳定 ID'),
      el('li', {}, '题干完全相同的题会在刷题时自动去重（保留首个）'),
      el('li', {}, '只新增、不改旧题；改旧题序号会影响自动 ID'),
      el('li', {}, '上传到 GitHub Pages 后，刷新即可自动加载新题'))));
    main.appendChild(s3);

    main.appendChild(el('div', { class: 'card' }, el('h3', {}, '让 AI 帮你转换'),
      el('div', { class: 'about-text' }, el('p', {}, 'bank/HOW_TO_ADD_QUESTIONS.md 是一份可直接交给 AI 的说明（Skill）。把原始题目和该文件一起发给 AI，它会按规则产出可用的 setN.json。'))));
    app.appendChild(main);
  }

  /* ================= 关于 ================= */
  function renderAbout(app) {
    app.appendChild(U.topbar('关于', { back: () => App.go('home') }));
    const main = el('main');
    main.appendChild(el('div', { class: 'page-title' }, `党建理论刷题 ${CFG.APP_VERSION}`));
    main.appendChild(el('div', { class: 'page-sub' }, `${CFG.STAGE}阶段 · 题库与程序分离 · GitHub Pages 静态部署 · 离线可用`));
    const st = Bank.getStats();
    const bankCard = el('div', { class: 'card' }, el('h3', {}, '已加载题库'));
    st.banks.forEach(b => bankCard.appendChild(el('div', { class: 'stat-row' }, el('span', {}, b.title || b.id), el('span', { class: 'v' }, b.error ? '加载失败' : `${b.count} 题`))));
    bankCard.appendChild(el('div', { class: 'stat-row stat-total' }, el('span', {}, `去重后有效`), el('span', { class: 'v' }, `${st.totalUnique} 题`)));
    main.appendChild(bankCard);
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.5 更新'), el('div', { class: 'about-text' },
      el('p', {}, '🔗 存档码紧凑化：改用按题库分组的状态位图，码长基本固定、不再随做题量膨胀，导出复制更方便（旧存档码仍可正常导入）'),
      el('p', {}, '📝 解析增强：对过短或泛泛而谈的解析批量补充“辨析”要点，结合具体选项讲清为何选/为何不选'),
      el('p', {}, '🧹 去重优化：题干相同仅解析不同的题视为同一题，展示时自动保留最长（信息量最大）的解析'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.4 更新'), el('div', { class: 'about-text' },
      el('p', {}, '🗑 修复各模块“清空/清除”等操作：改用应用内自定义确认框'),
      el('p', {}, '（原因：微信等内置浏览器会屏蔽浏览器原生确认弹窗，导致确认失效）'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.3 更新'), el('div', { class: 'about-text' },
      el('p', {}, '↩️ 返回/前进键改为逐级翻页：返回回到上一页、前进回到下一页,不再直接退出'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.2 更新'), el('div', { class: 'about-text' },
      el('p', {}, '🔄 断点续做：答题进度自动保存，意外退出后重新打开自动恢复'),
      el('p', {}, '🛡 修复会话无法序列化导致进度保存失败的隐患'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.1 更新'), el('div', { class: 'about-text' },
      el('p', {}, '📝 每道题补全针对性解析，讲清知识点并辨析相似概念'),
      el('p', {}, '💾 “存档同步”升级为首页醒目入口，文案聚焦跨设备同步'),
      el('p', {}, '↩️ 支持浏览器返回键：逐级返回上一页，而非直接退出'),
      el('p', {}, '💡 首页“使用说明”改为面向用户；出题指南标注面向开发者'))));
    main.appendChild(el('div', { class: 'card' }, el('h3', {}, 'v4.0 更新'), el('div', { class: 'about-text' },
      el('p', {}, '🗂 题库与程序分离：题目放 bank 文件夹，manifest.json 管理'),
      el('p', {}, '🔖 新增“刷题记录”：可选择随机抽题是否包含已刷题、可清除'),
      el('p', {}, '💾 新增“存档同步”：一段字符串跨设备导出/导入（覆盖/合并/新建）'),
      el('p', {}, '🧩 自动去重：题干完全相同的题自动剔除'),
      el('p', {}, '🛠 全面模块化：config/util/storage/state/bank/archive/quiz/views/app'))));
    app.appendChild(main);
  }

  /* ================= 题目详情弹层 ================= */
  function showQuestionDetail(qid, source) { S.modal = { type: 'q-detail', qid, source }; App.renderModal(); }
  function buildQuestionDetailPanel() {
    const m = S.modal, q = Bank.findById(m.qid);
    if (!q) { S.modal = null; return null; }
    const rec = S.wrongBook[m.qid], fav = State.isFav(m.qid), banned = State.isBanned(m.qid), pr = S.practiced[m.qid];
    const inner = el('div', { class: 'modal' });
    inner.appendChild(el('div', { class: 'modal-handle' }));
    const tp = [`【${TYPE_NAMES[q.type]}】`];
    if (rec) tp.push(`错 ${rec.count} 次`);
    if (rec && rec.correctCount) tp.push(`订正 ${rec.correctCount} 次`);
    if (pr) tp.push(`刷 ${pr.count} 次`);
    if (fav) tp.push('⭐'); if (banned) tp.push('🚫已斩');
    inner.appendChild(el('div', { style: 'display:flex;align-items:center;margin-bottom:12px;gap:8px' },
      el('h3', { style: 'margin:0;flex:1' }, tp.join(' ')),
      el('button', { class: 'qhead-btn star-btn' + (fav ? ' active' : ''), onclick: () => { const now = State.toggleFav(m.qid); toast(now ? '已加入收藏' : '已取消收藏', 1200); App.renderModal(); App.render(); } }, fav ? '★' : '☆')));
    inner.appendChild(el('div', { class: 'qd' }, q.question));
    if (q.options) { const oc = el('div', { class: 'opts' }); Object.keys(q.options).sort().forEach(L => { const isC = q.type === 'single' ? L === q.answer : q.answer.includes(L); oc.appendChild(el('div', { class: 'opt-line', style: isC ? 'color:var(--ok);font-weight:600' : '' }, `${L}. ${q.options[L]}${isC ? '  ✓' : ''}`)); }); inner.appendChild(oc); }
    inner.appendChild(el('div', { class: 'ans-box ok' }, el('div', { class: 'ans-label' }, '正确答案'), el('div', { style: 'font-weight:600' }, q.answer + (q.aliases && q.aliases.length ? `（亦可：${q.aliases.join(' / ')}）` : ''))));
    if (rec && rec.lastUserAns) inner.appendChild(el('div', { class: 'ans-box bad' }, el('div', { class: 'ans-label' }, '上次错误答案'), el('div', { style: 'font-weight:600' }, rec.lastUserAns)));
    if (q.explanation) inner.appendChild(el('div', { class: 'explain' }, el('span', { class: 'label' }, '💡 解析'), el('span', {}, q.explanation)));
    const btns = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:14px' });
    if (m.source === 'wrong') btns.appendChild(el('button', { class: 'btn btn-outline-bad', style: 'margin:0', onclick: () => { U.confirm('从错题本移除该题？', () => { State.removeWrong(m.qid); S.modal = null; toast('已移出错题本'); App.render(); }); } }, '移出错题本'));
    else if (m.source === 'fav') btns.appendChild(el('button', { class: 'btn btn-outline-bad', style: 'margin:0', onclick: () => { U.confirm('取消收藏该题？', () => { State.toggleFav(m.qid); S.modal = null; toast('已取消收藏'); App.render(); }); } }, '取消收藏'));
    else if (m.source === 'banned') btns.appendChild(el('button', { class: 'btn btn-outline-primary', style: 'margin:0', onclick: () => { U.confirm('撤销斩题？该题将重新参与抽题。', () => { State.unbanQuestion(m.qid); toast('已撤销斩题', 1500); S.modal = null; App.render(); }, { danger: false }); } }, '↩️ 撤销斩题'));
    btns.appendChild(el('button', { class: 'btn btn-primary', style: 'margin:0', onclick: () => { S.modal = null; App.renderModal(); } }, '关闭'));
    inner.appendChild(btns);
    return inner;
  }

  /* ================= 导入存档预览弹层 ================= */
  function buildImportArchivePanel() {
    const obj = S.modal.obj, pv = Archive.preview(obj);
    const inner = el('div', { class: 'modal' });
    inner.appendChild(el('div', { class: 'modal-handle' }));
    inner.appendChild(el('h3', {}, '🔍 存档预览'));
    inner.appendChild(el('div', { class: 'archive-preview' },
      el('div', { class: 'pv-row' }, el('span', {}, '导出时间'), el('span', {}, U.fmtDate(pv.exportedAt) || '未知')),
      el('div', { class: 'pv-row' }, el('span', {}, '错题'), el('span', {}, String(pv.wrong))),
      el('div', { class: 'pv-row' }, el('span', {}, '收藏'), el('span', {}, String(pv.favs))),
      el('div', { class: 'pv-row' }, el('span', {}, '斩题'), el('span', {}, String(pv.banned))),
      el('div', { class: 'pv-row' }, el('span', {}, '刷题记录'), el('span', {}, String(pv.practiced))),
      el('div', { class: 'pv-row' }, el('span', {}, '历史记录'), el('span', {}, String(pv.history)))));
    inner.appendChild(el('div', { style: 'color:var(--text-muted);font-size:13px;margin-bottom:8px' }, '选择导入方式：'));
    const btns = el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      el('button', { class: 'btn btn-bad', style: 'margin:0', onclick: () => { U.confirm('覆盖将替换本机当前全部进度，确定？', () => { Archive.applyOverwrite(obj); S.modal = null; toast('已覆盖导入'); App.go('home'); }); } }, '🔁 覆盖当前进度'),
      el('button', { class: 'btn btn-primary', style: 'margin:0', onclick: () => { Archive.applyMerge(obj); S.modal = null; toast('已合并导入'); App.go('home'); } }, '➕ 合并到当前进度'),
      el('button', { class: 'btn btn-gold', style: 'margin:0', onclick: () => { U.prompt('新存档命名：', '导入存档 ' + U.fmtDate(new Date().toISOString()), (name) => { Archive.saveArchiveAsSlot(obj, (name || '').trim() || undefined); S.modal = null; toast('已存为新存档槽（未改动当前进度）'); App.render(); }); } }, '🆕 新建存档（不动当前）'),
      el('button', { class: 'btn', style: 'margin:0', onclick: () => { S.modal = null; App.renderModal(); } }, '取消'));
    inner.appendChild(btns);
    return inner;
  }

  /* ================= 载入存档槽弹层 ================= */
  function buildLoadSlotPanel() {
    const slot = Archive.getSlot(S.modal.slotId);
    if (!slot) { S.modal = null; return null; }
    const inner = el('div', { class: 'modal' });
    inner.appendChild(el('div', { class: 'modal-handle' }));
    inner.appendChild(el('h3', {}, '载入存档：' + slot.name));
    inner.appendChild(el('div', { style: 'color:var(--text-muted);font-size:13px;margin-bottom:8px' }, '选择载入方式：'));
    inner.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      el('button', { class: 'btn btn-bad', style: 'margin:0', onclick: () => { U.confirm('覆盖将替换本机当前全部进度，确定？', () => { Archive.applyOverwrite(slot.archive); S.modal = null; toast('已覆盖载入'); App.go('home'); }); } }, '🔁 覆盖当前进度'),
      el('button', { class: 'btn btn-primary', style: 'margin:0', onclick: () => { Archive.applyMerge(slot.archive); S.modal = null; toast('已合并载入'); App.go('home'); } }, '➕ 合并到当前进度'),
      el('button', { class: 'btn', style: 'margin:0', onclick: () => { S.modal = null; App.renderModal(); } }, '取消')));
    return inner;
  }

  return {
    renderHome, renderCustom, renderWrongBook, renderFavs, renderBanned, renderPracticed,
    renderHistory, renderSettings, renderArchive, renderGuide, renderAbout,
    buildQuestionDetailPanel, buildImportArchivePanel, buildLoadSlotPanel,
    buildSwitch,
  };
})();
