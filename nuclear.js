// "Nuclear race" mode: secret weapons programmes, intelligence, the Security Council and secret pacts.
// Mixed into Game.prototype; everything here only runs when game.nuclear is true.

const { project } = require('./world');

const RES = ['money', 'oil', 'steel', 'food'];
const RES_ICON = { money: '💰', oil: '🛢️', steel: '🔩', food: '🌾' };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const full = (c) => ({ money: 0, oil: 0, steel: 0, food: 0, ...c });

const NUKE = {
  research: { cost: full({ money: 1800, oil: 700, steel: 900, food: 400 }), time: 6 * 60 },
  enrich:   { cost: full({ money: 3000, oil: 1500, steel: 1500 }), time: 12 * 60 },
  weapon:   { cost: full({ money: 7500, oil: 3000, steel: 3500 }), minT: 40 * 60 },
  pace: { slow: { name: '🐢 هادئة', min: 30, jam: -1 }, normal: { name: '⚖️ عادية', min: 22, jam: 0 }, fast: { name: '🐇 سريعة', min: 15, jam: 1 } },
  test: 3 * 60,
  civil: 1.15,
  decoy: full({ money: 800 }), maxDecoys: 2,
  vp: { capture: 60, strike: 40, raid: 30, cyber: 20, expose: 30, sanction: 20, test: 150 },
  partnerShare: 0.2, maxPartners: 2,
};
NUKE.weaponValue = RES.reduce((a, r) => a + NUKE.weapon.cost[r], 0);

const INTEL = {
  cost: { 1: full({ money: 600, steel: 200 }), 2: full({ money: 1200, steel: 400 }), 3: full({ money: 2000, steel: 700 }), 4: full({ money: 3000, steel: 1000 }), 5: full({ money: 4500, steel: 1500 }) },
  time: { 1: 3, 2: 5, 3: 7, 4: 9, 5: 12 }, // game-minutes
  fast: ['russia', 'uk'], fastMult: 0.6,
  cooldown: 8 * 60, fastCooldown: 5 * 60,
};
const OPS = {
  spy:     { name: '🕵️ تجسس نووي', cost: full({ money: 400 }), desc: 'مرحلة برنامجها وتقدمه التقريبي' },
  locate:  { name: '📍 تحديد المنشأة', cost: full({ money: 700 }), desc: 'مكان المنشأة السرية' },
  funding: { name: '💸 تتبع التمويل', cost: full({ money: 600 }), desc: 'من يموّل برنامجها بالسر' },
  cyber:   { name: '💻 تخريب سيبراني', cost: full({ money: 1500, steel: 300 }), desc: 'يرجّع التسليح 20٪. يحتاج تقرير سابق بثقة متوسطة أو أعلى' },
};
const CONF = {
  high:   { name: '🟢 عالية', right: 1, caught: 0.05 },
  medium: { name: '🟡 متوسطة', right: 0.85, caught: 0.15 },
  low:    { name: '🔴 ضعيفة', right: 0.6, caught: 0.3 },
};
const STAGES = { none: 'لا يوجد برنامج', research: '🔬 بحث نووي', enrich: '⚛️ تخصيب', weapon: '💣 تسليح', test: '💥 تجربة' };
const RESOLUTIONS = {
  sanctions: { name: '⛔ عقوبات اقتصادية', desc: 'الإنتاج −25٪ والتسليح أبطأ 25٪ لمدة 10 دقائق', dur: 10 * 60 },
  authorize: { name: '⚔️ تفويض عسكري', desc: 'أي هجوم عليه أقوى 20٪ لمدة 10 دقائق', dur: 10 * 60 },
  embargo:   { name: '🚢 حظر تجاري', desc: 'لا سوق ولا عروض ولا تمويل سري لمدة 10 دقائق', dur: 10 * 60 },
  inspect:   { name: '🔍 تفتيش دولي', desc: 'يعلن للكل إذا وصل للبحث أو التخصيب (لا يكشف التسليح)' },
  lift:      { name: '✅ رفع عقوبة', desc: 'يلغي كل العقوبات والحظر والتفويض الساري عليه' },
};
const COUNCIL = { every: 15 * 60, first: 15 * 60, length: 60, propose: 25, vote: 35 }; // length/propose/vote in real seconds
const UN_HQ = [
  { name: 'نيويورك', at: [-74, 40.7] }, { name: 'جنيف', at: [6.1, 46.2] }, { name: 'فيينا', at: [16.4, 48.2] },
  { name: 'نيروبي', at: [36.8, -1.3] }, { name: 'بانكوك', at: [100.5, 13.75] }, { name: 'أديس أبابا', at: [38.7, 9] },
  { name: 'سانتياغو', at: [-70.6, -33.4] }, { name: 'بيروت', at: [35.5, 33.9] }, { name: 'طوكيو', at: [139.7, 35.7] },
  { name: 'روما', at: [12.5, 41.9] }, { name: 'مونتريال', at: [-73.6, 45.5] }, { name: 'لاهاي', at: [4.3, 52.1] },
  { name: 'كاتماندو', at: [85.3, 27.7] }, { name: 'مكسيكو', at: [-99.1, 19.4] }, { name: 'ليما', at: [-77, -12] },
];
const UN_COUNT = 5, UN_VP = 5;
const REGION = { usa: 'أمريكا الشمالية', china: 'شرق آسيا', russia: 'أوراسيا', iran: 'الشرق الأوسط', pakistan: 'جنوب آسيا', india: 'جنوب آسيا', eu: 'أوروبا', uk: 'أوروبا', egypt: 'شمال أفريقيا', saudi: 'الشرق الأوسط' };

const NuclearMixin = {
  initNuclear() {
    this.reports = [];
    this.measures = [];          // {kind, target, until}
    this.pacts = [];             // {id, owner, partner, by, status: pending|active|exposed|betrayed|rejected, paid, payments}
    this.publicNuke = {};        // pid -> {stage, t} from inspections and tests
    this.order = Object.keys(this.players);
    this.council = { next: COUNCIL.first, n: 0, session: null, warned: 0, last: null };
    for (const p of Object.values(this.players)) {
      p.nuke = { level: 0, job: null, fac: null, weaponizing: false, progress: 0, pace: 'normal', testing: null, done: false, bank: full({}), decoys: [], leakT: 0, stalled: false };
      p.intel = INTEL.fast.includes(p.faction) ? 2 : 0;
      p.counter = 0;
      p.intelJob = null;
      p.opReady = 0;
    }
  },

  // influence centres: the set of real UN seats that is fairest to the capitals in play
  placeUN(terr, caps, fits) {
    const cand = UN_HQ.map((c) => ({ ...project(c.at[0], c.at[1]), name: c.name })).filter((c) => fits(c, 35));
    const n = Math.min(UN_COUNT, cand.length);
    let best = null;
    const pick = (start, chosen) => {
      if (chosen.length === n) {
        if (chosen.some((a, i) => chosen.some((b, j) => j > i && dist(a, b) < 60))) return;
        const near = caps.map((cap) => Math.min(...chosen.map((c) => dist(c, cap))));
        const score = Math.max(...near) + 0.5 * (Math.max(...near) - Math.min(...near));
        if (!best || score < best.score) best = { score, chosen: chosen.slice() };
        return;
      }
      for (let i = start; i < cand.length; i++) { chosen.push(cand[i]); pick(i + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    for (const c of best ? best.chosen : cand.slice(0, n)) terr.push({ x: c.x, y: c.y, name: c.name, type: 'un', owner: null });
  },

  // ---------- helpers ----------
  fastIntel(p) { return INTEL.fast.includes(p.faction); },
  intelCost(p, kind) {
    const lvl = (kind === 'agency' ? p.intel : p.counter) + 1, c = INTEL.cost[lvl];
    if (!c) return null;
    const m = kind === 'agency' && this.fastIntel(p) ? INTEL.fastMult : 1;
    return Object.fromEntries(RES.map((r) => [r, Math.round(c[r] * m)]));
  },
  intelTime(p, kind) {
    const lvl = (kind === 'agency' ? p.intel : p.counter) + 1;
    return INTEL.time[lvl] ? INTEL.time[lvl] * 60 * (kind === 'agency' && this.fastIntel(p) ? INTEL.fastMult : 1) : null;
  },
  measure(pid, kind) { return this.nuclear ? this.measures.find((m) => m.target === pid && m.kind === kind) : null; },
  civilBonus(p) { return this.nuclear && p.nuke.level >= 2 ? NUKE.civil : 1; },
  measureAttack(def) { return def && this.measure(def.id, 'authorize') ? 1.2 : 1; },
  embargoed(p) { return !!this.measure(p.id, 'embargo'); },
  stageOf(p) {
    const n = p.nuke;
    if (n.testing) return 'test';
    if (n.weaponizing) return 'weapon';
    if (n.level >= 2) return 'enrich';
    if (n.level >= 1 || n.job) return n.job && n.job.kind === 'enrich' ? 'enrich' : 'research';
    return 'none';
  },
  bucket(x) { return x < 0.34 ? 'بداية' : x < 0.67 ? 'منتصف' : 'قريب من النهاية'; },
  stageProgress(p) {
    const n = p.nuke;
    if (n.weaponizing) return n.progress;
    if (n.job) return 1 - n.job.remaining / n.job.total;
    return 1;
  },
  fundedShare(owner) { return clamp(this.pacts.filter((x) => x.owner === owner.id && ['active', 'exposed'].includes(x.status)).reduce((a, x) => a + x.paid, 0) / NUKE.weaponValue, 0, 1); },
  partnersOf(owner) { return this.pacts.filter((x) => x.owner === owner.id && ['pending', 'active', 'exposed'].includes(x.status)); },
  qualifiedPartners(owner) { return this.pacts.filter((x) => x.owner === owner.id && ['active', 'exposed'].includes(x.status) && x.paid >= NUKE.weaponValue * NUKE.partnerShare).map((x) => x.partner); },
  seatHolders() {
    const held = {};
    for (const t of this.terr) if (t.type === 'un' && t.owner) {
      const h = (held[t.owner] = held[t.owner] || { pid: t.owner, n: 0, first: Infinity });
      h.n++; h.first = Math.min(h.first, t.capturedAt || 0);
    }
    return Object.values(held).sort((a, b) => b.n - a.n || a.first - b.first).slice(0, this.seats).map((h) => h.pid);
  },
  reportVisible(r, pid) { return r.by === pid || this.allies(r.by, pid); },
  addMeasure(kind, target) {
    this.measures = this.measures.filter((m) => !(m.kind === kind && m.target === target));
    this.measures.push({ kind, target, until: this.t + RESOLUTIONS[kind].dur });
  },
  nukeLog(text, kind = 'warn') { this.addLog(null, text, kind); },

  // ---------- programme ----------
  cmdNukeResearch(p) {
    const n = p.nuke;
    if (n.level > 0 || n.job) return 'البحث النووي موجود بالفعل';
    if (!this.canPay(p, NUKE.research.cost)) return 'موارد غير كافية';
    this.pay(p, NUKE.research.cost);
    n.job = { kind: 'research', remaining: NUKE.research.time, total: NUKE.research.time };
    return null;
  },
  cmdNukeEnrich(p, c) {
    const n = p.nuke, t = this.terr[c.terr];
    if (n.level !== 1 || n.job) return 'يحتاج إكمال البحث النووي أولاً';
    if (!t || t.owner !== p.id) return 'اختر موقعاً تملكه للمنشأة';
    if (n.decoys.includes(t.id)) return 'هذا الموقع فيه منشأة وهمية';
    if (!this.canPay(p, NUKE.enrich.cost)) return 'موارد غير كافية';
    this.pay(p, NUKE.enrich.cost);
    n.fac = t.id;
    n.job = { kind: 'enrich', remaining: NUKE.enrich.time, total: NUKE.enrich.time };
    return null;
  },
  cmdNukeWeapon(p, c) {
    const n = p.nuke;
    if (n.done) return 'أجريت تجربتك النووية بالفعل';
    if (n.level < 2 || n.fac === null) return 'يحتاج إكمال التخصيب أولاً';
    if (n.weaponizing) return 'التسليح جارٍ بالفعل';
    if (this.t < NUKE.weapon.minT) return `التسليح غير متاح قبل الدقيقة ${NUKE.weapon.minT / 60}`;
    n.weaponizing = true; n.progress = 0; n.pace = NUKE.pace[c.pace] ? c.pace : 'normal'; n.leakT = this.t;
    this.addLog(p.id, '💣 بدأ التسليح بالسر. التكلفة تُدفع بالتدريج من مواردك', 'warn');
    return null;
  },
  cmdNukePace(p, c) {
    if (!NUKE.pace[c.pace]) return 'طلب غير صالح';
    p.nuke.pace = c.pace;
    return null;
  },
  cmdNukeTest(p) {
    const n = p.nuke;
    if (!n.weaponizing || n.progress < 1) return 'السلاح غير جاهز';
    if (n.testing) return 'التجربة جارية';
    n.testing = { until: this.t + NUKE.test };
    this.publicNuke[p.id] = { stage: 'test', t: this.t };
    this.nukeLog(`🌋 زلزال مشبوه في أراضي ${p.name}! تجربة نووية خلال ${NUKE.test / 60} دقائق. المنشأة في ${this.tname(this.terr[n.fac])}، اضربها أو احتلها لإفشال التجربة`, 'bad');
    for (const b of Object.values(this.players)) if (b.bot && !this.allies(b.id, p.id)) this.changeRel(b.id, p.id, -25, false);
    return null;
  },
  cmdNukeDecoy(p, c) {
    const t = this.terr[c.terr], n = p.nuke;
    if (!t || t.owner !== p.id) return 'اختر موقعاً تملكه';
    if (n.fac === t.id || n.decoys.includes(t.id)) return 'هذا الموقع مستخدم';
    if (n.decoys.length >= NUKE.maxDecoys) return `الحد الأقصى ${NUKE.maxDecoys} منشآت وهمية`;
    if (!this.canPay(p, NUKE.decoy)) return 'موارد غير كافية';
    this.pay(p, NUKE.decoy);
    n.decoys.push(t.id);
    return null;
  },

  // ---------- intelligence ----------
  cmdIntelUpgrade(p, c) {
    const kind = c.kind === 'counter' ? 'counter' : 'agency';
    if (p.intelJob) return 'يوجد تطوير استخباراتي قيد التنفيذ';
    const cost = this.intelCost(p, kind);
    if (!cost) return 'وصلت للمستوى الأقصى';
    if (!this.canPay(p, cost)) return 'موارد غير كافية';
    this.pay(p, cost);
    const time = this.intelTime(p, kind);
    p.intelJob = { kind, remaining: time, total: time };
    return null;
  },
  cmdOp(p, c) {
    const O = OPS[c.op], target = this.players[c.target];
    if (!O) return 'طلب غير صالح';
    if (p.intel < 1) return 'تحتاج جهاز استخبارات مستوى 1 على الأقل';
    if (!target || target === p || this.allies(target.id, p.id)) return 'هدف غير صالح';
    if (this.t < p.opReady) return 'جهاز الاستخبارات مشغول، انتظر انتهاء العملية السابقة';
    if (c.op === 'cyber' && !this.reports.some((r) => r.target === target.id && this.reportVisible(r, p.id) && r.conf !== 'low'))
      return 'التخريب يحتاج تقرير سابق عن هالدولة بثقة متوسطة أو أعلى';
    if (!this.canPay(p, O.cost)) return 'موارد غير كافية';
    this.pay(p, O.cost);
    p.opReady = this.t + (this.fastIntel(p) ? INTEL.fastCooldown : INTEL.cooldown);
    this.runOp(p, target, c.op);
    return null;
  },
  confidence(p, target, op) {
    const n = target.nuke;
    let diff = p.intel + (this.has(p, 'satellites') ? 1 : 0) - target.counter;
    if (n.weaponizing && !n.testing) diff += NUKE.pace[n.pace].jam;
    if (n.fac !== null && this.terr[n.fac].type === 'capital') diff += 1; // the capital is the first place everyone looks
    if (op === 'funding') diff += Math.min(2, Math.floor(this.pacts.filter((x) => x.owner === target.id).reduce((a, x) => a + x.payments, 0) / 2));
    return diff >= 3 ? 'high' : diff >= 1 ? 'medium' : 'low';
  },
  runOp(p, target, op) {
    const conf = this.confidence(p, target, op), C = CONF[conf];
    const right = this.rand() < C.right;
    const caught = this.rand() < C.caught;
    if (caught) {
      this.addLog(target.id, `🛡️ مكافحة التجسس كشفت عملية ${OPS[op].name} من ${p.name} ضدك`, 'bad');
      this.addLog(p.id, `⚠️ انكشفت عمليتك ضد ${target.name}. العلاقة تضررت`, 'bad');
      if (target.bot) this.changeRel(target.id, p.id, -15, false);
    }
    if (op === 'cyber') {
      const n = target.nuke;
      if (n.weaponizing && !n.done) {
        n.progress = Math.max(0, n.progress - 0.2);
        p.vp += NUKE.vp.cyber;
        this.addLog(p.id, `💻 نجح التخريب السيبراني: برنامج ${target.name} تراجع 20٪ (+${NUKE.vp.cyber} نقطة)`, 'good');
        this.addLog(target.id, '💻 هجوم سيبراني على منشأتك أرجع التسليح 20٪', 'bad');
      } else this.addLog(p.id, `💻 اخترقنا أنظمة ${target.name} ولم نجد أي برنامج تسليح نخرّبه`, 'warn');
      return;
    }
    const data = right ? this.opTruth(target, op) : this.opLie(target, op);
    const r = { id: this.nextId++, by: p.id, target: target.id, kind: op, conf, data, right, t: this.t };
    this.reports.push(r);
    this.addLog(p.id, `${OPS[op].name} عن ${target.name} (ثقة ${C.name}): ${this.reportText(r)}`, 'good');
  },
  opTruth(target, op) {
    const n = target.nuke;
    if (op === 'spy') {
      const stage = this.stageOf(target);
      return { stage, progress: stage === 'none' ? null : this.bucket(this.stageProgress(target)), money: this.pacts.some((x) => x.owner === target.id && x.payments > 0) };
    }
    if (op === 'locate') {
      if (n.fac === null) return { site: null };
      // a weaker report may be fooled by a decoy
      if (this.terr[n.fac].type === 'capital') return { site: n.fac };
      return { site: n.decoys.length && this.rand() < 0.4 ? n.decoys[Math.floor(this.rand() * n.decoys.length)] : n.fac };
    }
    return { partners: this.pacts.filter((x) => x.owner === target.id && ['active', 'exposed'].includes(x.status) && x.paid > 0).map((x) => x.partner) };
  },
  opLie(target, op) {
    if (op === 'spy') {
      const real = this.stageOf(target), opts = ['none', 'research', 'enrich', 'weapon'].filter((s) => s !== real);
      const stage = opts[Math.floor(this.rand() * opts.length)];
      return { stage, progress: stage === 'none' ? null : this.bucket(this.rand()), money: this.rand() < 0.2 };
    }
    if (op === 'locate') {
      const n = target.nuke;
      if (n.decoys.length) return { site: n.decoys[Math.floor(this.rand() * n.decoys.length)] };
      const sites = this.terr.filter((t) => t.owner === target.id && t.id !== n.fac);
      return { site: sites.length ? sites[Math.floor(this.rand() * sites.length)].id : null };
    }
    const others = Object.values(this.players).filter((x) => x.id !== target.id && !this.allies(x.id, target.id));
    return { partners: this.rand() < 0.5 || !others.length ? [] : [others[Math.floor(this.rand() * others.length)].id] };
  },
  reportText(r) {
    const d = r.data;
    if (r.kind === 'spy') return `${STAGES[d.stage]}${d.progress ? ` (${d.progress})` : ''}${d.money ? ' · نشاط مالي مريب' : ''}`;
    if (r.kind === 'locate') return d.site === null ? 'لا توجد منشأة' : `المنشأة في ${this.tname(this.terr[d.site])}`;
    return d.partners.length ? `ممولون سريون: ${d.partners.map((id) => this.players[id].name).join(' و')}` : 'لا يوجد تمويل خارجي';
  },

  // ---------- secret pacts ----------
  cmdPactOffer(p, c) {
    const to = this.players[c.to];
    if (!to || to === p || this.allies(to.id, p.id)) return 'اختر دولة ليست في تحالفك';
    if (p.nuke.level < 2 && !p.nuke.weaponizing) return 'تحتاج إكمال التخصيب قبل عرض شراكة';
    if (p.nuke.done) return 'أجريت تجربتك بالفعل';
    return this.newPact(p, to, p);
  },
  cmdPactSupport(p, c) {
    const owner = this.players[c.to];
    if (!owner || owner === p || this.allies(owner.id, p.id)) return 'اختر دولة ليست في تحالفك';
    const known = this.reports.some((r) => r.target === owner.id && this.reportVisible(r, p.id) && r.kind === 'spy' && ['enrich', 'weapon'].includes(r.data.stage));
    if (!known) return 'تحتاج تقرير استخباراتي يكشف إن عندها برنامج تخصيب أو تسليح';
    return this.newPact(owner, p, p);
  },
  newPact(owner, partner, by) {
    if (this.partnersOf(owner).length >= NUKE.maxPartners) return `البرنامج عنده ${NUKE.maxPartners} شركاء بالفعل`;
    if (this.pacts.some((x) => x.owner === owner.id && x.partner === partner.id && ['pending', 'active', 'exposed'].includes(x.status))) return 'يوجد عرض أو شراكة بالفعل';
    const x = { id: this.nextId++, owner: owner.id, partner: partner.id, by: by.id, status: 'pending', paid: 0, payments: 0, t: this.t };
    this.pacts.push(x);
    const other = by === owner ? partner : owner;
    if (other.bot) {
      const ok = (other.rel[by.id] || 0) >= 50;
      this.answerPact(x, ok);
      if (!ok) return `${other.name} رفض الشراكة السرية (يحتاج علاقة 50 على الأقل)`;
    } else this.addLog(other.id, by === owner ? `🤫 ${owner.name} يعرض عليك شراكة سرية في برنامجه النووي. افتح تبويب الاستخبارات` : `🤫 ${partner.name} يعرض دعم برنامجك النووي بالسر. افتح تبويب الاستخبارات`, 'warn');
    return null;
  },
  cmdPactAnswer(p, c) {
    const x = this.pacts.find((y) => y.id === c.id && y.status === 'pending');
    if (!x) return 'العرض غير موجود';
    const other = x.by === x.owner ? x.partner : x.owner;
    if (other !== p.id) return 'العرض ليس لك';
    this.answerPact(x, !!c.accept);
    return null;
  },
  answerPact(x, ok) {
    const owner = this.players[x.owner], partner = this.players[x.partner];
    if (!ok) { x.status = 'rejected'; this.addLog(x.by, `❌ رُفض عرض الشراكة السرية بين ${owner.name} و${partner.name}`, 'bad'); return; }
    x.status = 'active';
    for (const id of [x.owner, x.partner]) this.addLog(id, `🤫 تم عقد شراكة سرية: ${partner.name} يدعم برنامج ${owner.name}. يحتاج تمويل ${Math.round(NUKE.partnerShare * 100)}٪ (${Math.round(NUKE.weaponValue * NUKE.partnerShare)}) للفوز معه`, 'good');
  },
  cmdPactFund(p, c) {
    const x = this.pacts.find((y) => y.id === c.id && y.partner === p.id && ['active', 'exposed'].includes(y.status));
    if (!x) return 'الشراكة غير موجودة';
    const owner = this.players[x.owner];
    if (this.embargoed(owner)) return `${owner.name} تحت حظر تجاري ولا يقدر يستلم تمويل`;
    if (this.embargoed(p)) return 'أنت تحت حظر تجاري';
    const amt = {};
    let sum = 0;
    for (const r of ['money', 'oil', 'steel']) { amt[r] = Math.max(0, Math.floor((c.res && c.res[r]) || 0)); sum += amt[r]; }
    if (!sum) return 'حدد مبلغ التمويل';
    if (!this.canPay(p, amt)) return 'موارد غير كافية';
    this.pay(p, amt);
    for (const r in amt) owner.nuke.bank[r] += amt[r];
    x.paid += sum; x.payments++;
    this.addLog(p.id, `💸 حوّلت ${sum} سراً لبرنامج ${owner.name} (إجمالي مساهمتك ${Math.round((100 * x.paid) / NUKE.weaponValue)}٪)`, 'good');
    this.addLog(owner.id, `💸 وصل تمويل سري من ${p.name}: ${Object.entries(amt).filter(([, v]) => v).map(([r, v]) => RES_ICON[r] + v).join(' ')}`, 'good');
    return null;
  },
  exposePact(x, how) {
    if (x.status !== 'active') return;
    x.status = 'exposed';
    const partner = this.players[x.partner], owner = this.players[x.owner];
    this.addMeasure('sanctions', partner.id);
    partner.vp = Math.max(0, partner.vp - 30);
    for (const b of Object.values(this.players)) if (b.bot && b.id !== owner.id && !this.allies(b.id, partner.id)) this.changeRel(b.id, partner.id, -40, false);
    this.nukeLog(`🚨 فضيحة: ${how} كشف أن ${partner.name} يموّل برنامج ${owner.name} النووي بالسر! عقوبات تلقائية 10 دقائق و−30 نقطة`, 'bad');
  },

  // ---------- Security Council ----------
  sessionTargets(chair, res) {
    return Object.values(this.players).filter((x) => res === 'lift' ? this.measures.some((m) => m.target === x.id) : x.id !== chair && !this.allies(x.id, chair));
  },
  cmdCouncilPropose(p, c) {
    const s = this.council.session;
    if (!s || s.phase !== 'propose') return 'لا توجد جلسة بانتظار قرار';
    if (s.chair !== p.id) return 'الرئيس فقط يطرح القرار';
    if (!RESOLUTIONS[c.res]) return 'قرار غير صالح';
    const target = this.players[c.target];
    if (!target || !this.sessionTargets(p.id, c.res).includes(target)) return c.res === 'lift' ? 'هالدولة ما عليها شي يُرفع' : 'لا يمكنك استهداف نفسك أو حلفائك';
    s.res = c.res; s.target = target.id; s.phase = 'vote';
    s.until = this.t + COUNCIL.vote * this.speed;
    s.votes[p.id] = 'yes';
    this.nukeLog(`🏛️ ${p.name} يطرح على مجلس الأمن: ${RESOLUTIONS[c.res].name} على ${target.name}. صوّتوا الآن!`);
    if (c.report) this.cmdCouncilEvidence(p, { report: c.report });
    return null;
  },
  cmdCouncilEvidence(p, c) {
    const s = this.council.session;
    if (!s || s.phase !== 'vote') return 'لا يوجد قرار مطروح';
    const target = this.players[s.target];
    let r;
    const pact = this.pacts.find((x) => x.owner === target.id && x.partner === p.id && ['active', 'exposed'].includes(x.status));
    if (c.insider) {
      // a partner leaks what they know from the inside
      if (!pact) return 'لست شريكاً في برنامجها';
      r = { id: this.nextId++, by: p.id, target: target.id, kind: 'spy', conf: 'high', data: this.opTruth(target, 'spy'), right: true, t: this.t, insider: true };
      this.reports.push(r);
    } else {
      r = this.reports.find((y) => y.id === c.report && this.reportVisible(y, p.id));
      if (!r) return 'التقرير غير موجود';
      if (r.target !== target.id) return 'التقرير عن دولة ثانية';
    }
    if (s.evidence.some((e) => e.report === r.id)) return 'التقرير مقدّم بالفعل';
    s.evidence.push({ report: r.id, by: p.id });
    this.nukeLog(`📄 ${p.name} قدّم تقرير ${OPS[r.kind].name} بثقة ${CONF[r.conf].name}: ${this.reportText(r)}`);
    if (pact && pact.status === 'active') {
      pact.status = 'betrayed';
      this.nukeLog(`🗡️ ${p.name} انقلب على شريكه ${target.name} وكشف أسراره أمام المجلس!`, 'bad');
    }
    // a high-confidence money trail is public proof on its own
    if (r.kind === 'funding' && r.conf === 'high' && r.right) {
      for (const pid of r.data.partners) {
        const x = this.pacts.find((y) => y.owner === target.id && y.partner === pid);
        if (x) this.exposePact(x, `تقرير ${this.players[r.by].name}`);
      }
    }
    return null;
  },
  cmdCouncilVote(p, c) {
    const s = this.council.session;
    if (!s || s.phase !== 'vote') return 'لا يوجد تصويت الآن';
    if (!['yes', 'no', 'abstain'].includes(c.choice)) return 'طلب غير صالح';
    s.votes[p.id] = c.choice;
    return null;
  },
  startSession() {
    const c = this.council;
    const chair = this.order[c.n % this.order.length];
    c.n++;
    c.session = { id: this.nextId++, n: c.n, chair, phase: 'propose', until: this.t + COUNCIL.propose * this.speed, res: null, target: null, evidence: [], votes: {} };
    this.nukeLog(`🏛️ جلسة مجلس الأمن رقم ${c.n} بدأت برئاسة ${this.players[chair].name}`);
  },
  tally(s) {
    const seats = this.seatHolders();
    let yes = 0, no = 0;
    for (const [pid, v] of Object.entries(s.votes)) {
      const w = seats.includes(pid) ? 2 : 1;
      if (v === 'yes') yes += w; else if (v === 'no') no += w;
    }
    return { yes, no, seats };
  },
  endSession() {
    const s = this.council.session;
    this.council.session = null;
    this.council.last = { n: s.n, res: s.res, target: s.target, passed: false };
    if (s.phase === 'propose') return this.nukeLog(`🏛️ انتهت الجلسة ${s.n} بدون قرار`);
    const { yes, no } = this.tally(s);
    const target = this.players[s.target], R = RESOLUTIONS[s.res];
    if (yes <= no) return this.nukeLog(`🏛️ سقط قرار ${R.name} على ${target.name} (مع ${yes} / ضد ${no})`);
    this.council.last.passed = true;
    this.nukeLog(`🏛️ أقر المجلس ${R.name} على ${target.name} (مع ${yes} / ضد ${no})`);
    const n = target.nuke, armed = n.weaponizing && !n.done;
    if (s.res === 'lift') this.measures = this.measures.filter((m) => m.target !== target.id);
    else if (s.res === 'inspect') {
      const lvl = n.level >= 2 || (n.job && n.job.kind === 'enrich') ? 'enrich' : n.level >= 1 || n.job ? 'research' : 'none';
      this.publicNuke[target.id] = { stage: lvl, t: this.t };
      this.nukeLog(`🔍 نتيجة التفتيش الدولي في ${target.name}: ${STAGES[lvl]}`);
    } else this.addMeasure(s.res, target.id);
    if (!['sanctions', 'authorize', 'embargo'].includes(s.res)) return;
    if (armed) {
      const credited = new Set();
      for (const e of s.evidence) {
        const r = this.reports.find((y) => y.id === e.report);
        if (r && r.kind === 'spy' && ['weapon', 'test'].includes(r.data.stage) && !credited.has(e.by)) {
          credited.add(e.by);
          this.players[e.by].vp += NUKE.vp.expose;
          this.nukeLog(`📢 ${this.players[e.by].name} فضح برنامج تسليح ${target.name} (+${NUKE.vp.expose} نقطة)`, 'good');
        }
      }
      if (s.res === 'sanctions') { this.players[s.chair].vp += NUKE.vp.sanction; this.addLog(s.chair, `⛔ عقوباتك أبطأت برنامج تسليح حقيقي (+${NUKE.vp.sanction} نقطة)`, 'good'); }
    }
    // partners named in a money-trail report presented at a passing resolution are exposed
    for (const e of s.evidence) {
      const r = this.reports.find((y) => y.id === e.report);
      if (!r || r.kind !== 'funding') continue;
      for (const pid of r.data.partners) {
        const x = this.pacts.find((y) => y.owner === target.id && y.partner === pid);
        if (x) this.exposePact(x, 'قرار مجلس الأمن');
      }
    }
  },

  // ---------- strikes on facilities (called from battle) ----------
  onSiteHit(p, def, to, kind) {
    if (!this.nuclear || !def) return;
    const n = def.nuke;
    if (kind === 'capture' && n.decoys.includes(to.id)) n.decoys = n.decoys.filter((x) => x !== to.id);
    if (n.fac === to.id) {
      const armed = (n.weaponizing && !n.done) || n.testing;
      if (n.testing) { n.testing = null; this.nukeLog(`💥 ${p.name} أفشل التجربة النووية لـ ${def.name}!`, 'good'); }
      let vp = 0, what;
      if (kind === 'capture') {
        n.fac = null; n.level = 1; n.weaponizing = false; n.progress = 0; n.job = null;
        vp = NUKE.vp.capture; what = 'احتل المنشأة النووية ودمّر البرنامج بالكامل';
      } else if (kind === 'strike') {
        n.progress = Math.max(0, n.progress - 0.35); vp = NUKE.vp.strike; what = 'ضرب المنشأة النووية وأرجع التسليح 35٪';
      } else {
        n.progress = Math.max(0, n.progress - 0.25); vp = NUKE.vp.raid; what = 'اقتحم العاصمة وخرّب المنشأة فيها (−25٪)';
      }
      if (armed) { p.vp += vp; this.nukeLog(`☢️ ${p.name} ${what} لدى ${def.name} (+${vp} نقطة)`, 'good'); }
      else if (kind === 'capture') this.addLog(def.id, `⚛️ خسرت منشأة التخصيب في ${this.tname(to)}، برنامجك رجع لمرحلة البحث`, 'bad');
      return;
    }
    const suspected = this.reports.some((r) => r.kind === 'locate' && r.target === def.id && r.data.site === to.id && this.reportVisible(r, p.id));
    if (suspected) {
      for (const b of Object.values(this.players)) if (b.bot && b.id !== def.id && !this.allies(b.id, p.id)) this.changeRel(b.id, p.id, -15, false);
      p.aggressor = this.t + 15 * 60;
      this.nukeLog(`⚠️ ${p.name} ضرب ${this.tname(to)} بحجة منشأة نووية، وما كان فيه شيء! استنكار دولي`, 'bad');
    }
  },

  // ---------- simulation ----------
  tickNuclear(dt) {
    const c = this.council;
    if (!c.session && this.t >= c.next - 2 * 60 && c.warned < c.next && c.next < this.endT) {
      c.warned = c.next;
      this.addLog(this.order[c.n % this.order.length], '🏛️ أنت رئيس جلسة مجلس الأمن القادمة بعد دقيقتين. جهّز قرارك وأدلتك', 'warn');
    }
    if (!c.session && this.t >= c.next && c.next < this.endT) { this.startSession(); c.next += COUNCIL.every; }
    if (c.session && this.t >= c.session.until) this.endSession();
    for (const m of [...this.measures]) if (this.t >= m.until) {
      this.measures = this.measures.filter((x) => x !== m);
      this.addLog(null, `🏛️ انتهى ${RESOLUTIONS[m.kind].name} على ${this.players[m.target].name}`);
    }
    for (const t of this.terr) if (t.type === 'un' && t.owner) this.players[t.owner].vp += (UN_VP * dt) / 60;
    for (const p of Object.values(this.players)) {
      const n = p.nuke;
      if (p.intelJob && (p.intelJob.remaining -= dt) <= 0) {
        const k = p.intelJob.kind;
        if (k === 'agency') p.intel++; else p.counter++;
        this.addLog(p.id, k === 'agency' ? `🕵️ جهاز الاستخبارات وصل للمستوى ${p.intel}` : `🛡️ مكافحة التجسس وصلت للمستوى ${p.counter}`, 'good');
        p.intelJob = null;
      }
      if (n.job) {
        if (n.job.kind === 'enrich' && (n.fac === null || this.terr[n.fac].owner !== p.id)) { n.job = null; n.fac = null; }
        else if ((n.job.remaining -= dt) <= 0) {
          n.level = n.job.kind === 'research' ? 1 : 2;
          this.addLog(p.id, n.level === 1 ? '🔬 اكتمل البحث النووي. تقدر الحين تبني منشأة تخصيب' : '⚛️ اكتمل التخصيب: إنتاجك كله +15٪ (طاقة مدنية). التسليح متاح من الدقيقة 40', 'good');
          n.job = null;
        }
      }
      if (n.fac !== null && this.terr[n.fac].owner !== p.id) { n.fac = null; n.level = Math.min(n.level, 1); n.weaponizing = false; n.progress = 0; n.testing = null; }
      if (n.weaponizing && n.progress < 1 && !n.testing) this.tickWeapon(p, dt);
      if (n.testing && this.t >= n.testing.until) this.testSucceeds(p);
    }
  },
  tickWeapon(p, dt) {
    const n = p.nuke;
    const rate = (dt / (NUKE.pace[n.pace].min * 60)) * (this.measure(p.id, 'sanctions') ? 0.75 : 1) * (1 + 0.5 * this.fundedShare(p));
    const step = Math.min(rate, 1 - n.progress);
    const due = {};
    for (const r of RES) due[r] = NUKE.weapon.cost[r] * step;
    // the secret fund pays first, then the national budget
    const fromBank = {}, fromRes = {};
    for (const r of RES) { fromBank[r] = Math.min(n.bank[r], due[r]); fromRes[r] = due[r] - fromBank[r]; }
    if (!this.canPay(p, fromRes)) {
      if (!n.stalled) this.addLog(p.id, '💣 التسليح متوقف: مواردك ما تكفي للدفعات', 'bad');
      n.stalled = true;
      return;
    }
    n.stalled = false;
    for (const r of RES) n.bank[r] -= fromBank[r];
    this.pay(p, fromRes);
    n.progress += step;
    if (n.progress >= 1) { n.progress = 1; this.addLog(p.id, '💣 السلاح جاهز! أعلن التجربة من تبويب الاستخبارات متى ما تبي', 'good'); }
    if (n.pace === 'fast' && this.t - n.leakT >= 10 * 60) {
      n.leakT = this.t;
      this.nukeLog(`📡 تسريبات: نشاط نووي مريب في منطقة ${REGION[p.faction] || 'غير معروفة'}`);
    }
  },
  testSucceeds(p) {
    const n = p.nuke;
    n.testing = null; n.done = true; n.weaponizing = false;
    const partners = this.qualifiedPartners(p);
    if (this.nukeWin === 'win') {
      this.publicNuke[p.id] = { stage: 'test', t: this.t };
      return this.finish(p.team, `نجحت التجربة النووية لـ ${p.name}`, partners);
    }
    p.vp += NUKE.vp.test;
    for (const id of partners) this.players[id].vp += NUKE.vp.test / 2;
    this.nukeLog(`☢️ نجحت التجربة النووية لـ ${p.name}! صار قوة نووية (+${NUKE.vp.test} نقطة${partners.length ? ` وشركاؤه السريون ${partners.map((id) => this.players[id].name).join(' و')} +${NUKE.vp.test / 2}` : ''})`, 'bad');
  },

  // ---------- view ----------
  nuclearView(pid) {
    const me = this.players[pid], n = me.nuke, rs = (x) => x / this.speed;
    const s = this.council.session;
    const vis = this.reports.filter((r) => this.reportVisible(r, pid));
    const reportOut = (r) => ({ id: r.id, by: r.by, target: r.target, kind: r.kind, conf: r.conf, data: r.data, text: this.reportText(r), ago: rs(this.t - r.t), insider: !!r.insider });
    const tally = s ? this.tally(s) : null;
    const myPacts = this.pacts.filter((x) => (x.owner === pid || x.partner === pid) && x.status !== 'rejected').map((x) => {
      const o = { id: x.id, owner: x.owner, partner: x.partner, by: x.by, status: x.status, paid: x.paid, share: x.paid / NUKE.weaponValue };
      if (x.partner === pid && ['active', 'exposed'].includes(x.status)) { const ow = this.players[x.owner]; o.ownerStage = this.stageOf(ow); o.ownerProgress = this.stageProgress(ow); }
      return o;
    });
    const testing = Object.values(this.players).filter((p) => p.nuke.testing).map((p) => ({ owner: p.id, fac: p.nuke.fac, remaining: rs(p.nuke.testing.until - this.t) }));
    return {
      mode: 'nuclear', nukeWin: this.nukeWin, seats: this.seats,
      council: {
        n: this.council.n, next: rs(this.council.next - this.t), chairNext: this.order[this.council.n % this.order.length], last: this.council.last,
        session: s ? {
          id: s.id, n: s.n, chair: s.chair, phase: s.phase, res: s.res, target: s.target, remaining: rs(s.until - this.t),
          evidence: s.evidence.map((e) => reportOut(this.reports.find((r) => r.id === e.report))),
          yes: tally.yes, no: tally.no, voters: Object.keys(s.votes).length, mine: s.votes[pid] || null,
          targets: s.phase === 'propose' && s.chair === pid ? Object.fromEntries(Object.keys(RESOLUTIONS).map((k) => [k, this.sessionTargets(pid, k).map((x) => x.id)])) : null,
        } : null,
      },
      seatHolders: tally ? tally.seats : this.seatHolders(),
      measures: this.measures.map((m) => ({ kind: m.kind, target: m.target, remaining: rs(m.until - this.t) })),
      publicNuke: this.publicNuke, testing,
      nukeMe: {
        level: n.level, stage: this.stageOf(me), job: n.job ? { kind: n.job.kind, remaining: rs(n.job.remaining), total: rs(n.job.total) } : null,
        fac: n.fac, weaponizing: n.weaponizing, progress: n.progress, pace: n.pace, testing: n.testing ? rs(n.testing.until - this.t) : null,
        done: n.done, bank: n.bank, decoys: n.decoys, stalled: n.stalled, funded: this.fundedShare(me),
        weaponOpensIn: rs(Math.max(0, NUKE.weapon.minT - this.t)),
        weaponEta: n.weaponizing && n.progress < 1 ? rs(((1 - n.progress) * NUKE.pace[n.pace].min * 60) / ((this.measure(pid, 'sanctions') ? 0.75 : 1) * (1 + 0.5 * this.fundedShare(me)))) : null,
        intel: me.intel, counter: me.counter, intelJob: me.intelJob ? { ...me.intelJob, remaining: rs(me.intelJob.remaining), total: rs(me.intelJob.total) } : null,
        intelCost: { agency: this.intelCost(me, 'agency'), counter: this.intelCost(me, 'counter') },
        intelTime: { agency: this.intelTime(me, 'agency') && rs(this.intelTime(me, 'agency')), counter: this.intelTime(me, 'counter') && rs(this.intelTime(me, 'counter')) },
        opIn: rs(Math.max(0, me.opReady - this.t)),
        reports: vis.slice(-30).reverse().map(reportOut),
        pacts: myPacts,
      },
    };
  },
  // markers the map may show to this player
  nuclearTerr(pid, o, t) {
    const me = this.players[pid];
    if (t.owner === pid) { if (me.nuke.fac === t.id) o.fac = 'mine'; else if (me.nuke.decoys.includes(t.id)) o.fac = 'decoy'; }
    else if (t.owner && this.players[t.owner].nuke.testing && this.players[t.owner].nuke.fac === t.id) o.fac = 'testing';
    else if (t.owner && this.reports.some((r) => r.kind === 'locate' && r.target === t.owner && r.data.site === t.id && this.reportVisible(r, pid))) o.fac = 'suspect';
  },
};

module.exports = { NuclearMixin, NUKE, INTEL, OPS, CONF, STAGES, RESOLUTIONS, COUNCIL, UN_VP };
