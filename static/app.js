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
  model: 'deepseek-flash', workspace: 'E:\\', readonly: false, mode: 'chat',
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
const TOOL_ICON = {
  Read: '👁', Glob: '⌕', Grep: '⌕', Write: '✎', Edit: '✎', MultiEdit: '✎', NotebookEdit: '✎',
  Bash: '▶', PowerShell: '▶', WebSearch: '🌐', WebFetch: '🌐', Task: '⛓', Skill: '✦',
};

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
  app: $('app'), side: $('side'), sideMask: $('sideMask'), btnSide: $('btnSide'),
  brandSub: $('brandSub'), btnNew: $('btnNew'), search: $('search'), convList: $('convList'),
  balText: $('balText'), balDot: $('balDot'), btnBalance: $('btnBalance'),
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
  setWorkspace: $('setWorkspace'), setReadonly: $('setReadonly'), setLineNo: $('setLineNo'),
  setReason: $('setReason'), setEnter: $('setEnter'), btnOpenFolder: $('btnOpenFolder'),
  btnExportAll: $('btnExportAll'), aboutNote: $('aboutNote'),
  keysModal: $('keysModal'), keysClose: $('keysClose'),
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
function apiFetch(url, opts) {
  const o = Object.assign({}, opts || {});
  o.headers = Object.assign({}, o.headers || {}, { 'X-DSUI-Token': state.token });
  return fetch(url, o);
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
  if (activate) { state.currentId = c.id; saveCurrentId(); }
  saveAll();
  if (activate) { state.shown = PAGE; render(); renderSidebar(); closeSide(); focusInput(); }
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
  nodes.btnTheme.textContent = t === 'dark' ? '🌙' : '☀️';
  const d = $('hljsDark'), l = $('hljsLight');
  if (d && l) { d.disabled = t !== 'dark'; l.disabled = t === 'dark'; }
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
  head.appendChild(el('span', 'tool-ico', TOOL_ICON[s.name] || '⚙'));
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
function buildReasonEl(text, open) {
  const d = el('details', 'think');
  if (open) d.open = true;
  const s = el('summary');
  const b = el('div', 'think-body');
  b.textContent = text || '';
  d.appendChild(s); d.appendChild(b);
  const api = { el: d, body: b, summary: s, touched: false,
    refresh: () => { s.textContent = '💭 思考过程 · ' + (b.textContent || '').length + ' 字'; } };
  api.refresh();
  s.addEventListener('click', () => { api.touched = true; });
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
  who.appendChild(el('b', null, msg.agent ? 'claude code' : 'deepseek'));
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
  const mk = (label, title, fn) => {
    const b = el('button', null, label);
    if (title) b.title = title;
    b.addEventListener('click', fn); acts.appendChild(b); return b;
  };
  mk('⧉', '复制全文', async () => { const ok = await copyText(msg.content || ''); toast(ok ? '已复制' : '失败'); });
  if (!msg.agent) mk('↻', '重新生成', () => regenerate(msg));
  const up = mk('👍', '有用', () => setFeedback(msg, 'up'));
  if (msg.feedback === 'up') up.classList.add('on');
  const dn = mk('👎', '没用', () => setFeedback(msg, 'down'));
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
function render() {
  const conv = currentConv();
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
    frag.appendChild(buildMessageEl(m));
  });
  nodes.streamInner.appendChild(frag);
  // 最后一条 AI 消息的操作栏常显（省得每次都要用鼠标划过去才看得见）
  const kids = nodes.streamInner.children;
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
  const list = state.convs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((c) => !q || (c.title || '').toLowerCase().includes(q) ||
      c.messages.some((m) => (m.content || '').toLowerCase().includes(q)));
  nodes.convList.innerHTML = '';
  if (!list.length) {
    nodes.convList.appendChild(el('div', 'conv-empty', q ? '没有匹配的会话' : '还没有会话'));
    return;
  }
  let lastGroup = '';
  list.forEach((c) => {
    const g = dayGroup(c.updatedAt);
    if (g !== lastGroup) { nodes.convList.appendChild(el('div', 'conv-group', g)); lastGroup = g; }
    const b = el('button', 'conv-item' + (c.id === state.currentId ? ' active' : ''));
    b.appendChild(el('span', 't', c.title || '新会话'));
    b.appendChild(el('span', 'n', String(c.messages.length)));
    const del = el('button', 'del', '✕');
    del.title = '删除';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(c.id); });
    b.appendChild(del);
    b.addEventListener('click', () => selectConversation(c.id));
    nodes.convList.appendChild(b);
  });
}
function selectConversation(id) {
  if (state.streaming) { toast('正在生成，先按 Esc 中断'); return; }
  state.currentId = id; state.shown = PAGE;
  saveCurrentId(); render(); renderSidebar(); syncMode(); closeSide();
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
  nodes.topMeta.textContent = `${n} 问 · ${c.model || state.settings.model} · ${timeAgo(c.updatedAt)}`;
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
  const x = el('button', 'bx', '✕');
  x.addEventListener('click', hideBanner);
  nodes.banner.appendChild(el('span', null, '⚠'));
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
  if (convMode(conv) === 'agent') return runAgent(conv, text);
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
    else { err = true; banner('和本地后端断了连接。', '那个黑窗口还在吗？不在就双击桌面图标重启。'); }
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
    touchConv(conv);
    render();
  }
}
async function runAgent(conv, text) {
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
          if (ev.type === 'session') conv.agentSessionId = ev.session_id;
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
    render();
  }
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
  if (convMode(conv) === 'agent') runAgent(conv, lastUser.content || '');
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
function openSettings() { nodes.settings.classList.remove('hidden'); fillSettings(); }
function closeSettings() { nodes.settings.classList.add('hidden'); }
function fillSettings() {
  const cfg = state.config || {};
  nodes.setModel.innerHTML = '';
  (cfg.models || []).forEach((m) => {
    const o = el('option', null, m.label || m.id); o.value = m.id; o.title = m.desc || '';
    nodes.setModel.appendChild(o);
  });
  const c = currentConv();
  nodes.setModel.value = (c && c.model) || state.settings.model;
  nodes.setTheme.value = state.settings.theme === 'light' ? 'light' : 'dark';
  nodes.setKey.value = '';
  nodes.keyNote.textContent = cfg.has_key
    ? `当前已设置（来源：${cfg.key_source || '未知'}）· 留空不改，填了就覆盖`
    : '当前没有 Key，发消息会失败';
  nodes.setBase.value = cfg.base_url || '';
  nodes.setTemp.value = state.settings.temperature;
  nodes.tempVal.textContent = Number(state.settings.temperature).toFixed(1);
  nodes.setMax.value = state.settings.max_tokens;
  nodes.setSystem.value = state.settings.system || '';
  nodes.setWorkspace.value = state.settings.workspace || 'E:\\';
  nodes.setReadonly.checked = !!state.settings.readonly;
  nodes.setLineNo.checked = !!state.settings.lineNumbers;
  nodes.setReason.checked = !!state.settings.showThinking;
  nodes.setEnter.value = state.settings.enterSend ? 'send' : 'newline';
  const at = cfg.attach || {};
  nodes.aboutNote.textContent = `v${cfg.version || '?'} · 附件上限 ${fmtNum(at.max_chars || 0)} 字/次 · 语音转写 ${at.asr ? '可用' : '不可用'} · 视频处理 ${at.ffmpeg ? '可用' : '不可用'} · 干活模式 ${cfg.agent_ready ? '就绪' : '未找到 claude'}`;
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
  nodes.setWorkspace.addEventListener('change', () => {
    const v = (nodes.setWorkspace.value || '').trim() || 'E:\\';
    nodes.setWorkspace.value = v; state.settings.workspace = v; saveSettings(); toast('起始目录：' + v);
  });
  nodes.setReadonly.addEventListener('change', () => {
    state.settings.readonly = nodes.setReadonly.checked; saveSettings();
    toast(nodes.setReadonly.checked ? '只读模式：只能看不能改' : '完全模式：可改文件、跑命令');
  });
  nodes.setLineNo.addEventListener('change', () => { state.settings.lineNumbers = nodes.setLineNo.checked; saveSettings(); render(); });
  nodes.setReason.addEventListener('change', () => { state.settings.showThinking = nodes.setReason.checked; saveSettings(); render(); });
  nodes.setEnter.addEventListener('change', () => { state.settings.enterSend = nodes.setEnter.value === 'send'; saveSettings(); });
  nodes.btnOpenFolder.addEventListener('click', async () => {
    const j = await (await apiFetch('/api/open-folder', { method: 'POST' })).json();
    toast(j.ok ? '已打开文件夹' : '打不开：' + (j.message || ''), 3200);
  });
  nodes.btnExportAll.addEventListener('click', exportAll);
  const saveKey = async () => {
    const body = { base_url: nodes.setBase.value.trim() };
    if (nodes.setKey.value.trim()) body.api_key = nodes.setKey.value.trim();
    const j = await (await apiFetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    state.config = Object.assign(state.config || {}, { has_key: j.has_key, key_source: j.key_source, base_url: j.base_url });
    nodes.setKey.value = ''; fillSettings(); toast(j.message || '已保存', 3200);
  };
  nodes.setKey.addEventListener('change', saveKey);
  nodes.setBase.addEventListener('change', saveKey);
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
      L.push('## ◉ DeepSeek', '');
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
async function refreshBalance(fresh) {
  nodes.balText.textContent = '余额…';
  try {
    const j = await (await apiFetch('/api/balance' + (fresh ? '?fresh=1' : ''))).json();
    if (!j.ok) { nodes.balDot.className = 'dot bad'; nodes.balText.textContent = j.message || '读取失败'; return; }
    const v = parseFloat(j.total);
    nodes.balDot.className = 'dot ' + (!j.is_available || v <= 0 ? 'bad' : v < 10 ? 'low' : 'ok');
    nodes.balText.textContent = `余额 ${j.currency} ${j.total}`;
  } catch (e) { nodes.balDot.className = 'dot bad'; nodes.balText.textContent = '余额读取失败'; }
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
  nodes.btnBalance.addEventListener('click', () => refreshBalance(true));
  nodes.btnAttach.addEventListener('click', () => nodes.fileInput.click());
  nodes.fileInput.addEventListener('change', () => { addFiles(nodes.fileInput.files); nodes.fileInput.value = ''; });
  nodes.modeSwitch.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  nodes.btnSend.addEventListener('click', () => send());
  nodes.btnStop.addEventListener('click', () => { if (state.abort) state.abort.abort(); });
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

  nodes.input.addEventListener('input', autoGrow);
  nodes.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && state.settings.enterSend) { e.preventDefault(); send(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !state.settings.enterSend) { e.preventDefault(); send(); }
  });
  nodes.input.addEventListener('paste', (e) => {
    const files = [];
    for (const it of (e.clipboardData && e.clipboardData.items) || [])
      if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
    if (files.length) { e.preventDefault(); addFiles(files); }
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
      e.preventDefault(); if (state.abort) state.abort.abort(); return;
    }
    if (e.key === 'Escape') {
      if (!nodes.lightbox.classList.contains('hidden')) { nodes.lightbox.classList.add('hidden'); return; }
      if (!nodes.palette.classList.contains('hidden')) { closePalette(); return; }
      if (!nodes.settings.classList.contains('hidden')) { closeSettings(); return; }
      if (!nodes.keysModal.classList.contains('hidden')) { nodes.keysModal.classList.add('hidden'); return; }
      if (state.streaming && state.abort) { state.abort.abort(); return; }
      closeSide();
    }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) closeSide(); });
  window.addEventListener('beforeunload', (e) => { if (state.streaming) { e.preventDefault(); e.returnValue = ''; } });
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

  bindSettings();
  bindEvents();
  syncMode();
  ensureLibs();
  render();
  renderSidebar();
  autoGrow();
  refreshBalance(false);
  focusInput();
  if (!cfg.has_key) banner('没有找到 API Key，发消息会失败。', '设置里可以填，或确认 ~/.claude/settings.json 里有 ANTHROPIC_AUTH_TOKEN');
  if (location.search.includes('panel=settings')) openSettings();
  if (location.search.includes('panel=palette')) openPalette();
  if (location.search.includes('theme=light')) { state.settings.theme = 'light'; applyTheme(); }
  if (location.search.includes('theme=dark')) { state.settings.theme = 'dark'; applyTheme(); }
  // 只读探针：?probe=1 把关键宽度写进标题，方便排查布局
  if (location.search.includes('probe=1')) {
    setTimeout(() => {
      const m = document.querySelector('.main');
      document.title = `PROBE vw=${innerWidth} app=${nodes.app.offsetWidth} side=${nodes.side.offsetWidth} `
        + `main=${m ? m.offsetWidth : -1} stream=${nodes.stream.offsetWidth} inner=${nodes.streamInner.offsetWidth} `
        + `composer=${nodes.composer.offsetWidth} collapsed=${nodes.app.classList.contains('collapsed')}`;
    }, 600);
  }
  console.log('deepseek webui v2 就绪', cfg.version);
}
boot();
