const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, FACTIONS, UNITS, BUILDINGS, TERR, RES, TECHS, GENERALS, CRISIS_ACTIONS, MAP_W, MAP_H, WORLD_DRAW, RIVALRIES, GENERIC_CRISES, EVENTS, PERMANENT, REL } = require('./game');
const META = { FACTIONS, UNITS, BUILDINGS, TERR, RES, TECHS, GENERALS, CRISIS_ACTIONS, MAP_W, MAP_H, WORLD_DRAW, RIVALRIES, GENERIC_CRISES, EVENTS, PERMANENT, REL };
const { botTurn } = require('./bot');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/meta.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(META));
  }
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> room
const DURATIONS = { 60: 2, 120: 1, 180: 2 / 3, 10: 12 }; // real minutes -> speed (10 = quick test)
const BOT_NAMES = ['الجنرال آلفا', 'القائد برافو', 'المشير تشارلي', 'العقيد دلتا', 'اللواء إيكو', 'الفريق فوكس'];

const newCode = () => {
  let c;
  do c = Math.random().toString(36).slice(2, 7).toUpperCase(); while (rooms.has(c));
  return c;
};
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const clean = (s, n = 20) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function lobbyState(room) {
  return {
    type: 'lobby', code: room.code, host: room.host, duration: room.duration, map: room.map,
    players: room.players.map((p) => ({ id: p.id, name: p.name, faction: p.faction, team: p.team, bot: p.bot, online: p.bot || !!(p.ws && p.ws.readyState === 1) })),
  };
}
function broadcastLobby(room) { for (const p of room.players) send(p.ws, lobbyState(room)); }
function broadcastChat(room, msg, sender) {
  const teamOf = (p) => (room.game ? room.game.players[p.id].team : p.team);
  for (const p of room.players) if (!msg.teamOnly || teamOf(p) === teamOf(sender)) send(p.ws, { type: 'chat', ...msg });
}

function startGame(room) {
  room.game = new Game(room.players, { speed: DURATIONS[room.duration] || 1, map: room.map });
  room.started = true;
  for (const p of room.players) send(p.ws, { type: 'started' });
}

wss.on('connection', (ws) => {
  let room = null, me = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const err = (text) => send(ws, { type: 'error', text });

    if (m.type === 'create' || m.type === 'join' || m.type === 'resume') {
      if (m.type === 'create') {
        room = { code: newCode(), players: [], host: null, duration: 120, map: 'world', started: false, game: null, created: Date.now() };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) return err('الغرفة غير موجودة');
      }
      if (m.type === 'resume') {
        me = room.players.find((p) => p.token === m.token);
        if (!me) { room = null; return err('تعذر استعادة الجلسة'); }
        me.ws = ws;
      } else {
        if (room.started) { room = null; return err('المباراة بدأت بالفعل'); }
        if (room.players.length >= 8) { room = null; return err('الغرفة ممتلئة'); }
        me = {
          id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'),
          name: clean(m.name) || 'لاعب', faction: FACTIONS[m.faction] ? m.faction : 'china', team: '', bot: false, ws,
        };
        room.players.push(me);
        if (!room.host) room.host = me.id;
      }
      send(ws, { type: 'welcome', id: me.id, token: me.token, code: room.code, meta: META });
      if (room.started) send(ws, { type: 'started' });
      broadcastLobby(room);
      return;
    }
    if (!room || !me) return;

    if (m.type === 'chat') {
      const text = clean(m.text, 200);
      if (text) broadcastChat(room, { from: me.name, id: me.id, text, teamOnly: !!m.teamOnly }, me);
      return;
    }

    if (m.type === 'leave') return leaveRoom(room, me, ws);
    if (!room.started) {
      const isHost = room.host === me.id;
      if (m.type === 'setFaction' && FACTIONS[m.faction]) me.faction = m.faction;
      else if (m.type === 'setTeam') me.team = ['', 'A', 'B', 'C', 'D'].includes(m.team) ? m.team : '';
      else if (m.type === 'setName') me.name = clean(m.name) || me.name;
      else if (isHost && m.type === 'setDuration' && DURATIONS[m.duration]) room.duration = Number(m.duration);
      else if (isHost && m.type === 'setMap' && ['world', 'random'].includes(m.map)) room.map = m.map;
      else if (isHost && m.type === 'addBot') {
        if (room.players.length >= 8) return err('الغرفة ممتلئة');
        const fk = Object.keys(FACTIONS);
        room.players.push({
          id: crypto.randomBytes(4).toString('hex'), name: BOT_NAMES[room.players.filter((p) => p.bot).length % BOT_NAMES.length] + ' 🤖',
          faction: fk[Math.floor(Math.random() * fk.length)], team: ['', 'A', 'B', 'C', 'D'].includes(m.team) ? m.team : '', bot: true,
        });
      } else if (isHost && m.type === 'botTeam') {
        const b = room.players.find((p) => p.id === m.id && p.bot);
        if (b) { b.team = ['', 'A', 'B', 'C', 'D'].includes(m.team) ? m.team : ''; if (FACTIONS[m.faction]) b.faction = m.faction; }
      } else if (isHost && m.type === 'kick') room.players = room.players.filter((p) => p.id !== m.id || p.id === me.id);
      else if (isHost && m.type === 'start') {
        if (room.players.length < 2) return err('تحتاج لاعبين اثنين على الأقل (أضف بوت للتجربة)');
        const teams = new Set(room.players.map((p) => p.team || 'solo-' + p.id));
        if (teams.size < 2) return err('كل اللاعبين في نفس الفريق! لازم فريقين على الأقل');
        startGame(room);
      }
      broadcastLobby(room);
      return;
    }

    if (m.type === 'pause' && room.host === me.id) {
      room.paused = m.on ? { by: me.name } : null;
      for (const p of room.players) pushState(room, p);
      return;
    }
    if (m.type === 'restart' && room.host === me.id) {
      room.started = false; room.game = null; room.paused = null;
      for (const p of room.players) send(p.ws, { type: 'restarted' });
      broadcastLobby(room);
      return;
    }
    if (m.type === 'cmd') {
      if (room.paused) return err('اللعبة متوقفة مؤقتاً');
      const e = room.game.cmd(me.id, m.cmd || {});
      if (e) err(e);
      else pushState(room, me);
    }
  });

  ws.on('close', () => { if (room && !room.started) broadcastLobby(room); });
});

function pushState(room, p) {
  if (p.ws) send(p.ws, { type: 'state', state: { ...room.game.view(p.id), paused: room.paused, host: room.host } });
}
// leaving a running match hands the country to a bot so the other players keep their game
function leaveRoom(room, me, ws) {
  me.ws = null; me.token = null;
  if (room.started) {
    me.bot = true; me.name += ' 🤖';
    const gp = room.game.players[me.id];
    if (gp) { gp.bot = true; gp.name = me.name; gp.rel = gp.rel || {}; room.game.addLog(null, `🚪 ${me.name.replace(' 🤖', '')} غادر المباراة وتسلّم بوت قيادة دولته`, 'warn'); }
  } else room.players = room.players.filter((p) => p !== me);
  const humans = room.players.filter((p) => !p.bot);
  if (!humans.length) { rooms.delete(room.code); }
  else {
    if (room.host === me.id) { room.host = humans[0].id; if (room.paused) room.paused = null; }
    if (!room.started) broadcastLobby(room);
  }
  send(ws, { type: 'left' });
}

let last = Date.now(), botClock = 0;
setInterval(() => {
  const now = Date.now(), dt = (now - last) / 1000;
  last = now;
  botClock += dt;
  const runBots = botClock >= 2;
  if (runBots) botClock = 0;
  for (const [code, room] of rooms) {
    const idle = room.players.every((p) => p.bot || !p.ws || p.ws.readyState !== 1);
    if (idle && now - (room.lastActive || room.created) > 30 * 60 * 1000) { rooms.delete(code); continue; }
    if (!idle) room.lastActive = now;
    if (!room.started) continue;
    if (room.paused) { for (const p of room.players) if (!p.bot) pushState(room, p); continue; }
    room.game.tick(dt);
    if (runBots) for (const p of room.players) if (p.bot) botTurn(room.game, p.id);
    for (const p of room.players) if (!p.bot) pushState(room, p);
  }
}, 1000);

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
