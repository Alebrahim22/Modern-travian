// Simple AI opponent. It reads the full game state (bots don't need fog of war to be fair to friends).
const { UNITS, RES, REL, TECHS, PERMANENT, emptyUnits, sumUnits, dist } = require('./game');

const ATTACKERS = ['inf', 'tank', 'jet', 'heli', 'sf', 'arty', 'bomber', 'missile'];
const TECH_ORDER = ['logistics', 'armor', 'agri', 'missiles', 'ew', 'satellites', 'nuclear'];

function estDefense(g, t, p) { return g.defensePower(t, 0.8, p); }

function power(g, p, units) {
  const { g: gr, a } = g.attackPower(p, units);
  return gr + a;
}

function willAttack(g, b, owner) {
  if (!owner) return true;
  if (g.t < 20 * 60) return false;
  if (owner === b.id || g.allies(owner, b.id)) return false;
  return (b.rel[owner] || 0) < REL.pact;
}

function botPolitics(g, p) {
  const pid = p.id;
  const cr = g.crisis;
  if (cr) {
    const side = g.partyOf(pid);
    if (side && !cr.party[pid]) {
      const other = side === 'a' ? cr.b : cr.a;
      g.cmd(pid, { type: 'crisis', id: cr.id, action: (p.rel[other] || 0) < 10 ? 'escalate' : 'calm' });
    } else if (!side && !cr.stance[pid] && p.decided !== cr.id) {
      p.decided = cr.id;
      const ra = p.rel[cr.a] || 0, rb = p.rel[cr.b] || 0;
      const fav = ra >= rb ? 'a' : 'b', diff = Math.abs(ra - rb), best = Math.max(ra, rb);
      const r = Math.random();
      if (best >= REL.pact && diff > 30) g.cmd(pid, { type: 'crisis', id: cr.id, action: 'military', side: fav });
      else if (diff > 20 && r < 0.6) g.cmd(pid, { type: 'crisis', id: cr.id, action: 'media', side: fav });
      else if (r < 0.35) g.cmd(pid, { type: 'crisis', id: cr.id, action: 'mediate' });
    }
  }
  const v = g.vote;
  if (v && !v.votes[pid] && p.team !== v.team) {
    const targets = g.teamMembers(v.team);
    const rel = targets.reduce((a, t) => a + (p.rel[t.id] || 0), 0) / targets.length;
    const choice = rel >= REL.pact && PERMANENT.includes(p.faction) ? 'veto' : rel < 15 ? 'yes' : 'no';
    g.cmd(pid, { type: 'vote', id: v.id, choice });
  }
}

function botTech(g, p) {
  const pid = p.id;
  if (!p.research) {
    const next = TECH_ORDER.find((k) => !p.techs[k] && TECHS[k].req.every((r) => p.techs[r]));
    if (next) {
      const c = g.techCost(next);
      if (RES.every((r) => p.res[r] >= c[r] + 300)) g.cmd(pid, { type: 'research', tech: next });
    }
  }
  if (!p.general && g.t > 10 * 60 && p.res.money > 2500) g.cmd(pid, { type: 'hireGeneral', kind: ['attack', 'attack', 'speed', 'defense'][Math.floor(Math.random() * 4)] });
  if (p.techs.nuclear && !p.sw) g.cmd(pid, { type: 'buildSW' });
  if (p.sw && p.sw.ready && !p.sw.used) {
    // hit the strongest enemy strategic site, or the leader's capital
    const foes = g.terr.filter((t) => t.owner && !g.allies(t.owner, pid) && t.owner !== pid);
    const strat = foes.filter((t) => t.type === 'strategic').sort((a, b) => sumUnits(b.units) - sumUnits(a.units));
    const target = strat[0] || foes.sort((a, b) => g.players[b.owner].vp - g.players[a.owner].vp)[0];
    if (target) g.cmd(pid, { type: 'strike', target: target.id });
  }
}

function botTurn(g, pid) {
  const p = g.players[pid];
  if (!p || g.winner) return;
  const cap = g.terr[p.capital];
  botPolitics(g, p);
  botTech(g, p);
  const pop = g.population(p), milQ = g.military(p, true);
  const foodNet = g.income(p).food - g.upkeep(p);
  const hungry = foodNet < 0 && p.res.food < 1500;

  // trade surplus on the open market
  const sorted = RES.slice().sort((a, b) => p.res[a] - p.res[b]);
  const low = sorted[0], high = sorted[3];
  if (p.res[high] > 3000 && p.res[low] < 500) g.cmd(pid, { type: 'market', give: high, get: low, amount: Math.floor(p.res[high] * 0.3) });

  // accept fair offers from players it doesn't dislike
  for (const o of [...g.offers]) {
    if (o.owner === pid) continue;
    const rel = g.players[o.owner].bot ? 0 : p.rel[o.owner] || 0;
    if (rel < REL.hostile || p.res[o.want] < o.wantAmt + 300) continue;
    const ratio = rel >= REL.trade ? 0.95 : 1.25;
    if (o.giveAmt >= o.wantAmt * ratio) { g.cmd(pid, { type: 'acceptOffer', id: o.id }); break; }
  }

  // upgrades: housing when manpower or food is tight, otherwise economy first
  if (!p.upgrade) {
    let b;
    if (milQ > pop * 0.75 || hungry) b = 'housing';
    else if (p.buildings.economy < 4) b = 'economy';
    else b = ['economy', 'factory', 'defense', 'housing', 'radar'][Math.floor(Math.random() * 5)];
    if (g.canPay(p, g.upgradeCost(p, b)) && Math.random() < 0.6) g.cmd(pid, { type: 'upgrade', building: b });
  }

  // keep the factory busy while there is manpower and food
  if (p.queue.length < 2 && !hungry && milQ < pop * 0.8) {
    const r = Math.random();
    let u = r < 0.45 ? 'inf' : r < 0.75 ? 'tank' : r < 0.9 ? 'jet' : 'sam';
    if (r < 0.45 && Math.random() < 0.25) u = p.techs.logistics ? 'sf' : 'heli';
    else if (r >= 0.45 && r < 0.75 && p.techs.armor && Math.random() < 0.3) u = 'arty';
    else if (u === 'jet' && p.techs.ew && Math.random() < 0.4) u = 'bomber';
    else if (u === 'sam' && p.techs.satellites && Math.random() < 0.35) u = 'abm';
    if (p.techs.missiles && Math.random() < 0.15) u = 'missile';
    const c = g.unitCost(p, u);
    const afford = Math.min(...RES.map((k) => (c[k] ? Math.floor(p.res[k] / c[k]) : 999)));
    const room = Math.floor((pop * 0.8 - milQ) / UNITS[u].crew);
    const n = Math.min(afford, room, u === 'inf' || u === 'sf' ? 15 : u === 'missile' || u === 'bomber' ? 2 : 5);
    if (n > 0) g.cmd(pid, { type: 'train', unit: u, count: n });
  }

  // attack the most valuable reachable target we can beat
  if (g.movements.some((m) => m.owner === pid && m.mission === 'attack')) return;
  const myPower = power(g, p, cap.units);
  if (myPower < 150) return;
  const candidates = g.terr
    .filter((t) => willAttack(g, p, t.owner))
    .map((t) => {
      const D = estDefense(g, t, p);
      let value = t.type === 'strategic' ? 3 : t.type === 'capital' ? 1.2 : 1;
      if (hungry && t.type === 'farm') value *= 2.5;
      if (t.owner && (p.rel[t.owner] || 0) < REL.hostile) value *= 1.5;
      return { t, D, score: (value * 1000) / (dist(cap, t) + 100) / (1 + D / 500) };
    })
    .filter((c) => myPower > c.D * 1.4)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return;
  const target = candidates[0];
  const units = emptyUnits();
  for (const u of ATTACKERS) units[u] = cap.units[u];
  units.inf = Math.max(0, units.inf - 5); // leave a small home guard
  if (sumUnits(units) === 0) return;
  if (sumUnits(units) === units.missile) return; // don't waste missiles without troops to follow up
  g.cmd(pid, { type: 'send', from: cap.id, to: target.t.id, units, mission: 'attack', withGeneral: true });

  // pull spare garrisons from quiet sites back to the capital occasionally
  if (Math.random() < 0.2) {
    for (const t of g.terr) {
      if (t.owner !== pid || t.id === cap.id || t.type === 'strategic') continue;
      const extra = Math.max(0, t.units.inf - 12);
      if (extra > 10) {
        const send = emptyUnits(); send.inf = extra;
        g.cmd(pid, { type: 'send', from: t.id, to: cap.id, units: send, mission: 'reinforce' });
      }
    }
  }
}

module.exports = { botTurn };
