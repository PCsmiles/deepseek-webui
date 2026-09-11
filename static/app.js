/* ============================================================================
   deepseek webui — 终端风格前端
   一个跑在浏览器里的、带 Markdown 渲染和流式输出的高级终端。
   Key 永远只在后端，浏览器只跟本机说话。
   ============================================================================ */
'use strict';

// ═══════════════════════════ 常量 ═══════════════════════════
const LS_CONV = 'dsui.conversations.v1';
const LS_SET  = 'dsui.settings.v1';
const LS_CUR  = 'dsui.current.v1';

const DEFAULT_SETTINGS = {
  theme: 'dark',            // dark | black | light
  system: '',
  temperature: 0.7,
  max_tokens: 4096,
  enterSend: true,
  showThinking: true,
  lineNumbers: false,
  model: 'deepseek-flash',
  workspace: 'E:\\',
  readonly: false,
  mode: 'chat',
};

const PAGE = 60;            // 一次渲染多少条消息，更早的用「加载更多」
const TOOL_CN = {
  Read: '读文件', Write: '写文件', Edit: '改文件', MultiEdit: '改文件',
  Bash: '跑命令', PowerShell: '跑命令', Glob: '找文件', Grep: '搜内容',
  WebSearch: '联网搜索', WebFetch: '抓网页', Task: '子任务', TodoWrite: '待办',
  NotebookEdit: '改笔记', Skill: '技能',
};

// ═══════════════════════════ 状态 ═══════════════════════════
const state = {
  convs: [], currentId: null,
  settings: { ...DEFAULT_SETTINGS },
  config: null, token: '',
  streaming: false, streamingMsgId: null, abort: null,
  attach: [],                 // 待发送附件 [{id,name,kind,size,note,text_chars}]
  shown: PAGE,                // 当前渲染了多少条
  startedAt: Date.now(),
  agentReady: false,
  search: '',
};

const $ = (id) => document.getElementById(id);
const nodes = {
  sbConn: $('sbConn'), sbModel: $('sbModel'), sbTitle: $('sbTitle'),
  sbStats: $('sbStats'), sbTimer: $('sbTimer'), sbGen: $('sbGen'),
  btnPalette: $('btnPalette'), btnSettings: $('btnSettings'),
  stream: $('stream'), streamInner: $('streamInner'), streamFoot: $('streamFoot'),
  banner: $('banner'), chips: $('chips'), promptBox: $('promptBox'), promptSign: $('promptSign'),
  input: $('input'), btnAttach: $('btnAttach'), fileInput: $('fileInput'),
  modeSwitch: $('modeSwitch'), hint: $('hint'), hintModel: $('hintModel'),
  palette: $('palette'), palInput: $('palInput'), palList: $('palList'), palHint: $('palHint'),
  settings: $('settings'), setClose: $('setClose'),
  setModel: $('setModel'), setTheme: $('setTheme'), setKey: $('setKey'), setKeyEye: $('setKeyEye'),
  keyNote: $('keyNote'), setBase: $('setBase'), setTemp: $('setTemp'), tempVal: $('tempVal'),
  setMax: $('setMax'), setSystem: $('setSystem'), setWorkspace: $('setWorkspace'),
  setReadonly: $('setReadonly'), setLineNo: $('setLineNo'), setReason: $('setReason'),
  setEnter: $('setEnter'), btnOpenFolder: $('btnOpenFolder'), btnExportAll: $('btnExportAll'),
  aboutNote: $('aboutNote'), lightbox: $('lightbox'), toast: $('toast'),
};
const live = new Map();   // msgId -> {body, think, thinkBody, logEl, metaEl, msg}

// ═══════════════════════════ 小工具 ═══════════════════════════
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
function fmtSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}
function fmtDur(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60);
  return `${m}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}
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
  const t = new Date(ts);
  return `${t.getMonth() + 1}/${t.getDate()}`;
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
      const ta = el('textarea'); ta.value = t;
      ta.style.cssText = 'position:fixed;opacity:0';
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

// ═══════════════════════════ 存档 ═══════════════════════════
function lsGet(key, def) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? def : JSON.parse(raw);
  } catch (e) {
    try { const raw = localStorage.getItem(key); if (raw) localStorage.setItem('dsui.corrupt.' + Date.now(), raw); } catch (_) {}
    setTimeout(() => toast('本地存的对话读不出来（数据损坏），已重置'), 500);
    return def;
  }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) {
    if (/quota|exceed/i.test(e.name + e.message)) toast('浏览器存储满了：设置里导出后删掉些旧对话', 5000);
    return false;
  }
}
const saveAll = () => lsSet(LS_CONV, state.convs);
const saveSettings = () => lsSet(LS_SET, state.settings);
const saveCurrentId = () => lsSet(LS_CUR, state.currentId);

// ═══════════════════════════ 对话 ═══════════════════════════
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
  if (activate) { state.shown = PAGE; render(); focusInput(); }
  return c;
}
function touchConv(c) {
  c.updatedAt = Date.now();
  saveAll(); scheduleBackup(c);
}
function titleFrom(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 34 ? t.slice(0, 34) + '…' : (t || 'new session');
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
  } catch (e) { /* 后端不在也不影响本地用 */ }
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
    } catch (e) { /* 跳过坏文件 */ }
  }
  for (const c of state.convs) if (!diskIds.has(c.id)) backupConv(c);
  state.convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveAll();
  return restored;
}

// ═══════════════════════════ 主题 ═══════════════════════════
function applyTheme() {
  const t = state.settings.theme || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const dark = $('hljsDark'), light = $('hljsLight');
  if (dark && light) { dark.disabled = t !== 'dark' && t !== 'black'; light.disabled = t === 'dark' || t === 'black'; }
}

// ═══════════════════════════ Markdown / 代码 / 公式 ═══════════════════════════
let mdDepsTried = false, libsLeft = 2;
function libReady() {
  if (--libsLeft > 0) return;
  if (!state.streaming) render();
}
function ensureLibs() {
  if (mdDepsTried) return; mdDepsTried = true;
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
    const s2 = document.createElement('script');
    s2.src = urls[1]; s2.onload = done;
    s2.onerror = () => console.warn('库加载失败:', g);
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
    const html = window.katex.renderToString(tex.trim(),
      { displayMode: !!display, throwOnError: false, output: 'html', strict: false });
    return (!html || html.indexOf('katex-error') >= 0) ? null : html;
  } catch (e) { return null; }
}
function extractMath(text) {
  if (!window.katex || !/[$\\]/.test(text)) return { text, store: [] };
  const store = [];
  const stash = (tex, display) => {
    const html = renderKatex(tex, display);
    if (html == null) return null;
    store.push(html);
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
  const parts = extractMath(text);
  let html = null;
  if (window.marked) {
    try { html = sanitizeHtml(window.marked.parse(parts.text, { gfm: true, breaks: true })); } catch (e) {}
  }
  if (html == null) html = '<p>' + escapeHtml(parts.text).replace(/\n/g, '<br>') + '</p>';
  if (parts.store.length) html = html.replace(/\uE000M(\d+)\uE001/g, (m, i) => parts.store[+i] || '');
  return html;
}

/** 把 <pre><code> 包成终端风代码块：语言标签 + 复制 + 行号 + diff 配色 */
function enhanceCode(root, streaming) {
  root.querySelectorAll('pre > code').forEach((code) => {
    if (code.closest('.cb')) return;
    const pre = code.parentElement;
    const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
    let lang = cls ? cls.slice(9) : '';
    const raw = code.textContent || '';
    const looksDiff = /^[+-][^+-]/m.test(raw) && (lang === 'diff' || /^[+-]/m.test(raw.slice(0, 400)));
    if (looksDiff && !lang) lang = 'diff';

    const box = el('div', 'cb');
    const head = el('div', 'cb-head');
    head.appendChild(el('span', 'lang', lang || 'text'));
    const btn = el('button', 'cbtn', '⧉ 复制');
    btn.title = '复制代码';
    btn.addEventListener('click', async () => {
      const ok = await copyText(raw);
      btn.textContent = ok ? '✓ 已复制' : '复制失败';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = '⧉ 复制'; btn.classList.remove('done'); }, 2000);
    });
    head.appendChild(btn);
    box.appendChild(head);
    pre.replaceWith(box);
    box.appendChild(pre);

    if (window.hljs && !streaming) { try { window.hljs.highlightElement(code); } catch (e) {} }
    // 行号：单独一列 sticky 的 gutter，不改动代码本身（复制时不会带上行号）
    if (state.settings.lineNumbers && !looksDiff) {
      const n = raw.replace(/\n$/, '').split('\n').length;
      if (n > 1 && n <= 800) {
        const g = el('span', 'gutter');
        g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        pre.insertBefore(g, code);
        box.classList.add('with-ln');
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

// ═══════════════════════════ 渲染：消息 ═══════════════════════════
function buildTags(list) {
  const box = el('div', 'tags');
  (list || []).forEach((a) => {
    const t = el('span', 'tag ' + (a.kind === 'image' ? 'img' : ''));
    const icon = { image: '🖼', pdf: '📄', doc: '📝', sheet: '📊', slides: '📑', audio: '🎙', video: '🎬' }[a.kind] || '📎';
    t.appendChild(el('span', null, icon));
    t.appendChild(el('b', null, a.name || a.id));
    if (a.size) t.appendChild(el('span', null, fmtSize(a.size)));
    box.appendChild(t);
  });
  return box;
}

function buildMessageEl(msg) {
  const wrap = el('div', 'msg ' + msg.role + (msg.error ? ' err' : ''));
  wrap.dataset.id = msg.id;
  const line = el('div', 'line');
  line.appendChild(el('span', 'sign', msg.role === 'user' ? '❯' : '◉'));
  const body = el('div', 'body');
  line.appendChild(body);
  wrap.appendChild(line);

  if (msg.role === 'user') {
    if (msg.attach && msg.attach.length) body.appendChild(buildTags(msg.attach));
    if (msg.content) body.appendChild(el('div', null, msg.content));
    live.set(msg.id, { body, msg });
    return wrap;
  }

  // ---- AI ----
  let think = null, thinkBody = null;
  if (msg.reasoning && state.settings.showThinking) {
    think = el('details', 'think');
    const sum = el('summary');
    thinkBody = el('div', 'think-body');
    thinkBody.textContent = msg.reasoning;
    think.appendChild(sum); think.appendChild(thinkBody);
    // 生成中显示 ⏳，出完了显示 💭 Thought for Xs
    const upd = () => {
      sum.textContent = (msg.elapsed || msg.done)
        ? `💭 Thought for ${fmtDur(msg.elapsed || 0)}` : '⏳ Thinking…';
    };
    upd();
    body.appendChild(think);
    think._upd = upd;
  }
  let logEl = null;
  if (msg.agent) { logEl = el('div', 'log'); body.appendChild(logEl); renderLog(logEl, msg); }

  const md = el('div', 'md');
  if (msg.content) { md.innerHTML = renderMarkdown(msg.content); enhanceCode(md, false); }
  body.appendChild(md);

  const metaEl = el('div', 'meta');
  body.appendChild(metaEl);
  live.set(msg.id, { body, md, think, thinkBody, logEl, metaEl, msg });
  renderMeta(metaEl, msg);
  return wrap;
}

function renderMeta(metaEl, msg) {
  metaEl.innerHTML = '';
  const mk = (label, title, fn) => {
    const b = el('button', null, label);
    if (title) b.title = title;
    b.addEventListener('click', fn);
    metaEl.appendChild(b);
    return b;
  };
  mk('⧉', '复制回答', async () => {
    const ok = await copyText(msg.content || '');
    toast(ok ? '已复制' : '复制失败');
  });
  if (!msg.agent) mk('↻', '重新生成', () => regenerate(msg));
  if (msg.feedback === 'up') mk('👍', '有用', () => setFeedback(msg, 'up')).classList.add('on');
  else mk('👍', '有用', () => setFeedback(msg, 'up'));
  if (msg.feedback === 'down') mk('👎', '没用', () => setFeedback(msg, 'down')).classList.add('on');
  else mk('👎', '没用', () => setFeedback(msg, 'down'));
  const sp = el('span', 'sp'); metaEl.appendChild(sp);
  const bits = [];
  if (msg.stopped) bits.push('已中断');
  if (msg.elapsed) bits.push(fmtDur(msg.elapsed));
  if (msg.usage && msg.usage.total_tokens) bits.push(fmtNum(msg.usage.total_tokens) + ' tokens');
  else if (msg.agentUsage) bits.push(`↑${fmtNum(msg.agentUsage.input_tokens)} ↓${fmtNum(msg.agentUsage.output_tokens)}`);
  metaEl.appendChild(el('span', null, bits.join(' · ')));
}

function renderLog(logEl, msg) {
  if (!logEl) return;
  logEl.innerHTML = '';
  (msg.steps || []).forEach((s) => {
    const it = el('div', 'log-item ' + (s.is_error || s.kind === 'denied' ? 'bad' : ''));
    const h = el('div', 'log-head');
    h.appendChild(el('span', 't', s.kind === 'denied' ? '⛔' : '▸'));
    h.appendChild(el('span', 'n', TOOL_CN[s.name] || s.name || '工具'));
    h.appendChild(el('span', 's', s.summary || ''));
    h.appendChild(el('span', 'st', s.kind === 'denied' ? '被拒绝'
      : s.status === 'run' ? '执行中…' : s.is_error ? '出错' : s.status === 'ok' ? '完成' : ''));
    h.addEventListener('click', () => it.classList.toggle('collapsed'));
    it.appendChild(h);
    if (s.body) {
      it.appendChild(el('pre', 'log-body', s.body));
      if (s.body.length > 400) it.classList.add('collapsed');
    } else it.classList.add('collapsed');
    logEl.appendChild(it);
  });
}

function renderWelcome() {
  const w = el('div', 'welcome');
  w.appendChild(el('div', 'big', '# 新会话'));
  const ul = el('ul');
  const items = [
    ['直接打字提问，Enter 发送', ''],
    ['/agent 切到干活模式——它会真的读写你电脑上的文件', ''],
    ['+ 号或拖拽可以带附件：文档 / 图片 / 录音 / 视频', ''],
    ['Ctrl+K 打开命令面板（切换、搜索、新会话）', ''],
  ];
  items.forEach(([t]) => ul.appendChild(el('li', null, t)));
  w.appendChild(ul);
  nodes.streamInner.appendChild(w);
}

function render() {
  const conv = currentConv();
  const box = nodes.streamInner;
  live.clear();
  box.innerHTML = '';
  nodes.streamFoot.innerHTML = '';
  if (!conv || !conv.messages.length) { renderWelcome(); syncStatusBar(); return; }

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
  box.appendChild(frag);
  scrollBottom(true);
  syncStatusBar();
}

function scrollBottom(force) {
  const s = nodes.stream;
  const near = s.scrollHeight - s.scrollTop - s.clientHeight < 160;
  if (force || near) s.scrollTop = s.scrollHeight;
}

// ═══════════════════════════ 状态栏 ═══════════════════════════
function convStats(conv) {
  let i = 0, o = 0;
  (conv.messages || []).forEach((m) => {
    if (m.usage) { i += m.usage.prompt_tokens || 0; o += m.usage.completion_tokens || 0; }
    else if (m.agentUsage) { i += m.agentUsage.input_tokens || 0; o += m.agentUsage.output_tokens || 0; }
  });
  return { i, o };
}
function syncStatusBar() {
  const c = currentConv();
  nodes.sbModel.textContent = (c && c.model) || state.settings.model;
  nodes.sbTitle.textContent = (c && c.title) || 'new session';
  const st = c ? convStats(c) : { i: 0, o: 0 };
  nodes.sbStats.textContent = `↑${fmtNum(st.i)} ↓${fmtNum(st.o)}`;
  nodes.sbGen.classList.toggle('hidden', !state.streaming);
  nodes.hintModel.textContent = state.attach.length ? `${state.attach.length} 个附件待发送` : '';
}
setInterval(() => {
  const sec = Math.floor((Date.now() - state.startedAt) / 1000);
  nodes.sbTimer.textContent =
    `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}, 1000);
setInterval(async () => {
  try {
    const ok = (await apiFetch('/api/health')).ok;
    nodes.sbConn.className = 'sb-dot ' + (ok ? 'ok' : 'bad');
  } catch (e) { nodes.sbConn.className = 'sb-dot bad'; }
}, 15000);

// ═══════════════════════════ 发送 ═══════════════════════════
function banner(kind, title, hint) {
  nodes.banner.className = 'banner';
  nodes.banner.innerHTML = '';
  const box = el('div');
  box.appendChild(el('div', 'bt', title));
  if (hint) box.appendChild(el('div', 'bh', hint));
  const x = el('button', 'bx', '✕');
  x.addEventListener('click', hideBanner);
  nodes.banner.appendChild(box); nodes.banner.appendChild(x);
  nodes.banner.classList.remove('hidden');
}
function hideBanner() { nodes.banner.classList.add('hidden'); nodes.banner.innerHTML = ''; }

function setStreaming(on) {
  state.streaming = on;
  nodes.input.disabled = on;
  nodes.sbGen.classList.toggle('hidden', !on);
  nodes.promptSign.textContent = on ? '■' : '❯';
  nodes.promptSign.style.color = on ? 'var(--red)' : '';
  if (!on) { syncStatusBar(); if (window.innerWidth > 720) nodes.input.focus(); }
}

async function send() {
  const conv = currentConv();
  if (!conv || state.streaming) return;
  const text = nodes.input.value.trim();
  const atts = state.attach.slice();
  if (!text && !atts.length) return;

  // 斜杠命令
  if (text.startsWith('/') && !atts.length) {
    if (handleSlash(text)) { nodes.input.value = ''; autoGrow(); return; }
  }

  conv.messages.push({
    id: uid(), role: 'user', ts: Date.now(), content: text,
    attach: atts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, size: a.size })),
  });
  if (!conv.title) conv.title = titleFrom(text || (atts[0] && atts[0].name) || 'new session');
  nodes.input.value = '';
  autoGrow();
  state.attach = [];
  renderChips();
  hideBanner();
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
  const bodyEl = n && n.md;
  const t0 = Date.now();
  if (bodyEl) bodyEl.innerHTML = '<span class="cur"></span>';

  setStreaming(true);
  state.abort = new AbortController();
  let cText = '', cThink = '', firstToken = false, renderTimer = null, sawErr = false;
  let thinkEl = null, thinkBodyEl = null;

  const flush = () => {
    renderTimer = null;
    if (!bodyEl) return;
    if (cText) {
      bodyEl.innerHTML = renderMarkdown(cText);
      enhanceCode(bodyEl, true);
      const last = bodyEl.lastElementChild;
      const cur = el('span', 'cur');
      if (last && /^(P|LI|H1|H2|H3|H4|TD|BLOCKQUOTE|PRE)$/.test(last.tagName)) last.appendChild(cur);
      else bodyEl.appendChild(cur);
    }
    if (thinkBodyEl) { thinkBodyEl.textContent = cThink; if (thinkEl && thinkEl._upd) thinkEl._upd(); }
    scrollBottom(false);
  };
  const schedule = () => { if (!renderTimer) renderTimer = setTimeout(flush, 80); };

  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: state.abort.signal,
      body: JSON.stringify({
        model: conv.model || state.settings.model,
        temperature: state.settings.temperature,
        max_tokens: state.settings.max_tokens,
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
      const r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim(); if (!p) continue;
          let ev; try { ev = JSON.parse(p); } catch (e) { continue; }

          if (ev.type === 'reasoning') {
            if (!cThink && bodyEl) bodyEl.innerHTML = '';
            if (!thinkEl && state.settings.showThinking && n) {
              thinkEl = el('details', 'think'); thinkEl.open = true;
              const sum = el('summary', null, '⏳ Thinking…');
              thinkBodyEl = el('div', 'think-body');
              thinkEl.appendChild(sum); thinkEl.appendChild(thinkBodyEl);
              thinkEl._upd = () => { sum.textContent = '⏳ Thinking…'; };
              n.body.insertBefore(thinkEl, bodyEl);
            }
            cThink += ev.text; schedule();
          } else if (ev.type === 'content') {
            if (!firstToken) {          // 正文开始了 → 把 Thinking 收起来（spec：默认折叠）
              firstToken = true;
              if (bodyEl) bodyEl.innerHTML = '';
              if (thinkEl) thinkEl.open = false;
            }
            cText += ev.text; schedule();
          } else if (ev.type === 'usage') {
            asst.usage = ev.usage;
          } else if (ev.type === 'finish') {
            if (ev.reason === 'length') asst.truncated = true;
          } else if (ev.type === 'error') {
            sawErr = true; banner('err', ev.message || '出错了', ev.hint || '');
          } else if (ev.type === 'done') done = true;
        }
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') asst.stopped = true;
    else { sawErr = true; banner('err', '和本地后端断了连接。', '确认那个黑窗口还开着，或双击桌面图标重启。'); }
  } finally {
    clearTimeout(renderTimer);
    asst.content = cText;
    asst.reasoning = state.settings.showThinking ? cThink : '';
    asst.elapsed = Date.now() - t0;
    asst.done = true;
    state.streamingMsgId = null;
    state.abort = null;
    setStreaming(false);
    if (asst.truncated) banner('err', '回答被 max_tokens 截断了。', '思考过程也占额度，去设置里调大 max_tokens。');
    if (!sawErr && !cText && bodyEl) bodyEl.innerHTML = '<p style="color:var(--fg-faint)">（没有返回内容，可以重新生成）</p>';
    touchConv(conv);
    render();
  }
}

async function runAgent(conv, text) {
  const asst = {
    id: uid(), role: 'assistant', ts: Date.now(), content: '', reasoning: '',
    steps: [], agent: true, model: 'claude-code',
  };
  conv.messages.push(asst);
  state.streamingMsgId = asst.id;
  render();
  const n = live.get(asst.id);
  const bodyEl = n && n.md, logEl = n && n.logEl;
  const t0 = Date.now();
  if (bodyEl) bodyEl.innerHTML = '<span class="cur"></span>';

  setStreaming(true);
  state.abort = new AbortController();
  let cText = '', cThink = '', timer = null, sawErr = false;
  let thinkEl = null, thinkBodyEl = null;

  const flush = () => {
    timer = null;
    if (logEl) renderLog(logEl, asst);
    if (bodyEl && cText) {
      bodyEl.innerHTML = renderMarkdown(cText);
      enhanceCode(bodyEl, false);
      const cur = el('span', 'cur');
      const last = bodyEl.lastElementChild;
      if (last && /^(P|LI|H1|H2|H3|H4|TD|BLOCKQUOTE|PRE)$/.test(last.tagName)) last.appendChild(cur);
      else bodyEl.appendChild(cur);
    }
    if (thinkBodyEl) { thinkBodyEl.textContent = cThink; if (thinkEl && thinkEl._upd) thinkEl._upd(); }
    scrollBottom(false);
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, 80); };

  try {
    const res = await apiFetch('/api/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: state.abort.signal,
      body: JSON.stringify({
        prompt: text, workspace: state.settings.workspace || 'E:\\',
        session_id: conv.agentSessionId || '', readonly: !!state.settings.readonly,
      }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader(), dec = new TextDecoder('utf-8');
    let buf = '', done = false;
    while (!done) {
      const r = await reader.read();
      if (r.done) break;
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
              thinkEl = el('details', 'think'); thinkEl.open = true;
              const sum = el('summary', null, '⏳ Thinking…');
              thinkBodyEl = el('div', 'think-body');
              thinkEl.appendChild(sum); thinkEl.appendChild(thinkBodyEl);
              thinkEl._upd = () => { sum.textContent = '⏳ Thinking…'; };
              n.body.insertBefore(thinkEl, bodyEl);
            }
            cThink += ev.text; schedule();
          } else if (ev.type === 'text') {
            if (!cText && thinkEl) thinkEl.open = false;   // 正文开始，收起 Thinking
            cText += ev.text; schedule();
          }
          else if (ev.type === 'tool') {
            asst.steps.push({ kind: 'tool', name: ev.name, id: ev.id,
              summary: toolSummary(ev.name, ev.input), status: 'run', body: '' });
            schedule();
          } else if (ev.type === 'tool_result') {
            const st = asst.steps.slice().reverse().find((s) => s.id === ev.id && s.status === 'run');
            if (st) { st.status = ev.is_error ? '' : 'ok'; st.is_error = ev.is_error; st.body = ev.content || ''; }
            schedule();
          } else if (ev.type === 'denied') {
            asst.steps.push({ kind: 'denied', name: ev.name, status: '', summary: ev.message || '没被允许', body: '' });
            schedule();
          } else if (ev.type === 'agent_usage') {
            asst.agentUsage = { input_tokens: ev.input_tokens, output_tokens: ev.output_tokens };
          } else if (ev.type === 'error') { sawErr = true; banner('err', ev.message || '出错了', ev.hint || ''); }
          else if (ev.type === 'done') done = true;
        }
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') asst.stopped = true;
    else { sawErr = true; banner('err', '和本地后端断了连接。', '确认那个黑窗口还开着。'); }
  } finally {
    clearTimeout(timer);
    asst.content = cText;
    asst.reasoning = state.settings.showThinking ? cThink : '';
    asst.elapsed = Date.now() - t0;
    asst.done = true;
    state.streamingMsgId = null;
    state.abort = null;
    setStreaming(false);
    if (!sawErr && !cText && bodyEl) bodyEl.innerHTML = '<p style="color:var(--fg-faint)">（这次没产出最终回答，看上面的工具日志）</p>';
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
  if (n) renderMeta(n.metaEl, m);
  toast(m.feedback ? '已标记（只存在本机）' : '已取消');
}

// ═══════════════════════════ 输入区 ═══════════════════════════
function autoGrow() {
  const t = nodes.input;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 200) + 'px';
}
function focusInput() { if (window.innerWidth > 720) nodes.input.focus(); }

function renderChips() {
  nodes.chips.innerHTML = '';
  state.attach.forEach((a, i) => {
    const t = el('span', 'tag ' + (a.busy ? 'busy' : a.bad ? 'bad' : a.kind === 'image' ? 'img' : ''));
    const icon = { image: '🖼', pdf: '📄', doc: '📝', sheet: '📊', slides: '📑', audio: '🎙', video: '🎬' }[a.kind] || '📎';
    t.appendChild(el('span', null, icon));
    t.appendChild(el('b', null, a.name));
    t.appendChild(el('span', null, a.busy ? '解析中…' : a.note || fmtSize(a.size)));
    const x = el('button', 'rm', '✕');
    x.title = '移除';
    x.addEventListener('click', () => { state.attach.splice(i, 1); renderChips(); });
    t.appendChild(x);
    nodes.chips.appendChild(t);
  });
  syncStatusBar();
}

async function addFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  for (const f of list) {
    const item = { id: '', name: f.name, size: f.size, kind: 'unknown', busy: true, note: '' };
    state.attach.push(item);
    renderChips();
    try {
      const r = await apiFetch('/api/attach?name=' + encodeURIComponent(f.name), {
        method: 'POST', body: f,
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.message || '上传失败');
      Object.assign(item, { id: j.id, kind: j.kind, note: j.note, text_chars: j.text_chars, busy: false });
      if (j.kind === 'image') item.kind = 'image';
    } catch (e) {
      item.busy = false; item.bad = true; item.note = '失败：' + e.message;
    }
    renderChips();
  }
  const bad = state.attach.filter((a) => a.bad);
  if (bad.length) toast(`${bad.length} 个附件没处理成功，看标签上的提示`, 4200);
}

// ═══════════════════════════ 斜杠命令 ═══════════════════════════
const SLASH = [
  ['/new', '新建会话'],
  ['/agent', '切到干活模式'],
  ['/chat', '切回聊天模式'],
  ['/model', '切换模型，如 /model deepseek-v4-pro'],
  ['/clear', '清空当前会话的消息'],
  ['/settings', '打开设置'],
  ['/attach', '按路径加附件，如 /attach E:\\a.pdf'],
  ['/export', '导出当前会话为 Markdown'],
  ['/theme', '切换主题 dark|black|light'],
  ['/help', '看这些命令'],
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
      state.settings.model = arg; saveSettings(); syncStatusBar();
      toast('模型已切到 ' + arg); return true;
    case '/clear':
      if (conv) { conv.messages = []; touchConv(conv); render(); toast('已清空'); }
      return true;
    case '/settings': openSettings(); return true;
    case '/export': exportCurrent(); return true;
    case '/theme':
      if (['dark', 'black', 'light'].includes(arg)) {
        state.settings.theme = arg; saveSettings(); applyTheme();
        nodes.setTheme.value = arg; toast('主题：' + arg);
      } else toast('用法：/theme dark | black | light');
      return true;
    case '/attach':
      if (!arg) { toast('用法：/attach 完整路径'); return true; }
      attachByPath(arg); return true;
    case '/help':
      paletteCommands(); return true;
    default:
      return false;
  }
}
async function attachByPath(p) {
  try {
    const r = await apiFetch('/api/attach-path', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.message);
    state.attach.push(j);
    renderChips();
    toast('已加入：' + j.name);
  } catch (e) { toast('加不了：' + e.message, 4000); }
}

// ═══════════════════════════ 命令面板 ═══════════════════════════
let palItems = [], palSel = 0;
function openPalette(prefill) {
  nodes.palette.classList.remove('hidden');
  nodes.palInput.value = prefill || '';
  renderPalette();
  setTimeout(() => nodes.palInput.focus(), 10);
}
function closePalette() { nodes.palette.classList.add('hidden'); }
function paletteCommands() {
  palItems = SLASH.map(([k, d]) => ({ k, t: d, m: '命令', act: () => handleSlash(k + ' ') }));
  palSel = 0; paintPalette();
}
function renderPalette() {
  const q = (nodes.palInput.value || '').trim().toLowerCase();
  if (q.startsWith('/')) {
    palItems = SLASH.filter(([k]) => k.startsWith(q)).map(([k, d]) => ({ k, t: d, m: '命令', act: () => handleSlash(k + ' ') }));
    if (!palItems.length) palItems = SLASH.map(([k, d]) => ({ k, t: d, m: '命令', act: () => handleSlash(k + ' ') }));
  } else {
    const convs = state.convs
      .slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .filter((c) => !q || (c.title || '').toLowerCase().includes(q) ||
        c.messages.some((m) => (m.content || '').toLowerCase().includes(q)));
    palItems = [{ k: 'new', t: '新建会话', m: 'Ctrl+N', act: () => newConversation() }];
    convs.slice(0, 40).forEach((c) => palItems.push({
      k: c.title || 'new session',
      t: `${c.messages.length} 条 · ${timeAgo(c.updatedAt)}`,
      m: fullTime(c.createdAt).slice(0, 10),
      act: () => { state.currentId = c.id; state.shown = PAGE; saveCurrentId(); render(); closePalette(); },
    }));
  }
  palSel = 0; paintPalette();
}
function paintPalette() {
  nodes.palList.innerHTML = '';
  palItems.forEach((it, i) => {
    const d = el('div', 'pal-item' + (i === palSel ? ' sel' : ''));
    d.appendChild(el('span', 'k', '❯'));
    d.appendChild(el('span', 't', it.k));
    d.appendChild(el('span', 'm', it.t + (it.m ? ' · ' + it.m : '')));
    d.addEventListener('click', () => it.act());
    d.addEventListener('mousemove', () => { if (palSel !== i) { palSel = i; paintPalette(); } });
    nodes.palList.appendChild(d);
  });
  nodes.palHint.textContent = palItems.length ? '↑↓ 选择 · Enter 打开 · Esc 关闭' : '没有匹配的会话';
}

// ═══════════════════════════ 设置 ═══════════════════════════
function openSettings() { nodes.settings.classList.remove('hidden'); fillSettings(); }
function closeSettings() { nodes.settings.classList.add('hidden'); }
function fillSettings() {
  const cfg = state.config || {};
  nodes.setModel.innerHTML = '';
  (cfg.models || []).forEach((m) => {
    const o = el('option', null, m.label || m.id);
    o.value = m.id; o.title = m.desc || '';
    nodes.setModel.appendChild(o);
  });
  const c = currentConv();
  nodes.setModel.value = (c && c.model) || state.settings.model;
  nodes.setTheme.value = state.settings.theme;
  nodes.setKey.value = '';
  nodes.keyNote.textContent = cfg.has_key
    ? `当前：已设置（来源：${cfg.key_source || '未知'}）· 留空不改，填了就覆盖`
    : '当前：没有 Key，发消息会失败';
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
  nodes.aboutNote.textContent =
    `v${cfg.version || '?'} · 附件上限 ${fmtNum(at.max_chars || 0)} 字/次 · ` +
    `语音转写 ${at.asr ? '可用' : '不可用'} · 视频处理 ${at.ffmpeg ? '可用（ffmpeg）' : '不可用（缺 ffmpeg）'} · ` +
    `干活模式 ${cfg.agent_ready ? '就绪' : '未找到 claude'}`;
}
function bindSettings() {
  nodes.setClose.addEventListener('click', closeSettings);
  nodes.settings.addEventListener('click', (e) => { if (e.target === nodes.settings) closeSettings(); });
  nodes.setKeyEye.addEventListener('click', () => {
    nodes.setKey.type = nodes.setKey.type === 'password' ? 'text' : 'password';
  });
  nodes.setModel.addEventListener('change', () => {
    const c = currentConv();
    state.settings.model = nodes.setModel.value;
    if (c) { c.model = nodes.setModel.value; touchConv(c); }
    saveSettings(); syncStatusBar();
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
    nodes.setWorkspace.value = v; state.settings.workspace = v; saveSettings();
    toast('起始目录：' + v);
  });
  nodes.setReadonly.addEventListener('change', () => {
    state.settings.readonly = nodes.setReadonly.checked; saveSettings();
    toast(nodes.setReadonly.checked ? '只读模式：只能看不能改' : '完全模式：可改文件、跑命令');
  });
  nodes.setLineNo.addEventListener('change', () => {
    state.settings.lineNumbers = nodes.setLineNo.checked; saveSettings(); render();
  });
  nodes.setReason.addEventListener('change', () => {
    state.settings.showThinking = nodes.setReason.checked; saveSettings(); render();
  });
  nodes.setEnter.addEventListener('change', () => {
    state.settings.enterSend = nodes.setEnter.value === 'send'; saveSettings();
  });
  nodes.btnOpenFolder.addEventListener('click', async () => {
    const j = await (await apiFetch('/api/open-folder', { method: 'POST' })).json();
    toast(j.ok ? '已打开文件夹' : '打不开：' + (j.message || ''), 3600);
  });
  nodes.btnExportAll.addEventListener('click', exportAll);
  // Key / Base URL 存后端
  const saveKey = async () => {
    const body = { base_url: nodes.setBase.value.trim() };
    if (nodes.setKey.value.trim()) body.api_key = nodes.setKey.value.trim();
    const j = await (await apiFetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    state.config = Object.assign(state.config || {}, { has_key: j.has_key, key_source: j.key_source, base_url: j.base_url });
    nodes.setKey.value = '';
    fillSettings();
    toast(j.message || '已保存', 3600);
  };
  nodes.setKey.addEventListener('change', saveKey);
  nodes.setBase.addEventListener('change', saveKey);
}

// ═══════════════════════════ 导出 ═══════════════════════════
const safeName = (s) => (s || 'session').replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 60);
function convToMarkdown(c) {
  const L = [`# ${c.title || 'session'}`, '',
    `> 模型：${c.model || ''} · 创建：${fullTime(c.createdAt)} · 导出：${fullTime(Date.now())}`, '', '---', ''];
  c.messages.forEach((m) => {
    if (m.role === 'user') {
      L.push('## ❯ 我', '');
      (m.attach || []).forEach((a) => L.push(`[附件：${a.name}]`));
      L.push(m.content || '', '');
    } else if (m.content) {
      L.push('## ◉ DeepSeek', '');
      if (m.reasoning) { L.push('<details><summary>Thinking</summary>', '', m.reasoning, '', '</details>', ''); }
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

// ═══════════════════════════ 模式 ═══════════════════════════
function setMode(mode) {
  const c = currentConv();
  if (!c) return;
  if (state.streaming) { toast('正在生成，先按 Esc 中断'); return; }
  c.mode = mode;
  state.settings.mode = mode;
  saveAll(); saveSettings();
  syncMode();
  if (mode === 'agent') {
    if (!state.agentReady) banner('err', '没找到 claude 命令，干活模式用不了。', '装一下：npm install -g @anthropic-ai/claude-code');
    else { hideBanner(); toast('AGENT：它会真的读写你电脑上的文件', 3000); }
  } else hideBanner();
}
function syncMode() {
  const c = currentConv();
  const m = convMode(c);
  nodes.modeSwitch.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  nodes.input.placeholder = m === 'agent' ? '让它干什么…（比如：把 E:\\xxx 里的脚本报错修好）' : '输入点什么…';
}

// ═══════════════════════════ 事件绑定 ═══════════════════════════
function bindEvents() {
  nodes.btnPalette.addEventListener('click', () => openPalette());
  nodes.btnSettings.addEventListener('click', openSettings);
  nodes.btnAttach.addEventListener('click', () => nodes.fileInput.click());
  nodes.fileInput.addEventListener('change', () => { addFiles(nodes.fileInput.files); nodes.fileInput.value = ''; });
  nodes.modeSwitch.querySelectorAll('.mode-btn').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));
  nodes.sbTitle.addEventListener('click', () => {
    const c = currentConv(); if (!c) return;
    const v = prompt('会话标题：', c.title || '');
    if (v != null) { c.title = v.trim() || 'new session'; touchConv(c); render(); }
  });
  nodes.lightbox.addEventListener('click', () => nodes.lightbox.classList.add('hidden'));

  // 面板键盘
  nodes.palInput.addEventListener('input', renderPalette);
  nodes.palInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); paintPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); paintPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palSel]; if (it) { closePalette(); it.act(); } }
  });
  nodes.palette.addEventListener('click', (e) => { if (e.target === nodes.palette) closePalette(); });

  // 输入
  nodes.input.addEventListener('input', () => { autoGrow(); if (nodes.input.value.startsWith('/')) openPalette(nodes.input.value); });
  nodes.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && state.settings.enterSend) { e.preventDefault(); send(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !state.settings.enterSend) { e.preventDefault(); send(); }
    else if (e.key === 'Tab' && nodes.input.value.startsWith('/')) {
      e.preventDefault();
      const hit = SLASH.find(([k]) => k.startsWith(nodes.input.value.trim()));
      if (hit) { nodes.input.value = hit[0] + ' '; autoGrow(); closePalette(); }
    }
  });
  nodes.input.addEventListener('paste', (e) => {
    const files = [];
    for (const it of (e.clipboardData && e.clipboardData.items) || [])
      if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  // 拖拽
  ['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault(); nodes.promptBox.style.borderTopColor = 'var(--green)';
    }
  }));
  ['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => {
    nodes.promptBox.style.borderTopColor = '';
    if (ev === 'drop') {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }
  }));

  // 全局快捷键
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); nodes.palette.classList.contains('hidden') ? openPalette() : closePalette(); return; }
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); newConversation(); return; }
    if (ctrl && e.key.toLowerCase() === 'c' && state.streaming && !String(getSelection() || '').length) {
      e.preventDefault(); if (state.abort) state.abort.abort(); return;
    }
    if (e.key === 'Escape') {
      if (!nodes.lightbox.classList.contains('hidden')) { nodes.lightbox.classList.add('hidden'); return; }
      if (!nodes.palette.classList.contains('hidden')) { closePalette(); return; }
      if (!nodes.settings.classList.contains('hidden')) { closeSettings(); return; }
      if (state.streaming && state.abort) { state.abort.abort(); return; }
    }
  });
  window.addEventListener('beforeunload', (e) => { if (state.streaming) { e.preventDefault(); e.returnValue = ''; } });
}

// ═══════════════════════════ 错误兜底 ═══════════════════════════
function reportFatal(msg, where) {
  try {
    document.title = 'ERR ' + msg;
    banner('err', '界面出了点小毛病：' + msg, '位置：' + where + '（F5 刷新通常能恢复）');
  } catch (_) {}
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

// ═══════════════════════════ 启动 ═══════════════════════════
async function boot() {
  const saved = lsGet(LS_SET, null);
  state.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
  applyTheme();

  try {
    state.config = await (await apiFetch('/api/config')).json();
  } catch (e) {
    state.config = { models: [], has_key: false };
    banner('err', '连不上本地后端。', '那个黑窗口还在吗？不在就双击桌面图标重启。');
  }
  const cfg = state.config || {};
  state.token = cfg.token || '';
  state.agentReady = !!cfg.agent_ready;
  if (!saved) {
    if (cfg.system_prompt) state.settings.system = cfg.system_prompt;
    if (cfg.default_model) state.settings.model = cfg.default_model;
  }
  saveSettings();
  nodes.sbConn.className = 'sb-dot ok';

  state.convs = lsGet(LS_CONV, []);
  if (!Array.isArray(state.convs)) state.convs = [];
  state.convs.forEach((c) => { if (!Array.isArray(c.messages)) c.messages = []; if (!c.mode) c.mode = 'chat'; });
  state.currentId = lsGet(LS_CUR, null);

  const restored = await restoreFromDisk();
  if (restored > 0) toast(`从本地文件夹恢复了 ${restored} 个会话`, 3200);
  if (!state.convs.length) newConversation(true);
  else if (!state.currentId || !state.convs.some((c) => c.id === state.currentId)) {
    state.currentId = state.convs[0].id; saveCurrentId();
  }

  bindSettings();
  bindEvents();
  syncMode();
  ensureLibs();
  render();
  autoGrow();
  if (window.innerWidth > 720) nodes.input.focus();
  if (!cfg.has_key) banner('err', '没有找到 API Key，发消息会失败。',
    '设置里可以填，或确认 ~/.claude/settings.json 里有 ANTHROPIC_AUTH_TOKEN');
  // 只读的调试入口：网址后面加 ?panel=settings 直接打开设置（截图/排查用）
  if (location.search.includes('panel=settings')) openSettings();
  console.log('deepseek webui 就绪', cfg.version);
}

boot();
