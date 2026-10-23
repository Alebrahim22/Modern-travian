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
  if (!p.research && !(p.saving && Math.random() < 0.9)) {
    const next = TECH_ORDER.find((k) => !p.techs[k] && TECHS[k].req.every((r) => p.techs[r]) && !(g.nuclear && k === 'nuclear'));
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

// ---------- nuclear race mode ----------
const AGGRESSIVE = ['iran', 'russia', 'pakistan'];
const seesStage = (g, pid, target, stages, minConf) => g.reports.some((r) => r.kind === 'spy' && r.target === target && g.reportVisible(r, pid)
  && stages.includes(r.data.stage) && (minConf !== 'medium' || r.conf !== 'low') && g.t - r.t < 20 * 60);
const afford = (p, c, margin = 0) => RES.every((r) => p.res[r] >= (c[r] || 0) + (c[r] ? margin : 0));

function botNuclear(g, p) {
  const pid = p.id, n = p.nuke;
  // cautious: only some bots ever go for the bomb
  if (!p.nukePlan) {
    const r = Math.random();
    p.nukePlan = r < (AGGRESSIVE.includes(p.faction) ? 0.35 : 0.12) ? 'weapon' : r < 0.6 ? 'civil' : 'none';
  }
  const foes = Object.values(g.players).filter((x) => x.id !== pid && !g.allies(x.id, pid));
  p.saving = null; // what the bot is putting money aside for; the army waits while it saves

  // intelligence agency and counter-intelligence
  if (!p.intelJob && g.t > 6 * 60) {
    const wantAgency = g.fastIntel(p) ? 4 : 2, wantCounter = p.nukePlan === 'weapon' ? 2 : 1;
    const kind = p.intel < wantAgency ? 'agency' : p.counter < wantCounter && n.level >= 1 ? 'counter' : null;
    if (kind) {
      const c = g.intelCost(p, kind);
      if (afford(p, c, 300)) g.cmd(pid, { type: 'intelUpgrade', kind });
      else if (p.intel < 2) p.saving = c;
    }
  }

  // the programme
  if (p.nukePlan !== 'none' && g.t > 18 * 60) {
    const step = n.level === 0 ? g.NUKE.research.cost : n.level === 1 ? g.NUKE.enrich.cost : null;
    if (step && !n.job && !afford(p, step, 300)) p.saving = step;
    if (n.level === 0 && !n.job && afford(p, g.NUKE.research.cost, 300)) g.cmd(pid, { type: 'nukeResearch' });
    if (n.level === 1 && !n.job && afford(p, g.NUKE.enrich.cost, 300)) {
      const mine = g.terr.filter((t) => t.owner === pid && t.type !== 'capital');
      const caps = foes.map((x) => g.terr[x.capital]);
      const far = mine.sort((a, b) => Math.min(...caps.map((c) => dist(b, c))) - Math.min(...caps.map((c) => dist(a, c))))[0];
      const site = p.nukePlan === 'weapon' && far && Math.random() < 0.6 ? far : g.terr[p.capital];
      g.cmd(pid, { type: 'nukeEnrich', terr: site.id });
    }
  }
  if (p.nukePlan === 'weapon' && n.level >= 2 && n.fac !== null) {
    if (!n.weaponizing && !n.done && g.t >= g.NUKE.weapon.minT && p.res.money > 2500)
      g.cmd(pid, { type: 'nukeWeapon', pace: Math.random() < (AGGRESSIVE.includes(p.faction) ? 0.6 : 0.3) ? 'slow' : 'normal' });
    if (n.decoys.length < 1 && p.res.money > 3500 && Math.random() < 0.05) {
      const t = g.terr.find((x) => x.owner === pid && x.id !== n.fac && x.type !== 'capital');
      if (t) g.cmd(pid, { type: 'nukeDecoy', terr: t.id });
    }
    if (n.weaponizing && n.progress >= 1 && !n.testing) g.cmd(pid, { type: 'nukeTest' });
    if ((n.weaponizing && n.progress < 1) || (!n.weaponizing && !n.done && g.t >= g.NUKE.weapon.minT - 5 * 60)) p.saving = { money: 2500, oil: 1000, steel: 1200 };
  }

  // operations: watch suspicious rivals, find facilities, sabotage the ones close to a bomb
  if (p.intel >= 1 && g.t >= p.opReady && p.res.money > 900 && Math.random() < 0.5 && foes.length) {
    const armed = foes.filter((x) => seesStage(g, pid, x.id, ['weapon', 'test'], 'medium'));
    const x = armed[Math.floor(Math.random() * armed.length)];
    if (x) {
      const located = g.reports.some((r) => r.kind === 'locate' && r.target === x.id && g.reportVisible(r, pid) && r.data.site !== null);
      const cyber = p.res.money > 1700 && p.res.steel > 350 && (located || Math.random() < 0.5);
      g.cmd(pid, { type: 'op', op: cyber ? 'cyber' : located ? 'spy' : 'locate', target: x.id });
    } else {
      const sus = foes.filter((f) => (g.publicNuke[f.id] && g.publicNuke[f.id].stage !== 'none') || (p.rel[f.id] || 0) < 0);
      const pool = sus.length && Math.random() < 0.7 ? sus : foes;
      g.cmd(pid, { type: 'op', op: 'spy', target: pool[Math.floor(Math.random() * pool.length)].id });
    }
  }

  // fund partners' programmes once in a while
  for (const x of g.pacts) {
    if (x.partner !== pid || !['active', 'exposed'].includes(x.status) || x.paid >= g.NUKE.weaponValue * 0.25) continue;
    if (p.res.money > 3000 && Math.random() < 0.1) g.cmd(pid, { type: 'pactFund', id: x.id, res: { money: 500, steel: 200 } });
  }

  // trade surplus for whatever the plan is short of
  if (p.saving && Math.random() < 0.2) {
    const short = RES.find((r) => p.res[r] < (p.saving[r] || 0));
    const rich = RES.filter((r) => r !== short).sort((a, b) => (p.res[b] - (p.saving[b] || 0)) - (p.res[a] - (p.saving[a] || 0)))[0];
    const spare = short && p.res[rich] - (p.saving[rich] || 0) - 1000;
    if (spare > 300) g.cmd(pid, { type: 'market', give: rich, get: short, amount: Math.floor(Math.min(spare, ((p.saving[short] - p.res[short]) / g.marketRate(p)) + 50)) });
  }

  botCouncil(g, p, foes);
}

function botCouncil(g, p, foes) {
  const pid = p.id, s = g.council.session;
  if (!s) return;
  const myReports = (target) => g.reports.filter((r) => r.target === target && g.reportVisible(r, pid) && r.kind === 'spy' && ['weapon', 'test'].includes(r.data.stage));
  if (s.phase === 'propose' && s.chair === pid) {
    const armed = foes.filter((x) => myReports(x.id).some((r) => r.conf !== 'low'));
    const mine = g.measures.find((m) => m.target === pid || g.allies(m.target, pid));
    const teams = {};
    for (const x of Object.values(g.players)) teams[x.team] = (teams[x.team] || 0) + x.vp;
    const vps = Object.values(teams).sort((a, b) => b - a);
    const leader = foes.find((x) => teams[x.team] === vps[0] && vps[0] > 1.3 * (vps[1] || 0) + 50);
    if (armed.length) {
      const x = armed[0], r = myReports(x.id).sort((a, b) => (b.conf === 'high') - (a.conf === 'high'))[0];
      g.cmd(pid, { type: 'councilPropose', res: Math.random() < 0.6 ? 'sanctions' : 'authorize', target: x.id, report: r.id });
    } else if (mine) g.cmd(pid, { type: 'councilPropose', res: 'lift', target: mine.target });
    else if (leader) g.cmd(pid, { type: 'councilPropose', res: 'sanctions', target: leader.id });
    else if (g.t > g.NUKE.weapon.minT && Math.random() < 0.6 && foes.some((x) => g.publicNuke[x.id] && g.publicNuke[x.id].stage === 'enrich')) {
      // enriched states past minute 40 are the usual suspects
      const sus = foes.filter((x) => g.publicNuke[x.id] && g.publicNuke[x.id].stage === 'enrich');
      g.cmd(pid, { type: 'councilPropose', res: 'sanctions', target: sus[Math.floor(Math.random() * sus.length)].id });
    }
    else {
      const sus = foes.filter((x) => (p.rel[x.id] || 0) < 10);
      if (sus.length) g.cmd(pid, { type: 'councilPropose', res: 'inspect', target: sus[Math.floor(Math.random() * sus.length)].id });
    }
    return;
  }
  if (s.phase !== 'vote') return;
  const target = s.target;
  for (const r of myReports(target)) if (!s.evidence.some((e) => e.report === r.id)) { g.cmd(pid, { type: 'councilEvidence', report: r.id }); break; }
  if (s.votes[pid]) return;
  const friend = target === pid || g.allies(target, pid) || g.pacts.some((x) => x.owner === target && x.partner === pid && ['active', 'exposed'].includes(x.status));
  const rel = p.rel[target] || 0;
  let choice;
  if (s.res === 'lift') choice = friend || rel >= REL.pact ? 'yes' : rel < 0 ? 'no' : 'abstain';
  else if (friend) choice = 'no';
  else {
    const proof = s.evidence.some((e) => { const r = g.reports.find((y) => y.id === e.report); return r && r.kind === 'spy' && ['weapon', 'test'].includes(r.data.stage) && r.conf !== 'low'; });
    choice = proof || rel < 15 || (g.players[target].aggressor || 0) > g.t ? 'yes' : rel >= REL.pact ? 'no' : 'abstain';
  }
  g.cmd(pid, { type: 'councilVote', choice });
}

// build bases on held command centres (then farms) and keep them garrisoned
function botBases(g, p, hungry) {
  const pid = p.id;
  const mine = g.terr.filter((t) => t.owner === pid && t.type !== 'capital');
  const prio = (t) => (t.type === 'strategic' ? 3 : t.type === 'farm' ? 2 : 1);
  if (!p.baseBuild && Math.random() < 0.3) {
    const bases = mine.filter((t) => t.base > 0);
    let t = null;
    if (bases.length < g.baseLimit(p)) t = mine.filter((x) => !x.base).sort((a, b) => prio(b) - prio(a))[0];
    if (!t || prio(t) < 2) t = bases.filter((x) => x.base < 2 && x.type === 'strategic')[0] || t;
    if (t) {
      const c = g.BASE.cost[(t.base || 0) + 1];
      if (c && RES.every((r) => p.res[r] >= c[r] + 400)) g.cmd(pid, { type: 'buildBase', terr: t.id });
    }
  }
  if (hungry || Math.random() > 0.25) return;
  const pop = g.population(p), milQ = g.military(p, true);
  for (const t of mine) {
    if (!t.base || p.queue.some((q) => q.at === t.id)) continue;
    if (g.crew(t.units) > g.siteCap(t) * 0.8) continue;
    const u = t.base >= 2 && Math.random() < 0.5 ? (Math.random() < 0.5 ? 'tank' : p.techs.satellites ? 'abm' : 'sam') : Math.random() < 0.7 ? 'inf' : 'sam';
    const c = g.unitCost(p, u, t);
    const afford = Math.min(...RES.map((k) => (c[k] ? Math.floor(p.res[k] / c[k]) : 999)));
    const n = Math.min(afford, Math.floor((pop * 0.8 - milQ) / UNITS[u].crew), u === 'inf' ? 10 : 4);
    if (n > 0) { g.cmd(pid, { type: 'train', unit: u, count: n, at: t.id }); return; }
  }
}

// a testing site is everyone's problem; a located facility of an armed rival is worth a strike
function nukeTargetValue(g, p, t) {
  const o = g.players[t.owner];
  if (o.nuke.testing && o.nuke.fac === t.id) return 8;
  const located = g.reports.some((r) => r.kind === 'locate' && r.target === o.id && r.data.site === t.id && g.reportVisible(r, p.id) && r.conf !== 'low');
  return located && seesStage(g, p.id, o.id, ['weapon', 'test'], 'medium') ? 4 : 1;
}

function botTurn(g, pid) {
  const p = g.players[pid];
  if (!p || g.winner) return;
  const cap = g.terr[p.capital];
  botPolitics(g, p);
  botTech(g, p);
  if (g.nuclear) botNuclear(g, p);
  const pop = g.population(p), milQ = g.military(p, true);
  const foodNet = g.income(p).food - g.upkeep(p);
  const hungry = foodNet < 0 && p.res.food < 1500;
  // save up for the nuclear plan, unless under attack or it has dragged on too long
  let saving = !!p.saving && !RES.every((r) => p.res[r] >= (p.saving[r] ? p.saving[r] + 400 : 0));
  if (!saving) p.saveSince = null;
  else if (p.saveSince == null) p.saveSince = g.t;
  if (saving && g.t - p.saveSince > 23 * 60) p.saveSince = g.t; // a short spending break every 20 minutes
  if (saving && (g.t - p.saveSince > 20 * 60 || g.movements.some((m) => m.to === cap.id && m.owner !== pid && m.mission === 'attack'))) saving = false;

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
    if (!saving && g.canPay(p, g.upgradeCost(p, b)) && Math.random() < 0.6) g.cmd(pid, { type: 'upgrade', building: b });
  }

  // keep the factory busy while there is manpower and food
  if (p.queue.filter((q) => q.at === p.capital).length < 2 && !hungry && !saving && milQ < pop * 0.8) {
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

  if (!saving) botBases(g, p, hungry);

  // attack the most valuable reachable target we can beat
  if (g.movements.some((m) => m.owner === pid && m.mission === 'attack')) return;
  const myPower = power(g, p, cap.units);
  if (myPower < 150) return;
  const candidates = g.terr
    .filter((t) => willAttack(g, p, t.owner))
    .map((t) => {
      const D = estDefense(g, t, p);
      let value = t.type === 'strategic' ? 3 : t.type === 'un' ? 2.5 : t.type === 'capital' ? 1.2 : 1;
      if (g.nuclear && t.owner) value *= nukeTargetValue(g, p, t);
      if (hungry && t.type === 'farm') value *= 2.5;
      if (t.owner && (p.rel[t.owner] || 0) < REL.hostile) value *= 1.5;
      return { t, D, score: (value * 1000) / (dist(cap, t) + 100) / (1 + D / 500) };
    })
    .filter((c) => myPower > c.D * (g.nuclear && c.t.owner && nukeTargetValue(g, p, c.t) > 1 ? 1.1 : 1.4))
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
