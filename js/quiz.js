"use strict";
/* ============================================================
 * quiz.js — 答题引擎
 *  · 抽题（普通/考试/错题/收藏），支持“是否包含已刷过的题”
 *  · 选答判定、即时反馈、考试统一判定
 *  · 答对的题计入“刷过的题”；错题/收藏做对仍保留
 *  · 总结页、逐题回顾、题号导航、斩题确认弹窗
 * ============================================================ */
window.Quiz = (function () {
  const { el, clear, toast, shuffle, sample } = U;
  const S = State.state;
  const TYPE_ORDER = CFG.TYPE_ORDER, TYPE_NAMES = CFG.TYPE_NAMES;

  /* ---------- 判定 ---------- */
  function checkAnswer(q, ua) {
    if (ua === null || ua === undefined) return false;
    if (q.type === 'single') return String(ua || '').trim().toUpperCase() === (q.answer || '').trim().toUpperCase();
    if (q.type === 'multi') {
      const uas = new Set((Array.isArray(ua) ? ua : [ua]).map(c => String(c || '').toUpperCase()).filter(Boolean));
      const cas = new Set((q.answer || '').split('').filter(c => /[A-F]/.test(c.toUpperCase())).map(c => c.toUpperCase()));
      if (uas.size === 0 || uas.size !== cas.size) return false;
      for (const x of uas) if (!cas.has(x)) return false;
      return true;
    }
    if (q.type === 'tf') return String(ua || '').trim() === (q.answer || '').trim();
    if (q.type === 'fill') {
      const norm = s => String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
      const stripPunct = s => s.replace(/[、,，。.\s]/g, '');
      const uan = norm(ua);
      if (!uan) return false;
      const cands = [q.answer].concat(q.aliases || []);
      for (const c of cands) {
        if (!c) continue;
        if (norm(c) === uan) return true;
        if (stripPunct(norm(c)) === stripPunct(uan)) return true;
      }
      return false;
    }
    return false;
  }

  /* ---------- 抽题 / 开始会话 ---------- */
  function buildCandidatePool() {
    const all = Bank.getActiveQuestions(); // 已排除斩题
    if (S.settings.includePracticed) return all;
    const out = { single: [], multi: [], tf: [], fill: [] };
    for (const t of TYPE_ORDER) out[t] = all[t].filter(q => !State.isPracticed(q.id));
    return out;
  }

  function startSession(mode, customQuota) {
    let qs;
    if (mode === 'wrong') {
      const ids = State.wrongQids();
      if (!ids.length) { toast('错题本为空'); return; }
      qs = shuffle(ids.map(Bank.findById).filter(Boolean));
    } else if (mode === 'fav') {
      const ids = S.favs.slice();
      if (!ids.length) { toast('收藏夹为空'); return; }
      qs = shuffle(ids.map(Bank.findById).filter(Boolean));
    } else if (mode === 'practiced') {
      const ids = State.practicedQids();
      if (!ids.length) { toast('暂无刷题记录'); return; }
      qs = shuffle(ids.map(Bank.findById).filter(Boolean));
    } else {
      const quota = customQuota || CFG.DEFAULT_QUOTA;
      const pool = buildCandidatePool();
      qs = [];
      const shortages = [];
      for (const t of TYPE_ORDER) {
        const want = quota[t] || 0;
        const take = Math.min(want, pool[t].length);
        if (take < want) shortages.push(`${TYPE_NAMES[t]} ${take}/${want}`);
        qs = qs.concat(sample(pool[t], take));
      }
      if (!qs.length) { toast('可用题目为零（可能都被斩或已刷完）'); return; }
      if (shortages.length) toast('题量不足，已按可用数抽取：' + shortages.join('，'), 2600);
    }
    S.session = {
      mode, isExam: false, questions: qs, index: 0,
      answers: new Array(qs.length).fill(null), answered: false,
      startedAt: new Date().toISOString(),
    };
    App.go('quiz');
  }

  function startExam() {
    const pool = buildCandidatePool();
    for (const t of TYPE_ORDER) {
      if (pool[t].length < CFG.DEFAULT_QUOTA[t]) {
        toast(`可用题不足：${TYPE_NAMES[t]}仅 ${pool[t].length} 题，需 ${CFG.DEFAULT_QUOTA[t]} 题` +
          (S.settings.includePracticed ? '' : '（已关闭“包含刷过的题”）'), 3000);
        return;
      }
    }
    U.confirm('真实考试：100 题，提交后才能查看答案。确定开始？', () => {
      let qs = [];
      for (const t of TYPE_ORDER) qs = qs.concat(sample(pool[t], CFG.DEFAULT_QUOTA[t]));
      S.session = {
        mode: 'exam', isExam: true, questions: qs, index: 0,
        answers: new Array(qs.length).fill(null), answered: false,
        startedAt: new Date().toISOString(),
      };
      App.go('quiz');
    }, { danger: false, icon: '📝', title: '开始考试', okText: '开始' });
  }

  /* ---------- 答题界面 ---------- */
  function renderQuiz(app) {
    const s = S.session;
    if (!s) { App.go('home'); return; }
    if (s.index >= s.questions.length) { showSummary(); return; }
    const q = s.questions[s.index];
    const total = s.questions.length;
    const isExam = s.isExam;

    const titleMap = { exam: '📝 真实考试', wrong: '错题重做', fav: '收藏重做', practiced: '刷题记录重做', normal: '模拟刷题' };
    app.appendChild(U.topbar(titleMap[s.mode] || '模拟刷题', {
      back: () => confirmQuit(), exam: isExam,
      actions: [el('button', { class: 'icon-btn', onclick: showNavigator, 'aria-label': '题号导航' }, '⊞')]
    }));

    const main = el('main');
    const answeredCount = s.answers.filter(a => a !== null).length;
    const okCount = isExam ? answeredCount : s.answers.filter(a => a && a.correct).length;
    const badCount = isExam ? 0 : s.answers.filter(a => a && a.correct === false).length;

    const progressLeft = el('div', { class: 'left' },
      el('span', {}, `第 ${s.index + 1} / ${total} 题`),
      el('button', { class: 'nav-btn', onclick: showNavigator }, '题号 ⊞'));
    const progressRight = isExam
      ? el('span', { class: 'score' }, el('span', {}, `已答 ${answeredCount}/${total}`))
      : el('span', { class: 'score' }, el('span', { class: 'ok-c' }, `✓ ${okCount}`), el('span', { class: 'bad-c' }, `✗ ${badCount}`));
    main.appendChild(el('div', { class: 'quiz-progress' }, progressLeft, progressRight));
    main.appendChild(el('div', { class: 'progress-bar' + (isExam ? ' exam' : '') }, el('div', { style: `width:${(s.index / total) * 100}%` })));

    main.appendChild(el('div', { class: 'qhead-row' },
      el('div', { class: 'qtype-tag' + (isExam ? ' exam-tag' : '') }, TYPE_NAMES[q.type]),
      el('div', { class: 'qhead-actions' }, buildStarBtn(q.id), buildBanBtn(q.id))));
    main.appendChild(el('div', { class: 'qtext' }, q.question));

    const ansArea = el('div', { class: 'ans-area' }); main.appendChild(ansArea);
    const feedbackArea = el('div', { class: 'feedback-area' }); main.appendChild(feedbackArea);
    const prev = s.answers[s.index];
    s.answered = !isExam && prev !== null;
    const bar = el('div', { class: 'action-bar' }); main.appendChild(bar);

    if (q.type === 'single') buildSingleAnswer(q, ansArea, feedbackArea, bar);
    else if (q.type === 'multi') buildMultiAnswer(q, ansArea, feedbackArea, bar);
    else if (q.type === 'tf') buildTFAnswer(q, ansArea, feedbackArea, bar);
    else buildFillAnswer(q, ansArea, feedbackArea, bar);

    if (prev !== null) {
      if (isExam) restoreExamSelection(q, prev.ua);
      else restoreAnsweredState(q, prev.ua, prev.correct, ansArea, feedbackArea, bar);
    }
    app.appendChild(main);
  }

  function buildStarBtn(qid) {
    const fav = State.isFav(qid);
    const btn = el('button', {
      class: 'qhead-btn star-btn' + (fav ? ' active' : ''), 'aria-label': '收藏',
      onclick: e => { e.stopPropagation(); const now = State.toggleFav(qid); btn.classList.toggle('active', now); btn.textContent = now ? '★' : '☆'; toast(now ? '已加入收藏' : '已取消收藏', 1200); }
    }, fav ? '★' : '☆');
    return btn;
  }
  function buildBanBtn(qid) {
    return el('button', {
      class: 'qhead-btn ban-btn', 'aria-label': '斩题', title: '斩题（不再出现）',
      onclick: e => {
        e.stopPropagation();
        if (S.session && S.session._skipBanConfirm) { doBanCurrent(qid); return; }
        S.modal = { type: 'ban-confirm', qid }; App.renderModal();
      }
    }, '🚫');
  }
  function doBanCurrent(qid) {
    State.banQuestion(qid);
    toast('已斩掉，自动跳过此题', 1200);
    const s = S.session; if (!s) return;
    s.questions.splice(s.index, 1); s.answers.splice(s.index, 1); s.answered = false;
    if (!s.questions.length) { S.session = null; App.go('home'); return; }
    if (s.index >= s.questions.length) s.index = s.questions.length - 1;
    App.render();
  }
  function buildBanConfirmDialog() {
    const qid = S.modal.qid;
    let dontAsk = false;
    const checkbox = el('div', { class: 'dialog-checkbox', onclick: () => { dontAsk = !dontAsk; checkbox.classList.toggle('checked', dontAsk); } },
      el('div', { class: 'box' }), el('div', { class: 'label' }, '本次刷题中不再弹出此提示'));
    return el('div', { class: 'dialog', onclick: e => e.stopPropagation() },
      el('div', { class: 'dialog-icon' }, '🚫'),
      el('h3', {}, '确定要“斩”掉这道题？'),
      el('div', { class: 'dialog-msg' }, '斩掉后此题将不再出现在随机抽题中。可在“斩题库”中撤销。'),
      checkbox,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn', onclick: () => { S.modal = null; App.renderModal(); } }, '取消'),
        el('button', { class: 'btn btn-primary', onclick: () => { if (dontAsk && S.session) S.session._skipBanConfirm = true; S.modal = null; App.renderModal(); doBanCurrent(qid); } }, '确认斩题')));
  }

  /* ---------- 各题型 ---------- */
  function buildSingleAnswer(q, ansArea, feedbackArea, bar) {
    const s = S.session, opts = {};
    Object.keys(q.options).sort().forEach(L => {
      const node = el('div', { class: 'option' }, el('div', { class: 'letter' }, L), el('div', { class: 'text' }, q.options[L]));
      node.addEventListener('click', () => {
        if (s.isExam) { Object.values(opts).forEach(n => n.classList.remove('selected')); node.classList.add('selected'); s.answers[s.index] = { ua: L, correct: null }; }
        else { if (s.answered) return; submitAnswer(q, L, ansArea, feedbackArea, bar); }
      });
      opts[L] = node; ansArea.appendChild(node);
    });
    s._opts = opts; buildBottomBar(bar);
  }
  function buildMultiAnswer(q, ansArea, feedbackArea, bar) {
    const s = S.session, selected = new Set(), opts = {};
    ansArea.appendChild(el('div', { style: 'color:var(--text-muted);font-size:13px;margin-bottom:8px' }, s.isExam ? '勾选所有正确选项（考试结束统一判定）' : '勾选所有正确选项后点击“提交答案”'));
    Object.keys(q.options).sort().forEach(L => {
      const node = el('div', { class: 'option' }, el('div', { class: 'mark' }), el('div', { class: 'letter' }, L), el('div', { class: 'text' }, q.options[L]));
      node.addEventListener('click', () => {
        if (!s.isExam && s.answered) return;
        if (selected.has(L)) { selected.delete(L); node.classList.remove('selected'); } else { selected.add(L); node.classList.add('selected'); }
        if (s.isExam) s.answers[s.index] = selected.size ? { ua: Array.from(selected), correct: null } : null;
      });
      opts[L] = node; ansArea.appendChild(node);
    });
    s._opts = opts; s._multiSelected = selected;
    buildBottomBar(bar, () => { if (!s.isExam && s.answered) return; if (!selected.size) { toast('请至少勾选一项'); return; } submitAnswer(q, Array.from(selected), ansArea, feedbackArea, bar); });
  }
  function buildTFAnswer(q, ansArea, feedbackArea, bar) {
    const s = S.session;
    const tBtn = el('button', { class: 'tf-btn t' }, '✓ 正确'), fBtn = el('button', { class: 'tf-btn f' }, '✗ 错误');
    const handle = val => {
      if (s.isExam) { tBtn.classList.remove('exam-selected'); fBtn.classList.remove('exam-selected'); (val === '正确' ? tBtn : fBtn).classList.add('exam-selected'); s.answers[s.index] = { ua: val, correct: null }; }
      else { if (s.answered) return; submitAnswer(q, val, ansArea, feedbackArea, bar); }
    };
    tBtn.addEventListener('click', () => handle('正确')); fBtn.addEventListener('click', () => handle('错误'));
    ansArea.appendChild(el('div', { class: 'tf-row' }, tBtn, fBtn));
    s._tfBtns = { 正确: tBtn, 错误: fBtn }; buildBottomBar(bar);
  }
  function buildFillAnswer(q, ansArea, feedbackArea, bar) {
    const s = S.session;
    ansArea.appendChild(el('div', { style: 'color:var(--text-muted);font-size:13px;margin-bottom:8px' }, s.isExam ? '输入答案（考试结束统一判定）' : '输入答案后点击“提交答案”'));
    const input = el('input', { type: 'text', class: 'fill-input', placeholder: '请输入答案', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' });
    input.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } });
    if (s.isExam) input.addEventListener('input', () => { const v = input.value.trim(); s.answers[s.index] = v ? { ua: v, correct: null } : null; });
    ansArea.appendChild(input); setTimeout(() => input.focus(), 100); s._fillInput = input;
    function doSubmit() {
      if (!s.isExam && s.answered) return;
      const v = input.value.trim(); if (!v) { toast('请输入答案'); return; }
      if (s.isExam) { s.answers[s.index] = { ua: v, correct: null }; input.blur(); nextQuestion(); }
      else { input.blur(); submitAnswer(q, v, ansArea, feedbackArea, bar); }
    }
    buildBottomBar(bar, doSubmit);
  }

  function buildBottomBar(bar, submitHandler) {
    const s = S.session;
    bar.appendChild(s.index > 0
      ? el('button', { class: 'btn btn-quit', onclick: prevQuestion }, '← 上一题')
      : el('button', { class: 'btn btn-quit', onclick: confirmQuit }, '退出'));
    if (s.isExam) {
      const isLast = s.index >= s.questions.length - 1;
      bar.appendChild(isLast
        ? el('button', { class: 'btn btn-exam', onclick: confirmSubmitExam }, '📤 提交考试')
        : el('button', { class: 'btn btn-primary', onclick: nextQuestion }, '下一题 →'));
    } else {
      bar.appendChild(submitHandler
        ? el('button', { class: 'btn btn-primary', onclick: submitHandler }, '提交答案')
        : el('button', { class: 'btn', onclick: nextQuestion }, '跳过 →'));
    }
  }

  /* ---------- 提交（模拟模式） ---------- */
  function submitAnswer(q, ua, ansArea, feedbackArea, bar) {
    const s = S.session, correct = checkAnswer(q, ua);
    s.answered = true;
    s.answers[s.index] = { ua: Array.isArray(ua) ? ua.slice() : ua, correct };
    markFeedback(q, ua, correct);
    showFeedbackCard(q, ua, correct, feedbackArea);
    State.recordPracticed(q.id, correct);
    if (correct) { if (S.wrongBook[q.id]) State.markWrongCorrect(q.id); }
    else State.recordWrong(q.id, Array.isArray(ua) ? ua.sort().join('') : String(ua));
    clear(bar);
    bar.appendChild(s.index > 0 ? el('button', { class: 'btn btn-quit', onclick: prevQuestion }, '← 上一题') : el('button', { class: 'btn btn-quit', onclick: confirmQuit }, '退出'));
    const isLast = s.index >= s.questions.length - 1;
    bar.appendChild(el('button', { class: 'btn btn-ok', onclick: nextQuestion }, isLast ? '查看成绩 →' : '下一题 →'));
    setTimeout(() => { const fc = feedbackArea.querySelector('.feedback'); if (fc) fc.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  }
  function markFeedback(q, ua, correct) {
    const s = S.session;
    if (q.type === 'single') {
      Object.keys(s._opts).forEach(L => { s._opts[L].classList.add('disabled'); if (L === q.answer) s._opts[L].classList.add('correct'); else if (L === ua) s._opts[L].classList.add('wrong'); });
    } else if (q.type === 'multi') {
      const cs = new Set(q.answer.split('')), us = new Set(ua);
      Object.keys(s._opts).forEach(L => { s._opts[L].classList.add('disabled'); s._opts[L].classList.remove('selected'); if (cs.has(L)) s._opts[L].classList.add('correct'); else if (us.has(L)) s._opts[L].classList.add('wrong'); });
    } else if (q.type === 'tf') {
      Object.keys(s._tfBtns).forEach(k => s._tfBtns[k].disabled = true);
      if (correct) { s._tfBtns[ua].classList.add('selected-correct'); s._tfBtns[ua === '正确' ? '错误' : '正确'].classList.add('dim'); }
      else { s._tfBtns[ua].classList.add('wrong-pick'); s._tfBtns[q.answer].classList.add('selected-correct'); }
    } else if (q.type === 'fill') { if (s._fillInput) s._fillInput.disabled = true; }
  }
  function showFeedbackCard(q, ua, correct, area) {
    clear(area);
    const fb = el('div', { class: 'feedback ' + (correct ? 'correct' : 'wrong') });
    fb.appendChild(el('div', { class: 'head' }, correct ? '✓ 回答正确' : '✗ 回答错误'));
    const uaDisp = Array.isArray(ua) ? ua.sort().join('') : String(ua);
    let line = `你的答案：${uaDisp}　　正确答案：${q.answer}`;
    if (q.type === 'fill' && q.aliases && q.aliases.length) line += `（亦可：${q.aliases.join(' / ')}）`;
    fb.appendChild(el('div', { class: 'ans' }, line)); area.appendChild(fb);
    if (q.explanation) { const ex = el('div', { class: 'explain' }); ex.appendChild(el('span', { class: 'label' }, '💡 解析')); ex.appendChild(el('span', {}, q.explanation)); area.appendChild(ex); }
  }
  function restoreAnsweredState(q, ua, correct, ansArea, feedbackArea, bar) {
    const s = S.session; s.answered = true;
    markFeedback(q, ua, correct); showFeedbackCard(q, ua, correct, feedbackArea);
    clear(bar);
    bar.appendChild(s.index > 0 ? el('button', { class: 'btn btn-quit', onclick: prevQuestion }, '← 上一题') : el('button', { class: 'btn btn-quit', onclick: confirmQuit }, '退出'));
    const isLast = s.index >= s.questions.length - 1;
    bar.appendChild(el('button', { class: 'btn btn-ok', onclick: nextQuestion }, isLast ? '查看成绩 →' : '下一题 →'));
  }
  function restoreExamSelection(q, ua) {
    const s = S.session;
    if (q.type === 'single') { if (s._opts[ua]) s._opts[ua].classList.add('selected'); }
    else if (q.type === 'multi') { if (Array.isArray(ua)) ua.forEach(L => { if (s._opts[L]) { s._opts[L].classList.add('selected'); s._multiSelected.add(L); } }); }
    else if (q.type === 'tf') { if (s._tfBtns[ua]) s._tfBtns[ua].classList.add('exam-selected'); }
    else if (q.type === 'fill') { if (s._fillInput && ua) s._fillInput.value = ua; }
  }

  function nextQuestion() {
    const s = S.session; s.index += 1; s.answered = false;
    if (s.index >= s.questions.length) { if (s.isExam) confirmSubmitExam(); else showSummary(); }
    else App.render();
  }
  function prevQuestion() { const s = S.session; if (s.index > 0) { s.index -= 1; s.answered = false; App.render(); } }

  function confirmQuit() {
    const s = S.session; if (!s) { App.go('home'); return; }
    const answered = s.answers.filter(a => a !== null).length;
    if (answered === 0) { S.session = null; App.go('home'); return; }
    const msg = s.isExam ? `考试进度（已答 ${answered} 题）将不被保存。确定中途退出？` : '当前进度将不被保存（错题/收藏/刷题记录已保存）。确定退出？';
    U.confirm(msg, () => { S.session = null; App.go('home'); }, { title: '退出练习', okText: '退出' });
  }

  // 供浏览器返回键调用：镜像答题流程各页“返回”逻辑
  function handleBack() {
    if (S.view === 'quiz') { confirmQuit(); return; }
    if (S.view === 'summary') { S.session = null; App.go('home'); return; }
    if (S.view === 'review') {
      if (S.modal && S.modal.histRec) { S.modal = null; App.go('history'); }
      else { S.view = 'summary'; App.render(); }
      return;
    }
    App.go('home');
  }

  /* ---------- 题号导航 ---------- */
  function showNavigator() { S.modal = { type: 'navigator' }; App.renderModal(); }
  function buildNavigatorPanel() {
    const s = S.session;
    const inner = el('div', { class: 'modal' });
    inner.appendChild(el('div', { class: 'modal-handle' }));
    inner.appendChild(el('h3', {}, '📑 题号导航'));
    const total = s.questions.length, answered = s.answers.filter(a => a !== null).length;
    if (s.isExam) inner.appendChild(el('div', { class: 'nav-summary' },
      el('div', { class: 'item' }, el('div', { class: 'dot', style: 'background:var(--primary)' }), `已答 ${answered}`),
      el('div', { class: 'item' }, el('div', { class: 'dot', style: 'background:var(--border-strong)' }), `未答 ${total - answered}`)));
    else { const ok = s.answers.filter(a => a && a.correct).length, bad = s.answers.filter(a => a && a.correct === false).length;
      inner.appendChild(el('div', { class: 'nav-summary' },
        el('div', { class: 'item' }, el('div', { class: 'dot', style: 'background:var(--ok)' }), `对 ${ok}`),
        el('div', { class: 'item' }, el('div', { class: 'dot', style: 'background:var(--bad)' }), `错 ${bad}`),
        el('div', { class: 'item' }, el('div', { class: 'dot', style: 'background:var(--border-strong)' }), `未答 ${total - answered}`))); }
    const grouped = { single: [], multi: [], tf: [], fill: [] };
    s.questions.forEach((q, i) => { if (grouped[q.type]) grouped[q.type].push(i); });
    TYPE_ORDER.forEach(t => {
      const idxs = grouped[t]; if (!idxs.length) return;
      const ans = idxs.filter(i => s.answers[i] !== null).length;
      const sec = el('div', { class: 'nav-section' });
      sec.appendChild(el('div', { class: 'nav-section-title' }, el('span', {}, TYPE_NAMES[t]), el('span', { class: 'stat-mini' }, `${ans} / ${idxs.length}`)));
      const grid = el('div', { class: 'nav-grid' });
      idxs.forEach(i => {
        const q = s.questions[i], a = s.answers[i], cls = ['nav-cell'];
        if (i === s.index) cls.push('current');
        if (a !== null) { cls.push('answered'); if (s.isExam) cls.push('exam'); else if (a.correct) cls.push('correct'); else if (a.correct === false) cls.push('wrong'); }
        if (State.isFav(q.id)) cls.push('starred');
        grid.appendChild(el('div', { class: cls.join(' '), onclick: () => { s.index = i; s.answered = false; S.modal = null; App.renderModal(); App.render(); } }, String(i + 1)));
      });
      sec.appendChild(grid); inner.appendChild(sec);
    });
    if (s.isExam) { const un = total - answered; inner.appendChild(el('button', { class: 'btn btn-exam', onclick: () => { S.modal = null; App.renderModal(); confirmSubmitExam(); } }, `📤 提交考试${un > 0 ? `（未答 ${un} 题）` : ''}`)); }
    inner.appendChild(el('button', { class: 'btn', onclick: () => { S.modal = null; App.renderModal(); } }, '关闭'));
    return inner;
  }

  /* ---------- 提交考试 ---------- */
  function confirmSubmitExam() {
    const s = S.session, un = s.answers.filter(a => a === null).length;
    let msg = '确定提交考试？';
    if (un > 0) msg = `还有 ${un} 题未作答，确定提交？未作答计为错误。`;
    U.confirm(msg, () => {
      s.questions.forEach((q, i) => {
        const a = s.answers[i];
        if (a === null) { s.answers[i] = { ua: null, correct: false }; State.recordPracticed(q.id, false); }
        else {
          a.correct = checkAnswer(q, a.ua);
          State.recordPracticed(q.id, a.correct);
          if (!a.correct) State.recordWrong(q.id, Array.isArray(a.ua) ? a.ua.sort().join('') : String(a.ua || ''));
          else if (S.wrongBook[q.id]) State.markWrongCorrect(q.id);
        }
      });
      showSummary();
    }, { danger: false, icon: '📤', title: '提交考试', okText: '提交' });
  }

  /* ---------- 总结 ---------- */
  function showSummary() {
    S.view = 'summary';
    const s = S.session;
    if (s && s.answers.some(a => a !== null)) {
      const total = s.answers.length, ok = s.answers.filter(a => a && a.correct).length, bad = s.answers.filter(a => a && a.correct === false).length;
      const typeStats = {}; TYPE_ORDER.forEach(t => typeStats[t] = { total: 0, ok: 0 });
      s.questions.forEach((q, i) => { typeStats[q.type].total++; if (s.answers[i] && s.answers[i].correct) typeStats[q.type].ok++; });
      const rec = {
        mode: s.isExam ? 'exam' : 'normal', submode: s.mode,
        startedAt: s.startedAt, finishedAt: new Date().toISOString(),
        total, ok, bad, skip: total - ok - bad, pct: total ? ok / total * 100 : 0, typeStats,
        questions: s.questions.map(q => ({ id: q.id, type: q.type, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation, aliases: q.aliases })),
        answers: s.answers.map(a => a ? { ua: a.ua, correct: a.correct } : null),
      };
      State.recordHistory(rec);
    }
    App.go('summary');
  }

  function renderSummary(app) {
    const s = S.session; if (!s) { App.go('home'); return; }
    const total = s.answers.length, ok = s.answers.filter(a => a && a.correct).length, bad = total - ok, pct = total ? ok / total * 100 : 0, isExam = s.isExam;
    app.appendChild(U.topbar(isExam ? '考试成绩' : '练习成绩', { back: () => { S.session = null; App.go('home'); }, exam: isExam }));
    const main = el('main');
    let heroClass = 'summary-hero'; if (isExam) heroClass += ' exam'; else if (pct >= 80) heroClass += ' high-score'; else if (pct < 60) heroClass += ' low-score';
    const hero = el('div', { class: heroClass }, el('div', { class: 'pct' }, `${pct.toFixed(0)}%`), el('div', { class: 'label' }, isExam ? '考试得分率' : '本轮正确率'));
    hero.appendChild(el('div', { class: 'summary-stats' },
      el('div', { class: 'cell' }, el('div', { class: 'num' }, String(total)), el('div', { class: 'lab' }, '总题数')),
      el('div', { class: 'cell' }, el('div', { class: 'num ok' }, String(ok)), el('div', { class: 'lab' }, '答对')),
      el('div', { class: 'cell' }, el('div', { class: 'num bad' }, String(bad)), el('div', { class: 'lab' }, '答错'))));
    main.appendChild(hero);
    const typeStats = {}; TYPE_ORDER.forEach(t => typeStats[t] = { total: 0, ok: 0 });
    s.questions.forEach((q, i) => { typeStats[q.type].total++; if (s.answers[i] && s.answers[i].correct) typeStats[q.type].ok++; });
    const card = el('div', { class: 'card' }, el('h3', {}, '分题型成绩'));
    TYPE_ORDER.forEach(t => { const ts = typeStats[t]; if (!ts.total) return; const r = ts.ok / ts.total * 100; const color = r >= 80 ? 'var(--ok)' : r >= 60 ? 'var(--primary)' : 'var(--bad)';
      card.appendChild(el('div', { class: 'stat-row' }, el('span', {}, TYPE_NAMES[t]), el('span', { style: `color:${color};font-weight:700;font-variant-numeric:tabular-nums` }, `${ts.ok} / ${ts.total}　${r.toFixed(0)}%`))); });
    main.appendChild(card);
    if (isExam) main.appendChild(el('button', { class: 'btn btn-primary', onclick: () => { App.go('review'); } }, '📖 逐题查看答案与解析'));
    if (bad > 0) main.appendChild(el('button', { class: 'btn btn-outline-bad', onclick: () => { S.session = null; App.go('wrong'); } }, `📝 查看错题本（${State.wrongQids().length}）`));
    main.appendChild(el('button', { class: isExam ? 'btn btn-exam' : 'btn btn-primary', onclick: () => isExam ? startExam() : startSession('normal') }, isExam ? '🔄 再来一次考试' : '🔄 再来一轮'));
    main.appendChild(el('button', { class: 'btn', onclick: () => { S.session = null; App.go('home'); } }, '返回主页'));
    app.appendChild(main);
  }

  /* ---------- 逐题回顾 ---------- */
  function renderReview(app) {
    const src = (S.modal && S.modal.histRec) || S.session;
    if (!src) { App.go('home'); return; }
    // 防御：来自导入存档码的历史记录只有成绩摘要，没有逐题明细（questions/answers）。
    // 紧凑存档码（DJC1/DJC0）为压缩体积不保存每题题面，这里给出友好提示而非报错。
    const fromImport = src.summaryOnly || !Array.isArray(src.questions) || !Array.isArray(src.answers) || !src.questions.length;
    if (S.modal && S.modal.histRec && fromImport) {
      const isExam0 = src.mode === 'exam';
      app.appendChild(U.topbar('答题回顾', { back: () => { S.modal = null; App.go('history'); }, exam: isExam0 }));
      const main0 = el('main');
      const pct = (src.pct != null) ? src.pct : (src.total ? Math.round((src.ok || 0) / src.total * 100) : 0);
      main0.appendChild(el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { style: 'display:flex;justify-content:space-around;text-align:center' },
        el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--primary)' }, `${pct}%`), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '正确率')),
        el('div', {}, el('div', { style: 'font-size:22px;font-weight:800' }, String(src.total || 0)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '总题')),
        el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--ok)' }, String(src.ok || 0)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '对')))));
      main0.appendChild(el('div', { class: 'card', style: 'color:var(--text-muted);font-size:14px;line-height:1.7' },
        '此记录来自导入的存档码，仅保留成绩摘要，没有逐题明细。',
        el('br'),
        '（为保证存档码足够短、便于复制导出，跨设备同步只携带每题的“做过/做错/收藏/斩除”状态与成绩概要，不携带逐题题面与作答。本机实际答题产生的记录仍有完整逐题回顾。）'));
      app.appendChild(main0);
      return;
    }
    const questions = src.questions, answers = src.answers;
    const isExam = src.isExam !== undefined ? src.isExam : (src.mode === 'exam');
    app.appendChild(U.topbar('答题回顾', { back: () => { if (S.modal && S.modal.histRec) { S.modal = null; App.go('history'); } else { App.go('summary'); } }, exam: isExam }));
    const main = el('main');
    const total = answers.length, ok = answers.filter(a => a && a.correct).length, wrong = total - ok;
    main.appendChild(el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { style: 'display:flex;justify-content:space-around;text-align:center' },
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--primary)' }, `${(ok / total * 100).toFixed(0)}%`), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '正确率')),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800' }, String(total)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '总题')),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--ok)' }, String(ok)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '对')),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;color:var(--bad)' }, String(wrong)), el('div', { style: 'font-size:12px;color:var(--text-muted)' }, '错')))));
    questions.forEach((q, i) => {
      const a = answers[i], isCorrect = a && a.correct, skipped = !a || a.ua == null;
      const card = el('div', { class: 'card', style: `margin-bottom:10px;border-left:4px solid ${isCorrect ? 'var(--ok)' : 'var(--bad)'}` });
      card.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap' },
        el('span', { style: 'font-weight:700;font-size:13px;color:var(--text-muted)' }, `第 ${i + 1} 题`),
        el('span', { class: 'qtype-mini' }, TYPE_NAMES[q.type]),
        el('span', { style: `margin-left:auto;font-weight:700;font-size:13px;color:${isCorrect ? 'var(--ok)' : 'var(--bad)'}` }, isCorrect ? '✓ 正确' : (skipped ? '○ 未答' : '✗ 错误'))));
      card.appendChild(el('div', { style: 'font-size:15px;line-height:1.6;margin-bottom:10px;white-space:pre-wrap' }, q.question));
      if (q.options) {
        const cs = new Set((q.answer || '').split('')), us = new Set();
        if (a && a.ua) (Array.isArray(a.ua) ? a.ua : [a.ua]).forEach(x => us.add(String(x)));
        Object.keys(q.options).sort().forEach(L => { const isC = cs.has(L), isU = us.has(L); let st = 'padding:8px 12px;border-radius:6px;margin-bottom:4px;font-size:14px'; if (isC) st += ';background:var(--ok-light);color:var(--ok);font-weight:600'; else if (isU) st += ';background:var(--bad-light);color:var(--bad)'; card.appendChild(el('div', { style: st }, `${L}. ${q.options[L]}${isC ? ' ✓' : ''}${isU && !isC ? ' ← 你的选择' : ''}`)); });
      } else {
        const uaDisp = a ? (Array.isArray(a.ua) ? a.ua.join('') : String(a.ua || '')) : '(未答)';
        card.appendChild(el('div', { style: 'font-size:13px;padding:6px 0;color:var(--text-muted)' }, `你的答案：${skipped ? '(未答)' : uaDisp}　　正确：${q.answer}` + (q.aliases && q.aliases.length ? `（亦可：${q.aliases.join('/')}）` : '')));
      }
      if (q.explanation) card.appendChild(el('div', { style: 'background:var(--panel-2);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text);line-height:1.6;margin-top:8px' }, el('span', { style: 'color:var(--primary);font-weight:700' }, '💡 解析：'), q.explanation));
      main.appendChild(card);
    });
    app.appendChild(main);
  }

  return {
    checkAnswer, startSession, startExam,
    renderQuiz, renderSummary, renderReview,
    buildNavigatorPanel, buildBanConfirmDialog,
    showSummary, handleBack,
  };
})();
