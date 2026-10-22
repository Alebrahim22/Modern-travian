'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RES_ICONS = { money: '💰', oil: '🛢️', steel: '🔩', food: '🌾' };
const RES_NAMES = { money: 'مال', oil: 'نفط', steel: 'فولاذ', food: 'غذاء' };
const MISSION = { attack: 'هجوم', reinforce: 'تعزيز', scout: 'استطلاع', return: 'عودة' };

let ws, myId, meta = { FACTIONS: {} }, lobby = null, S = null, stateAt = 0;
const ui = {
  faction: localStorage.getItem('faction') || 'china',
  tab: 'base', selected: null, mode: null, sendFrom: null, sendTo: null,
  inputs: {}, chat: [], seenLog: 0, seenChat: 0, sheet: false,
};
const isMobile = () => matchMedia('(max-width: 899px)').matches;

// ---------------- theme ----------------
const PALETTES = {
  dark: { ocean: '#0b2131', sea: '#0f1a24', land: '#1f2d24', coast: '#3d5546', grid: '#ffffff0a', neutral: '#3a4450', ring: '#0d1117', label: '#ffffff', halo: '#000000cc', strat: '#ffd54f', name: '#cfd8dc', select: '#ffffff', meta: '#0d1117' },
  light: { ocean: '#a9d0e6', sea: '#cfe3ef', land: '#ece6d4', coast: '#b8ab88', grid: '#0000000d', neutral: '#8c96a0', ring: '#ffffff', label: '#1f2328', halo: '#ffffffdd', strat: '#9a6700', name: '#3d4650', select: '#1f2328', meta: '#ffffff' },
};
let PAL = PALETTES.dark;
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  PAL = PALETTES[t] || PALETTES.dark;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', PAL.meta);
  for (const b of document.querySelectorAll('[data-theme-toggle]')) b.textContent = t === 'light' ? '🌙' : '☀️';
}
applyTheme(document.documentElement.dataset.theme || 'dark');
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', t); } catch {}
  applyTheme(t);
});

// ---------------- connection ----------------
function connect(onOpen) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = onOpen;
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    const sess = getSession();
    if (sess) setTimeout(() => connect(() => send({ type: 'resume', code: sess.code, token: sess.token })), 1500);
  };
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
const cmd = (c) => send({ type: 'cmd', cmd: c });
const getSession = () => { try { return JSON.parse(localStorage.getItem('session')); } catch { return null; } };

function handle(m) {
  if (m.type === 'welcome') {
    myId = m.id; meta = m.meta;
    localStorage.setItem('session', JSON.stringify({ code: m.code, token: m.token }));
    history.replaceState(null, '', '?room=' + m.code);
  } else if (m.type === 'lobby') {
    lobby = m; if (!S) { show('lobby'); renderLobby(); }
  } else if (m.type === 'started') {
    show('game');
    maybeTutorial();
  } else if (m.type === 'state') {
    S = m.state; stateAt = performance.now();
    if ($('#game').classList.contains('hidden')) { show('game'); maybeTutorial(); }
    renderGame();
  } else if (m.type === 'chat') {
    ui.chat.push(m); if (ui.chat.length > 100) ui.chat.shift();
    if (S) renderPanel(true);
  } else if (m.type === 'error') {
    toast(m.text);
    if (/استعادة|غير موجودة/.test(m.text)) { localStorage.removeItem('session'); show('home'); }
  }
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  if (id === 'game') resize();
}
function toast(t, ok) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show'); el.classList.toggle('ok', !!ok);
  clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------------- home ----------------
function renderFactionPick() {
  $('#factionPick').innerHTML = Object.entries(meta.FACTIONS).map(([k, f]) =>
    `<div class="faction ${k === ui.faction ? 'sel' : ''}" data-f="${k}"><b>${f.flag} ${f.name}</b><small>${f.pros.map((x) => '✅ ' + x).join('<br>')}${f.cons.map((x) => '<br>⚠️ ' + x).join('')}</small></div>`).join('');
}
$('#factionPick').onclick = (e) => {
  const el = e.target.closest('.faction'); if (!el) return;
  ui.faction = el.dataset.f; localStorage.setItem('faction', ui.faction); renderFactionPick();
};
$('#nameInput').value = localStorage.getItem('name') || '';
const myName = () => { const n = $('#nameInput').value.trim(); localStorage.setItem('name', n); return n; };
$('#createBtn').onclick = () => {
  if (!myName()) return toast('اكتب اسمك أولاً');
  connect(() => send({ type: 'create', name: myName(), faction: ui.faction }));
};
$('#joinBtn').onclick = () => {
  if (!myName()) return toast('اكتب اسمك أولاً');
  const code = $('#codeInput').value.trim().toUpperCase();
  if (!code) return toast('اكتب كود الغرفة');
  connect(() => send({ type: 'join', code, name: myName(), faction: ui.faction }));
};

// ---------------- lobby ----------------
const factionOptions = (sel) => Object.entries(meta.FACTIONS).map(([k, f]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${f.flag} ${f.name}</option>`).join('');
const teamOptions = (sel) => ['', 'A', 'B', 'C', 'D'].map((t) => `<option value="${t}" ${t === sel ? 'selected' : ''}>${t ? 'فريق ' + t : 'بدون فريق'}</option>`).join('');

function renderLobby() {
  const isHost = lobby.host === myId;
  $('#roomCode').textContent = lobby.code;
  $('#lobbyPlayers').innerHTML = lobby.players.map((p) => {
    const f = meta.FACTIONS[p.faction];
    const botCtl = isHost && p.bot
      ? `<select data-bot="${p.id}" data-k="faction">${factionOptions(p.faction)}</select><select data-bot="${p.id}" data-k="team">${teamOptions(p.team)}</select><button class="small danger" data-kick="${p.id}">حذف</button>`
      : `<span class="tag">${p.team ? 'فريق ' + p.team : 'بدون فريق'}</span>`;
    const kick = isHost && !p.bot && p.id !== myId ? `<button class="small danger" data-kick="${p.id}">طرد</button>` : '';
    return `<div class="lp"><span class="name">${f.flag} <b>${esc(p.name)}</b> ${p.id === lobby.host ? '👑' : ''} ${p.id === myId ? '(أنت)' : ''} ${p.online ? '' : '<span class="off">غير متصل</span>'}<br><small class="sub">${f.name}</small></span>${botCtl}${kick}</div>`;
  }).join('');
  const me = lobby.players.find((p) => p.id === myId);
  if (me) { $('#myFaction').innerHTML = factionOptions(me.faction); $('#myTeam').value = me.team; }
  $('#duration').value = lobby.duration;
  $('#mapSel').value = lobby.map;
  $('#hostControls').classList.toggle('hidden', !isHost);
  $('#waitHost').classList.toggle('hidden', isHost);
}
$('#lobbyPlayers').onchange = (e) => {
  const id = e.target.dataset.bot; if (!id) return;
  const p = lobby.players.find((x) => x.id === id);
  send({ type: 'botTeam', id, team: e.target.dataset.k === 'team' ? e.target.value : p.team, faction: e.target.dataset.k === 'faction' ? e.target.value : p.faction });
};
$('#lobbyPlayers').onclick = (e) => { const id = e.target.dataset.kick; if (id) send({ type: 'kick', id }); };
$('#myFaction').onchange = (e) => { localStorage.setItem('faction', e.target.value); send({ type: 'setFaction', faction: e.target.value }); };
$('#myTeam').onchange = (e) => send({ type: 'setTeam', team: e.target.value });
$('#duration').onchange = (e) => send({ type: 'setDuration', duration: Number(e.target.value) });
$('#mapSel').onchange = (e) => send({ type: 'setMap', map: e.target.value });
$('#addBot').onclick = () => send({ type: 'addBot' });
$('#startBtn').onclick = () => send({ type: 'start' });
$('#copyLink').onclick = () => {
  const link = location.origin + location.pathname + '?room=' + lobby.code;
  navigator.clipboard?.writeText(link).then(() => toast('تم نسخ الرابط ✅'), () => prompt('انسخ الرابط:', link));
};

// ---------------- game helpers ----------------
const fmt = (n) => (n < 0 ? '-' : '') + Math.floor(Math.abs(n)).toLocaleString('en-US');
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
};
const player = (id) => S.players.find((p) => p.id === id);
const me = () => player(myId);
const friendly = (id) => id && (id === myId || player(id).team === me().team);
const costHtml = (c) => Object.keys(c).filter((r) => c[r]).map((r) => `<span class="${S.me.res[r] < c[r] ? 'no' : ''}">${RES_ICONS[r]}${fmt(c[r])}</span>`).join(' ');
const canAfford = (c, n = 1) => Object.keys(c).every((r) => S.me.res[r] >= c[r] * n);
const terrName = (t) => {
  const T = meta.TERR[t.type];
  if (t.type === 'capital') return `${T.icon} ${T.name} ${esc(player(t.owner).name)}`;
  return t.name ? `${T.icon} ${T.name} ${esc(t.name)}` : `${T.icon} ${T.name} #${t.id}`;
};
const unitsLine = (u) => {
  const parts = Object.keys(meta.UNITS).filter((k) => u[k] > 0).map((k) => `${meta.UNITS[k].icon}${u[k]}`);
  return parts.length ? parts.join(' ') : 'لا توجد قوات';
};
const total = (u) => Object.values(u).reduce((a, b) => a + b, 0);

// ---------------- game render ----------------
const fmtK = (n) => Math.abs(n) >= 100000 ? Math.round(n / 1000) + 'k' : Math.abs(n) >= 10000 ? (n / 1000).toFixed(1) + 'k' : fmt(n);
const teamVp = (team) => S.players.filter((p) => p.team === team).reduce((a, p) => a + p.vp, 0);
const nearest = (list) => { const c = S.terr[S.me.capital]; return list.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; };

// how the player is doing against the win condition
function goalInfo() {
  const myTeam = me().team, mine = teamVp(myTeam);
  const strat = S.terr.filter((t) => t.type === 'strategic');
  const held = strat.filter((t) => t.owner && player(t.owner).team === myTeam).length;
  const teams = {};
  for (const p of S.players) (teams[p.team] = teams[p.team] || []).push(p);
  let lead = null;
  for (const ps of Object.values(teams)) {
    const vp = ps.reduce((a, p) => a + p.vp, 0);
    if (!lead || vp > lead.vp) lead = { vp, ps };
  }
  const rate = held * 10; // VP per game-minute
  const eta = rate ? ((S.vpTarget - mine) / rate) * 60 / S.speed : null; // real seconds
  const iLead = lead.ps.some((p) => p.team === myTeam);
  return { mine, held, total: strat.length, lead, iLead, eta };
}

// one clear suggestion for what to do next
function nextTip() {
  const m = S.me, cap = S.terr[S.me.capital];
  const incoming = S.movements.filter((x) => x.hostile && x.mission === 'attack' && S.terr[x.to].owner && friendly(S.terr[x.to].owner));
  if (incoming.length) return null; // the red alert already covers it
  if (S.winner) return null;
  const capUnits = total(cap.units || {});
  const atk = ['inf', 'tank', 'jet'].reduce((a, k) => a + (cap.units?.[k] || 0), 0);
  if (m.income.food - m.upkeep < 0 && m.res.food < 800) return { text: '🌾 الغذاء ينفد! اشترِ غذاء من السوق أو احتل مزرعة.', label: 'السوق', go: () => setTab('trade') };
  if (capUnits < 15 && !m.queue.length) return { text: 'ابدأ بتجنيد جيش: مشاة ودبابات.', label: 'جنّد', go: () => setTab('train') };
  if (crisisPending()) return { text: '🔥 أزمة دولية! اختر موقفك واكسب نقاط أو علاقات.', label: 'العالم', go: () => setTab('world') };
  if (votePending()) return { text: '🏛️ مجلس الأمن يصوّت على عقوبات. صوّت الآن.', label: 'صوّت', go: () => setTab('world') };
  if (S.proposalsIn.length) return { text: '🤝 عندك عرض تحالف بانتظار ردك.', label: 'شوف', go: () => setTab('dip') };
  const g = goalInfo();
  const freeStrat = S.terr.filter((t) => t.type === 'strategic' && !friendly(t.owner));
  if (atk >= 25 && freeStrat.length && (g.held === 0 || atk >= 60)) {
    const t = nearest(freeStrat);
    return { text: `⭐ احتل ${t.name ? esc(t.name) : 'مركز القيادة'} لتجمع نقاط النصر.`, label: 'هاجم', go: () => { selectTerr(t.id); focusTerr(t.id); } };
  }
  if (atk >= 20) {
    const eco = S.terr.filter((t) => !t.owner && ['city', 'oil', 'mine', 'farm'].includes(t.type));
    if (eco.length) {
      const t = nearest(eco);
      return { text: `${meta.TERR[t.type].icon} احتل ${t.name ? esc(t.name) : meta.TERR[t.type].name} القريب لزيادة دخلك.`, label: 'هاجم', go: () => { selectTerr(t.id); focusTerr(t.id); } };
    }
  }
  if (!m.upgrade) {
    const B = meta.BUILDINGS, k = Object.keys(B).find((x) => m.buildings[x] < 10 && canAfford(m.upgradeCosts[x].cost));
    if (k) return { text: `🔨 طوّر ${B[k].name} لتقوية قاعدتك.`, label: 'طوّر', go: () => setTab('base') };
  }
  if (!m.queue.length) return { text: 'المصنع متوقف. جنّد وحدات أكثر.', label: 'جنّد', go: () => setTab('train') };
  if (!m.research && Object.keys(meta.TECHS).some((k) => !m.techs[k])) return { text: '🔬 ابدأ بحثاً جديداً يفتح أسلحة أقوى.', label: 'أبحاث', go: () => setTab('tech') };
  return null;
}
const crisisPending = () => S.crisis && (S.crisis.a === myId || S.crisis.b === myId ? !S.crisis.party[myId] : !S.crisis.mine);
const votePending = () => S.vote && S.vote.team !== me().team && !S.vote.mine;

function renderGame() {
  const r = S.me.res, inc = { ...S.me.income, food: S.me.income.food - S.me.upkeep };
  const mob = isMobile(), f = mob ? fmtK : fmt;
  $('#resBar').innerHTML = Object.keys(RES_ICONS).map((k) =>
    `<span class="res" title="${RES_NAMES[k]}">${RES_ICONS[k]} <b>${f(r[k])}</b> <small class="${inc[k] < 0 ? 'neg' : ''}">${inc[k] < 0 ? '' : '+'}${f(inc[k])}${mob ? '' : '/د'}</small></span>`).join('') +
    `<span class="res" title="الجيش / السكان · إنتاجية المدنيين">👥 <b>${f(S.me.mil)}/${f(S.me.pop)}</b> <small class="${S.me.productivity < 0.7 ? 'neg' : ''}">${mob ? '' : 'إنتاجية '}${Math.round(S.me.productivity * 100)}٪</small></span>`;

  // objective card: always visible, answers "how do I win?"
  const g = goalInfo();
  const pct = Math.min(100, (100 * g.mine) / S.vpTarget), lpct = Math.min(100, (100 * g.lead.vp) / S.vpTarget);
  const leadName = g.lead.vp < 1 ? 'لا أحد عنده نقاط بعد' : g.iLead ? 'أنت المتصدر 👑' : 'المتصدر: ' + g.lead.ps.map((p) => meta.FACTIONS[p.faction].flag + ' ' + esc(p.name)).join(' + ') + ` ⭐${fmt(g.lead.vp)}`;
  const etaTxt = g.held ? `تملك ${g.held}/${g.total} مراكز ⭐` + (g.eta != null ? ` · تفوز خلال ~${fmtTime(Math.max(0, g.eta))} لو حافظت عليها` : '')
    : `لا تملك أي مركز ⭐ — احتل واحداً لتبدأ جمع النقاط`;
  const prot = S.protection > 0 ? ` · 🛡️ حماية ${fmtTime(S.protection)}` : '';
  $('#goalCard').innerHTML = `<div class="g1"><span>🎯 فريقك ⭐ ${fmt(g.mine)} / ${fmt(S.vpTarget)}</span><span class="tm">⏱️ ${fmtTime(S.remaining)}</span></div>
    <div class="bar gbar">${g.iLead ? '' : `<i class="lead" style="width:${lpct}%"></i>`}<i style="width:${pct}%;position:relative"></i></div>
    <div class="g2">${leadName}${prot}<br>${etaTxt}</div>`;

  // incoming attack alert
  const incoming = S.movements.filter((x) => x.hostile && x.mission === 'attack' && S.terr[x.to].owner && friendly(S.terr[x.to].owner)).sort((a, b) => a.eta - b.eta);
  const al = $('#alertPill');
  if (incoming.length) {
    const x = incoming[0];
    al.innerHTML = `⚠️ هجوم قادم على ${terrName(S.terr[x.to])} من ${esc(player(x.owner).name)} خلال ${fmtTime(x.eta)}${incoming.length > 1 ? ` (+${incoming.length - 1})` : ''} — عزّز دفاعك!`;
  }
  al.classList.toggle('hidden', !incoming.length);

  const tip = nextTip(), tc = $('#tipCard');
  if (tip && !ui.mode) {
    tc.innerHTML = `<span>💡 ${tip.text}</span><b class="go">${tip.label} ←</b>`;
    tc.onclick = tip.go;
  }
  tc.classList.toggle('hidden', !tip || !!ui.mode);

  const bars = [];
  if (S.event) bars.push(`${S.event.name}: ${S.event.desc} <small>(${fmtTime(S.event.remaining)})</small>`);
  if (S.crisis) bars.push(`🔥 ${S.crisis.title}: ${esc(player(S.crisis.a).name)} ضد ${esc(player(S.crisis.b).name)} <small>(${fmtTime(S.crisis.remaining)})</small>`);
  if (S.vote) bars.push(`🏛️ تصويت على عقوبات ضد ${esc(S.vote.names)} <small>(${fmtTime(S.vote.remaining)})</small>`);
  if (S.sanctions) bars.push(`⛔ عقوبات على ${esc(S.sanctions.names)} <small>(${fmtTime(S.sanctions.remaining)})</small>`);
  for (const pr of S.projects) bars.push(`☢️ ${esc(pr.name)}: ${pr.ready ? 'السلاح النهائي جاهز!' : 'سلاح نهائي ' + Math.round(pr.progress * 100) + '٪'}`);
  $('#eventBar').innerHTML = bars.map((b) => `<div>${b}</div>`).join('');
  $('#eventBar').classList.toggle('hidden', !bars.length);

  const dip = S.proposalsIn.length > 0, world = !!(crisisPending() || votePending());
  $('#dipDot').classList.toggle('hidden', !dip);
  $('#worldDot').classList.toggle('hidden', !world);
  $('#worldDot2').classList.toggle('hidden', !world);
  if (!ui.mapKey || ui.mapKey !== S.map.W + 'x' + S.map.H) {
    ui.mapKey = S.map.W + 'x' + S.map.H;
    resize();
    // the world map is wide: on small screens start zoomed in on the player's capital
    if (S.map.world && canvas.getBoundingClientRect().width < 800) zoomBtn(-1);
  }
  const teams = {};
  for (const p of S.players) (teams[p.team] = teams[p.team] || []).push(p);
  $('#vpBar').innerHTML = Object.values(teams).map((ps) => {
    const vp = ps.reduce((a, p) => a + p.vp, 0);
    return `<span class="vpchip">${ps.map((p) => `<span class="swatch" style="background:${p.color}"></span>${esc(p.name)}`).join(' + ')} ⭐${fmt(vp)}</span>`;
  }).join('');
  const lastLog = S.log.length ? S.log[S.log.length - 1].t : 0;
  const logNew = !(ui.tab === 'log' && ui.sheetVisible()) && lastLog > ui.seenLog;
  $('#logDot').classList.toggle('hidden', !logNew);
  if (ui.tab === 'log' && ui.sheetVisible()) ui.seenLog = lastLog;
  const chatNew = ui.tab !== 'chat' && ui.chat.length > ui.seenChat;
  $('#moreDot').classList.toggle('hidden', !(dip || chatNew || incoming.length));
  if (S.winner && !ui.winnerShown) {
    ui.winnerShown = true;
    const won = S.winner.ids.includes(myId);
    $('#winner').innerHTML = `<div class="card"><h1>${won ? '🏆 انتصرت!' : '🏳️ انتهت المباراة'}</h1><p>الفائز: <b>${S.winner.names.map(esc).join(' و ')}</b></p><p class="sub">${S.winner.why}</p><button class="primary" onclick="localStorage.removeItem('session');location.href=location.pathname">مباراة جديدة</button> <button onclick="document.getElementById('winner').classList.add('hidden')">عرض الخريطة</button></div>`;
    $('#winner').classList.remove('hidden');
  }
  renderPanel();
}
ui.sheetVisible = () => !isMobile() || ui.sheet;

let panelTouch = false;
$('#tabBody').addEventListener('pointerdown', () => { panelTouch = true; });
window.addEventListener('pointerup', () => setTimeout(() => { panelTouch = false; }, 50));
window.addEventListener('pointercancel', () => { panelTouch = false; });

function renderPanel(force) {
  const body = $('#tabBody');
  const active = document.activeElement;
  if (!force && active && body.contains(active) && /INPUT|SELECT/.test(active.tagName)) return;
  if (!force && (panelTouch || !ui.sheetVisible())) return; // don't swap buttons under a finger, or render a hidden sheet
  const html = TABS[ui.tab]();
  if (!force && html === ui.lastHtml) return;
  ui.lastHtml = html;
  const scroll = body.scrollTop;
  body.innerHTML = html;
  body.scrollTop = ui.tab === 'chat' ? body.scrollHeight : scroll;
  for (const el of body.querySelectorAll('[data-key]')) if (ui.inputs[el.dataset.key] !== undefined) el.value = ui.inputs[el.dataset.key];
  if (ui.tab === 'chat') {
    ui.seenChat = ui.chat.length;
    const inp = $('#chatInput'); if (inp && force && active && active.id === 'chatInput') inp.focus();
  }
  $('#chatDot').classList.toggle('hidden', ui.tab === 'chat' || ui.chat.length <= ui.seenChat);
  updateEta();
}

const TABS = {
  base() {
    const B = meta.BUILDINGS, m = S.me;
    let h = '';
    if (m.upgrade) {
      const pct = 100 * (1 - m.upgrade.remaining / m.upgrade.total);
      h += `<div class="box"><h4>🔨 جاري تطوير ${B[m.upgrade.b].name}</h4><div class="cost">متبقي ${fmtTime(m.upgrade.remaining)}</div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }
    for (const [k, b] of Object.entries(B)) {
      const lvl = m.buildings[k], c = m.upgradeCosts[k];
      const max = lvl >= 10;
      h += `<div class="box"><h4><span>${b.icon} ${b.name} <span class="tag">مستوى ${lvl}</span></span>
        <button class="small" data-up="${k}" ${max || m.upgrade || !canAfford(c.cost) ? 'disabled' : ''}>${max ? 'الأقصى' : 'تطوير'}</button></h4>
        <div class="stats">${b.desc}</div>${max ? '' : `<div class="cost">${costHtml(c.cost)} · ⏱️${fmtTime(c.time)}</div>`}</div>`;
    }
    const f = meta.FACTIONS[me().faction];
    const net = m.income.food - m.upkeep;
    h += `<div class="box"><h4>👥 السكان والغذاء</h4><div class="stats">السكان ${fmt(m.pop)} · العسكريون ${fmt(m.mil)} · المدنيون ${fmt(Math.max(0, m.pop - m.mil))}</div>
      <div class="stats">إنتاجية الاقتصاد ${Math.round(m.productivity * 100)}٪ (كلما زاد الجيش قلّ العمال المدنيون)</div>
      <div class="stats">🌾 إنتاج ${fmt(m.income.food)}/د · إعاشة الجيش ${fmt(m.upkeep)}/د · الصافي <b class="${net < 0 ? 'neg' : ''}">${fmt(net)}/د</b></div>
      ${net < 0 ? '<div class="stats neg">⚠️ إذا نفد الغذاء سيبدأ الجنود بالانشقاق. احتل أراضٍ زراعية 🌾 أو طوّر السكن والزراعة أو اشترِ غذاء من السوق.</div>' : ''}</div>`;
    h += `<div class="box"><h4>${f.flag} ${f.name}</h4><div class="stats">${f.pros.map((x) => '✅ ' + x).join('<br>')}${f.cons.map((x) => '<br>⚠️ ' + x).join('')}</div></div>`;
    h += `<button onclick="selectTerr(S.me.capital)">📍 عرض عاصمتي وجيشها</button>`;
    return h;
  },
  train() {
    const m = S.me;
    let h = '<div class="box hint">🪖 جنّد هنا، ثم اضغط على أي موقع في الخريطة واختر <b>هجوم</b>. المشاة 🪖 رخيصة، الدبابات 🚜 قوية برياً، المقاتلات ✈️ سريعة لكن الدفاع الجوي 📡 يصطادها.</div>';
    if (m.queue.length) {
      h += `<div class="box"><h4>🏭 طابور التصنيع</h4>` + m.queue.map((q, i) =>
        `<div class="stats">${meta.UNITS[q.unit].icon} ${meta.UNITS[q.unit].name} × ${q.count}${i === 0 ? ` · التالية خلال ${fmtTime(q.remaining)}` : ''}</div>`).join('') + `</div>`;
    }
    for (const [k, u] of Object.entries(meta.UNITS)) {
      const c = m.unitCosts[k];
      if (u.req && !m.techs[u.req]) {
        h += `<div class="box locked"><h4><span>${u.icon} ${u.name}</span><span class="tag">🔒 يحتاج بحث ${meta.TECHS[u.req].name}</span></h4></div>`;
        continue;
      }
      const maxN = Math.min(500, ...Object.keys(c.cost).filter((r) => c.cost[r]).map((r) => Math.floor(m.res[r] / c.cost[r])));
      h += `<div class="box"><h4><span>${u.icon} ${u.name}</span></h4>
        <div class="stats">⚔️ هجوم ${u.att}${u.air ? ' (جوي)' : ''} · 🛡️ دفاع بري ${u.defG} · دفاع جوي ${u.defA} · 🏃 سرعة ${u.speed} · 🌾 ${u.upkeep}/د · 👥 ${u.crew}${u.oneShot ? ' · يُستهلك عند الهجوم' : ''}</div>
        <div class="cost">${costHtml(c.cost)} · ⏱️${fmtTime(c.time)} للوحدة</div>
        <div class="actions">${stepper('train-' + k, 1, maxN, 1)}
        <button class="small" data-set="train-${k}" data-n="${maxN}">الأقصى ${maxN}</button>
        <button class="primary grow" data-train="${k}" ${maxN < 1 ? 'disabled' : ''}>تصنيع</button></div></div>`;
    }
    return h;
  },
  site() {
    if (ui.mode === 'send') return sendForm();
    if (ui.selected == null) return '<p class="sub">اضغط على أي موقع في الخريطة لعرض معلوماته.</p>';
    const t = S.terr[ui.selected], T = meta.TERR[t.type];
    const stratHint = t.type === 'strategic' && !friendly(t.owner) ? '<div class="box hint">⭐ هذا مركز قيادة: كل دقيقة تملكه فيها تعطي فريقك 10 نقاط نصر. هذا هو طريق الفوز!</div>' : '';
    const owner = t.owner ? player(t.owner) : null;
    let h = `<div class="box"><h4>${terrName(t)}</h4>
      <div class="stats">المالك: ${owner ? `<span class="swatch" style="background:${owner.color}"></span>${esc(owner.name)}` : 'محايد'}</div>
      <div class="stats">الإنتاج: ${Object.keys(T.prod).filter((r) => T.prod[r]).map((r) => RES_ICONS[r] + T.prod[r] + '/د').join(' ')}${t.type === 'strategic' ? ' · ⭐ 10 نقاط نصر/د' : ''} · 👥 سكان ${T.pop}</div></div>` + stratHint;
    h += `<div class="box"><h4>🪖 الحامية</h4>`;
    if (t.units) h += `<div>${unitsLine(t.units)}</div>`;
    else if (t.scout) h += `<div>${unitsLine(t.scout.units)}</div><div class="stats">من تقرير استطلاع قبل ${fmtTime(t.scout.age)}</div>`;
    else h += `<div class="stats">❓ غير معروفة. أرسل درونز للاستطلاع أو طوّر الرادار.</div>`;
    h += `</div>`;
    const g = S.me.general;
    if (g && g.loc === t.id) h += `<div class="box"><h4>${meta.GENERALS[g.type].icon} ${meta.GENERALS[g.type].name} متمركز هنا <span class="tag">مستوى ${g.level}</span></h4></div>`;
    const sw = S.me.sw;
    if (sw && sw.ready && !sw.used && t.owner !== myId && !friendly(t.owner)) {
      h += ui.confirmStrike === t.id
        ? `<div class="box"><h4>☢️ تأكيد إطلاق السلاح النهائي على ${terrName(t)}؟</h4><div class="stats">سيُبيد الحامية بالكامل. كل الدول ستستنكر وتسوء علاقاتها معك.</div><div class="row"><button class="danger" data-strike="${t.id}">إطلاق</button><button data-strike-cancel="1">إلغاء</button></div></div>`
        : `<button class="danger" data-strike-ask="${t.id}" style="margin-bottom:8px">☢️ إطلاق السلاح النهائي هنا</button>`;
    }
    if (t.owner === myId) {
      h += total(t.units) > 0
        ? `<button class="primary block" onclick="startSend(${t.id})">🎯 إرسال قوات من هنا</button>`
        : '<p class="sub">لا توجد قوات هنا للإرسال.</p>';
    } else if (!friendly(t.owner)) {
      if (t.owner && S.protection > 0) h += `<div class="box hint">🛡️ اللاعبون محميون من الهجوم أول ${fmtTime(S.protection)}. استغلها للتوسع على المواقع المحايدة.</div>`;
      const mine = S.terr.filter((x) => x.owner === myId && x.units && total(x.units) > 0)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
      if (!mine.length) h += '<p class="sub">ما عندك قوات. جنّد من تبويب الجيش أولاً.</p>';
      else {
        h += `<button class="primary block danger" onclick="startSend(${mine[0].id}, ${t.id})">⚔️ هاجم من ${terrName(mine[0])}</button>`;
        if (mine.length > 1) h += `<div class="sub">أو من:</div><div class="target-list">` + mine.slice(1, 6).map((x) => `<button class="small" onclick="startSend(${x.id}, ${t.id})">${terrName(x)}</button>`).join('') + '</div>';
      }
    }
    return h;
  },
  moves() {
    if (!S.movements.length) return '<p class="sub">لا توجد تحركات حالياً.</p>';
    return S.movements.slice().sort((a, b) => a.eta - b.eta).map((m) => {
      const o = player(m.owner), from = S.terr[m.from], to = S.terr[m.to];
      return `<div class="mv ${m.hostile ? 'hostile' : ''}">${m.hostile ? '⚠️ ' : ''}<span class="swatch" style="background:${o.color}"></span>${esc(o.name)} · ${MISSION[m.mission]}: ${terrName(from)} ← ${terrName(to)}<br>
        <small>${m.general ? '🎖️ مع القائد · ' : ''}${m.units ? unitsLine(m.units) : 'قوات مجهولة'} · يصل خلال ${fmtTime(m.eta)}</small></div>`;
    }).join('');
  },
  rank() {
    const rows = S.players.slice().sort((a, b) => b.vp - a.vp).map((p) => {
      const f = meta.FACTIONS[p.faction];
      return `<tr class="${p.id === myId ? 'me' : ''}"><td><span class="swatch" style="background:${p.color}"></span>${esc(p.name)}${p.id === myId ? ' (أنت)' : ''}</td><td>${f.flag}</td><td>${p.allied ? S.players.filter((x) => x.team === p.team && x.id !== p.id).map((x) => `<span class="swatch" style="background:${x.color}"></span>`).join('') : '-'}</td><td>${p.territories}</td><td>⭐${fmt(p.vp)}</td></tr>`;
    }).join('');
    return `<h4>📊 الترتيب</h4>
      <table class="rank"><tr><th>اللاعب</th><th>الدولة</th><th>حلفاء</th><th>المواقع</th><th>النقاط</th></tr>${rows}</table>`;
  },
  log() {
    return S.log.slice().reverse().map((l) => `<div class="log-item ${l.kind}">${esc(l.text)} <small>قبل ${fmtTime(l.ago)}</small></div>`).join('') || '<p class="sub">لا توجد أحداث بعد.</p>';
  },
  tech() {
    const m = S.me, T = meta.TECHS;
    let h = '';
    if (m.research) {
      const pct = 100 * (1 - m.research.remaining / m.research.total);
      h += `<div class="box"><h4>🔬 جاري بحث ${T[m.research.tech].icon} ${T[m.research.tech].name}</h4><div class="cost">متبقي ${fmtTime(m.research.remaining)}</div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }
    for (const [k, t] of Object.entries(T)) {
      const done = m.techs[k], ready = t.req.every((r) => m.techs[r]);
      const c = m.techCosts[k];
      h += `<div class="box ${done ? 'done' : ready ? '' : 'locked'}"><h4><span>${t.icon} ${t.name} <span class="tag">المستوى ${t.tier}</span></span>
        ${done ? '<span class="tag good">✓ مكتمل</span>' : `<button class="small" data-research="${k}" ${!ready || m.research || !canAfford(c.cost) ? 'disabled' : ''}>بحث</button>`}</h4>
        <div class="stats">${t.desc}</div>${t.req.length ? `<div class="stats">يتطلب: ${t.req.map((r) => T[r].name).join(' + ')}</div>` : ''}
        ${done ? '' : `<div class="cost">${costHtml(c.cost)} · ⏱️${fmtTime(c.time)}</div>`}</div>`;
    }
    // generals
    const g = m.general, G = meta.GENERALS;
    h += `<div class="box"><h4>🎖️ القائد العسكري</h4>`;
    if (g) {
      const loc = g.loc != null ? terrName(S.terr[g.loc]) : 'في مهمة مع جيشه';
      h += `<div>${G[g.type].icon} <b>${G[g.type].name}</b> <span class="tag">مستوى ${g.level}</span> <span class="tag">انتصارات ${g.xp}</span></div><div class="stats">${G[g.type].desc}</div><div class="stats">📍 ${loc}</div>
        <div class="stats">أرسله مع جيش من تبويب الموقع. يترقّى عند الانتصار ويُقتل إذا هُزم جيشه.</div>`;
    } else if (m.generalCooldown > 0) {
      h += `<div class="stats">يتم تجهيز قائد جديد خلال ${fmtTime(m.generalCooldown)}</div>`;
    } else {
      h += `<div class="cost">التكلفة: ${costHtml(m.generalCost)}</div>` + Object.entries(G).map(([k, x]) =>
        `<div class="unitrow"><span>${x.icon} <b>${x.name}</b><br><small class="stats">${x.desc}</small></span><button class="small" data-general="${k}" ${canAfford(m.generalCost) ? '' : 'disabled'}>تعيين</button></div>`).join('');
    }
    h += '</div>';
    // superweapon
    h += `<div class="box"><h4>☢️ السلاح النهائي</h4>`;
    if (!m.techs.nuclear) h += `<div class="stats">يحتاج بحث المشروع السري. البناء يستغرق ${fmtTime(m.swTime)} وكل الدول تشاهد تقدمه، واقتحام عاصمتك يؤخره.</div>`;
    else if (!m.sw) {
      h += `<div class="cost">${costHtml(m.swCost)} · ⏱️${fmtTime(m.swTime)}</div>${m.swOpen ? '' : `<div class="stats">يُسمح بالبناء بعد ${fmtTime(m.swOpensIn)}</div>`}
        <button class="small danger" data-build-sw="1" ${!m.swOpen || !canAfford(m.swCost) ? 'disabled' : ''}>بدء المشروع (سيعلم الجميع)</button>`;
    } else if (m.sw.used) h += '<div class="stats">تم استخدام السلاح.</div>';
    else if (m.sw.ready) h += '<div class="stats good">جاهز! اختر موقعاً للعدو من الخريطة ثم اضغط "إطلاق السلاح النهائي هنا" في تبويب الموقع.</div>';
    else h += `<div class="stats">قيد البناء، متبقي ${fmtTime(m.sw.remaining)}</div><div class="bar"><i style="width:${100 * (1 - m.sw.remaining / m.sw.total)}%"></i></div>`;
    return h + '</div>';
  },
  world() {
    const g = goalInfo();
    let h = `<div class="box hint"><h4>🏆 كيف تفوز</h4>
      أول فريق يجمع <b>${fmt(S.vpTarget)} ⭐</b> يفوز. وإذا انتهى الوقت (${fmtTime(S.remaining)}) يفوز صاحب أعلى نقاط.<br>
      ⭐ كل مركز قيادة تملكه = 10 نقاط كل دقيقة. وتكسب نقاط إضافية من الأزمات الدولية (وساطة أو دعم الطرف الفائز).<br>
      فريقك الآن: <b>⭐ ${fmt(g.mine)}</b> · يملك <b>${g.held}/${g.total}</b> مراكز${g.eta != null ? ` · يوصل للهدف خلال ~${fmtTime(g.eta)}` : ''}.
      <div class="bar"><i style="width:${Math.min(100, (100 * g.mine) / S.vpTarget)}%"></i></div></div>`;
    const nm = (id) => { const p = player(id); return `${meta.FACTIONS[p.faction].flag} ${esc(p.name)}`; };
    const c = S.crisis;
    if (c) {
      const side = c.a === myId ? 'a' : c.b === myId ? 'b' : null;
      h += `<div class="box crisis"><h4>🔥 ${esc(c.title)}</h4>
        <div>${nm(c.a)} <b>ضد</b> ${nm(c.b)} · متبقي ${fmtTime(c.remaining)}</div>
        <div class="stats">الدعم: ${nm(c.a)} ${c.support.a} · ${nm(c.b)} ${c.support.b} · الوساطة ${c.mediation.toFixed(1)}/${c.needed}</div>
        <div class="stats">إذا اكتملت الوساطة تنتهي الأزمة بسلام (+40 نقطة لكل وسيط). وإلا يربح صاحب الدعم الأكبر +40 وداعموه +20. كل انتصار بين الطرفين يعطي +10 ويزيد الدعم. اقتصاد الطرفين -10٪ ما لم يختارا التهدئة.</div>`;
      if (side) {
        h += c.party[myId] ? `<div class="stats">موقفك: ${c.party[myId] === 'escalate' ? '⚔️ تصعيد' : '🕊️ تهدئة'}</div>`
          : `<div class="row"><button class="small danger" data-crisis="escalate">⚔️ تصعيد (هجومك على خصمك +15٪)</button><button class="small" data-crisis="calm">🕊️ قبول التهدئة</button></div>`;
      } else if (c.mine) {
        const A = { mediate: '🕊️ وساطة', military: '🪖 دعم عسكري', media: '📢 دعم إعلامي' };
        h += `<div class="stats">موقفك: ${A[c.mine.action]}${c.mine.side ? ' لـ ' + nm(c.mine.side === 'a' ? c.a : c.b) : ''}</div>`;
      } else {
        const cc = S.me.crisisCosts;
        h += `<div class="unitrow"><span>🕊️ وساطة سلام <small class="cost">${costHtml(cc.mediate)}</small></span><button class="small" data-crisis="mediate">توسط</button></div>`;
        for (const [k, label, note] of [['military', '🪖 دعم عسكري', 'تُرسل الموارد للطرف ويزيد هجومه 10٪'], ['media', '📢 دعم إعلامي وسياسي', 'رخيص، يحسّن علاقتك مع الطرف ويغضب الآخر']]) {
          h += `<div class="unitrow"><span>${label} <small class="cost">${costHtml(cc[k])}</small><br><small class="stats">${note}</small></span><button class="small" data-crisis="${k}" data-side="a">${nm(c.a)}</button><button class="small" data-crisis="${k}" data-side="b">${nm(c.b)}</button></div>`;
        }
      }
      const st = Object.entries(c.stance);
      if (st.length) h += `<div class="stats">المواقف: ${st.map(([id, x]) => `${nm(id)}: ${x.action === 'mediate' ? 'وساطة' : (x.action === 'military' ? 'دعم عسكري لـ ' : 'دعم إعلامي لـ ') + (x.side ? nm(x.side === 'a' ? c.a : c.b) : '')}`).join(' · ')}</div>`;
      h += '</div>';
    } else h += `<div class="box"><div class="stats">لا توجد أزمة دولية حالياً. الأزمة القادمة متوقعة خلال ${fmtTime(Math.max(0, S.nextCrisis))}.</div></div>`;
    const v = S.vote;
    if (v) {
      h += `<div class="box"><h4>🏛️ مجلس الأمن: عقوبات على ${esc(v.names)}؟</h4><div class="stats">إنتاج -25٪ وإغلاق السوق 10 دقائق إذا وافقت الأغلبية ولم يستخدم أحد الأعضاء الدائمين الفيتو. متبقي ${fmtTime(v.remaining)} · مع ${v.yes} / ضد ${v.no}</div>`;
      if (v.team === me().team) h += '<div class="stats neg">أنت المستهدف. أقنع الآخرين بالتصويت ضد أو اطلب فيتو من حليف.</div>';
      else if (v.mine) h += `<div class="stats">صوتك: ${{ yes: 'مع', no: 'ضد', veto: 'فيتو' }[v.mine]}</div>`;
      else h += `<div class="row"><button class="small" data-vote="yes">مع العقوبات</button><button class="small" data-vote="no">ضد</button>${S.me.canVeto ? '<button class="small danger" data-vote="veto">✋ فيتو</button>' : ''}</div>`;
      h += '</div>';
    }
    if (S.sanctions) h += `<div class="box"><h4>⛔ عقوبات على ${esc(S.sanctions.names)}</h4><div class="stats">متبقي ${fmtTime(S.sanctions.remaining)}</div></div>`;
    if (S.projects.length) {
      h += `<div class="box"><h4>☢️ مشاريع الأسلحة النهائية</h4>` + S.projects.map((p) =>
        `<div class="stats">${nm(p.id)}: ${p.ready ? '<b class="neg">جاهز للإطلاق!</b>' : `${Math.round(p.progress * 100)}٪ · متبقي ${fmtTime(p.remaining)}`}</div>${p.ready ? '' : `<div class="bar"><i style="width:${p.progress * 100}%;background:var(--bad)"></i></div>`}`).join('') +
        '<div class="stats">اقتحام عاصمة صاحب المشروع يؤخره 40٪.</div></div>';
    }
    if (S.event) h += `<div class="box"><h4>${S.event.name}</h4><div class="stats">${S.event.desc} · متبقي ${fmtTime(S.event.remaining)}</div></div>`;
    return h + TABS.rank();
  },
  trade() {
    const m = S.me;
    const opts = (sel) => meta.RES.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${RES_ICONS[r]} ${RES_NAMES[r]}</option>`).join('');
    const mg = ui.inputs['mk-give'] || 'money', mt = ui.inputs['mk-get'] || 'food', ma = Number(ui.inputs['mk-amt'] || 0);
    let h = `<div class="box"><h4>🏪 السوق العام</h4><div class="stats">سعرك الحالي: كل 1 تعطيه تحصل مقابله ${m.marketRate.toFixed(2)} (يتحسن مع كل اتفاقية تجارية مع البوتات)</div>
      <div class="unitrow"><select data-key="mk-give">${opts(mg)}</select><input type="number" min="1" placeholder="الكمية" data-key="mk-amt"><span>←</span><select data-key="mk-get">${opts(mt)}</select></div>
      <div class="row"><span class="stats" id="mkOut">${ma > 0 ? 'ستحصل على ' + fmt(ma * m.marketRate) : ''}</span><button class="small primary" data-market="1">بيع</button></div></div>`;
    const og = ui.inputs['of-give'] || 'oil', ow = ui.inputs['of-want'] || 'money';
    h += `<div class="box"><h4>📢 نشر عرض للاعبين</h4><div class="stats">تُحجز مواردك حتى يقبل أحد العرض أو تلغيه. البوتات تقبل العروض العادلة، وأكثر إذا عندكم اتفاقية تجارية.</div>
      <div class="unitrow"><span>أعطي</span><input type="number" min="1" data-key="of-ga"><select data-key="of-give">${opts(og)}</select></div>
      <div class="unitrow"><span>مقابل</span><input type="number" min="1" data-key="of-wa"><select data-key="of-want">${opts(ow)}</select></div>
      <button class="small primary" data-offer="1">نشر العرض</button></div>`;
    h += `<div class="box"><h4>📋 العروض المفتوحة</h4>`;
    if (!S.offers.length) h += '<div class="stats">لا توجد عروض.</div>';
    for (const o of S.offers) {
      const mine = o.owner === myId;
      h += `<div class="mv">${esc(o.ownerName)} يعطي ${RES_ICONS[o.give]}${fmt(o.giveAmt)} مقابل ${RES_ICONS[o.want]}${fmt(o.wantAmt)}
        ${mine ? `<button class="small" data-cancel="${o.id}">إلغاء</button>` : `<button class="small primary" data-accept="${o.id}" ${m.res[o.want] < o.wantAmt ? 'disabled' : ''}>قبول</button>`}</div>`;
    }
    return h + '</div>';
  },
  dip() {
    const R = S.REL;
    let h = '';
    for (const from of S.proposalsIn) {
      const p = player(from);
      h += `<div class="box"><h4>🤝 ${esc(p.name)} يعرض عليك تحالفاً</h4><div class="row"><button class="small primary" data-ally-accept="${from}">قبول</button><button class="small" data-ally-reject="${from}">رفض</button></div></div>`;
    }
    h += `<div class="stats" style="margin-bottom:8px">الحلفاء يتشاركون الرؤية ونقاط النصر. أقصى حجم للتحالف ${S.maxTeam}. مع البوتات: ابنِ العلاقة بالهدايا والمهام والتجارة. ${R.trade}+ اتفاقية تجارية (سعر سوق أفضل)، ${R.pact}+ عدم اعتداء، ${R.ally}+ يقبل التحالف. مهاجمتهم تدمّر العلاقة.</div>`;
    if (me().allied) h += `<button class="small danger" data-leave="1" style="margin-bottom:8px">الانسحاب من التحالف</button>`;
    for (const p of S.players) {
      if (p.id === myId) continue;
      const f = meta.FACTIONS[p.faction];
      const ally = p.team === me().team;
      let status = ally ? '<span class="tag good">حليف</span>' : '';
      if (p.bot && !ally) {
        const r = p.rel;
        const label = r >= R.ally ? 'مستعد للتحالف' : r >= R.pact ? 'عدم اعتداء' : r >= R.trade ? 'اتفاقية تجارية' : r <= R.hostile ? 'عدائي' : 'محايد';
        status = `<span class="tag">${label} (${r})</span><div class="relbar"><i style="width:${(r + 100) / 2}%;background:${r < 0 ? 'var(--bad)' : 'var(--good)'}"></i></div>`;
      }
      const sent = S.proposalsOut.includes(p.id);
      h += `<div class="box"><h4><span><span class="swatch" style="background:${p.color}"></span>${f.flag} ${esc(p.name)}</span>${ally ? '' : `<button class="small" data-propose="${p.id}" ${sent ? 'disabled' : ''}>${sent ? 'تم إرسال العرض' : 'عرض تحالف'}</button>`}</h4>${status}
        <div class="unitrow"><span>🎁 هدية</span><input type="number" min="1" data-key="gift-amt-${p.id}" placeholder="الكمية"><select data-key="gift-res-${p.id}">${meta.RES.map((r) => `<option value="${r}">${RES_ICONS[r]}</option>`).join('')}</select><button class="small" data-gift="${p.id}">إرسال</button></div>`;
      for (const mi of S.missions.filter((x) => x.bot === p.id)) {
        h += `<div class="mission">📌 مهمة: ${esc(mi.text)} <small>(العلاقة +${mi.reward}${mi.kind === 'deliver' ? '' : ' ومكافأة موارد'} · متبقي ${fmtTime(mi.left)})</small>
          ${mi.kind === 'deliver' ? `<button class="small primary" data-deliver="${mi.id}" ${S.me.res[mi.res] < mi.amt ? 'disabled' : ''}>تسليم</button>` : ''}</div>`;
      }
      h += '</div>';
    }
    return h;
  },
  more() {
    const dots = { dip: S.proposalsIn.length > 0, chat: ui.chat.length > ui.seenChat, moves: S.movements.some((x) => x.hostile), log: !$('#logDot').classList.contains('hidden') };
    const items = [['moves', '🚀', 'التحركات'], ['tech', '🔬', 'الأبحاث والقادة'], ['trade', '⚖️', 'التجارة'], ['dip', '🤝', 'الدبلوماسية'], ['log', '📜', 'الأحداث'], ['chat', '💬', 'الدردشة']];
    return `<div class="more-grid">${items.map(([k, i, n]) => `<button data-goto="${k}"><i>${i}</i>${n}${dots[k] ? '<span class="dot"></span>' : ''}</button>`).join('')}
      <button onclick="showTutorial(0)"><i>❓</i>كيف ألعب</button><button data-theme-toggle-alt onclick="document.querySelector('#topBtns [data-theme-toggle]').click()"><i>🌓</i>فاتح / داكن</button>
      <button onclick="selectTerr(S.me.capital);focusTerr(S.me.capital)"><i>🏠</i>عاصمتي</button></div>`;
  },
  chat() {
    const list = ui.chat.map((c) => `<div class="log-item">${c.teamOnly ? '<span class="tag">للفريق</span> ' : ''}<b>${esc(c.from)}:</b> ${esc(c.text)}</div>`).join('');
    return `<div class="chat-list">${list || '<p class="sub">لا رسائل بعد.</p>'}</div>
      <form class="chat-form" onsubmit="sendChat(event)"><input id="chatInput" placeholder="اكتب رسالة..." autocomplete="off">
      ${me().allied ? '<label><input type="checkbox" id="teamOnly" style="width:auto"> للفريق</label>' : ''}<button>إرسال</button></form>`;
  },
};

function stepper(key, min, max, def) {
  return `<div class="stepper"><button data-step="${key}" data-d="-1" data-min="${min}" data-max="${max}">−</button><input type="number" inputmode="numeric" min="${min}" max="${max}" value="${def}" data-key="${key}"><button data-step="${key}" data-d="1" data-min="${min}" data-max="${max}">+</button></div>`;
}

function sendForm() {
  const from = S.terr[ui.sendFrom];
  if (!from || from.owner !== myId) { ui.mode = null; return TABS.site(); }
  if (ui.sendTo == null) return `<div class="box"><h4>🎯 إرسال من ${terrName(from)}</h4><p>اضغط على الهدف في الخريطة.</p><button onclick="cancelSend()">إلغاء</button></div>`;
  const to = S.terr[ui.sendTo];
  const own = to.owner === myId;
  let h = `<div class="box"><h4>🎯 ${terrName(from)} ← ${terrName(to)}</h4>`;
  const known = to.units || (to.scout && to.scout.units);
  if (!own) h += `<div class="stats">حامية الهدف: ${known ? unitsLine(known) : '❓ غير معروفة (أرسل درونز 🛸 للاستطلاع)'}</div>`;
  const avail = Object.keys(meta.UNITS).filter((k) => from.units[k]);
  h += `<div class="actions"><button class="small" data-sendall="1">✅ كل القوات</button><button class="small" data-sendall="0">✖️ تصفير</button></div>`;
  for (const k of avail) {
    const u = meta.UNITS[k], n = from.units[k];
    h += `<div class="unitrow sendrow"><span>${u.icon} ${u.name} <small class="sub">(${n})</small></span>${stepper('send-' + k, 0, n, 0)}<button class="small" data-set="send-${k}" data-n="${n}">الكل</button></div>`;
  }
  const g = S.me.general;
  if (g && g.loc === from.id) h += `<label class="unitrow"><input type="checkbox" id="withGeneral" style="width:auto;min-height:0" ${ui.withGeneral !== false ? 'checked' : ''}> ${meta.GENERALS[g.type].icon} يرافق ${meta.GENERALS[g.type].name} (مستوى ${g.level}) هذا الجيش</label>`;
  h += `<div class="stats" id="eta"></div><div class="actions">`;
  if (own) h += `<button class="primary grow" onclick="doSend('reinforce')">🛡️ تعزيز</button>`;
  else if (friendly(to.owner)) h += `<span class="sub grow">لا يمكن إرسال قوات لموقع حليف.</span>`;
  else h += `<button class="primary danger grow" onclick="doSend('attack')">⚔️ هجوم</button><button onclick="doSend('scout')">🛸 استطلاع</button>`;
  h += `<button onclick="cancelSend()">إلغاء</button></div></div>`;
  return h;
}

function sendUnits() {
  const units = {};
  for (const k of Object.keys(meta.UNITS)) units[k] = Number(ui.inputs['send-' + k] || 0);
  return units;
}
function updateEta() {
  const el = $('#eta'); if (!el || ui.sendTo == null) return;
  const u = sendUnits();
  let sp = Infinity;
  for (const k in u) if (u[k] > 0) sp = Math.min(sp, meta.UNITS[k].speed);
  if (sp === Infinity) { el.textContent = ''; return; }
  const a = S.terr[ui.sendFrom], b = S.terr[ui.sendTo];
  const secs = (Math.hypot(a.x - b.x, a.y - b.y) / sp) * 60 / S.speed;
  let att = 0;
  const atkMul = meta.FACTIONS[me().faction].attack || 1;
  for (const k in u) att += u[k] * meta.UNITS[k].att * atkMul;
  el.textContent = `⏱️ وقت الوصول: ${fmtTime(secs)} · ⚔️ قوة الهجوم: ${fmt(att)}`;
}

const TAB_TITLES = { base: '🏛️ قاعدتي', train: '🏭 الجيش', site: '📍 الموقع', moves: '🚀 التحركات', tech: '🔬 الأبحاث والقادة', world: '🌍 العالم والترتيب', trade: '⚖️ التجارة', dip: '🤝 الدبلوماسية', log: '📜 الأحداث', chat: '💬 الدردشة', more: '☰ المزيد' };
const NAV_OF = { base: 'base', train: 'train', world: 'world', site: 'map' };

window.selectTerr = (id) => { ui.selected = id; ui.mode = null; ui.confirmStrike = null; setTab('site'); };
window.startSend = (from, to) => {
  ui.mode = 'send'; ui.sendFrom = from; ui.sendTo = to ?? null; ui.selected = from;
  for (const k in ui.inputs) if (k.startsWith('send-')) delete ui.inputs[k];
  if (ui.sendTo == null && isMobile()) { ui.tab = 'site'; closeSheet(); } // free the map so the target can be tapped
  else setTab('site');
  updateBanner();
};
window.cancelSend = () => { ui.mode = null; ui.sendTo = null; updateBanner(); renderPanel(true); if (S) renderGame(); };
window.doSend = (mission) => {
  const units = sendUnits();
  if (total(units) === 0) return toast('اختر عدد الوحدات (أو اضغط "كل القوات")');
  const wg = $('#withGeneral');
  cmd({ type: 'send', from: ui.sendFrom, to: ui.sendTo, units, mission, withGeneral: !!(wg && wg.checked) });
  ui.mode = null; ui.selected = ui.sendTo; ui.sendTo = null; updateBanner();
  for (const k in ui.inputs) if (k.startsWith('send-')) delete ui.inputs[k];
  if (isMobile()) { toast('🚀 انطلقت قواتك! تابعها على الخريطة', true); ui.tab = 'moves'; closeSheet(); }
  else setTab('moves');
};
window.sendChat = (e) => {
  e.preventDefault();
  const inp = $('#chatInput'); const text = inp.value.trim(); if (!text) return;
  send({ type: 'chat', text, teamOnly: !!($('#teamOnly') && $('#teamOnly').checked) });
  inp.value = '';
};

function updateBanner() {
  const b = $('#modeBanner');
  if (ui.mode === 'send' && ui.sendTo == null) {
    b.innerHTML = `🎯 اضغط على الهدف في الخريطة <button onclick="cancelSend()">إلغاء</button>`;
    b.classList.remove('hidden');
  } else b.classList.add('hidden');
}

function syncNav() {
  const open = ui.sheetVisible();
  $('#game').classList.toggle('sheet-open', ui.sheet);
  $('#game').classList.toggle('sheet-full', ui.sheet && ['chat', 'trade', 'dip'].includes(ui.tab));
  const nav = !isMobile() || open ? (NAV_OF[ui.tab] || 'more') : 'map';
  for (const b of document.querySelectorAll('#bottomNav button')) b.classList.toggle('active', b.dataset.nav === nav);
  $('#sheetTitle').textContent = TAB_TITLES[ui.tab] || '';
}
window.setTab = (t) => {
  ui.tab = t; ui.sheet = true;
  if (t !== 'site') ui.confirmStrike = null;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === t);
  syncNav();
  if (S) { renderPanel(true); $('#tabBody').scrollTop = 0; }
};
window.closeSheet = () => { ui.sheet = false; syncNav(); };
$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };
$('#bottomNav').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const n = b.dataset.nav;
  if (n === 'map' || (ui.sheet && (NAV_OF[ui.tab] || 'more') === n)) return closeSheet();
  setTab(n);
};
// swipe the sheet header down to close it
(() => {
  let y0 = null;
  $('#sheetHead').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  $('#sheetHead').addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 50) closeSheet(); y0 = null; });
})();
window.addEventListener('resize', () => { if (S) { syncNav(); renderGame(); } });

$('#tabBody').addEventListener('input', (e) => {
  const k = e.target.dataset.key; if (!k) return;
  if (e.target.tagName === 'SELECT') { ui.inputs[k] = e.target.value; return; }
  let v = Number(e.target.value);
  const max = Number(e.target.max);
  if (e.target.max !== '' && v > max) { v = max; e.target.value = max; }
  ui.inputs[k] = v;
  updateEta();
  if (k === 'mk-amt' && $('#mkOut')) $('#mkOut').textContent = v > 0 ? 'ستحصل على ' + fmt(v * S.me.marketRate) : '';
});
function setInput(key, v) {
  ui.inputs[key] = v;
  const el = document.querySelector(`#tabBody [data-key="${key}"]`); if (el) el.value = v;
  updateEta();
}
$('#tabBody').addEventListener('click', (e) => {
  const el = e.target.closest('button,[data-goto]'); if (!el) return;
  const d = el.dataset;
  if (d.goto) setTab(d.goto);
  else if (d.step) {
    const cur = Number(ui.inputs[d.step] ?? document.querySelector(`#tabBody [data-key="${d.step}"]`)?.value ?? 0);
    const big = cur >= 20 ? 5 : 1; // speed up long presses through big armies
    setInput(d.step, Math.max(Number(d.min), Math.min(Number(d.max), cur + Number(d.d) * big)));
  } else if (d.set) setInput(d.set, Number(d.n));
  else if (d.sendall) { const from = S.terr[ui.sendFrom]; for (const k of Object.keys(meta.UNITS)) if (from.units[k]) setInput('send-' + k, d.sendall === '1' ? from.units[k] : 0); }
  else if (d.up) cmd({ type: 'upgrade', building: d.up });
  else if (d.train) {
    const n = Number(ui.inputs['train-' + d.train] || 1);
    cmd({ type: 'train', unit: d.train, count: n });
    toast(`🏭 أُضيف ${n} ${meta.UNITS[d.train].name} للتصنيع`, true);
  }
  else if (d.market) cmd({ type: 'market', give: ui.inputs['mk-give'] || 'money', get: ui.inputs['mk-get'] || 'food', amount: Number(ui.inputs['mk-amt'] || 0) });
  else if (d.offer) cmd({ type: 'offer', give: ui.inputs['of-give'] || 'oil', giveAmt: Number(ui.inputs['of-ga'] || 0), want: ui.inputs['of-want'] || 'money', wantAmt: Number(ui.inputs['of-wa'] || 0) });
  else if (d.cancel) cmd({ type: 'cancelOffer', id: Number(d.cancel) });
  else if (d.accept) cmd({ type: 'acceptOffer', id: Number(d.accept) });
  else if (d.propose) cmd({ type: 'propose', to: d.propose });
  else if (d.allyAccept) cmd({ type: 'acceptAlliance', from: d.allyAccept });
  else if (d.allyReject) cmd({ type: 'rejectAlliance', from: d.allyReject });
  else if (d.leave) cmd({ type: 'leaveAlliance' });
  else if (d.gift) cmd({ type: 'gift', to: d.gift, res: ui.inputs['gift-res-' + d.gift] || 'money', amount: Number(ui.inputs['gift-amt-' + d.gift] || 0) });
  else if (d.deliver) cmd({ type: 'mission', id: Number(d.deliver) });
  else if (d.research) cmd({ type: 'research', tech: d.research });
  else if (d.general) cmd({ type: 'hireGeneral', kind: d.general });
  else if (d.buildSw) cmd({ type: 'buildSW' });
  else if (d.strikeAsk) { ui.confirmStrike = Number(d.strikeAsk); renderPanel(true); }
  else if (d.strikeCancel) { ui.confirmStrike = null; renderPanel(true); }
  else if (d.strike) { cmd({ type: 'strike', target: Number(d.strike) }); ui.confirmStrike = null; }
  else if (d.crisis) cmd({ type: 'crisis', id: S.crisis.id, action: d.crisis, side: d.side });
  else if (d.vote) cmd({ type: 'vote', id: S.vote.id, choice: d.vote });
});
$('#tabBody').addEventListener('change', (e) => { if (e.target.id === 'withGeneral') ui.withGeneral = e.target.checked; });

// ---------------- tutorial ----------------
const TUTORIAL = [
  ['🏆', '<b>هدف اللعبة</b><br>على الخريطة مراكز قيادة <b>⭐</b>. كل مركز تملكه يعطي فريقك <b>10 نقاط نصر كل دقيقة</b>.<br>أول فريق يوصل للهدف يفوز، وإذا خلص الوقت يفوز الأعلى نقاطاً. البطاقة أعلى الخريطة تعرض تقدّمك دائماً.'],
  ['🏭', '<b>١. جنّد جيشك</b><br>من زر <b>الجيش</b> تحت. المشاة رخيصة، الدبابات قوية، المقاتلات سريعة.<br>انتبه: كل جندي يأكل 🌾 غذاء ويقلل العمال المدنيين.'],
  ['⚔️', '<b>٢. هاجم واحتل</b><br>اضغط على أي موقع في الخريطة ثم <b>هاجم</b>. ابدأ بالمواقع الرمادية المحايدة القريبة: مدن 🏙️ ونفط 🛢️ ومناجم ⛏️ ومزارع 🌾 تزيد دخلك.'],
  ['⭐', '<b>٣. سيطر على مراكز القيادة</b><br>لما يقوى جيشك احتل مراكز ⭐ وخلّ فيها حامية قوية، لأن الأعداء بيحاولون ياخذونها منك.'],
  ['🛡️', '<b>نصائح</b><br>أول 20 دقيقة لا أحد يقدر يهاجم اللاعبين، استغلها للتوسع.<br>الشريط الأزرق 💡 أعلى الخريطة يقترح عليك الخطوة الجاية دائماً. وتقدر تتحالف وتتاجر من <b>المزيد</b>.'],
];
window.showTutorial = (i) => {
  const el = $('#tutorial');
  if (i >= TUTORIAL.length) { el.classList.add('hidden'); try { localStorage.setItem('tutDone', '1'); } catch {} return; }
  const [icon, text] = TUTORIAL[i];
  el.innerHTML = `<div class="card"><div class="tut-icon">${icon}</div><div class="tut-text">${text}</div>
    <div class="tut-dots">${TUTORIAL.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tut-btns">${i < TUTORIAL.length - 1 ? `<button onclick="showTutorial(${TUTORIAL.length})">تخطي</button>` : ''}<button class="primary" onclick="showTutorial(${i + 1})">${i < TUTORIAL.length - 1 ? 'التالي' : 'يلا نبدأ! 🚀'}</button></div></div>`;
  el.classList.remove('hidden');
};
function maybeTutorial() {
  let done = false;
  try { done = localStorage.getItem('tutDone'); } catch {}
  if (!done) showTutorial(0);
}

// ---------------- map ----------------
const canvas = $('#map'), ctx = canvas.getContext('2d');
let view = { s: 1, ox: 0, oy: 0, dpr: 1 }, base = { s: 1, ox: 0, oy: 0 }, cam = { z: 1, x: 0, y: 0 };
function applyCam() { view = { s: base.s * cam.z, ox: base.ox + cam.x, oy: base.oy + cam.y, dpr: view.dpr }; }
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const W = S ? S.map.W : 1000, H = S ? S.map.H : 650;
  const s = Math.min(r.width / W, r.height / H) * 0.98;
  base = { s: s * dpr, ox: ((r.width - W * s) / 2) * dpr, oy: ((r.height - H * s) / 2) * dpr };
  view.dpr = dpr; applyCam();
}
window.addEventListener('resize', resize);
function zoomAt(f, cx, cy) { // cx, cy in canvas pixels
  const z = Math.max(1, Math.min(6, cam.z * f)); f = z / cam.z;
  cam.x = cx - base.ox - (cx - base.ox - cam.x) * f;
  cam.y = cy - base.oy - (cy - base.oy - cam.y) * f;
  cam.z = z; if (z === 1) { cam.x = 0; cam.y = 0; }
  applyCam();
}
// centre a territory; on phones keep it in the strip above the open bottom sheet
window.focusTerr = (id, z) => {
  const t = S.terr[id];
  if (z) cam.z = z;
  const fy = isMobile() && ui.sheet ? 0.2 : 0.5;
  cam.x = canvas.width / 2 - base.ox - t.x * base.s * cam.z;
  cam.y = canvas.height * fy - base.oy - t.y * base.s * cam.z;
  applyCam();
};
window.zoomBtn = (f) => {
  if (f === 0) { cam = { z: 1, x: 0, y: 0 }; applyCam(); }
  else if (f === -1) focusTerr(S.me.capital, Math.min(6, Math.max(cam.z, 1.6, canvas.height / (S.map.H * base.s)))); // fill the screen height
  else zoomAt(f, canvas.width / 2, canvas.height / 2);
};
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr);
}, { passive: false });

const pointers = new Map();
let dragged = false, pinchD = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragged = false; pinchD = 0; });
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  if (pointers.size === 1) {
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    if (dragged || Math.abs(dx) + Math.abs(dy) > 4) {
      dragged = true;
      cam.x += dx * view.dpr; cam.y += dy * view.dpr; applyCam();
      pointers.set(e.pointerId, cur);
    }
  } else if (pointers.size === 2) {
    pointers.set(e.pointerId, cur);
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = canvas.getBoundingClientRect();
    if (pinchD) zoomAt(d / pinchD, ((a.x + b.x) / 2 - r.left) * view.dpr, ((a.y + b.y) / 2 - r.top) * view.dpr);
    pinchD = d; dragged = true;
  }
});
const endPointer = (e) => { pointers.delete(e.pointerId); pinchD = 0; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('click', (e) => {
  if (!S || dragged) return;
  const r = canvas.getBoundingClientRect(), dpr = view.dpr || 1;
  const x = ((e.clientX - r.left) * dpr - view.ox) / view.s, y = ((e.clientY - r.top) * dpr - view.oy) / view.s;
  let best = null, bd = (S.map.world ? 26 : 34) / Math.sqrt(cam.z);
  for (const t of S.terr) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  if (!best) return;
  if (ui.mode === 'send') {
    if (best.id === ui.sendFrom) return;
    ui.sendTo = best.id;
    for (const k in ui.inputs) if (k.startsWith('send-')) delete ui.inputs[k];
    updateBanner(); setTab('site');
  } else selectTerr(best.id);
  // if the open sheet would cover the tapped site, slide the map up
  if (isMobile() && (e.clientY - r.top) > r.height * 0.33) focusTerr(best.id);
});

function haloText(txt, x, y, color) {
  ctx.lineWidth = 3; ctx.strokeStyle = PAL.halo; ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function draw() {
  requestAnimationFrame(draw);
  if (!S || $('#game').classList.contains('hidden')) return;
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
  const MW = S.map.W, MH = S.map.H, world = S.map.world, K = world ? 0.75 : 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, MW, MH); ctx.clip();
  ctx.fillStyle = world ? PAL.ocean : PAL.sea; ctx.fillRect(0, 0, MW, MH);
  if (world) {
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
    ctx.fillStyle = PAL.land; ctx.strokeStyle = PAL.coast; ctx.lineWidth = 1.2;
    for (const l of meta.WORLD_DRAW.land) { poly(l); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = PAL.ocean;
    for (const w of meta.WORLD_DRAW.water) { poly(w); ctx.fill(); ctx.stroke(); }
  }
  ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= MW; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MH); ctx.stroke(); }
  for (let y = 0; y <= MH; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MW, y); ctx.stroke(); }
  ctx.restore();

  // territory influence
  for (const t of S.terr) if (t.owner) {
    const p = player(t.owner);
    const R = 70 * K;
    const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, R);
    g.addColorStop(0, p.color + '40'); g.addColorStop(1, p.color + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, Math.PI * 2); ctx.fill();
  }

  // movements
  const elapsed = (performance.now() - stateAt) / 1000;
  for (const m of S.movements) {
    const a = S.terr[m.from], b = S.terr[m.to], p = player(m.owner);
    const dur = m.eta / Math.max(0.0001, 1 - m.progress);
    const prog = Math.min(1, m.progress + elapsed / Math.max(dur, 0.001));
    ctx.strokeStyle = m.hostile ? '#f85149' : p.color; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const x = a.x + (b.x - a.x) * prog, y = a.y + (b.y - a.y) * prog;
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    haloText(fmtTime(Math.max(0, m.eta - elapsed)), x, y - 11, m.hostile ? '#f85149' : PAL.label);
  }

  // territories
  for (const t of S.terr) {
    const r = (t.type === 'capital' ? 22 : t.type === 'strategic' ? 20 : 15) * K;
    const p = t.owner ? player(t.owner) : null;
    ctx.fillStyle = p ? p.color : PAL.neutral;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = t.type === 'strategic' ? 3 : 2;
    ctx.strokeStyle = t.type === 'strategic' ? '#ffc107' : PAL.ring;
    ctx.stroke();
    if (ui.selected === t.id || ui.sendFrom === t.id && ui.mode === 'send' || ui.sendTo === t.id && ui.mode === 'send') {
      ctx.strokeStyle = PAL.select; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(t.x, t.y, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = `${r}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(meta.TERR[t.type].icon, t.x, t.y + 1);
    const n = t.units ? total(t.units) : t.scout ? total(t.scout.units) + '?' : '?';
    const fs = world ? 10 : 12;
    ctx.font = `bold ${fs}px sans-serif`;
    const label = String(n), w = ctx.measureText(label).width + 8;
    ctx.fillStyle = '#000000b0'; ctx.fillRect(t.x - w / 2, t.y + r + 2, w, fs + 3);
    ctx.fillStyle = t.units ? '#fff' : '#aaa'; ctx.fillText(label, t.x, t.y + r + 3 + fs / 2);
    if (t.type === 'capital') {
      ctx.font = `bold ${fs}px sans-serif`;
      haloText(meta.FACTIONS[p.faction].flag + ' ' + p.name, t.x, t.y - r - 8, PAL.label);
    } else if (t.name && (t.type === 'strategic' || cam.z >= 2)) {
      ctx.font = `${t.type === 'strategic' ? 'bold ' : ''}${fs - 1}px sans-serif`;
      haloText(t.name, t.x, t.y - r - 7, t.type === 'strategic' ? PAL.strat : PAL.name);
    }
  }
}
requestAnimationFrame(draw);

// ---------------- boot ----------------
fetch('meta.json').then((r) => r.json()).then((m) => {
  meta = m;
  if (!meta.FACTIONS[ui.faction]) ui.faction = 'china';
  renderFactionPick();
});
const params = new URLSearchParams(location.search);
const sess = getSession();
if (params.get('room')) $('#codeInput').value = params.get('room');
if (sess && (!params.get('room') || params.get('room') === sess.code)) {
  connect(() => send({ type: 'resume', code: sess.code, token: sess.token }));
}
