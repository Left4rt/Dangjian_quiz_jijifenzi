# PASSDOWN — 项目交接文档

> 给下一位接手的 AI / 开发者。读完这份你就能维护本项目，不必通读全部源码。

## 0. 一句话定位

这是一个**纯静态、可部署到 GitHub Pages 的「党建理论刷题」单页 Web 应用**。无后端、无构建步骤、无 npm 依赖，所有数据存在浏览器 `localStorage`，题库以 JSON 文件形式与主程序分离。

---

## 1. 设计思路（为什么这样做）

1. **题库与程序分离。** 主程序是「加载器」，题目放在 `bank/*.json`，由 `bank/manifest.json` 登记。维护者今后只新增题库文件 + 改 manifest，**不动代码**。GitHub Pages 更新后自动加载新题。
2. **不用打包 / 不用 ES module。** 直接用多个 `<script src>` 顺序加载，每个模块挂到 `window` 上的一个全局对象（`CFG / U / Store / State / Bank / Archive / Quiz / Views / App`）。这样**双击 `index.html`（file://）也能跑界面**，唯一限制是 file:// 下浏览器禁止 `fetch` 本地 JSON（CORS），所以题库加载必须经 HTTP（GitHub Pages 或本地静态服务器）。
3. **数据稳定性优先。** 题目自动生成稳定 ID（`题库id__题型__序号`），去重后用「别名映射」让旧 ID 仍可解析，保证错题/收藏跨题库更新不失效。
4. **跨设备靠存档码。** 静态站无法云同步，于是把全部用户痕迹编码成一段字符串，手动在设备间导入导出。

---

## 2. 文件结构

```
djquiz/
├── index.html                     加载器外壳：<head> + #app + 9 个 <script>
├── css/
│   └── styles.css                 全部样式（党建红金主题，含深色模式）
├── js/                            按依赖顺序加载，见下
│   ├── config.js   (CFG)          常量：路径、题型、配额、LS 键、存档前缀、版本号
│   ├── util.js     (U)            DOM 工具：$ el clear toast shuffle sample fmtDate normText topbar
│   ├── storage.js  (Store)        localStorage 读写封装：loadJSON saveJSON remove
│   ├── state.js    (State)        全局状态对象 + 所有数据操作（错题/收藏/斩题/已刷/历史/设置/存档槽）
│   ├── bank.js     (Bank)         异步加载题库、ID 生成、去重、查询统计
│   ├── archive.js  (Archive)      存档码编解码（gzip 优先，降级 base64）、预览、覆盖/合并、存档槽
│   ├── quiz.js     (Quiz)         答题流程：抽题、各题型答题区、判分、导航、总结、回顾、斩题对话框
│   ├── views.js    (Views)        各页面视图 + 弹层构造（主页/错题/收藏/斩题/已刷/历史/设置/存档/指南/关于）
│   └── app.js      (App)          入口：路由 render()、go()、模态分发 renderModal()、启动 boot()
├── bank/
│   ├── manifest.json              题库清单
│   ├── set1.json / set2.json / set3.json   三份题库（各 100 题）
│   └── HOW_TO_ADD_QUESTIONS.md    出题/新增题目指南（可当 AI skill 用）
└── PASSDOWN.md                    本文件
```

**加载顺序（不可乱）**：`config → util → storage → state → bank → archive → quiz → views → app`。后者依赖前者挂在 window 上的对象。

---

## 3. 各模块公开 API 速查

- `CFG`：纯常量。改路径/配额/版本来这里。
- `U`：`$ , el , clear , toast , shuffle , sample , fmtDate , normText , topbar`。`el(tag, attrs, ...children)` 是手写的 DOM 构造器，`on*` 属性即事件监听，`html` 属性写 innerHTML。
- `Store`：`loadJSON(key,fallback) , saveJSON(key,v) , remove(key)`。
- `State`：`state`（对象）+ `setSetting , recordWrong , markWrongCorrect , removeWrong , clearWrong , wrongQids , isFav , toggleFav , clearFavs , isBanned , banQuestion , unbanQuestion , clearBanned , bannedQids , recordPracticed , isPracticed , clearPracticed , practicedQids , recordHistory , clearHistory , saveSlots`。
- `Bank`：`load()`（async）`, isLoaded , getStats , getAllQuestions , getActiveQuestions , getCounts , getActiveCounts , findById , resolveId`。
- `Archive`：`buildArchive , encode(async) , decode(async) , preview , applyOverwrite , applyMerge , saveCurrentAsSlot , saveArchiveAsSlot , getSlot , deleteSlot , renameSlot , canGzip`。
- `Quiz`：`checkAnswer , startSession , startExam , renderQuiz , renderSummary , renderReview , buildNavigatorPanel , buildBanConfirmDialog , showSummary`。
- `Views`：`renderHome , renderCustom , renderWrongBook , renderFavs , renderBanned , renderPracticed , renderHistory , renderSettings , renderArchive , renderGuide , renderAbout , buildQuestionDetailPanel , buildImportArchivePanel , buildLoadSlotPanel , buildSwitch`。
- `App`：`render , go , renderModal , boot`。

---

## 4. 关键机制细节

### 4.1 启动流程（app.js `boot()`）
`boot()` 设 `state.booting=true` → 渲染加载屏 → `await Bank.load()` → 成功则 `booting=false, view='home'` 再 render；失败则把错误存入 `state.bootError` 显示错误屏（含「file:// 不能加载、请用 GitHub Pages 或本地服务器」的提示 + 重试按钮）。

### 4.2 路由与模态（app.js）
- `state.view` 决定渲染哪个视图，`App.go(view)` 切换。
- `state.modal` 决定弹层：`q-detail / navigator / import-archive / load-slot` 是**底部抽屉**（`.modal-overlay`），`ban-confirm` 是**居中对话框**（`.dialog-overlay`），`__review__` 只是承载历史回顾数据、不弹层（review 视图直接读 `state.modal.histRec`）。

### 4.3 题库加载与去重（bank.js）
- `fetchJSON` 给 URL 加 `?v=时间戳` 且 `cache:'no-store'`，**防 GitHub Pages 缓存**导致新题不出现。
- 逐题 `normalizeQuestion` 生成 ID（缺省时 `bankId__type__序号`）。
- 去重 key = `type + normText(question)`，保留首个；建立 `aliasToCanonical` 让被去重题的旧 ID 仍能 `resolveId` 到保留题。
- `getActiveQuestions()` = 全部题减去已斩题（`state.banned`）。随机抽题用 active；错题/收藏重做用全部（不受斩题影响）。

### 4.4 已刷题（需求2）
- 答对/答错都会 `recordPracticed(qid)`。
- 设置项 `settings.includePracticed`（默认 true）控制随机抽题是否包含已刷题；关掉后 `Quiz` 抽题会过滤掉 `practicedQids`。
- 「已刷记录」页可单独查看与清空，设置页也有开关。

### 4.5 题库解析（每题 explanation 字段）
每道题的 `explanation` 字段都写有针对性的解析，不只给结论，还讲清相关知识点，并对易混的相似概念做辨析（例如“第一动力/第一资源/第一要务”、“合宪性审查/合法性审查”、“留党察看最长两年”等常考点）。判断题解析会点明“正确/错误”的依据与陷阱所在。维护时若新增题目，建议同样补全 explanation；解析按“题型 + 题干归一化文本”与题目绑定，重复题会共享同一条解析。最初从 Word 导入时 explanation 仅是“本题易错率：X%”的占位，现已全部替换为真正解析（脚本见“历史脚本”说明）。

### 4.6 存档码（需求3）
- `buildArchive()` 打包 `wrongBook/favs/banned/history(限120条)/practiced/settings`。
- `encode`：JSON → UTF-8 字节 → 优先 gzip（`CompressionStream`）→ base64，前缀 `DJZ1:`；浏览器不支持 gzip 时降级纯 base64，前缀 `DJB1:`。`decode` 按前缀反向处理。
- 导入时 `preview()` 给出条目计数预览；用户选**覆盖** `applyOverwrite` / **合并** `applyMerge`（错题次数相加、收藏/斩题取并集、已刷相加、历史按 `finishedAt` 去重）/ **新建存档**（存进 slots）。
- 导入前会 `resolveId` 把存档里的旧题 ID 经别名映射归一，避免题库更新后引用失效。

---

## 5. 常见维护任务怎么做

| 任务 | 操作 |
|---|---|
| 新增题目 | 见 `bank/HOW_TO_ADD_QUESTIONS.md`：加 `bank/setN.json` + 改 `manifest.json`，不动代码 |
| 临时停用某题库 | manifest 里该条 `"enabled": false` |
| 改默认抽题数量 | `js/config.js` 的 `DEFAULT_QUOTA` |
| 改主题色 | `css/styles.css` 顶部 `:root` 变量（`--primary` 等） |
| 加新页面 | 在 `views.js` 写 `renderXxx(app)` 并 export → 在 `app.js` 的 `render()` switch 里加 `case` |
| 升级数据结构 | 改 `config.js` 的 `LS.*` 键名（避免与旧版冲突）并在 `Archive`/`State` 做迁移 |

---

## 6. 测试方法

仓库根目录有 `_test_harness.js`（Node 测试桩，自带 DOM/fetch/localStorage 模拟）。无网络也能跑：

```
node _test_harness.js
```

它会：按序加载全部模块（查引用错误）→ 模拟启动加载题库 → 验证去重数 → 跑一次刷题与判分 → 校验 checkAnswer 四题型 → 收藏/斩题 → 存档编码/预览/合并回环 → 渲染全部视图。全绿即通过。

> 注意：Node 下无 `CompressionStream`，存档会走 `DJB1:` 纯 base64 分支；浏览器里则是 `DJZ1:` gzip。两者可互相解码。

部署：把整个 `djquiz/` 目录推到 GitHub Pages（或任意静态托管）。本地预览：`cd djquiz && python3 -m http.server 8000`，访问 `http://localhost:8000/`。

---

## 7. 已知约束 / 坑

- **必须经 HTTP 访问**：file:// 直接打开会卡在「题库加载失败」（CORS 禁 fetch 本地文件），这是浏览器安全策略，非 bug。
- **localStorage 是按域名/源隔离的**：换设备、换浏览器、清缓存都会丢数据 → 这正是「存档码」存在的理由。
- **JSON 必须合法**：题库文件有语法错会导致该题库整份加载失败（其它题库仍正常，错误会显示在「关于/设置」的题库统计里）。
- 题干「实质重复但答案不同」会被去重只留其一，新增题库时留意。

---

## 8. 自定义确认/输入框（v4.4，重要）

**不要使用原生 `confirm()` / `prompt()` / `alert()`**：微信、部分 App 的内置浏览器会屏蔽 JS 原生弹窗，`confirm()` 直接返回 false、`prompt()` 返回 null，导致所有“需要确认才执行”的操作（各模块的清空/清除/删除、覆盖导入、退出答题、提交考试、存档命名等）全部静默失效。这正是 v4.4 之前“清空功能均不可用”的根因。

改为 `util.js` 内的自定义对话框：
- `U.confirm(message, onOk, opts)`：opts 可含 `{ danger, title, okText, cancelText, icon, onCancel }`，`danger` 默认 true（确定键警示红）。在回调 `onOk` 里写真正要执行的动作。
- `U.prompt(message, defaultValue, onOk, opts)`：`onOk(value)` 收到输入值；取消则不调用。
- 二者用 `.dialog-overlay/.dialog` 样式（与“斩题确认”一致），独立挂到 `document.body`，不走 `S.modal` 路由。

新增需要确认的操作时，一律用 `U.confirm/U.prompt`，禁止再用原生弹窗。

## 9. 浏览器返回键与断点续做（v4.3）

**返回/前进键（v4.3 改为“每视图一条历史记录”模型）**：在 `app.js` 中，每次 `App.go(view)` 都 `history.pushState({view}, '', '#'+view)`，历史栈随浏览深度自然增长；监听 `popstate`，读取 `e.state.view` 切到对应视图——于是浏览器/手机返回键就是“回到上一个页面”，前进键回到下一个页面，而不是直接退出程序。要点：
- 所有“进入某视图”都走 `App.go`（包括 `showSummary→go('summary')`、考试总结进入逐题回顾 `go('review')`、历史详情 `go('review')` 等），这样每个页面都在历史栈里占一条，返回可逐级回退。`App.render()` 仅用于“重渲染当前视图”，不压栈。
- 浮层（q-detail / navigator / import-archive / load-slot / ban-confirm）打开时**不压栈**；返回键在 `onPopState` 里先关闭浮层并把当前视图 `pushHistory` 压回，因此“返回”第一下是关浮层、第二下才回上一页。
- 答题进行中（`view==='quiz'` 且已作答）返回时 `confirm` 二次确认，取消则把 `quiz` 压回、留在原页。
- 启动时 `replaceHistory(初始视图)`；`boot()` 确定最终视图（home 或断点续做的 quiz）后再 `replaceHistory` 一次，使首条记录与实际起始页一致。
- 不支持 History API 的环境用 try/catch 静默降级。

> 早期 v4.1 曾用“单一陷阱记录 + 每次返回重新压陷阱”的方案，在微信内置浏览器里因 pushState 不被当作真正导航而仍会整页退出。v4.3 改为每视图各占一条真实历史记录后，历史栈有了真实深度，微信内也能逐级返回（仅首页返回可能仍由微信关闭页面，属其限制）。

**微信/内置浏览器**：微信 X5/WKWebView 的返回/前进/关闭按钮在原生层处理，少数情况下仍可能直接关页面，页面无法完全拦截。应对：①首页在检测到微信 UA 时给出提示，引导用页面内“←”或“···→在浏览器打开”；②最关键的兜底是**断点续做**。

**断点续做（resume）**：见 `state.js` 的 `saveResume / loadResume / clearResume`，键 `LS.RESUME`。
- 只在「答题进行中」持久化，离开答题即清除（钩子在 `app.js` 的 `render()` 末尾）。
- **只存题目 id + 作答**，恢复时用 `Bank.findById` 重新取回题目对象——**绝不要直接序列化整个 `session`**，因为答题时会话上挂了临时 DOM 引用（`_opts/_tfBtns/_fillInput/_multiSelected`），`JSON.stringify` 会因循环引用失败。
- `boot()` 成功后调用 `loadResume()`，命中（12 小时内、未答完）则恢复 `session` 并进入 `quiz` 视图，提示「已恢复上次未完成的练习」。题库变动后找不到的题会被跳过。

## 10. 版本变更速览

- **v4.0**：题库与程序分离、模块化、刷题记录、存档同步、自动去重。
- **v4.1**：① 每题补全真实解析（知识点 + 相似概念辨析），见 §4.5；② 存档同步提升为首页醒目入口，文案聚焦「跨设备同步」；③ 浏览器返回键逐级返回，见 §9；④ 首页提示改为面向用户的「使用说明」，出题指南页标注「面向开发者」。
- **v4.2**：① 断点续做：答题进度自动保存，意外关闭后重新打开自动恢复，见 §9；② 修复会话因挂载临时 DOM 引用导致无法序列化的隐患。
- **v4.3**：浏览器返回/前进键改为“每视图一条历史记录”模型（参考通用单页应用做法），返回键逐级回到上一页、前进键回到下一页；历史栈有真实深度后微信内也能逐级返回，见 §9。
- **v4.4**：① 修复各模块“清空/清除/删除”等确认操作在微信等内置浏览器中失效的问题——改用应用内自定义确认/输入框（`U.confirm` / `U.prompt`），见 §8；② 移除首页针对微信用户的专属提示。

## 11. 历史脚本（一次性，已执行，不在交付包内）

题库解析是一次性批量生成的：先用脚本按「题型 + 题干归一化」提取 193 道唯一题，人工逐题撰写解析，再用注入脚本按归一化题干写回三份 `bank/set*.json` 的每一道题（含重复题，共 300 处）。这些脚本是一次性工具，已执行完毕，成果固化在题库 JSON 中，无需保留或重跑。今后新增题目时直接在 JSON 里手写 `explanation` 即可。
