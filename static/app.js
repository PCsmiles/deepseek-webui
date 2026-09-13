/* ============================================================================
   deepseek webui — 前端逻辑（v2：侧栏 + 气泡 + 彩色卡片）
   Key 永远只在后端；浏览器只跟本机 127.0.0.1 说话。
   ============================================================================ */
'use strict';

const LS_CONV = 'dsui.conversations.v1';
const LS_SET  = 'dsui.settings.v1';
const LS_CUR  = 'dsui.current.v1';

const DEFAULT_SETTINGS = {
  theme: 'dark', system: '', temperature: 0.7, max_tokens: 4096,
  enterSend: true, showThinking: true, lineNumbers: false,
  // 余额进度条的"充值基准"：{amt 充值那刻的余额, ts, top 当时累计充值额, topup 这次充了多少}
  // 没值时第一次读到余额会以当前余额起算（100%），以后一检测到余额上涨就自动重置
  balBase: null,
  // workspace 留空 = 用后端 config.json 里配的那个（打包版会配成她的"文档\工作区"）
  // workspace：网页版**没有**"选工作区"这回事（用户明确要求删掉）——它是内部值，
  // 只决定干活时的落脚点，界面不暴露。留空 = 用后端 config.json（打包版配成她的文档\工作区），
  // 再留空 = E:\。记忆跟它无关（server.py 会自动把该目录的记忆接上共享记忆）。
  model: 'deepseek-flash', workspace: '', readonly: false, mode: 'chat',
  useMemory: true,      // CHAT 模式是否带上长期记忆（跟终端共用那一份）
  animations: true,     // 界面动画（这台机器系统里动画是关的，所以自己管，不看 prefers-reduced-motion）
};

const PAGE = 60;
const TOOL_CN = {
  Read: '读文件', Write: '写文件', Edit: '改文件', MultiEdit: '改文件', NotebookEdit: '改笔记',
  Bash: '跑命令', PowerShell: '跑命令', Glob: '找文件', Grep: '搜内容',
  WebSearch: '联网搜索', WebFetch: '抓网页', Task: '子任务', TodoWrite: '待办', Skill: '技能',
};
const TOOL_COLOR = {
  Read: 'var(--cyan)', Glob: 'var(--cyan)', Grep: 'var(--cyan)',
  Write: 'var(--amber)', Edit: 'var(--amber)', MultiEdit: 'var(--amber)', NotebookEdit: 'var(--amber)',
  Bash: 'var(--green)', PowerShell: 'var(--green)',
  WebSearch: 'var(--violet)', WebFetch: 'var(--violet)',
};
// 工具类型 → 图标名（用统一笔触的 SVG，不用 emoji——emoji 是"业余感"最大的来源）
const TOOL_ICON = {
  Read: 'eye', Glob: 'search', Grep: 'search',
  Write: 'pencil', Edit: 'pencil', MultiEdit: 'pencil', NotebookEdit: 'pencil',
  Bash: 'terminal', PowerShell: 'terminal',
  WebSearch: 'globe', WebFetch: 'globe',
  Task: 'link', Skill: 'spark',
};

// 图标库：24×24 viewBox，1.7px 描边，圆头圆角，全部继承 currentColor
const ICONS = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.2"/>',
  pencil: '<path d="M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/>',
  terminal: '<path d="m5 8 4 4-4 4"/><path d="M12 16h7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.5 2.6 14.5 0 17-2.6-2.5-2.6-14.5 0-17Z"/>',
  link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
  spark: '<path d="M12 4l1.7 5.3L19 11l-5.3 1.7L12 18l-1.7-5.3L5 11l5.3-1.7Z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2M12 19.2v2M4.5 7.5l1.7 1M17.8 15.5l1.7 1M4.5 16.5l1.7-1M17.8 8.5l1.7-1"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  arrowUp: '<path d="M12 19V5.5"/><path d="m6 11.5 6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.2"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M6.5 15h-1A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5v1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-1.7 5.7"/><path d="M20 5.5V11h-5.5"/>',
  thumbUp: '<path d="M7 21V10.5l4-7a1.8 1.8 0 0 1 2.4 1.7V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.2 21H7Z"/><path d="M7 10.5H4.5A1.5 1.5 0 0 0 3 12v7.5A1.5 1.5 0 0 0 4.5 21H7"/>',
  thumbDown: '<path d="M17 3v10.5l-4 7a1.8 1.8 0 0 1-2.4-1.7V15H5.6a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.8 3H17Z"/><path d="M17 13.5h2.5A1.5 1.5 0 0 0 21 12V4.5A1.5 1.5 0 0 0 19.5 3H17"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  warn: '<path d="M12 3.8 21 20H3Z"/><path d="M12 10v4.2M12 17.2h.01"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
  git: '<circle cx="6.5" cy="6" r="2.6"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="12" r="2.6"/><path d="M6.5 8.6v6.8"/><path d="M9.1 6h3.4a2.4 2.4 0 0 1 2.4 2.4v1.1"/><path d="M9.1 18h3.4a2.4 2.4 0 0 0 2.4-2.4v-1.1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z"/><path d="M12 14v7"/>',
};
function ic(name, size = 14) {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" `
    + `aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
}

const state = {
  convs: [], currentId: null,
  settings: { ...DEFAULT_SETTINGS },
  config: null, token: '',
  streaming: false, streamingMsgId: null, abort: null,
  attach: [], shown: PAGE, search: '',
  agentReady: false, sidebarOpen: false,
};

const $ = (id) => document.getElementById(id);
const nodes = {
  app: $('app'), side: $('side'), sideMask: $('sideMask'), btnSide: $('btnSide'), brandName: $('brandName'),
  brandSub: $('brandSub'), btnNew: $('btnNew'), search: $('search'), convList: $('convList'),
  balText: $('balText'), balDot: $('balDot'), btnBalance: $('btnBalance'),
  balBar: $('balBar'), balFill: $('balFill'), balPct: $('balPct'), balLbl: $('balLbl'),
  balPop: $('balPop'), balBar2: $('balBar2'), balFill2: $('balFill2'),
  balPopNum: $('balPopNum'), balPopCur: $('balPopCur'), balPopBadge: $('balPopBadge'),
  balPopBase: $('balPopBase'), balPopWhen: $('balPopWhen'), balPopUsed: $('balPopUsed'),
  balPopRefresh: $('balPopRefresh'), balPopReset: $('balPopReset'), balPopNote: $('balPopNote'),
  btnTheme: $('btnTheme'), btnSettings: $('btnSettings'), btnKeys: $('btnKeys'),
  convTitle: $('convTitle'), topMeta: $('topMeta'), modeSwitch: $('modeSwitch'),
  btnPalette: $('btnPalette'), btnExport: $('btnExport'),
  stream: $('stream'), streamInner: $('streamInner'), streamFoot: $('streamFoot'),
  banner: $('banner'), chips: $('chips'), composer: $('composer'),
  input: $('input'), btnAttach: $('btnAttach'), btnSend: $('btnSend'), btnStop: $('btnStop'),
  hint: $('hint'), hintRight: $('hintRight'),
  palette: $('palette'), palInput: $('palInput'), palList: $('palList'), palHint: $('palHint'),
  settings: $('settings'), setClose: $('setClose'), setModel: $('setModel'), setTheme: $('setTheme'),
  setKey: $('setKey'), setKeyEye: $('setKeyEye'), keyNote: $('keyNote'), setBase: $('setBase'),
  setTemp: $('setTemp'), tempVal: $('tempVal'), setMax: $('setMax'), setSystem: $('setSystem'),
  setProtocol: $('setProtocol'), modelList: $('modelList'),
  setAgentBase: $('setAgentBase'), setAgentKey: $('setAgentKey'), setAgentModel: $('setAgentModel'),
  setAgentEye: $('setAgentEye'), btnTestChat: $('btnTestChat'), btnTestAgent: $('btnTestAgent'),
  btnClaudeUpdate: $('btnClaudeUpdate'), testNote: $('testNote'),
  setup: $('setup'), suClose: $('suClose'), tplDeepseek: $('tplDeepseek'), tplOpenai: $('tplOpenai'),
  tplAnthropic: $('tplAnthropic'), suProtocol: $('suProtocol'), suModel: $('suModel'),
  suBase: $('suBase'), suKey: $('suKey'), suSame: $('suSame'), suAgentBox: $('suAgentBox'),
  suAgentBase: $('suAgentBase'), suAgentKey: $('suAgentKey'), suAgentModel: $('suAgentModel'),
  suAsr: $('suAsr'), suTestChat: $('suTestChat'),
  suTestAgent: $('suTestAgent'), suNote: $('suNote'), suSave: $('suSave'),
  setReadonly: $('setReadonly'), setLineNo: $('setLineNo'),
  setReason: $('setReason'), setEnter: $('setEnter'), btnOpenFolder: $('btnOpenFolder'),
  btnExportAll: $('btnExportAll'), aboutNote: $('aboutNote'),
  memPick: $('memPick'), memOpen: $('memOpen'), memEdit: $('memEdit'),
  memSave: $('memSave'), memNote: $('memNote'), setMemory: $('setMemory'),
  setMotion: $('setMotion'), onboard: $('onboard'), obClose: $('obClose'), btnAgain: $('btnAgain'),
  btnGit: $('btnGit'), gitBadge: $('gitBadge'), btnUsage: $('btnUsage'),
  btnSettingsTop: $('btnSettingsTop'),
  gitWs: $('gitWs'), gitWsSet: $('gitWsSet'),
  gitWsNow: $('gitWsNow'), gitWsEdit: $('gitWsEdit'), gitWsRow: $('gitWsRow'),
  gitModal: $('gitModal'), gitClose: $('gitClose'), gitHead: $('gitHead'), gitMsg: $('gitMsg'),
  gitInit: $('gitInit'), gitCommit: $('gitCommit'), gitRestoreAll: $('gitRestoreAll'),
  gitList: $('gitList'), gitDiff: $('gitDiff'),
  usageModal: $('usageModal'), usageClose: $('usageClose'), usageBody: $('usageBody'),
  keysModal: $('keysModal'), keysClose: $('keysClose'), searchIco: $('searchIco'),
  lightbox: $('lightbox'), toast: $('toast'), fileInput: $('fileInput'),
};
const live = new Map();   // msgId -> {bodyEl, mdEl, thinkEl, logEl, actsEl, msg}

// ══════════════ 小工具 ══════════════
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => (n || 0).toLocaleString('en-US');
const fmtSize = (n) => n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(0) + 'KB' : (n / 1048576).toFixed(1) + 'MB';
const fmtDur = (ms) => ms < 60000 ? (ms / 1000).toFixed(1) + 's' : `${Math.floor(ms / 60000)}m${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`;
function fullTime(ts) {
  const d = new Date(ts || Date.now()), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60e3) return '刚刚';
  if (d < 3600e3) return Math.floor(d / 60e3) + '分钟前';
  if (d < 86400e3) return Math.floor(d / 3600e3) + '小时前';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + '天前';
  const t = new Date(ts); return `${t.getMonth() + 1}/${t.getDate()}`;
}
function dayGroup(ts) {
  const d = new Date(ts || 0), now = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return '今天';
  const y = new Date(now.getTime() - 86400e3);
  if (same(d, y)) return '昨天';
  if (Date.now() - ts < 7 * 86400e3) return '本周';
  return '更早';
}
let toastTimer = null;
function toast(msg, ms = 2400) {
  nodes.toast.textContent = msg;
  nodes.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => nodes.toast.classList.add('hidden'), ms);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    try {
      const ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}
async function apiFetch(url, opts) {
  const doFetch = () => {
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({}, o.headers || {}, { 'X-DSUI-Token': state.token });
    return fetch(url, o);
  };
  let res = await doFetch();
  // 403 = 令牌不对（多半是服务刚重启过、页面手里是旧令牌）→ 重新取一个再试一次，
  // 用户不用手动刷新页面
  if (res && res.status === 403) {
    try {
      const cfg = await (await fetch('/api/config')).json();
      if (cfg && cfg.token) {
        state.token = cfg.token;
        res = await doFetch();
        if (res.status !== 403) console.info('访问令牌已自动更新');
      }
    } catch (e) { /* 后端真连不上，交给调用方报错 */ }
  }
  return res;
}

// ══════════════ 存档 ══════════════
function lsGet(key, def) {
  try { const raw = localStorage.getItem(key); return raw == null ? def : JSON.parse(raw); }
  catch (e) {
    try { const raw = localStorage.getItem(key); if (raw) localStorage.setItem('dsui.corrupt.' + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast('本地存的会话读不出来（数据损坏），已重置'), 500);
    return def;
  }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { if (/quota|exceed/i.test(e.name + e.message)) toast('浏览器存储满了：设置里导出后删掉些旧会话', 5000); return false; }
}
const saveAll = () => lsSet(LS_CONV, state.convs);
const saveSettings = () => lsSet(LS_SET, state.settings);
const saveCurrentId = () => lsSet(LS_CUR, state.currentId);

// ══════════════ 会话 ══════════════
const currentConv = () => state.convs.find((c) => c.id === state.currentId) || null;
const convMode = (c) => (c && c.mode) || 'chat';

function newConversation(activate = true) {
  const c = {
    id: uid(), title: '', createdAt: Date.now(), updatedAt: Date.now(),
    model: state.settings.model, mode: state.settings.mode || 'chat',
    workspace: state.settings.workspace || 'E:\\', messages: [],
  };
  state.convs.unshift(c);
  state.freshConvId = c.id;                 // 侧栏里这条会滑入
  if (activate) { state.currentId = c.id; saveCurrentId(); }
  saveAll();
  if (activate) { state.shown = PAGE; render(); renderSidebar(); syncMode(); closeSide(); focusInput(); }
  return c;
}
function touchConv(c) { c.updatedAt = Date.now(); saveAll(); scheduleBackup(c); renderSidebar(); }
function titleFrom(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 34 ? t.slice(0, 34) + '…' : (t || '新会话');
}
const backupTimers = new Map();
function scheduleBackup(conv) {
  clearTimeout(backupTimers.get(conv.id));
  backupTimers.set(conv.id, setTimeout(() => backupConv(conv), 900));
}
async function backupConv(conv) {
  try {
    await apiFetch('/api/conversations/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: conv.id, data: conv }),
    });
  } catch (e) {}
}
const deleteBackup = (id) => apiFetch('/api/conversations/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});

async function restoreFromDisk() {
  let j;
  try { j = await (await apiFetch('/api/conversations/list')).json(); } catch (e) { return 0; }
  if (!j || !j.ok) return 0;
  const diskIds = new Set((j.items || []).map((i) => i.id));
  let restored = 0;
  for (const it of j.items || []) {
    const local = state.convs.find((c) => c.id === it.id);
    if (local && (local.updatedAt || 0) >= (it.updatedAt || 0)) continue;
    try {
      const jj = await (await apiFetch('/api/conversations/' + encodeURIComponent(it.id))).json();
      if (!jj.ok || !jj.data) continue;
      const d = jj.data;
      if (!Array.isArray(d.messages)) d.messages = [];
      if (local) Object.assign(local, d); else { state.convs.push(d); restored++; }
    } catch (e) {}
  }
  for (const c of state.convs) if (!diskIds.has(c.id)) backupConv(c);
  state.convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveAll();
  return restored;
}

// ══════════════ 主题 ══════════════
function applyTheme() {
  const t = state.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  nodes.btnTheme.innerHTML = ic(t === 'dark' ? 'moon' : 'sun', 16);
  nodes.btnTheme.title = t === 'dark' ? '切到浅色 (Ctrl+J)' : '切到深色 (Ctrl+J)';
  const d = $('hljsDark'), l = $('hljsLight');
  if (d && l) { d.disabled = t !== 'dark'; l.disabled = t === 'dark'; }
}
/** 界面动画：自己管开关（系统里 prefers-reduced-motion 是 reduce，不能听它的） */
function applyMotion() {
  document.documentElement.classList.toggle('no-motion', state.settings.animations === false);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 切换会话：旧的先淡出滑走，新的再滑入（真·渐进渐出） */
async function switchConvTo(id) {
  if (state.currentId === id) return;
  if (state.settings.animations !== false) {
    nodes.streamInner.classList.add('leaving');
    await sleep(150);
  }
  nodes.streamInner.classList.remove('leaving');
  state.currentId = id;
  state.shown = PAGE;
  saveCurrentId();
  render();
  renderSidebar();
  syncMode();
  // 顶栏标题也淡一下
  const tt = nodes.convTitle.parentElement;
  tt.classList.remove('swap');
  void tt.offsetWidth;
  tt.classList.add('swap');
  closeSide();
}

/** 把界面上写死的那些符号换成统一图标（emoji 是"业余感"最大的破绽） */
function initIcons() {
  const set = (n, name, size) => { if (n) n.innerHTML = ic(name, size); };
  set(nodes.btnSide, 'menu', 17);
  set(nodes.btnSettings, 'gear', 16);
  set(nodes.btnKeys, 'keyboard', 16);
  set(nodes.btnAttach, 'plus', 18);
  set(nodes.btnSend, 'arrowUp', 17);
  set(nodes.btnStop, 'stop', 13);
  set(nodes.btnPalette, 'search', 15);
  set(nodes.btnExport, 'download', 15);
  set(nodes.keysClose, 'close', 14);
  set(nodes.setClose, 'close', 15);
  set(nodes.searchIco, 'search', 13);
  set(nodes.btnGit, 'git', 15);
  set(nodes.btnUsage, 'chart', 15);
  set(nodes.btnSettingsTop, 'gear', 16);
  if (nodes.btnNew) nodes.btnNew.innerHTML = ic('plus', 16) + '<span>新建会话</span>';
}

// ══════════════ Markdown / 代码 / 公式 ══════════════
let mdTried = false, libsLeft = 2;
function libReady() { if (--libsLeft > 0) return; if (!state.streaming) render(); }
function ensureLibs() {
  if (mdTried) return; mdTried = true;
  loadScript(['/static/vendor/marked.min.js', 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'], 'marked', libReady);
  loadScript(['/static/vendor/highlight.min.js', 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js'], 'hljs');
  loadScript(['/static/vendor/katex.min.js', 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'], 'katex', libReady);
  loadCss(['/static/vendor/katex.min.css', 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'], 'katexCss');
}
function loadScript(urls, g, onReady) {
  if (window[g]) { if (onReady) onReady(); return; }
  const done = () => { if (onReady && window[g]) onReady(); };
  const s = document.createElement('script');
  s.src = urls[0]; s.onload = done;
  s.onerror = () => {
    if (!urls[1]) return;
    const s2 = document.createElement('script'); s2.src = urls[1]; s2.onload = done;
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
}
function loadCss(urls, id) {
  const link = $(id); if (!link) return;
  link.addEventListener('error', () => { if (urls[1]) link.href = urls[1]; }, { once: true });
  fetch(urls[0], { method: 'HEAD' }).then((r) => { if (!r.ok && urls[1]) link.href = urls[1]; }).catch(() => {});
}
function renderKatex(tex, display) {
  if (!window.katex) return null;
  try {
    const h = window.katex.renderToString(tex.trim(), { displayMode: !!display, throwOnError: false, output: 'html', strict: false });
    return (!h || h.indexOf('katex-error') >= 0) ? null : h;
  } catch (e) { return null; }
}
function extractMath(text) {
  if (!window.katex || !/[$\\]/.test(text)) return { text, store: [] };
  const store = [];
  const stash = (tex, display) => {
    const h = renderKatex(tex, display);
    if (h == null) return null;
    store.push(h);
    return '\uE000M' + (store.length - 1) + '\uE001';
  };
  const segs = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/);
  for (let i = 0; i < segs.length; i += 2) {
    segs[i] = segs[i]
      .replace(/\\\[([\s\S]+?)\\\]/g, (m, t) => stash(t, true) ?? m)
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => stash(t, true) ?? m)
      .replace(/\\\(([\s\S]+?)\\\)/g, (m, t) => stash(t, false) ?? m)
      .replace(/(^|[^\\$])\$([^\n$]{1,240}?)\$(?!\d)/g, (m, pre, t) => {
        const k = stash(t, false); return k == null ? m : pre + k;
      });
  }
  return { text: segs.join(''), store };
}
function sanitizeHtml(html) {
  const t = document.createElement('div');
  t.innerHTML = html;
  t.querySelectorAll('script,iframe,object,embed,link,meta,style,form,input').forEach((n) => n.remove());
  t.querySelectorAll('*').forEach((n) => {
    for (const a of Array.from(n.attributes)) {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      if ((a.name === 'href' || a.name === 'src') && /^\s*(javascript|data:text\/html)/i.test(a.value)) n.removeAttribute(a.name);
    }
  });
  return t.innerHTML;
}
function renderMarkdown(text) {
  const p = extractMath(text);
  let html = null;
  if (window.marked) { try { html = sanitizeHtml(window.marked.parse(p.text, { gfm: true, breaks: true })); } catch (e) {} }
  if (html == null) html = '<p>' + escapeHtml(p.text).replace(/\n/g, '<br>') + '</p>';
  if (p.store.length) html = html.replace(/\uE000M(\d+)\uE001/g, (m, i) => p.store[+i] || '');
  return html;
}
function enhance(root, streaming) {
  root.querySelectorAll('pre > code').forEach((code) => {
    if (code.closest('.cb')) return;
    const pre = code.parentElement;
    const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
    let lang = cls ? cls.slice(9) : '';
    const raw = code.textContent || '';
    const isDiff = (lang === 'diff') || (/^[+-][^+-]/m.test(raw) && /^[+-]/m.test(raw.slice(0, 400)));
    if (isDiff && !lang) lang = 'diff';
    const box = el('div', 'cb');
    const head = el('div', 'cb-head');
    head.appendChild(el('span', null, lang || 'text'));
    const btn = el('button', 'cbtn', '⧉ 复制');
    btn.addEventListener('click', async () => {
      const ok = await copyText(raw);
      btn.textContent = ok ? '✓ 已复制' : '复制失败';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = '⧉ 复制'; btn.classList.remove('done'); }, 1800);
    });
    head.appendChild(btn);
    box.appendChild(head);
    pre.replaceWith(box); box.appendChild(pre);
    if (window.hljs && !streaming) { try { window.hljs.highlightElement(code); } catch (e) {} }
    if (state.settings.lineNumbers && !isDiff) {
      const n = raw.replace(/\n$/, '').split('\n').length;
      if (n > 1 && n <= 800) {
        const g = el('span', 'gutter');
        g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        pre.insertBefore(g, code);
      }
    }
  });
  root.querySelectorAll('table').forEach((t) => {
    if (t.closest('.table-wrap')) return;
    const w = el('div', 'table-wrap'); t.replaceWith(w); w.appendChild(t);
  });
  root.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  root.querySelectorAll('img').forEach((im) => {
    im.style.cursor = 'zoom-in';
    im.addEventListener('click', () => {
      nodes.lightbox.querySelector('img').src = im.src;
      nodes.lightbox.classList.remove('hidden');
    });
  });
}

// ══════════════ 渲染：消息 ══════════════
function tagEl(a, withRemove, onRemove) {
  const t = el('span', 'tag ' + (a.busy ? 'busy' : a.bad ? 'bad' : ''));
  const icon = { image: '🖼', pdf: '📄', doc: '📝', sheet: '📊', slides: '📑', audio: '🎙', video: '🎬' }[a.kind] || '📎';
  t.appendChild(el('span', null, icon));
  t.appendChild(el('b', null, a.name || a.id));
  if (a.busy) t.appendChild(el('span', null, '解析中…'));
  else if (a.note) t.appendChild(el('span', null, a.note));
  else if (a.size) t.appendChild(el('span', null, fmtSize(a.size)));
  if (withRemove) {
    const x = el('button', 'rm', '✕');
    x.title = '移除';
    x.addEventListener('click', onRemove);
    t.appendChild(x);
  }
  return t;
}
function buildToolEl(s) {
  const color = TOOL_COLOR[s.name] || 'var(--accent)';
  const box = el('div', 'tool');
  box.style.setProperty('--toolc', color);
  const head = el('div', 'tool-head');
  const ico = el('span', 'tool-ico');
  ico.innerHTML = ic(TOOL_ICON[s.name] || 'spark', 14);
  head.appendChild(ico);
  head.appendChild(el('span', 'tool-name', TOOL_CN[s.name] || s.name));
  head.appendChild(el('span', 'tool-sum', s.summary || ''));
  const st = el('span', 'tool-st ' + (s.kind === 'denied' || s.is_error ? 'bad' : (s.status || '')),
    s.kind === 'denied' ? '被拒绝' : s.status === 'run' ? '执行中…' : s.is_error ? '出错' : s.status === 'ok' ? '完成' : '');
  head.appendChild(st);
  head.addEventListener('click', () => box.classList.toggle('collapsed'));
  box.appendChild(head);
  if (s.body) {
    box.appendChild(el('pre', 'tool-body', s.body));
    if (s.body.length > 400) box.classList.add('collapsed');
  } else box.classList.add('collapsed');
  return box;
}
/** 思考过程的折叠标题：图标 + 文字（图标也是 SVG，跟别处一套） */
function thinkSummary(label) {
  const s = el('summary');
  const i = el('span');
  i.innerHTML = ic('spark', 13);
  i.style.display = 'grid';
  const t = el('span', null, label);
  s.appendChild(i); s.appendChild(t);
  return { el: s, setText: (v) => { t.textContent = v; } };
}
function buildReasonEl(text, open) {
  const d = el('details', 'think');
  if (open) d.open = true;
  const sum = thinkSummary('思考过程');
  const b = el('div', 'think-body');
  b.textContent = text || '';
  d.appendChild(sum.el); d.appendChild(b);
  const api = {
    el: d, body: b, summary: sum.el, touched: false,
    refresh: () => sum.setText('思考过程 · ' + (b.textContent || '').length + ' 字'),
  };
  api.refresh();
  sum.el.addEventListener('click', () => { api.touched = true; });
  return api;
}
function buildMessageEl(msg) {
  const wrap = el('div', 'msg ' + msg.role);
  wrap.dataset.id = msg.id;
  const av = el('div', 'avatar ' + (msg.role === 'user' ? 'me' : 'ai'), msg.role === 'user' ? '我' : 'D');
  const body = el('div', 'body');
  wrap.appendChild(av); wrap.appendChild(body);

  if (msg.role === 'user') {
    if (msg.attach && msg.attach.length) {
      const tags = el('div', 'tags');
      msg.attach.forEach((a) => tags.appendChild(tagEl(a, false)));
      body.appendChild(tags);
    }
    if (msg.images && msg.images.length) {
      const im = el('div', 'user-imgs');
      msg.images.forEach((x) => { const i = el('img'); i.src = x.url || ('/api/image/' + x.id); im.appendChild(i); });
      body.appendChild(im);
    }
    if (msg.content) body.appendChild(el('div', 'bubble', msg.content));
    const acts = el('div', 'acts');
    const c = el('button', null, '⧉ 复制');
    c.addEventListener('click', async () => { await copyText(msg.content || ''); toast('已复制'); });
    acts.appendChild(c);
    acts.appendChild(el('span', 'sp'));
    acts.appendChild(el('span', 'meta', fullTime(msg.ts)));
    body.appendChild(acts);
    live.set(msg.id, { bodyEl: body, msg });
    return wrap;
  }

  // ---- AI ----
  const who = el('div', 'who');
  who.appendChild(el('b', null, msg.agent ? 'claude code' : (state.brand || 'deepseek')));
  who.appendChild(el('span', null, timeAgo(msg.ts)));
  if (msg.agent) who.appendChild(el('span', null, '· AGENT'));
  body.appendChild(who);

  let thinkEl = null, thinkBody = null;
  if (msg.reasoning && state.settings.showThinking) {
    thinkEl = buildReasonEl(msg.reasoning, false);
    thinkBody = thinkEl.body;
    body.appendChild(thinkEl.el);
  }
  let logEl = null;
  if (msg.agent) { logEl = el('div'); body.appendChild(logEl); renderTools(logEl, msg); }

  const md = el('div', 'md');
  if (msg.content) { md.innerHTML = renderMarkdown(msg.content); enhance(md, false); }
  body.appendChild(md);

  const acts = el('div', 'acts');
  body.appendChild(acts);
  live.set(msg.id, { bodyEl: body, mdEl: md, thinkEl, thinkBody, logEl, actsEl: acts, msg });
  renderActs(acts, msg);
  return wrap;
}
function renderTools(box, msg) {
  if (!box) return;
  box.innerHTML = '';
  (msg.steps || []).forEach((s) => box.appendChild(buildToolEl(s)));
}
function renderActs(acts, msg) {
  acts.innerHTML = '';
  const mk = (iconName, title, fn) => {
    const b = el('button');
    b.innerHTML = ic(iconName, 15);
    b.title = title;
    b.addEventListener('click', fn); acts.appendChild(b); return b;
  };
  mk('copy', '复制全文', async () => { const ok = await copyText(msg.content || ''); toast(ok ? '已复制' : '复制失败'); });
  if (!msg.agent) mk('refresh', '重新生成', () => regenerate(msg));
  const up = mk('thumbUp', '有用', () => setFeedback(msg, 'up'));
  if (msg.feedback === 'up') up.classList.add('on');
  const dn = mk('thumbDown', '没用', () => setFeedback(msg, 'down'));
  if (msg.feedback === 'down') dn.classList.add('on');
  acts.appendChild(el('span', 'sp'));
  const bits = [];
  if (msg.stopped) bits.push('已中断');
  if (msg.elapsed) bits.push(fmtDur(msg.elapsed));
  if (msg.usage && msg.usage.total_tokens) bits.push(fmtNum(msg.usage.total_tokens) + ' tokens');
  else if (msg.agentUsage) bits.push(`↑${fmtNum(msg.agentUsage.input_tokens)} ↓${fmtNum(msg.agentUsage.output_tokens)}`);
  acts.appendChild(el('span', 'meta', bits.join(' · ')));
}
function renderWelcome() {
  const w = el('div', 'welcome');
  w.appendChild(el('div', 'big', '今天想做什么？'));
  w.appendChild(el('div', 'sub', '直接开问，或者切到 AGENT 让它真的动你电脑'));
  const g = el('div', 'cards');
  const items = [
    ['解释概念', '用生活里的例子讲讲 SLAM 里的卡尔曼滤波'],
    ['写段代码', '用 Python 写个读 CSV 算平均值的函数，带中文注释'],
    ['总结文档', '点下面的 ＋ 丢个 PDF / Word / 录音进来，我帮你总结'],
    ['干活', '切到 AGENT：让它改文件、跑命令、调环境'],
  ];
  items.forEach(([t, d]) => {
    const b = el('button', 'card');
    b.innerHTML = `<b>${escapeHtml(t)}</b>${escapeHtml(d)}`;
    b.addEventListener('click', () => {
      if (t === '总结文档') { nodes.fileInput.click(); return; }
      if (t === '干活') { setMode('agent'); return; }
      nodes.input.value = d; autoGrow(); focusInput();
    });
    g.appendChild(b);
  });
  w.appendChild(g);
  nodes.streamInner.appendChild(w);
}
/** 换会话就播一次入场（放在 render 最前面，空会话的欢迎页也要播） */
function playEnterIfSwitched(id) {
  if (state.lastConvId === id) return;
  state.lastConvId = id;
  nodes.streamInner.classList.remove('enter', 'leaving');
  void nodes.streamInner.offsetWidth;
  nodes.streamInner.classList.add('enter');
}

function render() {
  const conv = currentConv();
  playEnterIfSwitched(conv ? conv.id : '(none)');
  live.clear();
  nodes.streamInner.innerHTML = '';
  nodes.streamFoot.innerHTML = '';
  if (!conv || !conv.messages.length) { renderWelcome(); syncTop(); return; }
  const total = conv.messages.length;
  const start = Math.max(0, total - state.shown);
  if (start > 0) {
    const b = el('button', 'load-more', `▲ 加载更早的 ${start} 条`);
    b.addEventListener('click', () => { state.shown += PAGE; render(); });
    nodes.streamFoot.appendChild(b);
  }
  const frag = document.createDocumentFragment();
  conv.messages.slice(start).forEach((m) => {
    const empty = m.role === 'assistant' && !m.content && !m.reasoning && !(m.steps || []).length && !m.error;
    if (empty && m.id !== state.streamingMsgId) return;
    const elm = buildMessageEl(m);
    // 只有刚发出来的消息才播入场动画（刷新历史时不要一堆一起动）
    if (m.ts && Date.now() - m.ts < 3000) elm.classList.add('new');
    frag.appendChild(elm);
  });
  nodes.streamInner.appendChild(frag);
  const kids = Array.from(nodes.streamInner.children);
  // 每条消息给个序号，切换会话时按顺序渐出（抽屉感）
  kids.forEach((k, i) => k.style.setProperty('--i', String(Math.min(i, 8))));
  // 最后一条 AI 消息的操作栏常显（省得每次都要用鼠标划过去才看得见）
  for (let i = kids.length - 1; i >= 0; i--) {
    const n = live.get(kids[i].dataset.id);
    if (n && n.actsEl) { n.actsEl.classList.add('pinned'); break; }
  }
  scrollBottom(true);
  syncTop();
}
function scrollBottom(force) {
  const s = nodes.stream;
  if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 160) s.scrollTop = s.scrollHeight;
}

// ══════════════ 侧栏 ══════════════
function renderSidebar() {
  const q = state.search.trim().toLowerCase();
  const list = state.convs.slice()
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || ((b.updatedAt || 0) - (a.updatedAt || 0)))
    .filter((c) => !q || (c.title || '').toLowerCase().includes(q) ||
      c.messages.some((m) => (m.content || '').toLowerCase().includes(q)));
  // 只清条目，保留那个会"滑"的选中指示块（清掉它就滑不起来了）
  Array.from(nodes.convList.children).forEach((c) => {
    if (!c.classList.contains('conv-ind')) c.remove();
  });
  if (!list.length) {
    nodes.convList.appendChild(el('div', 'conv-empty', q ? '没有匹配的会话' : '还没有会话'));
    return;
  }
  let lastGroup = '';
  list.forEach((c) => {
    const g = c.pinned ? '置顶' : dayGroup(c.updatedAt);
    if (g !== lastGroup) { nodes.convList.appendChild(el('div', 'conv-group', g)); lastGroup = g; }
    const cls = 'conv-item' + (c.id === state.currentId ? ' active' : '')
      + (c.id === state.freshConvId ? ' fresh' : '');
    const b = el('button', cls);
    b.appendChild(el('span', 't', c.title || '新会话'));
    b.appendChild(el('span', 'n', String(c.messages.length)));
    const pin = el('button', 'pin' + (c.pinned ? ' on' : ''));
    pin.innerHTML = ic('pin', 12);
    pin.title = c.pinned ? '取消置顶' : '置顶';
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      c.pinned = !c.pinned;
      saveAll(); renderSidebar();
    });
    b.appendChild(pin);
    const del = el('button', 'del', '✕');
    del.title = '删除';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(c.id); });
    b.appendChild(del);
    b.addEventListener('click', () => selectConversation(c.id));
    nodes.convList.appendChild(b);
  });
  state.freshConvId = null;
  // 选中指示块：位置一变就"滑"过去（而不是跳）
  let ind = nodes.convList.querySelector('.conv-ind');
  if (!ind) { ind = el('span', 'conv-ind'); nodes.convList.appendChild(ind); }
  const act = nodes.convList.querySelector('.conv-item.active');
  if (act) {
    if (!ind.dataset.ready) {                      // 首次定位不播动画
      ind.style.transition = 'none';
      ind.dataset.ready = '1';
      requestAnimationFrame(() => { ind.style.transition = ''; });
    }
    ind.style.transform = `translateY(${act.offsetTop}px)`;
    ind.style.height = act.offsetHeight + 'px';
    ind.style.opacity = '1';
  } else {
    ind.style.opacity = '0';
  }
}
function selectConversation(id) {
  if (state.streaming) { toast('正在生成，先按 Esc 中断'); return; }
  switchConvTo(id);
}
function deleteConversation(id) {
  const c = state.convs.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`删除「${c.title || '新会话'}」？浏览器和本地文件夹里的都会删掉。`)) return;
  state.convs = state.convs.filter((x) => x.id !== id);
  deleteBackup(id);
  if (state.currentId === id) {
    state.currentId = state.convs.length ? state.convs[0].id : null;
    saveCurrentId();
    if (!state.currentId) newConversation(true); else render();
  }
  saveAll(); renderSidebar(); syncTop();
  toast('已删除');
}
function syncTop() {
  const c = currentConv();
  nodes.convTitle.value = (c && c.title) || '新会话';
  if (!c) { nodes.topMeta.textContent = ''; return; }
  const n = c.messages.filter((m) => m.role === 'user').length;
  const from = c.origin === 'terminal' ? ' · 来自终端' : '';
  nodes.topMeta.textContent =
    `${n} 问 · ${c.model || state.settings.model} · ${timeAgo(c.updatedAt)}${from}`;
}
function toggleSide() {
  if (window.innerWidth <= 860) {
    state.sidebarOpen = !state.sidebarOpen;
    nodes.side.classList.toggle('open', state.sidebarOpen);
    nodes.sideMask.classList.toggle('open', state.sidebarOpen);
  } else {
    nodes.app.classList.toggle('collapsed');
    state.settings.sideCollapsed = nodes.app.classList.contains('collapsed');
    saveSettings();
  }
}
function closeSide() {
  if (window.innerWidth <= 860) {
    state.sidebarOpen = false;
    nodes.side.classList.remove('open'); nodes.sideMask.classList.remove('open');
  }
}

// ══════════════ 发送 ══════════════
function banner(title, hint) {
  nodes.banner.innerHTML = '';
  const box = el('div');
  box.appendChild(el('div', 'bt', title));
  if (hint) box.appendChild(el('div', 'bh', hint));
  const x = el('button', 'bx');
  x.innerHTML = ic('close', 14);
  x.addEventListener('click', hideBanner);
  const w = el('span', 'b-ico');
  w.innerHTML = ic('warn', 15);
  nodes.banner.appendChild(w);
  nodes.banner.appendChild(box); nodes.banner.appendChild(x);
  nodes.banner.classList.remove('hidden');
}
function hideBanner() { nodes.banner.classList.add('hidden'); nodes.banner.innerHTML = ''; }
function setStreaming(on) {
  state.streaming = on;
  nodes.input.disabled = on;
  nodes.btnSend.classList.toggle('hidden', on);
  nodes.btnStop.classList.toggle('hidden', !on);
  if (!on) { syncTop(); if (window.innerWidth > 860) nodes.input.focus(); }
}
async function send() {
  const conv = currentConv();
  if (!conv || state.streaming) return;
  const text = nodes.input.value.trim();
  const atts = state.attach.slice();
  if (!text && !atts.length) return;
  if (text.startsWith('/') && !atts.length) { if (handleSlash(text)) { nodes.input.value = ''; autoGrow(); return; } }

  conv.messages.push({
    id: uid(), role: 'user', ts: Date.now(), content: text,
    attach: atts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size, note: a.note })),
  });
  if (!conv.title) conv.title = titleFrom(text || (atts[0] && atts[0].name) || '新会话');
  nodes.input.value = ''; autoGrow();
  state.attach = []; renderChips(); hideBanner();
  touchConv(conv);
  if (convMode(conv) === 'agent') return runAgent(conv, text, atts.map((a) => a.id));
  return runChat(conv, text);
}
async function runChat(conv, text) {
  const asst = { id: uid(), role: 'assistant', ts: Date.now(), content: '', reasoning: '', model: conv.model };
  conv.messages.push(asst);
  state.streamingMsgId = asst.id;
  render();
  const n = live.get(asst.id);
  const mdEl = n && n.mdEl;
  const t0 = Date.now();
  if (mdEl) mdEl.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';

  setStreaming(true);
  state.abort = new AbortController();
  let cText = '', cThink = '', first = false, timer = null, err = false;
  let thinkEl = null, thinkBody = null;
  const flush = () => {
    timer = null;
    if (mdEl) {
      if (cText) {
        mdEl.innerHTML = renderMarkdown(cText);
        enhance(mdEl, true);
        const cur = el('span', 'cur');
        const last = mdEl.lastElementChild;
        if (last && /^(P|LI|H1|H2|H3|H4|TD|BLOCKQUOTE|PRE)$/.test(last.tagName)) last.appendChild(cur);
        else mdEl.appendChild(cur);
      }
    }
    if (thinkBody) { thinkBody.textContent = cThink; if (thinkEl) thinkEl.refresh(); }
    scrollBottom(false);
  };
  const sched = () => { if (!timer) timer = setTimeout(flush, 80); };
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: state.abort.signal,
      body: JSON.stringify({
        model: conv.model || state.settings.model,
        temperature: state.settings.temperature, max_tokens: state.settings.max_tokens,
        system: state.settings.system || '',
        memory: !!state.settings.useMemory,     // CHAT 模式也带上长期记忆
        messages: conv.messages.map((m) => ({
          role: m.role, content: m.content || '', images: m.images || [],
          attach: (m.attach || []).map((a) => a.id),
        })),
      }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader(), dec = new TextDecoder('utf-8');
    let buf = '', done = false;
    while (!done) {
      const r = await reader.read(); if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim(); if (!p) continue;
          let ev; try { ev = JSON.parse(p); } catch (e) { continue; }
          if (ev.type === 'reasoning') {
            if (!thinkEl && state.settings.showThinking && n) {
              thinkEl = buildReasonEl('', true); thinkBody = thinkEl.body;
              n.bodyEl.insertBefore(thinkEl.el, mdEl);
            }
            cThink += ev.text; sched();
          } else if (ev.type === 'content') {
            if (!first) { first = true; if (mdEl) mdEl.innerHTML = ''; if (thinkEl) thinkEl.el.open = false; }
            cText += ev.text; sched();
          } else if (ev.type === 'usage') { asst.usage = ev.usage; }
          else if (ev.type === 'finish') { if (ev.reason === 'length') asst.truncated = true; }
          else if (ev.type === 'error') { err = true; banner(ev.message || '出错了', ev.hint || ''); }
          else if (ev.type === 'done') done = true;
        }
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') asst.stopped = true;
    else {
      err = true;
      banner('和本地后端断了连接。',
        '如果刚重启过服务，按 F5 刷新页面就好；如果一直连不上，双击桌面「鲸语」图标把服务拉起来。');
    }
  } finally {
    clearTimeout(timer);
    asst.content = cText;
    asst.reasoning = state.settings.showThinking ? cThink : '';
    asst.elapsed = Date.now() - t0;
    asst.done = true;
    state.streamingMsgId = null; state.abort = null;
    setStreaming(false);
    if (asst.truncated) banner('回答被 max_tokens 截断了。', '思考过程也占额度，去设置里调大 max_tokens。');
    if (!err && !cText && mdEl) mdEl.innerHTML = '<p style="color:var(--faint)">（没有返回内容，可以重新生成）</p>';
    refreshBalance(true, true);   // 刚花掉钱，立刻把余额/进度条更新一次（失败就悄悄算了）
    touchConv(conv);
    render();
  }
}
async function runAgent(conv, text, attachIds) {
  const asst = { id: uid(), role: 'assistant', ts: Date.now(), content: '', reasoning: '', steps: [], agent: true, model: 'claude-code' };
  conv.messages.push(asst);
  state.streamingMsgId = asst.id;
  render();
  const n = live.get(asst.id);
  const mdEl = n && n.mdEl, logEl = n && n.logEl;
  const t0 = Date.now();
  if (mdEl) mdEl.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';

  setStreaming(true);
  state.abort = new AbortController();
  let cText = '', cThink = '', timer = null, err = false;
  let thinkEl = null, thinkBody = null;
  const flush = () => {
    timer = null;
    if (logEl) renderTools(logEl, asst);
    if (mdEl && cText) {
      mdEl.innerHTML = renderMarkdown(cText);
      enhance(mdEl, false);
      const cur = el('span', 'cur');
      const last = mdEl.lastElementChild;
      if (last && /^(P|LI|H1|H2|H3|H4|TD|BLOCKQUOTE|PRE)$/.test(last.tagName)) last.appendChild(cur);
      else mdEl.appendChild(cur);
    }
    if (thinkBody) { thinkBody.textContent = cThink; if (thinkEl) thinkEl.refresh(); }
    scrollBottom(false);
  };
  const sched = () => { if (!timer) timer = setTimeout(flush, 80); };
  try {
    const res = await apiFetch('/api/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: state.abort.signal,
      body: JSON.stringify({
        prompt: text, workspace: state.settings.workspace || 'E:\\',
        session_id: conv.agentSessionId || '', readonly: !!state.settings.readonly,
        attach: attachIds || [],     // 附件也要交给 agent（图片给路径让它自己 Read）
      }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader(), dec = new TextDecoder('utf-8');
    let buf = '', done = false;
    while (!done) {
      const r = await reader.read(); if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim(); if (!p) continue;
          let ev; try { ev = JSON.parse(p); } catch (e) { continue; }
          if (ev.type === 'run') { conv.agentRunId = ev.run_id; touchConv(conv); }
          else if (ev.type === 'session') { conv.agentSessionId = ev.session_id; touchConv(conv); }
          else if (ev.type === 'thinking') {
            if (!thinkEl && state.settings.showThinking && n) {
              thinkEl = buildReasonEl('', true); thinkBody = thinkEl.body;
              n.bodyEl.insertBefore(thinkEl.el, logEl);
            }
            cThink += ev.text; sched();
          } else if (ev.type === 'text') {
            if (!cText && thinkEl) thinkEl.el.open = false;
            cText += ev.text; sched();
          } else if (ev.type === 'tool') {
            asst.steps.push({ kind: 'tool', name: ev.name, id: ev.id,
              summary: toolSummary(ev.name, ev.input), status: 'run', body: '' });
            sched();
          } else if (ev.type === 'tool_result') {
            const st = asst.steps.slice().reverse().find((s) => s.id === ev.id && s.status === 'run');
            if (st) { st.status = ev.is_error ? '' : 'ok'; st.is_error = ev.is_error; st.body = ev.content || ''; }
            sched();
          } else if (ev.type === 'denied') {
            asst.steps.push({ kind: 'denied', name: ev.name, status: '', summary: ev.message || '没被允许', body: '' });
            sched();
          } else if (ev.type === 'agent_usage') {
            asst.agentUsage = { input_tokens: ev.input_tokens, output_tokens: ev.output_tokens };
          } else if (ev.type === 'error') { err = true; banner(ev.message || '出错了', ev.hint || ''); }
          else if (ev.type === 'done') done = true;
        }
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') asst.stopped = true;
    else { err = true; banner('和本地后端断了连接。', '那个黑窗口还在吗？'); }
  } finally {
    clearTimeout(timer);
    asst.content = cText;
    asst.reasoning = state.settings.showThinking ? cThink : '';
    asst.elapsed = Date.now() - t0;
    asst.done = true;
    state.streamingMsgId = null; state.abort = null;
    setStreaming(false);
    if (!err && !cText && mdEl) mdEl.innerHTML = '<p style="color:var(--faint)">（这次没产出最终回答，看上面的工具卡片）</p>';
    touchConv(conv);
    refreshBalance(true, true);   // 刚花掉钱，立刻把余额/进度条更新一次（失败就悄悄算了）
    syncGitBadge();     // AGENT 可能改了文件，刷新顶栏的改动数
    render();
  }
}
/** 停止当前生成：先叫后端真的把进程杀掉（刷新页面不算停止，只有点这里算） */
function stopRunning() {
  const c = currentConv();
  if (c && c.agentRunId) {
    apiFetch('/api/agent/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: c.agentRunId }),
    }).catch(() => {});
  }
  if (state.abort) state.abort.abort();
}
/** 刷新回来：刚才那个 agent 任务还在后台跑 / 刚跑完 → 把结果接回来填进气泡 */
async function resumeAgentRun() {
  const c = currentConv();
  if (!c || !c.agentRunId) return;
  const last = c.messages[c.messages.length - 1];
  if (!last || last.role !== 'assistant' || last.done) return;
  let tries = 0, said = false;
  const tick = async () => {
    let j = null;
    try {
      j = await (await apiFetch('/api/agent/result?run_id=' + encodeURIComponent(c.agentRunId))).json();
    } catch (e) { return; }
    if (!j || !j.ok || last.done) return;
    if (!j.done) {                       // 还在跑：每 10 秒看一眼，最多看 30 分钟
      if (tries++ < 180) {
        if (!said) { said = true; toast('刚才那个任务还在后台跑，跑完我把结果填回来', 3600); }
        setTimeout(tick, 10000);
      }
      return;
    }
    if (j.text) last.content = j.text;   // 跑完了：把最终回答填回气泡
    if (j.usage) last.agentUsage = j.usage;
    if (j.session_id && !c.agentSessionId) c.agentSessionId = j.session_id;
    last.done = true;
    touchConv(c); render();
    if (j.text) toast('✅ 刚才那个任务跑完了，结果已填回来', 4000);
  };
  tick();
}
function toolSummary(name, input) {
  if (!input || typeof input !== 'object') return '';
  const pick = (k) => (typeof input[k] === 'string' ? input[k] : '');
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return pick('file_path') || pick('notebook_path');
    case 'Bash': case 'PowerShell': return pick('command');
    case 'Glob': return pick('pattern');
    case 'Grep': return (pick('pattern') ? `/${pick('pattern')}/ ` : '') + (pick('path') || '');
    case 'WebSearch': return pick('query');
    case 'WebFetch': return pick('url');
    case 'Task': return pick('description') || (pick('prompt') || '').slice(0, 80);
    case 'Skill': return pick('skill');
    default: { let s = ''; try { s = JSON.stringify(input); } catch (e) { s = String(input); } return s.length > 120 ? s.slice(0, 120) + '…' : s; }
  }
}
function regenerate(msg) {
  const conv = currentConv();
  if (!conv || state.streaming) return;
  const i = conv.messages.findIndex((m) => m.id === msg.id);
  if (i < 0) return;
  conv.messages.splice(i);
  saveAll(); render();
  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  const ids = (lastUser.attach || []).map((a) => a.id);   // 重新生成也要带上原来的附件
  if (convMode(conv) === 'agent') runAgent(conv, lastUser.content || '', ids);
  else runChat(conv, lastUser.content || '');
}
function setFeedback(m, v) {
  m.feedback = m.feedback === v ? null : v;
  touchConv(currentConv());
  const n = live.get(m.id);
  if (n) renderActs(n.actsEl, m);
  toast(m.feedback ? '已标记（只存本机）' : '已取消');
}

// ══════════════ 输入区 ══════════════
function autoGrow() {
  const t = nodes.input;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 200) + 'px';
}
function focusInput() { if (window.innerWidth > 860) nodes.input.focus(); }
function renderChips() {
  nodes.chips.innerHTML = '';
  state.attach.forEach((a, i) => {
    nodes.chips.appendChild(tagEl(a, true, () => { state.attach.splice(i, 1); renderChips(); }));
  });
  nodes.hintRight.textContent = state.attach.length ? `${state.attach.length} 个附件待发送` : '';
}
async function addFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  for (const f of list) {
    const item = { id: '', name: f.name, size: f.size, kind: 'unknown', busy: true, note: '' };
    state.attach.push(item); renderChips();
    try {
      const r = await apiFetch('/api/attach?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json();
      if (!j.ok) throw new Error(j.message || '上传失败');
      Object.assign(item, { id: j.id, kind: j.kind, note: j.note, busy: false });
    } catch (e) { item.busy = false; item.bad = true; item.note = '失败：' + e.message; }
    renderChips();
  }
  if (state.attach.some((a) => a.bad)) toast('有附件没处理成功，看标签上的提示', 4000);
}

// ══════════════ 斜杠命令 ══════════════
const SLASH = [
  ['/settings', '打开设置（模型、Key、外观…）'],
  ['/new', '新建会话'], ['/agent', '切到干活模式'], ['/chat', '切回聊天模式'],
  ['/model', '切换模型，如 /model deepseek-v4-pro'], ['/clear', '清空当前会话'],
  ['/settings', '打开设置'], ['/attach', '按路径加附件'], ['/export', '导出 Markdown'],
  ['/theme', '主题 dark|light'], ['/help', '看这些命令'],
];
function handleSlash(text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  const conv = currentConv();
  switch (cmd) {
    case '/new': newConversation(); return true;
    case '/agent': setMode('agent'); return true;
    case '/chat': setMode('chat'); return true;
    case '/model':
      if (!arg) { toast('用法：/model deepseek-v4-pro'); return true; }
      if (conv) { conv.model = arg; touchConv(conv); }
      state.settings.model = arg; saveSettings(); syncTop(); toast('模型：' + arg); return true;
    case '/clear': if (conv) { conv.messages = []; touchConv(conv); render(); toast('已清空'); } return true;
    case '/settings': openSettings(); return true;
    case '/export': exportCurrent(); return true;
    case '/theme':
      if (['dark', 'light'].includes(arg)) { state.settings.theme = arg; saveSettings(); applyTheme(); toast('主题：' + arg); }
      else toast('用法：/theme dark | light');
      return true;
    case '/attach':
      if (!arg) { toast('用法：/attach 完整路径'); return true; }
      attachByPath(arg); return true;
    case '/help': openPalette('/'); return true;
    default: return false;
  }
}
async function attachByPath(p) {
  try {
    const r = await apiFetch('/api/attach-path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.message);
    state.attach.push(j); renderChips(); toast('已加入：' + j.name);
  } catch (e) { toast('加不了：' + e.message, 4000); }
}

// ══════════════ 命令面板 ══════════════
let palItems = [], palSel = 0;
function openPalette(prefill) {
  nodes.palette.classList.remove('hidden');
  nodes.palInput.value = prefill || '';
  renderPalette();
  setTimeout(() => nodes.palInput.focus(), 10);
}
function closePalette() { nodes.palette.classList.add('hidden'); }
function renderPalette() {
  const q = (nodes.palInput.value || '').trim().toLowerCase();
  if (q.startsWith('/')) {
    const hits = SLASH.filter(([k]) => k.startsWith(q));
    palItems = (hits.length ? hits : SLASH).map(([k, d]) => ({ k, t: d, m: '命令', act: () => handleSlash(k + ' ') }));
  } else {
    const convs = state.convs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter((c) => !q || (c.title || '').toLowerCase().includes(q) ||
        c.messages.some((m) => (m.content || '').toLowerCase().includes(q)));
    palItems = [{ k: '新建会话', t: 'Ctrl+N', m: '', act: () => newConversation() }];
    convs.slice(0, 40).forEach((c) => palItems.push({
      k: c.title || '新会话', t: `${c.messages.length} 条 · ${timeAgo(c.updatedAt)}`, m: '',
      act: () => { state.currentId = c.id; state.shown = PAGE; saveCurrentId(); render(); renderSidebar(); syncMode(); closePalette(); },
    }));
    // 终端里跑过的会话也能直接接管（同一个大脑，接着聊就行）
    if (!q) {
      terminalSessions.slice(0, 8).forEach((s) => palItems.push({
        k: '终端 · ' + (s.title || '(空会话)'),
        t: `${timeAgo(s.ts * 1000)}${s.cwd ? ' · ' + s.cwd : ''}`,
        m: '接管',
        act: () => { closePalette(); importClaudeSession(s.id); },
      }));
    }
  }
  palSel = 0; paintPalette();
}
function paintPalette() {
  nodes.palList.innerHTML = '';
  palItems.forEach((it, i) => {
    const d = el('div', 'pal-item' + (i === palSel ? ' sel' : ''));
    d.appendChild(el('span', 't', it.k));
    d.appendChild(el('span', 'm', [it.t, it.m].filter(Boolean).join(' · ')));
    d.addEventListener('click', () => { closePalette(); it.act(); });
    d.addEventListener('mousemove', () => { if (palSel !== i) { palSel = i; paintPalette(); } });
    nodes.palList.appendChild(d);
  });
  nodes.palHint.textContent = palItems.length ? '↑↓ 选择 · Enter 打开 · Esc 关闭' : '没有匹配';
}

// ══════════════ 设置 ══════════════
function openSettings() {
  nodes.settings.classList.remove('hidden');
  fillSettings();
  loadMemoryList();
}
function closeSettings() { nodes.settings.classList.add('hidden'); }
function fillSettings() {
  const cfg = state.config || {};
  if (nodes.modelList) {
    nodes.modelList.innerHTML = '';
    (cfg.models || []).forEach((m) => {
      const o = el('option'); o.value = m.id; o.label = m.desc || '';
      nodes.modelList.appendChild(o);
    });
  }
  const c = currentConv();
  nodes.setModel.value = (c && c.model) || state.settings.model;
  nodes.setProtocol.value = cfg.protocol || 'openai';
  nodes.setTheme.value = state.settings.theme === 'light' ? 'light' : 'dark';
  nodes.setKey.value = '';
  nodes.keyNote.textContent = cfg.has_key
    ? `当前已设置（来源：${cfg.key_source || '未知'}）· 留空不改，填了就覆盖`
    : '当前没有 Key，发消息会失败';
  nodes.setBase.value = cfg.base_url || '';
  nodes.setAgentBase.value = cfg.agent_base_url || '';
  nodes.setAgentModel.value = cfg.agent_model || '';
  nodes.setAgentKey.value = '';
  nodes.testNote.textContent = '';
  nodes.setTemp.value = state.settings.temperature;
  nodes.tempVal.textContent = Number(state.settings.temperature).toFixed(1);
  nodes.setMax.value = state.settings.max_tokens;
  nodes.setSystem.value = state.settings.system || '';
  nodes.setReadonly.checked = !!state.settings.readonly;
  nodes.setLineNo.checked = !!state.settings.lineNumbers;
  nodes.setReason.checked = !!state.settings.showThinking;
  nodes.setMemory.checked = state.settings.useMemory !== false;
  nodes.setMotion.checked = state.settings.animations !== false;
  nodes.setEnter.value = state.settings.enterSend ? 'send' : 'newline';
  const at = cfg.attach || {};
  nodes.aboutNote.textContent = `v${cfg.version || '?'} · 接口 ${cfg.protocol === 'anthropic' ? 'Anthropic 兼容' : 'OpenAI 兼容'}`
    + ` · 附件上限 ${fmtNum(at.max_chars || 0)} 字/次 · 语音转写 ${at.asr ? '可用' : '不可用'}`
    + ` · 视频处理 ${at.ffmpeg ? '可用' : '不可用'} · 干活模式 ${cfg.agent_ready ? '就绪' : '未找到 claude'}`
    + (cfg.data_dir ? ` · 数据在 ${cfg.data_dir}` : '');
}
function bindSettings() {
  nodes.setClose.addEventListener('click', closeSettings);
  nodes.settings.addEventListener('click', (e) => { if (e.target === nodes.settings) closeSettings(); });
  nodes.keysClose.addEventListener('click', () => nodes.keysModal.classList.add('hidden'));
  nodes.keysModal.addEventListener('click', (e) => { if (e.target === nodes.keysModal) nodes.keysModal.classList.add('hidden'); });
  nodes.setKeyEye.addEventListener('click', () => { nodes.setKey.type = nodes.setKey.type === 'password' ? 'text' : 'password'; });
  nodes.setModel.addEventListener('change', () => {
    const c = currentConv();
    state.settings.model = nodes.setModel.value;
    if (c) { c.model = nodes.setModel.value; touchConv(c); }
    saveSettings(); syncTop();
    if (nodes.setModel.value.trim()) pushIface();     // 顺手存到后端 config.json
  });
  nodes.setTheme.addEventListener('change', () => {
    state.settings.theme = nodes.setTheme.value; saveSettings(); applyTheme();
  });
  nodes.setTemp.addEventListener('input', () => {
    state.settings.temperature = parseFloat(nodes.setTemp.value);
    nodes.tempVal.textContent = state.settings.temperature.toFixed(1); saveSettings();
  });
  nodes.setMax.addEventListener('change', () => {
    state.settings.max_tokens = Math.max(256, Math.min(8192, parseInt(nodes.setMax.value, 10) || 4096));
    nodes.setMax.value = state.settings.max_tokens; saveSettings();
  });
  nodes.setSystem.addEventListener('input', () => { state.settings.system = nodes.setSystem.value; saveSettings(); });
  nodes.setReadonly.addEventListener('change', () => {
    state.settings.readonly = nodes.setReadonly.checked; saveSettings();
    toast(nodes.setReadonly.checked ? '只读模式：只能看不能改' : '全自动：可改文件、可跑命令');
  });
  nodes.setLineNo.addEventListener('change', () => { state.settings.lineNumbers = nodes.setLineNo.checked; saveSettings(); render(); });
  nodes.setReason.addEventListener('change', () => { state.settings.showThinking = nodes.setReason.checked; saveSettings(); render(); });
  nodes.setMemory.addEventListener('change', () => {
    state.settings.useMemory = nodes.setMemory.checked; saveSettings();
    toast(nodes.setMemory.checked ? 'CHAT 模式会带上你的长期记忆' : 'CHAT 模式不再带记忆（省 token）');
  });
  nodes.setMotion.addEventListener('change', () => {
    state.settings.animations = nodes.setMotion.checked;
    saveSettings(); applyMotion();
    toast(nodes.setMotion.checked ? '界面动画已打开' : '界面动画已关闭');
  });
  nodes.memPick.addEventListener('change', () => loadMemoryFile(nodes.memPick.value));
  nodes.memSave.addEventListener('click', saveMemoryFile);
  nodes.memOpen.addEventListener('click', async () => {
    const j = await (await apiFetch('/api/open-folder', { method: 'POST' })).json();
    toast(j.ok ? '已打开数据文件夹（记忆在上一级 .claude 里）' : '打不开', 3000);
  });
  nodes.setEnter.addEventListener('change', () => { state.settings.enterSend = nodes.setEnter.value === 'send'; saveSettings(); });
  nodes.btnOpenFolder.addEventListener('click', async () => {
    const j = await (await apiFetch('/api/open-folder', { method: 'POST' })).json();
    toast(j.ok ? '已打开文件夹' : '打不开：' + (j.message || ''), 3200);
  });
  nodes.btnExportAll.addEventListener('click', exportAll);
  nodes.btnAgain.addEventListener('click', () => nodes.onboard.classList.remove('hidden'));
  nodes.obClose.addEventListener('click', () => {
    nodes.onboard.classList.add('hidden');
    state.settings.onboarded = true;
    saveSettings();
  });
  // 接口那一段改动 → 立刻存到后端 config.json（Key 不回显：填了才发过去）
  const pushIface = async () => {
    const body = {
      chat: {
        protocol: nodes.setProtocol.value,
        base_url: nodes.setBase.value.trim(),
        model: nodes.setModel.value.trim(),
        api_key: nodes.setKey.value.trim(),
      },
      agent: {
        base_url: nodes.setAgentBase.value.trim(),
        model: nodes.setAgentModel.value.trim(),
        api_key: nodes.setAgentKey.value.trim(),
      },
    };
    const j = await (await apiFetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    state.config = Object.assign(state.config || {}, {
      has_key: j.has_key, key_source: j.key_source, base_url: j.base_url,
      protocol: j.protocol, default_model: j.model, workspace: j.workspace,
      agent_base_url: nodes.setAgentBase.value.trim() || (state.config || {}).agent_base_url,
      agent_model: nodes.setAgentModel.value.trim() || (state.config || {}).agent_model,
    });
    nodes.setKey.value = ''; nodes.setAgentKey.value = '';
    fillSettings();
    toast(j.message || '已保存', 3200);
  };
  nodes.setKey.addEventListener('change', pushIface);
  nodes.setBase.addEventListener('change', pushIface);
  nodes.setProtocol.addEventListener('change', pushIface);
  nodes.setAgentBase.addEventListener('change', pushIface);
  nodes.setAgentModel.addEventListener('change', pushIface);
  nodes.setAgentKey.addEventListener('change', pushIface);
  nodes.setAgentEye.addEventListener('click', () => {
    nodes.setAgentKey.type = nodes.setAgentKey.type === 'password' ? 'text' : 'password';
  });
  nodes.btnTestChat.addEventListener('click', () => testIface('chat'));
  nodes.btnTestAgent.addEventListener('click', () => testIface('agent'));
  nodes.btnClaudeUpdate.addEventListener('click', claudeUpdate);
}

/** 检查/更新干活模式自带的 claude（走国内镜像，不碰被墙的官方更新域名） */
async function claudeUpdate() {
  const note = nodes.testNote;
  note.style.color = '';
  note.textContent = '正在查最新版本…';
  try {
    const j = await (await apiFetch('/api/claude-update')).json();
    if (!j.ok) { note.textContent = '❌ ' + (j.message || '查询失败'); note.style.color = 'var(--red)'; return; }
    if (!j.has_update) {
      note.textContent = j.message ? `当前 ${j.current || '?'}（${j.message}）` : `已是最新：${j.current}`;
      return;
    }
    if (!confirm(`发现新版本 ${j.latest}（当前 ${j.current}）。\n\n现在下载并更新吗？\n· 约 100MB，走国内镜像，一般十几秒\n· 正在干活的要先停下；纯聊天不受影响\n· 旧版会留一份备份`)) return;
    note.textContent = `正在下载 ${j.latest} …（约 100MB，别关页面）`;
    const r = await (await apiFetch('/api/claude-update', { method: 'POST' })).json();
    note.textContent = (r.ok ? '✅ ' : '❌ ') + (r.message || '');
    note.style.color = r.ok ? 'var(--green)' : 'var(--red)';
  } catch (e) {
    note.textContent = '❌ ' + e.message;
    note.style.color = 'var(--red)';
  }
}

/** 干活模式该用哪个地址：填了就用填的；没填但聊天是 DeepSeek 官方，就自动加 /anthropic */
function guessAgentBase(protocol) {
  const b = (nodes.setBase.value || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  if (/\/anthropic$/.test(b)) return b;
  if (b.includes('api.deepseek.com')) return b + '/anthropic';
  return protocol === 'anthropic' ? b : '';
}

/** 「测一下」按钮：拿当前填的参数真发一次最小请求，通不通立刻知道 */
async function testIface(kind, noteEl, src) {
  const note = noteEl || nodes.testNote;
  const pick = src || {
    protocol: () => nodes.setProtocol.value,
    base: () => nodes.setBase.value,
    key: () => nodes.setKey.value,
    model: () => nodes.setModel.value,
    agentBase: () => nodes.setAgentBase.value,
    agentKey: () => nodes.setAgentKey.value,
    agentModel: () => nodes.setAgentModel.value,
  };
  note.style.color = '';
  note.textContent = '正在试…（要连网，最多等十几秒）';
  const body = kind === 'agent'
    ? { protocol: 'anthropic',
        base_url: pick.agentBase().trim() || guessAgentBase(pick.protocol()),
        api_key: pick.agentKey().trim() || pick.key().trim(),
        model: pick.agentModel().trim() }
    : { protocol: pick.protocol(), base_url: pick.base().trim(),
        model: pick.model().trim(), api_key: pick.key().trim() };
  try {
    const j = await (await apiFetch('/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    note.textContent = (j.ok ? '✅ ' : '❌ ') + (j.message || '') + (j.hint ? ' —— ' + j.hint : '');
    note.style.color = j.ok ? 'var(--green)' : 'var(--red)';
  } catch (e) {
    note.textContent = '❌ 连不上本地服务：' + e.message;
    note.style.color = 'var(--red)';
  }
}

// ══════════════ 导出 ══════════════
const safeName = (s) => (s || 'session').replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 60);
function convToMarkdown(c) {
  const L = [`# ${c.title || '会话'}`, '', `> 模型：${c.model || ''} · 导出：${fullTime(Date.now())}`, '', '---', ''];
  c.messages.forEach((m) => {
    if (m.role === 'user') {
      L.push('## ❯ 我', '');
      (m.attach || []).forEach((a) => L.push(`[附件：${a.name}]`));
      L.push(m.content || '', '');
    } else if (m.content) {
      L.push('## ◉ ' + (state.brand || 'DeepSeek'), '');
      if (m.reasoning) L.push('<details><summary>思考过程</summary>', '', m.reasoning, '', '</details>', '');
      L.push(m.content, '');
    }
  });
  return L.join('\n');
}
function download(name, text) {
  const b = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
  const a = el('a'); a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportCurrent() {
  const c = currentConv();
  if (!c || !c.messages.length) { toast('这个会话还是空的'); return; }
  download(`${safeName(c.title)}_${new Date().toISOString().slice(0, 10)}.md`, convToMarkdown(c));
  toast('已导出');
}
function exportAll() {
  if (!state.convs.length) { toast('还没有会话'); return; }
  const parts = state.convs.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(convToMarkdown);
  download(`deepseek_全部会话_${new Date().toISOString().slice(0, 10)}.md`, parts.join('\n\n\n---\n\n\n'));
  toast(`已导出 ${state.convs.length} 个会话`);
}

// ══════════════ 模式 / 余额 ══════════════
function setMode(mode) {
  const c = currentConv();
  if (!c) return;
  if (state.streaming) { toast('正在生成，先按 Esc 中断'); return; }
  c.mode = mode; state.settings.mode = mode;
  saveAll(); saveSettings(); syncMode();
  if (mode === 'agent') {
    if (!state.agentReady) banner('没找到 claude 命令，干活模式用不了。', '装一下：npm install -g @anthropic-ai/claude-code');
    else { hideBanner(); toast('AGENT：它会真的读写你电脑上的文件', 2800); }
  } else hideBanner();
}
function syncMode() {
  const m = convMode(currentConv());
  nodes.modeSwitch.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  nodes.input.placeholder = m === 'agent' ? '让它干什么…（比如：把 E:\\xxx 里的脚本报错修好）' : '问点什么…（Enter 发送，Shift+Enter 换行）';
}
async function refreshBalance(fresh, quiet) {
  // quiet = 后台自动刷新：失败/没数据时保持原样，别把界面刷成报错
  try {
    const j = await (await apiFetch('/api/balance' + (fresh ? '?fresh=1' : ''))).json();
    if (!j.ok) {
      if (quiet) return;
      paintBalance(null);
      // 中转站基本都没有余额接口 → 直接把余额那一条藏起来，别每次都报个错
      if (/404|接口地址不对|not\s*found/i.test((j.message || '') + (j.hint || ''))) {
        nodes.btnBalance.classList.add('hidden');
        return;
      }
      nodes.balDot.className = 'dot bad'; nodes.balText.textContent = j.message || '读取失败'; return;
    }
    const v = parseFloat(j.total);
    // ⚠️ 接口里的 topped_up 不是"累计充值"，是**余额里来自充值的那部分**（total = 充值部分 + 赠送部分），
    //    它会随消费一起降。所以只能拿它当"充值了没"的信号，不能当累计额显示（标错过一次）
    const cum = parseFloat(j.topped_up);
    if (!isFinite(v)) {
      paintBalance(null);
      nodes.balDot.className = 'dot bad';
      nodes.balText.textContent = `余额 ${j.currency || ''} ${j.total}`;
      return;
    }
    // —— 充值基准：充一次就重新充满（这就是"每次充多少 R 开始往下算"）——
    // 判据优先用官方给的"累计充值额"涨没涨；拿不到就退回"余额变多了"= 充值了
    const now = Date.now();
    let base = state.settings.balBase;
    const cumUp = isFinite(cum) && base && typeof base.top === 'number' && cum > base.top + 0.001;
    const moneyUp = base && typeof base.amt === 'number' && base.amt > 0 && v > base.amt + 0.01;
    if (!base || typeof base.amt !== 'number' || base.amt <= 0) {
      base = { amt: v, ts: now, top: isFinite(cum) ? cum : null, topup: null };
      state.settings.balBase = base; saveSettings();
    } else if (cumUp || moneyUp) {
      base = { amt: v, ts: now, top: isFinite(cum) ? cum : null, topup: cumUp ? cum - base.top : null };
      state.settings.balBase = base; saveSettings();
      // 充值金额不报数字：万一是"关页期间充的、已经花掉一点"，算出来的数会偏小，不如不报
      toast(`检测到充值 → 进度条重新满格（基准 ${money(v, j.currency)}）`, 4500);
    }
    // —— 百分比 + 画进度条 ——
    let pct = Math.round((v / base.amt) * 100);
    const fake = new URLSearchParams(location.search).get('bal');   // ?bal=37 预览某个百分比
    if (fake && isFinite(parseFloat(fake))) pct = parseFloat(fake);
    pct = Math.max(0, Math.min(100, pct));
    nodes.balDot.className = 'dot '
      + (!j.is_available || v <= 0 ? 'bad' : pct >= 50 ? 'ok' : pct >= 20 ? 'low' : 'bad');
    nodes.balText.textContent = '';   // 只显示百分比（金额进悬停提示，侧栏再窄也不截断）
    const when = base.ts ? new Date(base.ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
    nodes.btnBalance.title = '点一下看余额明细';
    if (nodes.balPopNum) {          // 左键弹出的明细卡片
      nodes.balPopNum.textContent = Number(v).toFixed(2);
      nodes.balPopCur.textContent = symOf(j.currency);
      nodes.balPopBase.textContent = money(base.amt, j.currency);
      nodes.balPopWhen.textContent = when || '今天';
      nodes.balPopUsed.textContent = money(Math.max(0, base.amt - v), j.currency);
      nodes.balPopNote.textContent = '每次充值后自动回到 100%';
    }
    paintBalance(pct);
  } catch (e) {
    if (quiet) return;
    paintBalance(null); nodes.balDot.className = 'dot bad'; nodes.balText.textContent = '余额读取失败';
  }
}

function symOf(cur) { return cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : (cur || '') + ' '; }
function money(v, cur) { return symOf(cur) + Number(v).toFixed(2); }

let balPainted = false;   // 是否已经画过一次（第一次不走过渡动画，见下面）

// 把百分比画到进度条上（侧栏那条 + 卡片里那条一起画）。
// pct 传 null = 这次没有余额可显示（进度条和百分比都收起来）
function paintBalance(pct) {
  const bars = [[nodes.balBar, nodes.balFill], [nodes.balBar2, nodes.balFill2]];
  if (pct == null || !isFinite(pct)) {
    bars.forEach(([b]) => { if (b) b.classList.add('hidden'); });
    if (nodes.balPct) nodes.balPct.textContent = '';
    if (nodes.balLbl) nodes.balLbl.textContent = '';
    return;
  }
  const lv = pct >= 50 ? 'lv-ok' : pct >= 20 ? 'lv-mid' : 'lv-low';
  const w = pct <= 0 ? '0%' : Math.max(3, pct) + '%';
  bars.forEach(([b, f]) => {
    if (!b || !f) return;
    if (!b.dataset.base) b.dataset.base = b.classList.contains('lg') ? 'balbar lg' : 'balbar';
    b.className = b.dataset.base + ' ' + lv;      // 重新拼 class，顺带去掉 hidden
    if (balPainted) {
      f.style.width = w;                          // 之后的变化：平滑过去（好看）
    } else {
      // 第一次：直接到位。否则页面刚打开那 0.55 秒里进度条是空的（看着像坏了）
      const t = f.style.transition;
      f.style.transition = 'none';
      f.style.width = w;
      void f.offsetWidth;                         // 强制回流，让上面的 none 生效
      f.style.transition = t || '';
    }
  });
  balPainted = true;
  if (nodes.balPct) { nodes.balPct.className = 'balpct ' + lv; nodes.balPct.textContent = pct + '%'; }
  if (nodes.balLbl) nodes.balLbl.textContent = '剩余';
  if (nodes.balPopBadge) { nodes.balPopBadge.className = 'bp-badge ' + lv; nodes.balPopBadge.textContent = pct + '%'; }
}

function openBalPop() {
  nodes.balPop.classList.remove('hidden');
  refreshBalance(true, true);      // 打开就顺手刷一次（这样"点开就是最新的"）
}
function closeBalPop() { nodes.balPop.classList.add('hidden'); }
function resetBalBase() {
  if (!confirm('把"充值基准"重设为当前余额？\n（进度条回到 100%，之后照常递减）')) return;
  state.settings.balBase = null;
  saveSettings();
  refreshBalance(true, true);
}

// ══════════════ 长期记忆（跟终端共用同一份） ══════════════
async function loadMemoryList() {
  try {
    const j = await (await apiFetch('/api/memory')).json();
    nodes.memPick.innerHTML = '';
    (j.files || []).forEach((f) => {
      const o = el('option', null, f.name);
      o.value = f.name;
      nodes.memPick.appendChild(o);
    });
    nodes.memNote.textContent = `共 ${j.count} 个文件 · ${j.dir}`;
    if ((j.files || []).length) loadMemoryFile(nodes.memPick.value);
    else nodes.memEdit.value = '（还没有记忆文件）';
  } catch (e) { nodes.memNote.textContent = '读不到记忆目录：' + e.message; }
}
async function loadMemoryFile(name) {
  if (!name) return;
  nodes.memEdit.value = '加载中…';
  try {
    const j = await (await apiFetch('/api/memory/' + encodeURIComponent(name))).json();
    nodes.memEdit.value = j.ok ? j.content : ('读不出来：' + j.message);
  } catch (e) { nodes.memEdit.value = '读不出来：' + e.message; }
}
async function saveMemoryFile() {
  const name = nodes.memPick.value;
  if (!name) return;
  try {
    const j = await (await apiFetch('/api/memory/' + encodeURIComponent(name), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: nodes.memEdit.value }),
    })).json();
    toast(j.ok ? `已保存 ${name}` : ('保存失败：' + j.message));
  } catch (e) { toast('保存失败：' + e.message, 3600); }
}

// ══════════════ 接管终端会话（同一个大脑，不用重新认识你） ══════════════
let terminalSessions = [];
async function loadTerminalSessions() {
  try {
    const j = await (await apiFetch('/api/claude-sessions?limit=60')).json();
    terminalSessions = j.items || [];
  } catch (e) { terminalSessions = []; }
  // 数据比面板来得晚就补画一次（否则刚开机就按 Ctrl+K 会看不到终端会话）
  if (!nodes.palette.classList.contains('hidden') && !(nodes.palInput.value || '').trim()) {
    renderPalette();
  }
}
async function importClaudeSession(sid) {
  const exist = state.convs.find((c) => c.claudeSessionId === sid);
  if (exist) { selectConversation(exist.id); toast('这个终端会话已经在列表里了'); return; }
  toast('正在读取终端会话…');
  try {
    const j = await (await apiFetch('/api/claude-sessions/' + encodeURIComponent(sid))).json();
    if (!j.ok) { toast('读不出来：' + (j.message || ''), 3600); return; }
    const firstUser = (j.messages.find((m) => m.role === 'user') || {}).content || '终端会话';
    const conv = {
      id: uid(),
      title: firstUser.replace(/\s+/g, ' ').slice(0, 34),
      createdAt: Date.now(), updatedAt: Date.now(),
      model: state.settings.model, mode: 'agent',
      workspace: j.cwd || state.settings.workspace,
      agentSessionId: sid,          // ← 关键：后面的消息直接 --resume 接上这段会话
      claudeSessionId: sid,
      origin: 'terminal',           // 界面上标出来源
      messages: j.messages.map((m) => ({ ...m, ts: Date.now() })),
    };
    state.convs.unshift(conv);
    state.freshConvId = conv.id;
    saveAll(); touchConv(conv);
    await switchConvTo(conv.id);
    toast(`已接管终端会话（${j.messages.length} 条消息），直接接着聊就行`, 4000);
  } catch (e) { toast('读不出来：' + e.message, 4000); }
}

// ══════════════ Git：看改动 / 回滚 / 提交 ══════════════
let gitFiles = [];
function updateGitBadge(n) {
  if (!nodes.gitBadge) return;
  nodes.gitBadge.textContent = n > 99 ? '99+' : String(n);
  nodes.gitBadge.classList.toggle('hidden', !n);
}
async function openGit() { nodes.gitModal.classList.remove('hidden'); refreshGit(); }
/** 只更新顶栏那个小圆点（不打开面板） */
async function syncGitBadge() {
  const ws = state.settings.workspace || 'E:\\';
  try {
    const j = await (await apiFetch('/api/git?ws=' + encodeURIComponent(ws))).json();
    updateGitBadge(j.is_repo ? (j.files || []).length : 0);
  } catch (e) { updateGitBadge(0); }
}
let gitSeq = 0;      // 防并发：两次刷新同时跑的话，只让最后一次的结果生效
async function refreshGit() {
  const my = ++gitSeq;
  const ws = state.settings.workspace || 'E:\\';
  if (nodes.gitWs) nodes.gitWs.value = ws;
  if (nodes.gitWsNow) nodes.gitWsNow.textContent = ws;
  nodes.gitMsg.textContent = '读取中…';
  nodes.gitList.innerHTML = '';
  nodes.gitDiff.classList.add('hidden');
  try {
    const j = await (await apiFetch('/api/git?ws=' + encodeURIComponent(ws))).json();
    if (my !== gitSeq) return;          // 有更新的一次请求在跑，这次作废（否则列表会重复）
    nodes.gitHead.textContent = ws;
    if (!j.is_repo) {
      nodes.gitMsg.textContent = j.message || '不是 git 仓库';
      nodes.gitInit.classList.remove('hidden');
      nodes.gitCommit.classList.add('hidden');
      nodes.gitRestoreAll.classList.add('hidden');
      updateGitBadge(0);
      return;
    }
    gitFiles = j.files || [];
    nodes.gitHead.textContent = `${j.branch || '-'} · ${(j.head || '还没有提交').slice(0, 40)}`;
    // 没有任何提交时不要提供"全部还原"（会删光文件），并明确引导先提交
    nodes.gitMsg.textContent = gitFiles.length
      ? (j.has_commits ? `${gitFiles.length} 个文件改过`
        : `${gitFiles.length} 个文件还没被记录 —— 先点「提交全部」存一个存档点，之后才能回滚`)
      : '工作区是干净的';
    nodes.gitInit.classList.add('hidden');
    nodes.gitCommit.classList.toggle('hidden', !gitFiles.length);
    nodes.gitRestoreAll.classList.toggle('hidden', !(gitFiles.length && j.has_commits));
    gitFiles.forEach((f) => {
      const isNew = f.status === '??';
      const row = el('div', 'git-row');
      row.appendChild(el('span', 'st ' + (isNew ? 'new' : 'mod'), f.status));
      const p = el('span', 'p', f.path);
      p.title = f.path;
      row.appendChild(p);
      const rm = el('button', 'rm', isNew ? '删除' : '还原');
      rm.title = isNew ? '这是新文件，"还原"就是把它删掉' : '把这个文件恢复成改动前';
      rm.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(isNew ? `删掉新文件 ${f.path}？` : `还原 ${f.path}？这个文件里的改动会丢掉。`)) return;
        const r = await (await apiFetch('/api/git/action', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ws, action: 'restore', path: f.path }),
        })).json();
        toast(r.ok ? '已还原 ' + f.path : ('还原失败：' + r.message), 3200);
        refreshGit();
      });
      row.appendChild(rm);
      row.addEventListener('click', async () => {
        nodes.gitDiff.classList.remove('hidden');
        nodes.gitDiff.textContent = '读取中…';
        const d = await (await apiFetch('/api/git/diff?ws=' + encodeURIComponent(ws)
          + '&path=' + encodeURIComponent(f.path))).json();
        if (!d.ok) { nodes.gitDiff.textContent = d.message || '读不到'; return; }
        paintDiff(nodes.gitDiff, d.diff || '（没有可显示的 diff）');
      });
      nodes.gitList.appendChild(row);
    });
    updateGitBadge(gitFiles.length);
    // ?autodiff=1 时自动展开第一个文件的 diff（截图/自检用）
    if (location.search.includes('autodiff') && gitFiles.length) {
      const first = nodes.gitList.querySelector('.git-row');
      if (first) first.click();
    }
  } catch (e) {
    nodes.gitMsg.textContent = '读不到：' + e.message;
  }
}
function paintDiff(pre, text) {
  pre.innerHTML = text.split('\n').map((l) => {
    const t = escapeHtml(l);
    if (l.startsWith('+++') || l.startsWith('---')) return `<span class="dl">${t}</span>`;
    if (l.startsWith('@@')) return `<span class="dh">${t}</span>`;
    if (l.startsWith('+')) return `<span class="da">${t}</span>`;
    if (l.startsWith('-')) return `<span class="dd">${t}</span>`;
    return `<span>${t}</span>`;
  }).join('\n');
}
async function gitAction(action, extra = {}) {
  const ws = state.settings.workspace || 'E:\\';
  const j = await (await apiFetch('/api/git/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ ws, action }, extra)),
  })).json();
  toast(j.ok ? (j.message || '完成').slice(0, 80) : ('失败：' + j.message), 3600);
  refreshGit();
}

// ══════════════ 用量与花费 ══════════════
const PRICE_IN = 1 / 1e6, PRICE_OUT = 2 / 1e6;   // 估算用：¥1 / ¥2 每百万 tokens
function openUsage() { nodes.usageModal.classList.remove('hidden'); renderUsage(); }
function renderUsage() {
  const byDay = {}, byModel = {};
  let ti = 0, to = 0, nMsg = 0;
  state.convs.forEach((c) => {
    (c.messages || []).forEach((m) => {
      let i = 0, o = 0;
      if (m.usage) { i = m.usage.prompt_tokens || 0; o = m.usage.completion_tokens || 0; }
      else if (m.agentUsage) { i = m.agentUsage.input_tokens || 0; o = m.agentUsage.output_tokens || 0; }
      if (!i && !o) return;
      ti += i; to += o; nMsg++;
      const day = new Date(m.ts || Date.now()).toISOString().slice(0, 10);
      (byDay[day] = byDay[day] || { i: 0, o: 0 }).i += i;
      byDay[day].o += o;
      const md = m.agent ? 'claude-code(AGENT)' : (c.model || 'deepseek-flash');
      const e = (byModel[md] = byModel[md] || { i: 0, o: 0, n: 0 });
      e.i += i; e.o += o; e.n++;
    });
  });
  const money = (i, o) => `≈¥${(i * PRICE_IN + o * PRICE_OUT).toFixed(3)}`;
  const days = Object.keys(byDay).sort().slice(-14);
  const maxDay = Math.max(1, ...days.map((d) => byDay[d].i + byDay[d].o));
  const body = nodes.usageBody;
  body.innerHTML = '';
  const head = el('div', 'usage-top');
  head.innerHTML = `<div><b>${fmtNum(ti + to)}</b><span>总 tokens</span></div>
    <div><b>${fmtNum(ti)}</b><span>输入</span></div>
    <div><b>${fmtNum(to)}</b><span>输出</span></div>
    <div><b>${money(ti, to)}</b><span>估算花费</span></div>
    <div><b>${nMsg}</b><span>计入的消息</span></div>`;
  body.appendChild(head);
  body.appendChild(el('h4', 'usage-h', '最近 14 天'));
  const chart = el('div', 'usage-chart');
  days.forEach((d) => {
    const v = byDay[d];
    const h = Math.max(3, Math.round(((v.i + v.o) / maxDay) * 100));
    const col = el('div', 'ucol');
    col.title = `${d}\n输入 ${fmtNum(v.i)} · 输出 ${fmtNum(v.o)}\n${money(v.i, v.o)}`;
    const bar = el('div', 'ubar');
    bar.style.height = h + '%';
    col.appendChild(bar);
    col.appendChild(el('span', 'ulab', d.slice(5)));
    chart.appendChild(col);
  });
  if (!days.length) chart.appendChild(el('div', 'note', '（还没有数据）'));
  body.appendChild(chart);
  body.appendChild(el('h4', 'usage-h', '按模型 / 模式'));
  Object.keys(byModel).sort((a, b) => (byModel[b].i + byModel[b].o) - (byModel[a].i + byModel[a].o))
    .forEach((k) => {
      const v = byModel[k];
      const row = el('div', 'urow');
      row.appendChild(el('span', 'k', k));
      row.appendChild(el('span', 'n', `${v.n} 条`));
      row.appendChild(el('span', 'v', `${fmtNum(v.i)} / ${fmtNum(v.o)}`));
      row.appendChild(el('span', 'm', money(v.i, v.o)));
      body.appendChild(row);
    });
  body.appendChild(el('p', 'note',
    `花费是估算（输入 ¥1/百万、输出 ¥2/百万），实际以 DeepSeek 账单为准；侧边栏那个余额才是真实的。`));
}

// ══════════════ 长文本粘贴转附件 ══════════════
async function attachText(text, name) {
  try {
    const j = await (await apiFetch('/api/attach-text', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, name }),
    })).json();
    if (!j.ok) throw new Error(j.message);
    state.attach.push(j);
    renderChips();
    toast(`粘贴的 ${fmtNum(text.length)} 字已转成附件，不占输入框`, 3200);
  } catch (e) { toast('转附件失败：' + e.message, 3600); }
}

// ══════════════ 事件 ══════════════
function bindEvents() {
  nodes.btnNew.addEventListener('click', () => { if (!state.streaming) newConversation(); });
  nodes.btnSide.addEventListener('click', toggleSide);
  nodes.sideMask.addEventListener('click', closeSide);
  nodes.btnTheme.addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
    saveSettings(); applyTheme();
    if (!nodes.settings.classList.contains('hidden')) nodes.setTheme.value = state.settings.theme;
  });
  nodes.btnSettings.addEventListener('click', openSettings);
  nodes.btnKeys.addEventListener('click', () => nodes.keysModal.classList.remove('hidden'));
  nodes.btnPalette.addEventListener('click', () => openPalette());
  nodes.btnExport.addEventListener('click', (e) => exportCurrent(e.shiftKey ? 'txt' : 'md'));
  // 左键 = 开/关余额明细卡片（打开时顺手刷新一次）；右键 = 直接重设基准（后门）
  nodes.btnBalance.addEventListener('click', () => {
    if (nodes.balPop.classList.contains('hidden')) openBalPop(); else closeBalPop();
  });
  nodes.btnBalance.addEventListener('contextmenu', (e) => { e.preventDefault(); resetBalBase(); });
  nodes.balPopRefresh.addEventListener('click', () => refreshBalance(true));
  nodes.balPopReset.addEventListener('click', resetBalBase);
  // 点别的地方 = 收起卡片（点按钮自己不算，交给上面那个 handler）
  document.addEventListener('click', (e) => {
    if (nodes.balPop.classList.contains('hidden')) return;
    if (nodes.balPop.contains(e.target) || nodes.btnBalance.contains(e.target)) return;
    closeBalPop();
  });
  nodes.btnAttach.addEventListener('click', () => nodes.fileInput.click());
  nodes.fileInput.addEventListener('change', () => { addFiles(nodes.fileInput.files); nodes.fileInput.value = ''; });
  nodes.modeSwitch.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  nodes.btnSend.addEventListener('click', () => send());
  nodes.btnStop.addEventListener('click', () => stopRunning());
  nodes.search.addEventListener('input', () => { state.search = nodes.search.value; renderSidebar(); });
  nodes.convTitle.addEventListener('change', () => {
    const c = currentConv(); if (!c) return;
    c.title = nodes.convTitle.value.trim() || '新会话'; touchConv(c); syncTop(); renderSidebar();
  });
  nodes.lightbox.addEventListener('click', () => nodes.lightbox.classList.add('hidden'));

  nodes.palInput.addEventListener('input', renderPalette);
  nodes.palInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); paintPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); paintPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palSel]; if (it) { closePalette(); it.act(); } }
  });
  nodes.palette.addEventListener('click', (e) => { if (e.target === nodes.palette) closePalette(); });
  // git / 用量
  nodes.btnGit.addEventListener('click', openGit);
  nodes.btnSettingsTop.addEventListener('click', openSettings);
  // Git 目录：平时只显示一行当前目录，点「改」才展开输入框
  // （这不是"选工作区"——只是 git 需要一个路径才能工作，记忆跟它无关）
  nodes.gitWsEdit.addEventListener('click', () => {
    nodes.gitWsRow.classList.remove('hidden');
    nodes.gitWs.value = state.settings.workspace || 'E:\\';
    nodes.gitWs.focus();
  });
  nodes.gitWsSet.addEventListener('click', () => {
    const v = (nodes.gitWs.value || '').trim();
    if (!v) { toast('先填一个文件夹路径，比如 E:\\git练习'); return; }
    state.settings.workspace = v;
    saveSettings();
    nodes.gitWsRow.classList.add('hidden');
    toast('Git 目录已换成：' + v);
    refreshGit();
    syncGitBadge();
  });
  nodes.gitWs.addEventListener('keydown', (e) => { if (e.key === 'Enter') nodes.gitWsSet.click(); });
  nodes.gitInit.addEventListener('click', () => gitAction('init'));
  nodes.gitClose.addEventListener('click', () => nodes.gitModal.classList.add('hidden'));
  nodes.gitModal.addEventListener('click', (e) => { if (e.target === nodes.gitModal) nodes.gitModal.classList.add('hidden'); });
  nodes.gitInit.addEventListener('click', () => gitAction('init'));
  nodes.gitCommit.addEventListener('click', () => {
    const m = prompt('提交说明：', 'webui: 改动 ' + new Date().toLocaleString('zh-CN').slice(0, 16));
    if (m == null) return;
    gitAction('commit', { message: m });
  });
  nodes.gitRestoreAll.addEventListener('click', () => {
    if (!confirm('把所有改动还原成上一次提交的样子？\n（新加的文件会被删掉，改动会丢）')) return;
    gitAction('restore');
  });
  nodes.btnUsage.addEventListener('click', openUsage);
  nodes.usageClose.addEventListener('click', () => nodes.usageModal.classList.add('hidden'));
  nodes.usageModal.addEventListener('click', (e) => { if (e.target === nodes.usageModal) nodes.usageModal.classList.add('hidden'); });

  nodes.input.addEventListener('input', autoGrow);
  nodes.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && state.settings.enterSend) { e.preventDefault(); send(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !state.settings.enterSend) { e.preventDefault(); send(); }
  });
  nodes.input.addEventListener('paste', (e) => {
    const files = [];
    for (const it of (e.clipboardData && e.clipboardData.items) || [])
      if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    // 超长文本不要塞进输入框，直接转成附件（省得滚动半天，也不占输入区）
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (text.length > 800) { e.preventDefault(); attachText(text); }
  });
  ['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault(); nodes.composer.style.borderColor = 'var(--accent)';
    }
  }));
  ['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => {
    nodes.composer.style.borderColor = '';
    if (ev === 'drop') { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }
  }));
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); nodes.palette.classList.contains('hidden') ? openPalette() : closePalette(); return; }
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); if (!state.streaming) newConversation(); return; }
    if (ctrl && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light'; saveSettings(); applyTheme(); return;
    }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportCurrent('md'); return; }
    if (ctrl && e.key.toLowerCase() === 'c' && state.streaming && !String(getSelection() || '').length) {
      e.preventDefault(); stopRunning(); return;
    }
    if (e.key === 'Escape') {
      if (!nodes.lightbox.classList.contains('hidden')) { nodes.lightbox.classList.add('hidden'); return; }
      if (!nodes.palette.classList.contains('hidden')) { closePalette(); return; }
      if (!nodes.onboard.classList.contains('hidden')) { nodes.obClose.click(); return; }
      if (!nodes.gitModal.classList.contains('hidden')) { nodes.gitModal.classList.add('hidden'); return; }
      if (!nodes.usageModal.classList.contains('hidden')) { nodes.usageModal.classList.add('hidden'); return; }
      if (!nodes.settings.classList.contains('hidden')) { closeSettings(); return; }
      if (!nodes.keysModal.classList.contains('hidden')) { nodes.keysModal.classList.add('hidden'); return; }
      if (!nodes.balPop.classList.contains('hidden')) { closeBalPop(); return; }
      if (state.streaming && state.abort) { stopRunning(); return; }
      closeSide();
    }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) closeSide(); });
  window.addEventListener('beforeunload', (e) => { if (state.streaming) { e.preventDefault(); e.returnValue = ''; } });
}

// ══════════════ 接口配置向导（给不熟 API 的人：填三个空、点一下测试、保存） ══════════════
function applyBrand() {
  const b = (state.config && state.config.brand) || 'deepseek';
  state.brand = b;
  document.title = `${b} · 本地工作台`;
  const mt = document.querySelector('meta[name=apple-mobile-web-app-title]');
  if (mt) mt.setAttribute('content', b);
  if (nodes.brandName) nodes.brandName.textContent = b;
  const obT = document.querySelector('#onboard .ob-head b');
  if (obT) obT.textContent = `欢迎使用 ${b} 本地工作台`;
}
function openSetup() { nodes.setup.classList.remove('hidden'); fillSetup(); }
function closeSetup() { nodes.setup.classList.add('hidden'); }
function syncSetupAgentBox() { nodes.suAgentBox.classList.toggle('hidden', nodes.suSame.checked); }
function fillSetup() {
  const cfg = state.config || {};
  nodes.suProtocol.value = cfg.protocol || 'openai';
  nodes.suBase.value = cfg.base_url || '';
  nodes.suModel.value = cfg.default_model || 'deepseek-flash';
  nodes.suAgentBase.value = cfg.agent_base_url || '';
  nodes.suAgentModel.value = cfg.agent_model || '';
  nodes.suKey.value = ''; nodes.suAgentKey.value = ''; nodes.suAsr.value = '';
  nodes.suNote.style.color = '';
  nodes.suNote.textContent = cfg.has_key
    ? `已经配过了（来源：${cfg.key_source || '未知'}）。留空 = 不改，填了 = 覆盖。`
    : '还没有 API —— 填完点右下角「保存并开始用」就行';
  syncSetupAgentBox();
}
function pickTemplate(kind) {
  nodes.suNote.style.color = '';
  if (kind === 'deepseek') {
    nodes.suProtocol.value = 'openai';
    nodes.suBase.value = 'https://api.deepseek.com';
    nodes.suModel.value = 'deepseek-flash';
    nodes.suAgentBase.value = 'https://api.deepseek.com/anthropic';
    nodes.suAgentModel.value = 'deepseek-flash[1M]';
    nodes.suSame.checked = true;
    nodes.suNote.textContent = '去 platform.deepseek.com 充值 → 左侧「API keys」建一个，粘到下面，就齐了';
  } else if (kind === 'openai') {
    nodes.suProtocol.value = 'openai';
    nodes.suSame.checked = false;
    nodes.suNote.textContent = '照中转站给的填：地址一般是 https://xxx/v1 这种，模型名也照抄';
  } else {
    nodes.suProtocol.value = 'anthropic';
    nodes.suSame.checked = true;
    nodes.suNote.textContent = '照中转站给的填：地址填到域名（或在 /v1 之前截断），模型名照抄';
  }
  syncSetupAgentBox();
}
async function saveSetup() {
  const cfg = state.config || {};
  const chat = {
    protocol: nodes.suProtocol.value,
    base_url: nodes.suBase.value.trim(),
    model: nodes.suModel.value.trim(),
    api_key: nodes.suKey.value.trim(),
  };
  const agent = {
    base_url: nodes.suSame.checked
      ? (nodes.suAgentBase.value.trim() || guessAgentBase(nodes.suProtocol.value))
      : nodes.suAgentBase.value.trim(),
    model: nodes.suAgentModel.value.trim(),
    api_key: nodes.suSame.checked ? '' : nodes.suAgentKey.value.trim(),
  };
  if (!chat.base_url) { nodes.suNote.textContent = '❌ 先把「接口地址」填上'; nodes.suNote.style.color = 'var(--red)'; return; }
  if (!chat.api_key && !cfg.has_key) { nodes.suNote.textContent = '❌ 聊天那把 Key 必须填一个'; nodes.suNote.style.color = 'var(--red)'; return; }
  nodes.suNote.style.color = '';
  nodes.suNote.textContent = '保存中…';
  const body = { chat, agent };
  if (nodes.suAsr.value.trim()) body.asr_key = nodes.suAsr.value.trim();
  try {
    const j = await (await apiFetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    if (!j.ok) { nodes.suNote.textContent = '❌ ' + (j.message || '保存失败'); nodes.suNote.style.color = 'var(--red)'; return; }
    state.config = await (await apiFetch('/api/config')).json();
    applyBrand();
    if (chat.model) state.settings.model = chat.model;
    saveSettings(); syncTop();
    closeSetup();
    toast('配好了，直接开问就行', 3600);
    if (!state.settings.onboarded) setTimeout(() => nodes.onboard.classList.remove('hidden'), 700);
  } catch (e) {
    nodes.suNote.textContent = '❌ 保存失败：' + e.message;
    nodes.suNote.style.color = 'var(--red)';
  }
}
function bindSetup() {
  const pick = {
    protocol: () => nodes.suProtocol.value, base: () => nodes.suBase.value, key: () => nodes.suKey.value,
    model: () => nodes.suModel.value, agentBase: () => nodes.suAgentBase.value,
    agentKey: () => nodes.suAgentKey.value, agentModel: () => nodes.suAgentModel.value,
  };
  nodes.suClose.addEventListener('click', closeSetup);
  nodes.setup.addEventListener('click', (e) => { if (e.target === nodes.setup) closeSetup(); });
  nodes.tplDeepseek.addEventListener('click', () => pickTemplate('deepseek'));
  nodes.tplOpenai.addEventListener('click', () => pickTemplate('openai'));
  nodes.tplAnthropic.addEventListener('click', () => pickTemplate('anthropic'));
  nodes.suSame.addEventListener('change', syncSetupAgentBox);
  nodes.suTestChat.addEventListener('click', () => testIface('chat', nodes.suNote, pick));
  nodes.suTestAgent.addEventListener('click', () => testIface('agent', nodes.suNote, pick));
  nodes.suSave.addEventListener('click', saveSetup);
}

// ══════════════ 错误兜底 ══════════════
function reportFatal(msg, where) {
  try { document.title = 'ERR ' + msg; banner('界面出了点小毛病：' + msg, '位置：' + where + '（F5 刷新通常能恢复）'); } catch (_) {}
}
window.addEventListener('error', (e) => {
  const st = (e.error && e.error.stack) ? String(e.error.stack).split('\n').slice(1, 3).join(' | ') : '';
  reportFatal((e && e.message) || '未知错误', '同步 ' + st);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  const st = (r && r.stack) ? String(r.stack).split('\n').slice(1, 3).join(' | ') : '';
  reportFatal((r && (r.message || String(r))) || '未知错误', '异步 ' + st);
});

// ══════════════ 启动 ══════════════
async function boot() {
  const saved = lsGet(LS_SET, null);
  state.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
  if (state.settings.theme === 'black') state.settings.theme = 'dark';
  applyTheme();
  nodes.app.classList.toggle('collapsed', !!state.settings.sideCollapsed && window.innerWidth > 860);

  try { state.config = await (await apiFetch('/api/config')).json(); }
  catch (e) { state.config = { models: [], has_key: false }; banner('连不上本地后端。', '双击桌面上的图标重启服务，然后刷新页面。'); }
  const cfg = state.config || {};
  state.token = cfg.token || '';
  state.agentReady = !!cfg.agent_ready;
  nodes.brandSub.textContent = cfg.agent_ready ? '本地工作台' : '（未找到 claude）';
  if (!saved) {
    if (cfg.system_prompt) state.settings.system = cfg.system_prompt;
    if (cfg.default_model) state.settings.model = cfg.default_model;
  }
  // 网页版删掉了"选择工作区"：没值时固定 E:\（或后端 config.json 配的）；
  // 顺手把练 git 时留下的旧值换掉——用户不该再被这个值绊到
  if (!state.settings.workspace || state.settings.workspace === 'E:\\git练习') {
    state.settings.workspace = cfg.workspace || 'E:\\';
  }
  saveSettings();

  state.convs = lsGet(LS_CONV, []);
  if (!Array.isArray(state.convs)) state.convs = [];
  state.convs.forEach((c) => { if (!Array.isArray(c.messages)) c.messages = []; if (!c.mode) c.mode = 'chat'; });
  state.currentId = lsGet(LS_CUR, null);

  const restored = await restoreFromDisk();
  if (restored > 0) toast(`从本地文件夹恢复了 ${restored} 个会话`, 3000);
  if (!state.convs.length) newConversation(true);
  else if (!state.currentId || !state.convs.some((c) => c.id === state.currentId)) {
    state.currentId = state.convs[0].id; saveCurrentId();
  }

  initIcons();
  applyMotion();
  applyBrand();
  // 绑定界面事件：**任何一块出错都不许拖垮整个页面**。
  // 实测踩过：浏览器缓存里是旧版 app.js、页面是新版 HTML → 旧代码要绑的元素已经没了
  // → 抛 Cannot read properties of null → boot 中断 → 整页不可用（F5 才能恢复）。
  // 现在出错就记一笔继续跑（后端已经用 no-cache + ?v= 版本号堵住了错配的来源，这里是兜底）。
  const bindFailed = [];
  [bindSettings, bindSetup, bindEvents].forEach((fn) => {
    try { fn(); } catch (e) { bindFailed.push(fn.name); console.error('[绑定失败]', fn.name, e); }
  });
  if (bindFailed.length) {
    banner('界面没能完全加载（' + bindFailed.join('、') + '）',
      '按 F5 刷新一下就好；还不好就双击桌面图标重启服务。');
  }
  syncMode();
  ensureLibs();
  loadTerminalSessions();     // 终端里跑过的会话，命令面板里可以直接接管
  syncGitBadge();             // 顶栏显示工作目录有多少改动
  render();
  renderSidebar();
  autoGrow();
  refreshBalance(false);
  // 余额自动更新（用户要求"不用手动点"）：每 60 秒一次（页面在后台就跳过），
  // 切回标签页立刻更一次；每句话答完也会更（在 sendChat / runAgent 的 finally 里）。
  // 后端自己还有 60 秒缓存兜着，别怕请求太密。
  setInterval(() => { if (!document.hidden) refreshBalance(true, true); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshBalance(false, true);
  });
  focusInput();
  // 没配 API → 直接弹配置向导（不认识 API 的人照着填就行）
  // 配好了 → 只在第一次弹使用引导（加 ?nohelp=1 跳过；?setup=1 强制打开向导）
  if (location.search.includes('nohelp=1')) state.settings.onboarded = true;
  // 只有后端明确说"没配 Key"才弹向导；配置没读到（服务没起/请求失败）不许乱弹，
  // 否则会莫名其妙让人填一堆东西，还显得像"必须先填工作区才能用"
  if (cfg.has_key === false || location.search.includes('setup=1')) setTimeout(openSetup, 400);
  else if (!state.settings.onboarded) setTimeout(() => nodes.onboard.classList.remove('hidden'), 400);
  // PWA：注册 service worker（只在安全上下文 = localhost / *.localhost / https 里生效；
  // 用 127.0.0.1 之外的 IP 访问时浏览器会拒绝，这里静默降级，不影响使用）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js', { updateViaCache: 'none' })
      .then((r) => {
        window.__sw = r.active ? 'active' : (r.installing ? 'installing' : 'registered');
      })
      .catch((e) => {
        window.__sw = 'fail:' + (e && e.name);
        console.warn('service worker 没注册上（不影响使用）:', e && e.message);
      });
  } else {
    window.__sw = 'unsupported';
  }
  if (location.search.includes('panel=settings')) openSettings();
  if (location.search.includes('panel=palette')) openPalette();
  if (location.search.includes('panel=git')) openGit();
  if (location.search.includes('panel=usage')) openUsage();
  if (location.search.includes('panel=balance')) openBalPop();
  // 刷新回来：刚才那个 agent 任务还在后台跑 / 刚跑完 → 把结果接回来
  resumeAgentRun();

  // ?ws=<路径> 临时换工作目录（不改设置，方便瞄一眼别的目录）
  const wsM = location.search.match(/[?&]ws=([^&]+)/);
  if (wsM) {
    state.settings.workspace = decodeURIComponent(wsM[1]);
    syncGitBadge();
    if (!nodes.gitModal.classList.contains('hidden')) refreshGit();
  }
  if (location.search.includes('theme=light')) { state.settings.theme = 'light'; applyTheme(); }
  if (location.search.includes('theme=dark')) { state.settings.theme = 'dark'; applyTheme(); }
  // 慢放 8 倍：网址后面加 ?slowmo=1 就能看清动效（确认动画到底有没有生效）
  if (location.search.includes('slowmo=1')) {
    const st = document.createElement('style');
    st.textContent =
      '.stream-inner.enter{animation-duration:6s!important}'
      + '.stream-inner.enter .msg,.stream-inner.enter .welcome{animation-duration:6s!important;animation-delay:0ms!important}'
      + '.stream-inner.leaving{animation-duration:3s!important}'
      + '.conv-ind{transition-duration:3s!important}'
      + '.msg.new{animation-duration:6s!important}';
    document.head.appendChild(st);
    toast('慢放模式：动效放慢 8 倍', 5000);
  }
  // 只读探针：?probe=1 把关键状态写进标题，方便排查（布局 / 动画开关 / 指示块位置）
  if (location.search.includes('probe=1')) {
    setTimeout(() => {
      const m = document.querySelector('.main');
      const si = nodes.streamInner;
      const cs = si ? getComputedStyle(si) : null;
      const ind = nodes.convList ? nodes.convList.querySelector('.conv-ind') : null;
      // 哪些 nodes.X 取不到元素 = 页面和脚本版本对不上（历史坑，一眼就能看出是哪个）
      const nul = Object.keys(nodes).filter((k) => !nodes[k]);
      document.title = `PROBE null=${nul.length ? nul.join(',') : 'none'} `
        + `vw=${innerWidth} main=${m ? m.offsetWidth : -1} inner=${si ? si.offsetWidth : -1} `
        + `motion=${!document.documentElement.classList.contains('no-motion')} `
        + `anim=${cs && cs.animationName}/${cs && cs.animationDuration} enter=${si ? si.classList.contains('enter') : -1} `
        + `ind=${ind ? Math.round(ind.offsetTop) + '+' + Math.round(ind.offsetHeight) : 'none'} `
        + `sw=${window.__sw || 'none'}`;
      // 顺手做一次写操作自检（真浏览器会带 Origin 头，这正是之前踩坑的地方）
      apiFetch('/api/ping', { method: 'POST' })
        .then((r) => { document.title += ` ping=${r.status}`; })
        .catch((e) => { document.title += ' ping=ERR'; });
    }, 900);
  }
  console.log('deepseek webui v2 就绪', cfg.version);
}
boot();
