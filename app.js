/* 德语单词树 · 纯静态单页应用，无外部依赖，可离线双击打开 */
(function () {
'use strict';
var D = window.WORD_DATA;
if (!D) { document.body.innerHTML = '<p style="padding:40px">数据文件 data/words.js 未加载</p>'; return; }
var W = D.words, TREE = D.tree, NB = D.neighbors || {};
var TOTAL = W.length;
var SEARCH_HAY = null, POS_POOL = null;
function buildIndexes() {
  SEARCH_HAY = W.map(function (w) {
    return (w.w + ' ' + w.tr + ' ' + w.en + ' ' + w.de + ' ' + (w.mo || []).join(' ') +
      ' ' + (w.tp || []).join(' ') + ' ' + (w.pa || '')).toLowerCase();
  });
  POS_POOL = {};
  W.forEach(function (w, i) { (POS_POOL[w.pos] = POS_POOL[w.pos] || []).push(i); });
}
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ================= 状态 ================= */
var KEY = 'wortbaum_v1';
function dayStr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function loadState() {
  var s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  s.prog = s.prog || {}; s.xp = s.xp || 0; s.streak = s.streak || 1;
  s.goal = s.goal || 20; s.doneToday = s.doneToday || 0; s.unitIdx = s.unitIdx || 0;
  s.lastDay = s.lastDay || '';
  s.look = s.look || {};        // 单词查阅次数：{词索引: 次数}
  s.cursor = s.cursor || {};    // 每个学习范围已推进到的词位置
  s.rounds = s.rounds || {};    // 每个学习范围已背组数
  var td = dayStr(Date.now());
  if (s.lastDay !== td) { s.streak = (s.lastDay === dayStr(Date.now() - 86400000)) ? s.streak + 1 : 1; s.doneToday = 0; s.lastDay = td; }
  return s;
}
var S = loadState();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function lvOf(i) { var p = S.prog[i]; return p ? p.lv : 0; }
function knownCount() { var n = 0; for (var k in S.prog) if (S.prog[k].lv >= 3) n++; return n; }
function rateWord(i, r) {
  var p = S.prog[i] || { lv: 0, seen: 0 }, now = Date.now();
  p.seen = (p.seen || 0) + 1;
  if (r === 0) { p.lv = 0; p.next = now; }
  else if (r === 1) { p.lv = Math.max(1, p.lv); p.next = now + 86400000; }
  else { p.lv = Math.min(3, p.lv + 1); p.next = now + 4 * 86400000; }
  S.prog[i] = p; S.doneToday++; S.xp += (r + 1) * 2; save(); renderStats(); flyXp((r + 1) * 2);
}
function flyXp(n) {
  var el = document.createElement('span');
  el.className = 'xp-fly'; el.textContent = '+' + n + ' XP';
  var a = $('statXp').getBoundingClientRect();
  el.style.left = (a.left + a.width / 2) + 'px';
  el.style.top = (a.bottom + 4) + 'px';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 950);
  var st = $('statXp');
  st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
}
function renderStats() {
  $('statStreak').textContent = S.streak;
  $('statXp').textContent = S.xp;
  $('statKnown').textContent = knownCount();
  $('sideDone').textContent = S.doneToday;
  $('sideGoal').textContent = S.goal;
  $('sideGoalFill').style.width = Math.min(100, S.doneToday / S.goal * 100) + '%';
  $('pathXp').textContent = S.xp;
}
function speak(t) {
  if (!window.speechSynthesis || !t) return;
  try {
    var u = new SpeechSynthesisUtterance(t.replace(/·/g, ''));
    u.lang = 'de-DE'; u.rate = 0.85; u.pitch = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}

/* ================= 视图切换 ================= */
var curView = 'study';
function switchView(v) {
  curView = v;
  document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
  document.querySelectorAll('.view').forEach(function (s) {
    var on = s.id === 'view-' + v;
    s.classList.toggle('active', on);
    if (on) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
  });
  var hints = { study: '空格翻面 · F 朗读 · 1/2/3 评级', path: '点亮一个词族，就往上走一格',
    quiz: '十题一轮，答对积累连击与 XP', search: '按德语、中文、英文或词根查找 · Esc 清空' };
  $('topHint').textContent = hints[v] || '';
  if (v === 'study') { if (!round.length) makeRound(curScope || 'all'); else renderProgress(); }
  if (v === 'path') renderPath();
  if (v === 'quiz') { if (!quiz.qs.length) makeQuiz(); else renderQuiz(); }
  if (v === 'search') renderSearch();
}
document.querySelectorAll('.nav-item').forEach(function (b) {
  b.addEventListener('click', function () { switchView(b.dataset.view); });
});

/* ================= 详情 ================= */
function assocHtml(w) {
  return (w.as || []).map(function (a) { return '<div>' + esc(a) + '</div>'; }).join('');
}
function tagHtml(w) {
  var h = (w.mo || []).slice(0, 8).map(function (m) { return '<span class="dt-tag">' + esc(m) + '</span>'; }).join('');
  h += (w.tp || []).map(function (m) { return '<span class="dt-tag topic">' + esc(m) + '</span>'; }).join('');
  return h;
}
function showDetail(i) {
  S.look[i] = (S.look[i] || 0) + 1;
  save();
  if (curView === 'search') renderSearch();
  var w = W[i];
  var ns = (NB[String(i)] || []).slice(0, 6);
  var neiHtml = ns.length ? '<div class="dt-k">邻居</div><div class="dt-nei">' + ns.map(function (j) {
    return '<button data-nei="' + j + '">' + esc(W[j].w) + '</button>'; }).join('') + '</div>' : '';
  $('detailBody').innerHTML =
    '<div class="dt-top"><span class="dt-badge">' + esc(w.pos) + '</span><span class="dt-cefr">' + esc(w.cefr || '') + ' · ' + esc(w.deck || '') + '</span>' +
    (S.look[i] ? '<span class="dt-look">查阅 ' + S.look[i] + ' 次</span>' : '') + '</div>' +
    (w.art ? '<div class="dt-art">' + esc(w.art) + '</div>' : '') +
    '<div class="dt-word">' + esc(w.w) + '</div>' +
    (w.ipa ? '<div class="dt-ipa">〔' + esc(w.ipa) + '〕</div>' : '') +
    '<div class="dt-row"><div class="dt-k">翻译</div><div class="dt-v tr">' + esc(w.tr) + '</div></div>' +
    '<div class="dt-row"><div class="dt-k">英文</div><div class="dt-v">' + esc(w.en) + '</div></div>' +
    '<div class="dt-row"><div class="dt-k">德解</div><div class="dt-v de">' + esc(w.de) + '</div></div>' +
    (w.pa ? '<div class="dt-row"><div class="dt-k">解析</div><div class="dt-v pa">' + esc(w.pa) + '</div></div>' : '') +
    ((w.as || []).length ? '<div class="dt-assoc">' + assocHtml(w) + '</div>' : '') +
    '<div class="dt-tags">' + tagHtml(w) + '</div>' +
    '<div class="dt-row">' + neiHtml + '</div>' +
    '<div class="dt-btns"><button class="btn-main" id="dtSpeak">朗读</button>' +
    '<button class="btn-soft" id="dtStudy">学这个词</button></div>';
  $('wordModal').hidden = false;
  document.querySelector('.modal-card').scrollTop = 0;
  $('dtSpeak').onclick = function () { speak(w.w); };
  $('dtStudy').onclick = function () {
    closeDetail();
    round = [i]; roundPos = 0; curScope = 'single'; switchView('study'); showCard();
  };
  $('detailBody').querySelectorAll('[data-nei]').forEach(function (b) {
    b.onclick = function () { showDetail(+b.dataset.nei); };
  });
}
function closeDetail() { $('wordModal').hidden = true; }
$('modalClose').addEventListener('click', closeDetail);
$('wordModal').addEventListener('click', function (e) { if (e.target === this) closeDetail(); });

/* ================= 背单词 ================= */
var round = [], roundPos = 0, flipped = false, curScope = 'all', pendingUnit = false;
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/* 确定性打散：同一批词始终得到同一顺序，轮次游标才能严格推进而不重复 */
function stableShuffle(a) {
  function h(i) { var x = ((i + 1) * 2654435761) % 4294967296; x ^= x >>> 13; return x; }
  return a.slice().sort(function (x, y) { return h(x) - h(y); });
}
function allIdx() { var a = []; for (var i = 0; i < W.length; i++) a.push(i); return a; }
function scopePool(scope) {
  var now = Date.now(), a = [];
  if (scope === 'due') { for (var i = 0; i < W.length; i++) { var p = S.prog[i]; if (p && p.lv > 0 && p.lv < 3 && (p.next || 0) <= now) a.push(i); } }
  else if (scope === 'new') { for (var j = 0; j < W.length; j++) if (lvOf(j) === 0) a.push(j); }
  else if (scope.charAt(0) === 'b') { var bi = +scope.slice(1); TREE[bi].children.forEach(function (f) { a = a.concat(f.leaves); }); }
  else if (scope.charAt(0) === 'f') { var q = scope.slice(1).split('_'); a = TREE[+q[0]].children[+q[1]].leaves.slice(); }
  else { // 智能队列：未学优先，补待复习
    var fresh = [], due = [], rest = [];
    for (var k = 0; k < W.length; k++) {
      var p2 = S.prog[k];
      if (!p2 || p2.lv === 0) fresh.push(k);
      else if (p2.lv < 3 && (p2.next || 0) <= now) due.push(k);
      else rest.push(k);
    }
    a = due.concat(fresh, rest);
  }
  return a;
}
/* ---- 范围选择：两级芯片，点选即学，始终高亮当前范围 ---- */
function scopeCount(bi) { return TREE[bi].children.reduce(function (s, f) { return s + f.leaves.length; }, 0); }
function bindChips(rowSel, onPick) {
  document.querySelectorAll(rowSel + ' [data-sc]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation(); b.blur(); onPick(b.dataset.sc);
    });
  });
}
function chipHtml(v, label, n, on) {
  return '<button class="sc' + (on ? ' on' : '') + '" data-sc="' + v + '">' + esc(label) +
    (n ? '<small>' + n + '</small>' : '') + '</button>';
}
function famList(bi) {
  return TREE[bi].children.filter(function (f) { return f.leaves.length >= 6 && f.type !== '字母'; })
    .sort(function (a, b) { return b.leaves.length - a.leaves.length; });
}
function renderScope() {
  var mains = [['all', '智能队列'], ['new', '只背新词'], ['due', '待复习']];
  $('scopeMain').innerHTML = mains.map(function (m) {
    return chipHtml(m[0], m[1], 0, curScope === m[0]);
  }).join('');
  $('scopeBranch').innerHTML = TREE.map(function (b, bi) {
    return chipHtml('b' + bi, b.name, scopeCount(bi), curScope === 'b' + bi);
  }).join('');
  var famRow = $('scopeFam');
  var famBi = -1;
  if (curScope.charAt(0) === 'b') famBi = +curScope.slice(1);
  else if (curScope.charAt(0) === 'f') famBi = +curScope.slice(1).split('_')[0];
  if (famBi >= 0) {
    famRow.hidden = false;
    famRow.innerHTML = famList(famBi).map(function (f, fj) {
      return chipHtml('f' + famBi + '_' + TREE[famBi].children.indexOf(f), f.name, f.leaves.length, curScope === 'f' + famBi + '_' + TREE[famBi].children.indexOf(f));
    }).join('');
  } else famRow.hidden = true;
  bindChips('#scopeMain', pickScope);
  bindChips('#scopeBranch', pickScope);
  bindChips('#scopeFam', pickScope);
}
function pickScope(v) {
  if (v !== 'all' && !scopePool(v).length)
    v = (v === 'due' && scopePool('new').length) ? 'new' : 'all';
  makeRound(v, v === curScope);   // 重点当前范围 = 从头再背；换范围 = 接着该范围进度
}
/* 每个学习范围有独立游标：每轮从游标处取 20 词并向后推进，
   因此「换一组 / 继续下一组」必定拿到下一批词；游标持久化，刷新也不回到第一组。
   走完整池后自动从头循环，并在进度标签显示当前是第几组。 */
function makeRound(scope, restart) {
  curScope = scope || 'all';
  var pool = scopePool(curScope);
  if (!pool.length) pool = allIdx();
  if (curScope === 'all' || curScope === 'new' || curScope === 'due') pool = stableShuffle(pool);
  if (restart) { S.cursor[curScope] = 0; S.rounds[curScope] = 0; }
  var cur = S.cursor[curScope] || 0;
  if (cur >= pool.length) cur = 0;
  var picks = [];
  for (var n = 0; n < pool.length && picks.length < 20; n++) {
    var v = pool[(cur + n) % pool.length];
    if (picks.indexOf(v) < 0) picks.push(v);
  }
  round = picks; roundPos = 0; flipped = false;
  S.cursor[curScope] = (cur + picks.length) % pool.length;
  S.rounds[curScope] = (S.rounds[curScope] || 0) + 1;
  save();
  renderScope();
  showCard();
}
function renderCardTitle() {
  var t = { all: '智能队列 · 未学优先', new: '只背新词', due: '待复习' }[curScope];
  if (!t) {
    if (curScope === 'single') t = '单词详情 · 单卡学习';
    else if (curScope.charAt(0) === 'b') t = '枝 · ' + TREE[+curScope.slice(1)].name;
    else if (curScope.charAt(0) === 'f') {
      var q = curScope.slice(1).split('_'); t = '族 · ' + TREE[+q[0]].children[+q[1]].name;
    }
  }
  var g = (curScope === 'single') ? '' : ' · 第 ' + (S.rounds[curScope] || 1) + ' 组';
  $('spLabel').textContent = (t || '') + g;
}
function showCard() {
  var card = $('flashcard');
  var next = $('btnNextRound'); if (next) next.parentNode.removeChild(next);
  if (roundPos >= round.length) { finishRound(); return; }
  var i = round[roundPos], w = W[i];
  flipped = false; card.classList.remove('flipped');
  card.classList.remove('card-in'); void card.offsetWidth; card.classList.add('card-in');
  renderCardTitle();
  $('fcPos').textContent = w.pos + (w.cefr ? ' · ' + w.cefr : '');
  $('fcArt').textContent = w.art || '';
  $('fcWord').textContent = w.w;
  $('fcIpa').textContent = w.ipa ? '〔' + w.ipa + '〕' : '';
  $('fbScroll').innerHTML =
    '<div class="fb-word">' + esc(w.art ? w.art + ' ' : '') + esc(w.w) + '</div>' +
    '<div class="fb-line"><div class="fb-k">中文</div><div class="fb-v tr">' + esc(w.tr) + '</div></div>' +
    '<div class="fb-line"><div class="fb-k">English</div><div class="fb-v">' + esc(w.en) + '</div></div>' +
    '<div class="fb-line"><div class="fb-k">德语释义</div><div class="fb-v de">' + esc(w.de) + '</div></div>' +
    (w.pa ? '<div class="fb-line"><div class="fb-k">解析</div><div class="fb-v pa">' + esc(w.pa) + '</div></div>' : '') +
    ((w.as || []).length ? '<div class="fb-line"><div class="fb-k">关联 · 词族与用法</div>' + assocHtml(w) + '</div>' : '') +
    '<div class="dt-tags">' + tagHtml(w) + '</div>';
  document.querySelectorAll('.rate').forEach(function (b) { b.disabled = false; });
  renderProgress();
}
function renderProgress() {
  $('spCount').textContent = Math.min(roundPos + 1, round.length) + ' / ' + round.length;
  $('spFill').style.width = (round.length ? roundPos / round.length * 100 : 0) + '%';
}
function finishRound() {
  var poolLeft = Math.max(0, scopePool(curScope).length - (S.cursor[curScope] || 0));
  $('fcWord').textContent = '本轮完成';
  $('fcIpa').textContent = round.length + ' 张卡 · +' + (round.length * 4) + ' XP 左右';
  $('fcFront').style.pointerEvents = 'none';
  $('spFill').style.width = '100%'; $('spCount').textContent = round.length + ' / ' + round.length;
  document.querySelectorAll('.rate').forEach(function (b) { b.disabled = true; });
  if (pendingUnit) {
    pendingUnit = false; S.unitIdx = Math.min(units.length, S.unitIdx + 1); save();
    $('spLabel').textContent = '词族闯关 +1，已解锁下一关';
  } else $('spLabel').textContent = '本轮完成 · 第 ' + (S.rounds[curScope] || 1) + ' 组';
  var nb = document.createElement('button');
  nb.id = 'btnNextRound'; nb.className = 'btn-main'; nb.type = 'button';
  nb.textContent = poolLeft > 0 ? '继续下一组（还剩 ' + poolLeft + ' 词）' : '已过完一轮 · 从头再来';
  nb.onclick = function (e) { e.stopPropagation(); makeRound(curScope); };
  $('fcFront').appendChild(nb);
  setTimeout(function () { $('fcFront').style.pointerEvents = ''; }, 100);
}
$('flashcard').addEventListener('click', function (e) {
  if (e.target.closest('#btnSpeak')) return;
  if (roundPos >= round.length) return;
  flipped = !flipped; this.classList.toggle('flipped', flipped);
});
$('btnSpeak').addEventListener('click', function (e) { e.stopPropagation(); if (round.length) speak(W[round[roundPos]].w); });
$('btnNewRound').addEventListener('click', function () { makeRound(curScope || 'all'); });
document.querySelectorAll('.rate').forEach(function (b) {
  b.addEventListener('click', function () {
    if (roundPos >= round.length) return;
    var r = +b.dataset.rate, i = round[roundPos];
    rateWord(i, r);
    if (r === 0 && round.length > 1) round.push(i);   // 不认识：本轮末尾再出现
    roundPos++; flipped = false;
    if (roundPos >= round.length) finishRound(); else showCard();
    requestDraw();
  });
});

/* ================= 闯关路径 ================= */
var units = [];
function buildUnits() {
  var per = TREE.map(function () { return []; });
  TREE.forEach(function (b, bi) {
    b.children.forEach(function (f, fj) {
      if (f.leaves.length >= 9 && f.type !== '字母')
        per[bi].push({ bi: bi, fj: fj, name: f.name, n: f.leaves.length, type: f.type, scope: 'f' + bi + '_' + fj });
    });
  });
  per.forEach(function (a) { a.sort(function (x, y) { return y.n - x.n; }); });
  var mx = Math.max.apply(null, per.map(function (a) { return a.length; }).concat([0]));
  var out = [];
  for (var k = 0; k < mx; k++) for (var bi = 0; bi < per.length; bi++) if (per[bi][k]) out.push(per[bi][k]);
  units = out.slice(0, 40);
}
function renderPath() {
  var h = '';
  units.forEach(function (u, k) {
    var st = k < S.unitIdx ? 'done' : (k === S.unitIdx ? 'current' : 'lock');
    var off = [0, 46, 76, 46, 0, -46, -76, -46][k % 8];
    var ico = st === 'done' ? '★' : (st === 'current' ? '▶' : '·');
    h += '<div class="path-node ' + st + '" style="--off:' + off + 'px" data-unit="' + k + '">' +
      '<div class="pn-circle">' + ico + '</div>' +
      '<div class="pn-label">' + esc(u.name) + '</div>' +
      '<div class="pn-sub">' + u.n + ' 词 · ' + esc(u.type) + '枝</div></div>';
  });
  $('pathTrack').innerHTML = h;
  $('pathTrack').querySelectorAll('[data-unit]').forEach(function (el) {
    el.addEventListener('click', function () {
      var k = +el.dataset.unit;
      if (k !== S.unitIdx) return;
      pendingUnit = true; makeRound(units[k].scope); switchView('study');
    });
  });
  var cur = $('pathTrack').querySelector('[data-unit="' + S.unitIdx + '"]');
  var sc = $('pathScroll');
  if (cur && curView === 'path') requestAnimationFrame(function () {
    var d = cur.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    sc.scrollTop += d - sc.clientHeight / 2 + cur.clientHeight / 2;
  });
}

/* ================= 测验 ================= */
var quiz = { qs: [], i: 0, right: 0, combo: 0, answered: false };
function quizOpts(i, dir) {
  var w = W[i], key = dir === 'de2cn' ? 'tr' : 'w';
  var opts = [w[key]], guard = 0;
  var pool = (POS_POOL && POS_POOL[w.pos]) || null;
  while (opts.length < 4 && guard++ < 120) {
    var j = pool ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * W.length);
    var v = W[j][key];
    if (v && opts.indexOf(v) < 0) opts.push(v);
  }
  while (opts.length < 4) { var j2 = Math.floor(Math.random() * W.length); var v2 = W[j2][key]; if (v2 && opts.indexOf(v2) < 0) opts.push(v2); }
  return shuffle(opts);
}
function makeQuiz() {
  var pool = shuffle(allIdx()).slice(0, 10);
  quiz = { qs: pool.map(function (i) { var dir = Math.random() < .6 ? 'de2cn' : 'cn2de'; return { i: i, dir: dir, opts: quizOpts(i, dir) }; }),
    i: 0, right: 0, combo: 0, answered: false };
  renderQuiz();
}
function renderQuiz() {
  if (quiz.i >= quiz.qs.length) {
    var pct = Math.round(quiz.right / quiz.qs.length * 100);
    $('quizWrap').innerHTML = '<div class="q-result"><h2>本轮完成</h2>' +
      '<div class="big">' + pct + '%</div><p style="color:#6b7a63">答对 ' + quiz.right + ' / ' + quiz.qs.length + ' 题 · 累计 ' + S.xp + ' XP</p>' +
      '<button class="btn-main" id="qAgain">再来一轮</button></div>';
    $('qAgain').onclick = makeQuiz; return;
  }
  var q = quiz.qs[quiz.i], w = W[q.i];
  var ask = q.dir === 'de2cn' ? '这个德语词是什么意思？' : '哪个德语词对应这个中文？';
  var word = q.dir === 'de2cn' ? (w.art ? w.art + ' ' : '') + w.w : w.tr;
  var h = '<div class="q-head"><div class="q-title">' + ask + '</div><div class="q-meta">第 ' + (quiz.i + 1) + ' / ' + quiz.qs.length + ' 题 · 连击 ' + quiz.combo + '</div></div>' +
    '<div class="q-bar"><div class="q-fill" style="width:' + (quiz.i / quiz.qs.length * 100) + '%"></div></div>' +
    '<div class="q-card"><div class="q-ask">' + esc(w.pos) + ' · ' + esc(w.cefr || '') + '</div>' +
    '<div class="q-word ' + (q.dir === 'cn2de' ? 'cn' : '') + '">' + esc(word) + '</div><div class="q-opts">';
  q.opts.forEach(function (o, k) { h += '<button class="q-opt" data-opt="' + k + '">' + esc(o) + '</button>'; });
  h += '</div><div class="q-feedback" id="qFb"></div><div id="qNext"></div></div>';
  $('quizWrap').innerHTML = h;
  $('quizWrap').querySelectorAll('[data-opt]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (quiz.answered) return;
      quiz.answered = true;
      var val = q.opts[+b.dataset.opt], correct = q.dir === 'de2cn' ? w.tr : w.w;
      var ok = val === correct;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) $('quizWrap').querySelectorAll('[data-opt]').forEach(function (x) {
        if (q.opts[+x.dataset.opt] === correct) x.classList.add('right'); });
      if (ok) { quiz.right++; quiz.combo++; S.xp += 3 + Math.min(5, quiz.combo); save(); renderStats(); flyXp(3 + Math.min(5, quiz.combo)); }
      else quiz.combo = 0;
      var fb = $('qFb'); fb.className = 'q-feedback show ' + (ok ? 'ok' : 'no');
      fb.innerHTML = (ok ? '答对了 · +' + (3 + Math.min(5, quiz.combo)) + ' XP' : '正确答案：' + esc(correct)) +
        '<br><span style="font-weight:500">' + esc(w.w) + ' — ' + esc(w.tr) + '</span>';
      $('qNext').innerHTML = '<button class="btn-main q-next" id="qGo">' + (quiz.i + 1 >= quiz.qs.length ? '查看成绩' : '下一题') + '</button>';
      $('qGo').onclick = function () { quiz.i++; quiz.answered = false; renderQuiz(); };
      $('quizWrap').querySelectorAll('[data-opt]').forEach(function (x) { x.disabled = true; });
    });
  });
}

/* ================= 查找 ================= */
var searchPos = '', searchMax = 220;
function lookCount(i) { return S.look[i] || 0; }
function renderSearch() {
  if (!SEARCH_HAY) buildIndexes();
  var q = ($('searchInput').value || '').trim().toLowerCase();
  var list = $('searchList'), keepScroll = list.scrollTop;
  var tags = [['', '全部'], ['动词', '动词'], ['名词', '名词'], ['形容词', '形容词'], ['副词', '副词'],
    ['短语', '短语'], ['new', '未学'], ['known', '已掌握'], ['looked', '常查阅']];
  var lookedTotal = 0, lookedWords = 0;
  for (var lk in S.look) { lookedTotal += S.look[lk] || 0; if (S.look[lk] > 0) lookedWords++; }
  $('searchFilters').innerHTML = tags.map(function (t) {
    return '<button class="sf-tag ' + (searchPos === t[0] ? 'on' : '') + '" data-sp="' + t[0] + '">' + t[1] + '</button>';
  }).join('') + (lookedWords ? '<button class="sf-tag warn" id="lookReset" title="清空查阅次数统计">重置查阅</button>' : '');
  $('searchFilters').querySelectorAll('[data-sp]').forEach(function (b) {
    b.onclick = function () { searchPos = b.dataset.sp; searchMax = 220; list.scrollTop = 0; renderSearch(); };
  });
  if ($('lookReset')) $('lookReset').onclick = function () {
    if (!window.confirm('确定清空所有单词的查阅次数记录吗？学习进度不会受影响。')) return;
    S.look = {}; save(); renderSearch();
  };
  var hits = [];
  for (var i = 0; i < W.length; i++) {
    var w = W[i];
    if (searchPos === 'new' && lvOf(i) > 0) continue;
    if (searchPos === 'known' && lvOf(i) < 3) continue;
    if (searchPos === 'looked' && lookCount(i) < 1) continue;
    if (searchPos && ['动词', '名词', '形容词', '副词', '短语'].indexOf(searchPos) >= 0 && w.pos !== searchPos) continue;
    if (q && SEARCH_HAY[i].indexOf(q) < 0) continue;
    hits.push(i);
  }
  if (searchPos === 'looked') hits.sort(function (a, b) { return lookCount(b) - lookCount(a) || a - b; });
  var total = hits.length, res = hits.slice(0, searchMax);
  $('searchCount').textContent = searchPos === 'looked'
    ? '常查阅 ' + total + ' 词 · 累计 ' + lookedTotal + ' 次'
    : (q ? '命中 ' + total + ' 条' : TOTAL.toLocaleString() + ' 词');
  if (!res.length) {
    list.innerHTML = '<div class="sr-empty">' + (searchPos === 'looked'
      ? '还没有查阅记录。点开任意单词详情后，这里会按查阅次数从高到低列出，方便找出反复忘记的词。'
      : '没有找到匹配的单词') + '</div>';
    return;
  }
  var h = res.map(function (j) {
    var w = W[j], lv = lvOf(j), n = lookCount(j);
    return '<button class="sr-item" data-sr="' + j + '"><span class="sr-w">' + esc(w.w) + '</span>' +
      '<span class="sr-tr">' + esc(w.tr) + '</span><span class="sr-meta">' + esc(w.pos) + ' · ' + esc(w.cefr || '') +
      ' · ' + (lv >= 3 ? '已掌握' : lv >= 1 ? '学习中' : '未学') + '</span>' +
      (n ? '<span class="sr-look' + (n >= 3 ? ' hot' : '') + '">查阅 ' + n + ' 次</span>' : '') + '</button>';
  }).join('');
  if (total > res.length) h += '<button class="btn-soft sr-more" id="srMore">继续加载（还有 ' + (total - res.length) + ' 条）</button>';
  list.innerHTML = h;
  list.scrollTop = keepScroll;
  list.querySelectorAll('[data-sr]').forEach(function (b) {
    b.onclick = function () { showDetail(+b.dataset.sr); };
  });
  var more = $('srMore');
  if (more) more.onclick = function () { searchMax += 220; renderSearch(); };
}
var searchTimer = null;
$('searchInput').addEventListener('input', function () {
  searchMax = 220;
  clearTimeout(searchTimer); searchTimer = setTimeout(renderSearch, 110);
});
$('searchInput').addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { this.value = ''; clearTimeout(searchTimer); renderSearch(); }
});

/* ================= 快捷键 ================= */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeDetail(); return; }
  if (curView !== 'study' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault(); $('flashcard').click();
  }
  else if (e.key === 'f' || e.key === 'F') { if (round.length) speak(W[round[roundPos]].w); }
  else if (['1', '2', '3'].indexOf(e.key) >= 0) {
    var b = document.querySelector('.rate[data-rate="' + (+e.key - 1) + '"]'); if (b && !b.disabled) b.click();
  }
});

/* ================= 启动 ================= */
buildIndexes();
buildUnits(); renderStats();
renderScope();
renderPath(); renderSearch();
$('chipBranch').textContent = '背单词 · ' + TOTAL.toLocaleString() + ' 词';
switchView('study');
var boot = $('boot');
if (boot) { boot.classList.add('gone'); setTimeout(function () { boot.remove(); }, 420); }

})();
