// Game rules and simulation. All timings are in "game seconds"; a match is always
// 120 game-minutes long and `speed` compresses or stretches it into real time.

const { WORLD, WORLD_DRAW, CAPITALS, CHOKEPOINTS, SITES, project } = require('./world');

const GAME_MINUTES = 120;

const RES = ['money', 'oil', 'steel', 'food'];
const RES_NAME = { money: 'مال', oil: 'نفط', steel: 'فولاذ', food: 'غذاء' };
const RES_ICON = { money: '💰', oil: '🛢️', steel: '🔩', food: '🌾' };

// Every faction gets strengths and (except where the strength is narrow) a weakness.
// Fields left out fall back to FACTION_DEFAULTS.
const FACTION_DEFAULTS = {
  buildTime: 1, cost: 1, unitCost: {}, attack: 1, unitAtt: {}, defense: 1, capitalDefense: 1,
  prod: { money: 1, oil: 1, steel: 1, food: 1 }, pop: 1, upkeep: 1, intel: false, scoutAlways: false,
  seeIncoming: false, diplomacy: 1, market: 0.6,
};
const FACTIONS_RAW = {
  china:    { name: 'الصين', flag: '🇨🇳', pros: ['إنتاج ضخم: تصنيع الوحدات أسرع 30٪', 'الوحدات أرخص 10٪', 'إنتاج الفولاذ +15٪'], cons: ['إنتاج الغذاء -10٪'],
              buildTime: 0.7, cost: 0.9, prod: { steel: 1.15, food: 0.9 } },
  usa:      { name: 'أمريكا', flag: '🇺🇸', pros: ['قوة هجوم كل الوحدات +20٪', 'إنتاج المال +10٪'], cons: ['الوحدات أغلى 20٪'],
              attack: 1.2, prod: { money: 1.1 }, cost: 1.2 },
  russia:   { name: 'روسيا', flag: '🇷🇺', pros: ['استخبارات كاملة: ترى كل الحاميات وكل التحركات', 'الدفاع +15٪'], cons: ['إنتاج المال -5٪'],
              intel: true, scoutAlways: true, seeIncoming: true, defense: 1.15, prod: { money: 0.95 } },
  iran:     { name: 'إيران', flag: '🇮🇷', pros: ['كل الوحدات أرخص 25٪', 'إنتاج النفط +15٪'], cons: ['عقوبات: أسعار السوق العام سيئة'],
              cost: 0.75, prod: { oil: 1.15 }, market: 0.45 },
  pakistan: { name: 'باكستان', flag: '🇵🇰', pros: ['ردع نووي: دفاع العاصمة +60٪', 'المشاة والدفاع الجوي أرخص 25٪'], cons: ['إنتاج المال -5٪'],
              capitalDefense: 1.6, unitCost: { inf: 0.75, sam: 0.75 }, prod: { money: 0.95 } },
  india:    { name: 'الهند', flag: '🇮🇳', pros: ['عدد سكان +15٪', 'إنتاج الغذاء +20٪', 'تصنيع أسرع 10٪'], cons: ['أسعار السوق العام أقل'],
              pop: 1.15, prod: { food: 1.2 }, buildTime: 0.9, market: 0.5 },
  eu:       { name: 'الاتحاد الأوروبي', flag: '🇪🇺', pros: ['اقتصاد قوي: المال +30٪', 'دبلوماسية: كسب العلاقات أسرع 50٪', 'أفضل أسعار السوق'], cons: ['تردد عسكري: الهجوم -10٪'],
              prod: { money: 1.3 }, diplomacy: 1.5, market: 0.75, attack: 0.9 },
  uk:       { name: 'بريطانيا', flag: '🇬🇧', pros: ['استخبارات MI6: الدرونز لا تفشل وترى تفاصيل الهجمات القادمة', 'المقاتلات +15٪ هجوم', 'سوق لندن: أسعار جيدة'], cons: ['عدد سكان -5٪'],
              scoutAlways: true, seeIncoming: true, unitAtt: { jet: 1.15 }, market: 0.7, pop: 0.95 },
  egypt:    { name: 'مصر', flag: '🇪🇬', pros: ['أكبر جيش: عدد سكان +15٪', 'المشاة أرخص 15٪', 'تكلفة الإعاشة -15٪'], cons: ['تقنية أقل: هجوم الدبابات والمقاتلات -15٪'],
              pop: 1.15, unitCost: { inf: 0.85 }, upkeep: 0.85, unitAtt: { tank: 0.85, jet: 0.85 } },
  saudi:    { name: 'السعودية', flag: '🇸🇦', pros: ['ثروة نفطية: النفط +60٪', 'علاقات سياسية: كسب العلاقات أسرع 50٪', 'أسعار سوق ممتازة'], cons: ['تعتمد على الاستيراد: التصنيع أبطأ 15٪'],
              prod: { oil: 1.6 }, diplomacy: 1.5, market: 0.75, buildTime: 1.15 },
};
const FACTIONS = {};
for (const [k, f] of Object.entries(FACTIONS_RAW)) {
  FACTIONS[k] = { ...FACTION_DEFAULTS, ...f, prod: { ...FACTION_DEFAULTS.prod, ...(f.prod || {}) },
    desc: f.pros.join('، ') + (f.cons.length ? ' · ⚠️ ' + f.cons.join('، ') : '') };
}

// att: attack; air: attack counts as air; defG/defA: defense vs ground/air; speed: map units per game-minute;
// upkeep: food per game-minute; crew: manpower used
const UNITS = {
  inf:   { name: 'مشاة',         icon: '🪖', cost: { money: 60,  oil: 0,   steel: 15, food: 20 }, time: 8,  att: 10, air: false, defG: 15, defA: 5,  speed: 60,  upkeep: 1,   crew: 1 },
  tank:  { name: 'دبابة',        icon: '🚜', cost: { money: 180, oil: 50,  steel: 90, food: 0 },  time: 25, att: 50, air: false, defG: 40, defA: 10, speed: 55,  upkeep: 3,   crew: 3 },
  sam:   { name: 'دفاع جوي',     icon: '📡', cost: { money: 120, oil: 30,  steel: 70, food: 0 },  time: 20, att: 0,  air: false, defG: 15, defA: 80, speed: 40,  upkeep: 2,   crew: 2 },
  jet:   { name: 'مقاتلة',       icon: '✈️', cost: { money: 320, oil: 140, steel: 70, food: 0 },  time: 40, att: 90, air: true,  defG: 20, defA: 40, speed: 180, upkeep: 4,   crew: 2 },
  drone: { name: 'درون استطلاع', icon: '🛸', cost: { money: 40,  oil: 15,  steel: 10, food: 0 },  time: 6,  att: 0,  air: true,  defG: 1,  defA: 1,  speed: 240, upkeep: 0.5, crew: 1 },
  heli:  { name: 'مروحية هجومية', icon: '🚁', cost: { money: 220, oil: 90,  steel: 50, food: 0 },  time: 28, att: 55, air: true,  defG: 30, defA: 15, speed: 120, upkeep: 3,   crew: 2 },
  sf:    { name: 'قوات خاصة',     icon: '🥷', cost: { money: 150, oil: 10,  steel: 15, food: 30 }, time: 15, att: 32, air: false, defG: 20, defA: 8,  speed: 95,  upkeep: 1.5, crew: 1, req: 'logistics' },
  arty:  { name: 'مدفعية',        icon: '💥', cost: { money: 200, oil: 40,  steel: 110, food: 0 }, time: 30, att: 70, air: false, defG: 15, defA: 5,  speed: 35,  upkeep: 2,   crew: 3, req: 'armor', siege: 1.5 },
  abm:   { name: 'دفاع صاروخي',   icon: '🛡️', cost: { money: 300, oil: 60,  steel: 180, food: 0 }, time: 40, att: 0,  air: false, defG: 10, defA: 60, speed: 30,  upkeep: 3,   crew: 3, req: 'satellites', intercept: 1 },
  bomber: { name: 'قاذفة شبح',    icon: '🛩️', cost: { money: 600, oil: 260, steel: 200, food: 0 }, time: 60, att: 170, air: true, defG: 15, defA: 30, speed: 150, upkeep: 6,  crew: 2, req: 'ew' },
  missile: { name: 'صاروخ باليستي', icon: '🚀', cost: { money: 400, oil: 150, steel: 150, food: 0 }, time: 30, att: 150, air: true, defG: 0, defA: 0, speed: 400, upkeep: 0, crew: 1, req: 'missiles', oneShot: true },
};

const TECH_COST = { 1: { money: 800, oil: 300, steel: 400, food: 200 }, 2: { money: 1800, oil: 700, steel: 900, food: 400 }, 3: { money: 3200, oil: 1200, steel: 1600, food: 700 } };
const TECH_TIME = { 1: 150, 2: 300, 3: 480 };
const TECHS = {
  logistics:  { name: 'لوجستيات متقدمة', icon: '🚚', tier: 1, req: [], desc: 'كل جيوشك أسرع 20٪ · يفتح 🥷 القوات الخاصة' },
  agri:       { name: 'زراعة حديثة', icon: '🌱', tier: 1, req: [], desc: 'إنتاج الغذاء +25٪' },
  armor:      { name: 'دروع مركّبة', icon: '🛡️', tier: 1, req: [], desc: 'الدبابات: دفاع +25٪ وهجوم +10٪ · يفتح 💥 المدفعية' },
  ew:         { name: 'حرب إلكترونية', icon: '📶', tier: 2, req: ['armor'], desc: 'دفاعات العدو الجوية أضعف 30٪ ضد هجماتك · يفتح 🛩️ القاذفة الشبح' },
  missiles:   { name: 'صواريخ باليستية', icon: '🚀', tier: 2, req: ['logistics'], desc: 'تفتح الصواريخ: هجوم 150، سريعة جداً، تُستهلك عند الإطلاق' },
  satellites: { name: 'أقمار صناعية', icon: '🛰️', tier: 2, req: ['logistics'], desc: 'ترى كل حاميات الخريطة وتفاصيل الهجمات القادمة · يفتح 🛡️ الدفاع الصاروخي' },
  nuclear:    { name: 'المشروع السري', icon: '☢️', tier: 3, req: ['missiles', 'satellites'], desc: 'يسمح ببناء السلاح النهائي بعد الدقيقة 45' },
};

const GENERALS = {
  attack:  { name: 'قائد هجومي', icon: '🎖️', desc: 'جيشه يهاجم أقوى 15٪ (+5٪ لكل ترقية)' },
  defense: { name: 'قائد دفاعي', icon: '🏰', desc: 'الموقع الذي يتمركز فيه دفاعه أقوى 20٪ (+5٪ لكل ترقية)' },
  speed:   { name: 'قائد مناورات', icon: '⚡', desc: 'جيشه أسرع 30٪ ويخسر جنوداً أقل 15٪' },
};
const GENERAL_COST = { money: 1000, oil: 0, steel: 0, food: 300 };

const SUPERWEAPON = { cost: { money: 8000, oil: 4000, steel: 4000, food: 1500 }, time: 15 * 60, minT: 45 * 60 };

// Real rivalries get their own headline; any other pair gets a generic one.
const RIVALRIES = [
  { pair: ['india', 'pakistan'], title: 'اشتباكات حدودية في كشمير' },
  { pair: ['usa', 'china'], title: 'توتر عسكري في مضيق تايوان' },
  { pair: ['usa', 'iran'], title: 'احتكاك بحري في الخليج' },
  { pair: ['usa', 'russia'], title: 'أزمة صواريخ في أوروبا الشرقية' },
  { pair: ['russia', 'eu'], title: 'أزمة الغاز الأوروبية' },
  { pair: ['russia', 'uk'], title: 'فضيحة تجسس دبلوماسية' },
  { pair: ['saudi', 'iran'], title: 'حرب بالوكالة في اليمن' },
  { pair: ['china', 'india'], title: 'نزاع حدودي في الهيمالايا' },
  { pair: ['uk', 'eu'], title: 'خلاف الصيد والحدود بعد البريكست' },
  { pair: ['egypt', 'iran'], title: 'تهديد الملاحة في البحر الأحمر' },
  { pair: ['usa', 'eu'], title: 'حرب رسوم جمركية' },
  { pair: ['china', 'uk'], title: 'أزمة هونغ كونغ' },
  { pair: ['saudi', 'russia'], title: 'حرب أسعار النفط' },
  { pair: ['pakistan', 'iran'], title: 'توتر على حدود بلوشستان' },
  { pair: ['egypt', 'saudi'], title: 'خلاف حول جزر البحر الأحمر' },
];
const GENERIC_CRISES = ['نزاع على الحدود البحرية', 'حرب تجارية مفتوحة', 'أزمة دبلوماسية بعد حادث حدودي', 'نزاع على موارد المياه'];
const CRISIS_ACTIONS = {
  mediate:  { name: 'وساطة سلام', cost: { money: 800, oil: 0, steel: 0, food: 300 } },
  military: { name: 'دعم عسكري', cost: { money: 600, oil: 200, steel: 300, food: 0 } },
  media:    { name: 'دعم إعلامي وسياسي', cost: { money: 300, oil: 0, steel: 0, food: 0 } },
};
const PERMANENT = ['usa', 'russia', 'china', 'uk', 'eu']; // Security Council veto

const BUILDINGS = {
  economy: { name: 'الاقتصاد',  icon: '🏦', desc: 'إنتاج كل مواقعك +12٪ لكل مستوى' },
  housing: { name: 'السكن والزراعة', icon: '🏘️', desc: 'السكان +40 والغذاء +10٪ لكل مستوى' },
  factory: { name: 'المصانع',   icon: '🏭', desc: 'تصنيع الوحدات أسرع 15٪ لكل مستوى' },
  defense: { name: 'التحصينات', icon: '🧱', desc: 'دفاع العاصمة +15٪ ودفاع ثابت +50 لكل مستوى' },
  radar:   { name: 'الرادار',   icon: '🛰️', desc: 'مدى الرؤية حول عاصمتك +40 لكل مستوى' },
};
const MAX_LEVEL = 10;

const TERR = {
  capital:   { name: 'عاصمة',        icon: '🏛️', pop: 150, prod: { money: 300, oil: 120, steel: 150, food: 220 } },
  city:      { name: 'مدينة',        icon: '🏙️', pop: 60,  prod: { money: 160, oil: 0, steel: 0, food: 0 },   garrison: { inf: 15, tank: 2 } },
  oil:       { name: 'حقل نفط',      icon: '🛢️', pop: 15,  prod: { money: 0, oil: 130, steel: 0, food: 0 },   garrison: { inf: 10, tank: 3 } },
  mine:      { name: 'منجم',         icon: '⛏️', pop: 15,  prod: { money: 0, oil: 0, steel: 130, food: 0 },   garrison: { inf: 10, tank: 3 } },
  farm:      { name: 'أراضٍ زراعية', icon: '🌾', pop: 25,  prod: { money: 0, oil: 0, steel: 0, food: 180 },   garrison: { inf: 8, tank: 2 } },
  strategic: { name: 'مركز قيادة استراتيجي', icon: '⭐', pop: 30, prod: { money: 100, oil: 40, steel: 40, food: 40 }, garrison: { inf: 30, tank: 8, sam: 6 } },
};

const EVENTS = [
  { id: 'oilboom',  name: '📈 ارتفاع أسعار النفط', desc: 'إنتاج النفط مضاعف', mods: { prod: { oil: 2 } } },
  { id: 'drought',  name: '☀️ موجة جفاف', desc: 'إنتاج الغذاء -40٪', mods: { prod: { food: 0.6 } } },
  { id: 'crisis',   name: '📉 أزمة مالية عالمية', desc: 'إنتاج المال -30٪', mods: { prod: { money: 0.7 } } },
  { id: 'expo',     name: '🛒 معرض أسلحة دولي', desc: 'كل الوحدات أرخص 20٪', mods: { cost: 0.8 } },
  { id: 'storm',    name: '🌪️ عاصفة رملية', desc: 'التحركات الجديدة أبطأ 30٪ والدفاع +20٪', mods: { speed: 0.7, defense: 1.2 } },
  { id: 'trade',    name: '🚢 انتعاش التجارة', desc: 'أسعار السوق العام +0.2', mods: { market: 0.2 } },
  { id: 'steel',    name: '🏗️ طفرة صناعية', desc: 'إنتاج الفولاذ +50٪', mods: { prod: { steel: 1.5 } } },
];

const MAP_W = 1000, MAP_H = 650;
const HOME_RADIUS = 150;   // map units (random-map scale)
const PROTECTION = 20 * 60; // no player-vs-player attacks before this
const VP_PER_MIN = 10; // per strategic site, per game-minute
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#fdd835', '#6d4c41'];
const REL = { hostile: -30, trade: 25, pact: 50, ally: 75 };

const emptyUnits = () => Object.fromEntries(Object.keys(UNITS).map((k) => [k, 0]));
const emptyRes = () => ({ money: 0, oil: 0, steel: 0, food: 0 });
const sumUnits = (u) => Object.values(u).reduce((a, b) => a + b, 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Game {
  constructor(players, opts) {
    this.speed = opts.speed;          // game seconds per real second
    this.t = 0;                       // game seconds elapsed
    this.endT = GAME_MINUTES * 60;
    this.players = {};
    this.movements = [];
    this.offers = [];
    this.proposals = [];              // {from, to}
    this.missions = [];               // {id, bot, pid, kind, ...}
    this.log = [];
    this.nextId = 1;
    this.winner = null;
    this.event = null;
    this.nextEventT = 12 * 60;
    this.rand = mulberry(opts.seed ?? (Date.now() & 0xffffffff));
    this.world = opts.map !== 'random';
    this.W = this.world ? WORLD.W : MAP_W;
    this.H = this.world ? WORLD.H : MAP_H;
    this.distScale = MAP_W / this.W;  // travel and vision feel the same on both maps
    this.crisis = null;
    this.crisisSeen = {};
    this.nextCrisisT = 18 * 60;
    this.vote = null;
    this.nextVoteT = 35 * 60;
    this.sanctions = null;

    players.forEach((p, i) => {
      this.players[p.id] = {
        id: p.id, name: p.name, faction: p.faction, bot: !!p.bot,
        team: p.team ? 'team-' + p.team : 'solo-' + p.id,
        color: COLORS[i % COLORS.length],
        res: { money: 1500, oil: 600, steel: 900, food: 800 },
        buildings: { economy: 1, housing: 1, factory: 1, defense: 1, radar: 1 },
        upgrade: null, queue: [], vp: 0, capital: null, scouts: {},
        rel: {}, starveClock: 0,
        techs: {}, research: null, general: null, generalCooldown: 0, sw: null,
      };
    });
    for (const b of Object.values(this.players)) if (b.bot) {
      for (const p of Object.values(this.players)) if (p.id !== b.id) b.rel[p.id] = this.allies(b.id, p.id) ? 80 : Math.round(this.rand() * 20 - 10);
    }
    this.maxTeam = Math.max(2, Math.floor(players.length / 2));
    if (this.world) this.genWorld(players.map((p) => p.id));
    else this.genMap(players.map((p) => p.id));
    this.nStrategic = this.terr.filter((t) => t.type === 'strategic').length;
    this.vpTarget = 2.5 * GAME_MINUTES * this.nStrategic;
    this.addLog(null, `بدأت المباراة! أول فريق يجمع ${this.vpTarget} نقطة نصر يفوز، أو صاحب أعلى نقاط عند انتهاء الوقت.`);
  }

  // ---------- map ----------
  genMap(ids) {
    const n = ids.length;
    const terr = [];
    const cx = MAP_W / 2, cy = MAP_H / 2;
    const off = this.rand() * Math.PI * 2;
    ids.forEach((id, i) => {
      const a = off + (i / n) * Math.PI * 2;
      terr.push({ x: cx + Math.cos(a) * 400, y: cy + Math.sin(a) * 250, type: 'capital', owner: id });
    });
    const place = (type, count, rMin, rMax, minD) => {
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 400; tries++) {
          const a = this.rand() * Math.PI * 2, r = rMin + this.rand() * (rMax - rMin);
          const p = { x: cx + Math.cos(a) * r * 470, y: cy + Math.sin(a) * r * 295 };
          if (p.x < 30 || p.x > MAP_W - 30 || p.y < 30 || p.y > MAP_H - 30) continue;
          if (terr.every((o) => dist(o, p) > minD - tries * 0.1)) { terr.push({ ...p, type, owner: null }); break; }
        }
      }
    };
    const nStrat = Math.max(3, Math.min(6, n + 1));
    place('strategic', nStrat, 0.05, 0.45, 110);
    const each = Math.max(2, Math.round(9 / Math.max(n, 2)));
    for (const type of ['city', 'oil', 'mine', 'farm']) place(type, 2 + n * each, 0.2, 1, 62);
    terr.forEach((t, i) => {
      t.id = i;
      t.units = emptyUnits();
      if (t.type === 'capital') {
        Object.assign(t.units, { inf: 20, tank: 3, sam: 2 });
        this.players[t.owner].capital = i;
      } else Object.assign(t.units, TERR[t.type].garrison);
    });
    this.terr = terr;
  }

  genWorld(ids) {
    const terr = [];
    const used = {};
    const fits = (p, minD) => terr.every((o) => dist(o, p) > minD);
    for (const id of ids) {
      const f = this.players[id].faction, c = CAPITALS[f];
      const at = used[f] ? c.alt : c.at;
      used[f] = true;
      terr.push({ ...project(at[0], at[1]), type: 'capital', owner: id, name: c.name });
    }
    // chokepoints: the closest free one to each capital first, so everyone has a nearby objective
    const nStrat = Math.max(3, Math.min(6, ids.length + 1));
    const chokes = CHOKEPOINTS.map((c) => ({ ...project(c.at[0], c.at[1]), name: c.name }));
    const picked = [];
    const caps = terr.slice();
    while (picked.length < nStrat) {
      for (const cap of caps) {
        if (picked.length >= nStrat) break;
        const free = chokes.filter((c) => !picked.includes(c) && fits(c, 45));
        if (!free.length) break;
        free.sort((a, b) => dist(a, cap) - dist(b, cap));
        picked.push(free[0]);
        terr.push({ x: free[0].x, y: free[0].y, name: free[0].name, type: 'strategic', owner: null, claim: cap.owner });
      }
      if (!chokes.some((c) => !picked.includes(c) && fits(c, 45))) break;
    }
    // Real geography is lopsided, so sites are shared out fairly: each capital in turn claims
    // its nearest unclaimed site until everyone has the same number. Capitals of factions nobody
    // picked become strong neutral cities in the same pool.
    const pool = [];
    for (const [f, c] of Object.entries(CAPITALS)) if (!used[f]) pool.push({ ...project(c.at[0], c.at[1]), type: 'city', name: c.name, strong: true });
    for (const s of SITES) pool.push({ ...project(s.at[0], s.at[1]), type: s.type, name: s.name });
    const valid = pool.filter((p) => fits(p, 42));
    const perCap = Math.min(9, Math.floor(valid.length / caps.length));
    const types = ['city', 'oil', 'mine', 'farm'];
    for (let round = 0; round < perCap; round++) {
      const want = types[round % types.length]; // keep each capital's share mixed
      for (const cap of round % 2 ? caps.slice().reverse() : caps) {
        let free = valid.filter((p) => !p.taken && fits(p, 42));
        const typed = free.filter((p) => p.type === want);
        if (typed.length) free = typed;
        if (!free.length) continue;
        free.sort((x, y) => dist(x, cap) - dist(y, cap));
        free[0].taken = true;
        terr.push({ x: free[0].x, y: free[0].y, type: free[0].type, owner: null, name: free[0].name, strong: free[0].strong, claim: cap.owner });
      }
    }
    // Isolated nations face no early neighbours, so their nearby sites are held by tougher
    // local forces; crowded regions get weaker ones. Factor = own isolation / average isolation.
    const iso = {};
    for (const c of caps) iso[c.owner] = caps.length > 1 ? caps.filter((o) => o !== c).reduce((a, o) => a + dist(c, o), 0) / (caps.length - 1) : 1;
    const avgIso = Object.values(iso).reduce((a, b) => a + b, 0) / caps.length;
    terr.forEach((t, i) => {
      t.id = i;
      t.units = emptyUnits();
      if (t.type === 'capital') {
        Object.assign(t.units, { inf: 20, tank: 3, sam: 2 });
        this.players[t.owner].capital = i;
      } else {
        Object.assign(t.units, TERR[t.type].garrison);
        if (t.strong) { t.units.inf *= 2; t.units.tank *= 2; t.units.sam = 3; }
        const k = t.claim ? clamp(Math.pow(iso[t.claim] / avgIso, 3), 0.7, 2.5) : 1;
        for (const u in t.units) t.units[u] = Math.round(t.units[u] * k);
      }
      delete t.claim;
    });
    this.terr = terr;
  }

  // ---------- helpers ----------
  fac(p) { return FACTIONS[p.faction]; }
  allies(a, b) { return !!(a && b && this.players[a] && this.players[b] && this.players[a].team === this.players[b].team); }
  ev(key, sub) {
    const m = this.event ? this.event.mods[key] : undefined;
    if (m === undefined) return key === 'market' ? 0 : 1;
    return sub ? (m[sub] ?? 1) : m;
  }
  unitCost(p, u) {
    const c = UNITS[u].cost, f = this.fac(p), m = f.cost * (f.unitCost[u] || 1) * this.ev('cost');
    const out = {};
    for (const r of RES) out[r] = Math.round(c[r] * m);
    return out;
  }
  upgradeCost(p, b) {
    const lvl = p.buildings[b], m = Math.pow(1.6, lvl - 1);
    return { money: Math.round(250 * m), oil: Math.round(80 * m), steel: Math.round(180 * m), food: Math.round(60 * m) };
  }
  upgradeTime(p, b) { return Math.round(40 * Math.pow(1.4, p.buildings[b] - 1)); }
  unitTime(p, u) { return UNITS[u].time * this.fac(p).buildTime / (1 + 0.15 * (p.buildings.factory - 1)); }
  canPay(p, c) { return RES.every((r) => p.res[r] >= (c[r] || 0)); }
  pay(p, c) { RES.forEach((r) => (p.res[r] -= c[r] || 0)); }
  visionRadius(p) { return (160 + 40 * (p.buildings.radar - 1)) / this.distScale; }
  has(p, tech) { return !!p.techs[tech]; }
  techCost(tech) { return TECH_COST[TECHS[tech].tier]; }
  partyOf(pid) { const c = this.crisis; return c ? (c.a === pid ? 'a' : c.b === pid ? 'b' : null) : null; }
  statusMult(p) {
    let m = 1;
    const side = this.partyOf(p.id);
    if (side && this.crisis.party[p.id] !== 'calm') m *= 0.9;           // war economy
    if (this.sanctions && this.sanctions.team === p.team) m *= 0.75;
    return m;
  }
  crisisAttackBonus(p, def) {
    const c = this.crisis;
    if (!c || !def) return 1;
    const side = this.partyOf(p.id), other = side === 'a' ? c.b : side === 'b' ? c.a : null;
    if (!side || def.id !== other) return 1;
    let b = c.party[p.id] === 'escalate' ? 0.15 : 0;
    b += Math.min(0.3, 0.1 * Object.values(c.stance).filter((s) => s.action === 'military' && s.side === side).length);
    return 1 + b;
  }
  generalMult(p, kind) {
    const g = p.general;
    if (!g || g.type !== kind) return 1;
    return (kind === 'attack' ? 1.15 : 1.2) + 0.05 * (g.level - 1);
  }
  owned(p) { return this.terr.filter((t) => t.owner === p.id); }

  population(p) {
    let pop = 0;
    for (const t of this.terr) if (t.owner === p.id) pop += TERR[t.type].pop;
    return Math.round(pop * this.fac(p).pop + 40 * (p.buildings.housing - 1));
  }
  allUnits(p) {
    const u = emptyUnits();
    for (const t of this.terr) if (t.owner === p.id) for (const k in u) u[k] += t.units[k];
    for (const m of this.movements) if (m.owner === p.id) for (const k in u) u[k] += m.units[k];
    return u;
  }
  military(p, includeQueue) {
    const u = this.allUnits(p);
    let m = 0;
    for (const k in u) m += u[k] * UNITS[k].crew;
    if (includeQueue) for (const q of p.queue) m += q.count * UNITS[q.unit].crew;
    return m;
  }
  productivity(p) {
    const pop = this.population(p), mil = this.military(p);
    return 0.4 + 0.6 * clamp((pop - mil) / Math.max(pop, 1), 0, 1);
  }
  upkeep(p) {
    const u = this.allUnits(p);
    let f = 0;
    for (const k in u) f += u[k] * UNITS[k].upkeep;
    return f * this.fac(p).upkeep;
  }
  income(p) {
    const inc = emptyRes(), f = this.fac(p);
    const mult = (1 + 0.12 * (p.buildings.economy - 1)) * this.productivity(p) * this.statusMult(p);
    for (const t of this.terr) if (t.owner === p.id) {
      for (const r of RES) inc[r] += TERR[t.type].prod[r] * mult * f.prod[r] * this.ev('prod', r);
    }
    inc.food *= (1 + 0.1 * (p.buildings.housing - 1)) * (this.has(p, 'agri') ? 1.25 : 1);
    return inc; // per game-minute, before upkeep
  }
  marketRate(p) {
    const pacts = Object.values(this.players).filter((b) => b.bot && b.id !== p.id && (b.rel[p.id] || 0) >= REL.trade).length;
    return Math.min(0.95, this.fac(p).market + 0.05 * pacts + this.ev('market'));
  }
  addLog(to, text, kind = 'info') {
    this.log.push({ t: this.t, to, text, kind });
    if (this.log.length > 400) this.log.shift();
  }
  teamMembers(team) { return Object.values(this.players).filter((p) => p.team === team); }

  // relations: only bots keep a score (toward everyone else)
  relation(botId, pid) { const b = this.players[botId]; return b && b.bot ? Math.round(b.rel[pid] || 0) : null; }
  changeRel(botId, pid, delta, boost = true) {
    const b = this.players[botId], p = this.players[pid];
    if (!b || !b.bot || !p || botId === pid) return;
    if (delta > 0 && boost) delta *= this.fac(p).diplomacy;
    const before = b.rel[pid] || 0;
    b.rel[pid] = clamp(before + delta, -100, 100);
    for (const [lvl, name] of [[REL.trade, 'اتفاقية تجارية'], [REL.pact, 'معاهدة عدم اعتداء']]) {
      if (before < lvl && b.rel[pid] >= lvl) this.addLog(pid, `🤝 ${b.name} وقّع معك ${name}`, 'good');
      if (before >= lvl && b.rel[pid] < lvl) this.addLog(pid, `💔 ${b.name} ألغى ${name} معك`, 'bad');
    }
    if (before >= REL.ally && b.rel[pid] < REL.pact && this.allies(botId, pid)) this.leaveAlliance(b, true);
  }

  // ---------- commands ----------
  cmd(pid, c) {
    if (this.winner) return 'انتهت المباراة';
    const p = this.players[pid];
    if (!p) return 'لاعب غير معروف';
    const fn = {
      train: this.cmdTrain, upgrade: this.cmdUpgrade, send: this.send, market: this.cmdMarket,
      offer: this.cmdOffer, cancelOffer: this.cmdCancelOffer, acceptOffer: this.cmdAcceptOffer,
      gift: this.cmdGift, propose: this.cmdPropose, acceptAlliance: this.cmdAcceptAlliance,
      rejectAlliance: this.cmdRejectAlliance, leaveAlliance: (pp) => this.leaveAlliance(pp), mission: this.cmdMission,
      research: this.cmdResearch, hireGeneral: this.cmdHireGeneral, buildSW: this.cmdBuildSW, strike: this.cmdStrike,
      crisis: this.cmdCrisis, vote: this.cmdVote,
    }[c.type];
    return fn ? fn.call(this, p, c) : 'أمر غير معروف';
  }

  cmdTrain(p, c) {
    const u = c.unit, count = Math.floor(c.count);
    if (!UNITS[u] || !(count > 0 && count <= 500)) return 'طلب غير صالح';
    if (UNITS[u].req && !this.has(p, UNITS[u].req)) return `يحتاج بحث ${TECHS[UNITS[u].req].name}`;
    const one = this.unitCost(p, u);
    const total = {};
    for (const r of RES) total[r] = one[r] * count;
    if (!this.canPay(p, total)) return 'موارد غير كافية';
    if (this.military(p, true) + count * UNITS[u].crew > this.population(p)) return 'لا توجد قوى بشرية كافية. وسّع أراضيك أو طوّر السكن';
    if (p.queue.length >= 8) return 'طابور التصنيع ممتلئ';
    this.pay(p, total);
    p.queue.push({ unit: u, count, remaining: this.unitTime(p, u) });
    return null;
  }

  cmdUpgrade(p, c) {
    const b = c.building;
    if (!BUILDINGS[b]) return 'طلب غير صالح';
    if (p.upgrade) return 'يوجد تطوير قيد التنفيذ';
    if (p.buildings[b] >= MAX_LEVEL) return 'وصلت للمستوى الأقصى';
    const cost = this.upgradeCost(p, b);
    if (!this.canPay(p, cost)) return 'موارد غير كافية';
    this.pay(p, cost);
    p.upgrade = { b, remaining: this.upgradeTime(p, b), total: this.upgradeTime(p, b) };
    return null;
  }

  cmdMarket(p, c) {
    const amt = Math.floor(c.amount);
    if (this.sanctions && this.sanctions.team === p.team) return 'السوق العام مغلق أمامك بسبب عقوبات مجلس الأمن';
    if (!RES.includes(c.give) || !RES.includes(c.get) || c.give === c.get || !(amt > 0)) return 'طلب غير صالح';
    if (p.res[c.give] < amt) return 'موارد غير كافية';
    p.res[c.give] -= amt;
    p.res[c.get] += Math.floor(amt * this.marketRate(p));
    return null;
  }

  cmdOffer(p, c) {
    const ga = Math.floor(c.giveAmt), wa = Math.floor(c.wantAmt);
    if (!RES.includes(c.give) || !RES.includes(c.want) || c.give === c.want || !(ga > 0) || !(wa > 0)) return 'عرض غير صالح';
    if (p.res[c.give] < ga) return 'موارد غير كافية';
    if (this.offers.filter((o) => o.owner === p.id).length >= 5) return 'لديك 5 عروض مفتوحة كحد أقصى';
    p.res[c.give] -= ga;
    this.offers.push({ id: this.nextId++, owner: p.id, give: c.give, giveAmt: ga, want: c.want, wantAmt: wa, t: this.t });
    return null;
  }
  cmdCancelOffer(p, c) {
    const o = this.offers.find((x) => x.id === c.id && x.owner === p.id);
    if (!o) return 'العرض غير موجود';
    p.res[o.give] += o.giveAmt;
    this.offers = this.offers.filter((x) => x !== o);
    return null;
  }
  cmdAcceptOffer(p, c) {
    const o = this.offers.find((x) => x.id === c.id);
    if (!o || o.owner === p.id) return 'العرض غير متاح';
    if (p.res[o.want] < o.wantAmt) return 'موارد غير كافية';
    const owner = this.players[o.owner];
    if (owner.bot && (owner.rel[p.id] || 0) < REL.hostile) return `${owner.name} يرفض التعامل معك`;
    p.res[o.want] -= o.wantAmt; p.res[o.give] += o.giveAmt;
    owner.res[o.want] += o.wantAmt;
    this.offers = this.offers.filter((x) => x !== o);
    this.addLog(owner.id, `⚖️ ${p.name} قبل عرضك: أخذ ${RES_ICON[o.give]}${o.giveAmt} وأعطاك ${RES_ICON[o.want]}${o.wantAmt}`, 'good');
    this.addLog(p.id, `⚖️ تمت الصفقة مع ${owner.name}`, 'good');
    this.changeRel(owner.id, p.id, 3); this.changeRel(p.id, owner.id, 3);
    return null;
  }

  cmdGift(p, c) {
    const to = this.players[c.to], amt = Math.floor(c.amount);
    if (!to || to === p || !RES.includes(c.res) || !(amt > 0)) return 'طلب غير صالح';
    if (p.res[c.res] < amt) return 'موارد غير كافية';
    p.res[c.res] -= amt; to.res[c.res] += amt;
    this.addLog(to.id, `🎁 ${p.name} أرسل لك هدية: ${RES_ICON[c.res]}${amt}`, 'good');
    this.addLog(p.id, `🎁 أرسلت ${RES_ICON[c.res]}${amt} إلى ${to.name}`);
    if (to.bot) {
      // gifts alone can buy goodwill only up to a point; alliances need missions
      to.giftRel = to.giftRel || {};
      const used = to.giftRel[p.id] || 0;
      const gain = Math.min(10, amt / 100, Math.max(0, 35 - used));
      to.giftRel[p.id] = used + gain;
      if (gain > 0) this.changeRel(to.id, p.id, gain);
      else this.addLog(p.id, `${to.name} شكرك على الهدية، لكن العلاقة لن تتحسن أكثر بالهدايا. أنجز مهامه`, 'warn');
    }
    return null;
  }

  cmdPropose(p, c) {
    const to = this.players[c.to];
    if (!to || to === p) return 'طلب غير صالح';
    if (this.allies(p.id, to.id)) return 'أنتم حلفاء بالفعل';
    const size = this.teamMembers(p.team).length + this.teamMembers(to.team).length;
    if (size > this.maxTeam) return `الحد الأقصى للتحالف ${this.maxTeam} أعضاء في هذه المباراة`;
    if (to.bot) {
      const rel = to.rel[p.id] || 0;
      if (rel < REL.ally) {
        this.changeRel(to.id, p.id, -3, false);
        return `${to.name} رفض: يحتاج علاقة ${REL.ally} على الأقل (الحالية ${Math.round(rel)})`;
      }
      this.joinTeams(p, to);
      return null;
    }
    if (this.proposals.some((x) => x.from === p.id && x.to === to.id)) return 'أرسلت عرضاً بالفعل';
    this.proposals.push({ from: p.id, to: to.id });
    this.addLog(to.id, `🤝 ${p.name} يعرض عليك تحالفاً. افتح تبويب الدبلوماسية للرد`, 'warn');
    return null;
  }
  cmdAcceptAlliance(p, c) {
    const pr = this.proposals.find((x) => x.from === c.from && x.to === p.id);
    if (!pr) return 'العرض غير موجود';
    this.proposals = this.proposals.filter((x) => x !== pr);
    const from = this.players[c.from];
    if (this.teamMembers(p.team).length + this.teamMembers(from.team).length > this.maxTeam) return `الحد الأقصى للتحالف ${this.maxTeam}`;
    this.joinTeams(from, p);
    return null;
  }
  cmdRejectAlliance(p, c) {
    this.proposals = this.proposals.filter((x) => !(x.from === c.from && x.to === p.id));
    if (this.players[c.from]) this.addLog(c.from, `❌ ${p.name} رفض عرض التحالف`, 'bad');
    return null;
  }
  joinTeams(a, b) {
    const old = a.team;
    for (const m of this.teamMembers(old)) m.team = b.team;
    for (const m of this.teamMembers(b.team)) for (const n of this.teamMembers(b.team)) if (m.bot && m !== n) m.rel[n.id] = Math.max(m.rel[n.id] || 0, REL.ally);
    this.proposals = this.proposals.filter((x) => !(this.allies(x.from, x.to)));
    this.addLog(null, `🤝 تحالف جديد: ${this.teamMembers(b.team).map((m) => m.name).join(' + ')}`, 'warn');
  }
  leaveAlliance(p, quiet) {
    const mates = this.teamMembers(p.team).filter((m) => m !== p);
    if (!mates.length) return 'لست في تحالف';
    p.team = 'solo-' + p.id;
    for (const m of mates) { if (m.bot) m.rel[p.id] = Math.min(m.rel[p.id] || 0, 20); if (p.bot) p.rel[m.id] = Math.min(p.rel[m.id] || 0, 20); }
    this.addLog(null, `💔 ${p.name} انسحب من تحالفه مع ${mates.map((m) => m.name).join(' + ')}${quiet ? ' (تدهور العلاقات)' : ''}`, 'warn');
    return null;
  }

  // ---------- research, generals, superweapon ----------
  cmdResearch(p, c) {
    const T = TECHS[c.tech];
    if (!T) return 'طلب غير صالح';
    if (p.techs[c.tech]) return 'تم البحث مسبقاً';
    if (p.research) return 'يوجد بحث قيد التنفيذ';
    if (!T.req.every((r) => p.techs[r])) return 'يحتاج أبحاثاً سابقة';
    const cost = this.techCost(c.tech);
    if (!this.canPay(p, cost)) return 'موارد غير كافية';
    this.pay(p, cost);
    p.research = { tech: c.tech, remaining: TECH_TIME[T.tier], total: TECH_TIME[T.tier] };
    return null;
  }
  cmdHireGeneral(p, c) {
    if (!GENERALS[c.kind]) return 'طلب غير صالح';
    if (p.general) return 'لديك قائد بالفعل';
    if (this.t < p.generalCooldown) return 'لم يتم تجهيز قائد جديد بعد';
    if (!this.canPay(p, GENERAL_COST)) return 'موارد غير كافية';
    this.pay(p, GENERAL_COST);
    p.general = { type: c.kind, level: 1, xp: 0, loc: p.capital };
    this.addLog(p.id, `${GENERALS[c.kind].icon} انضم ${GENERALS[c.kind].name} إلى جيشك في العاصمة`, 'good');
    return null;
  }
  generalWin(p) {
    const g = p.general;
    g.xp++;
    const lvl = g.xp >= 5 ? 3 : g.xp >= 2 ? 2 : 1;
    if (lvl > g.level) { g.level = lvl; this.addLog(p.id, `🎖️ ترقّى ${GENERALS[g.type].name} إلى المستوى ${lvl}`, 'good'); }
  }
  generalDies(p) {
    this.addLog(p.id, `⚰️ قُتل ${GENERALS[p.general.type].name} في المعركة. يمكنك تعيين قائد جديد بعد 5 دقائق`, 'bad');
    p.general = null;
    p.generalCooldown = this.t + 5 * 60;
  }
  cmdBuildSW(p) {
    if (!this.has(p, 'nuclear')) return 'يحتاج بحث المشروع السري';
    if (p.sw) return 'المشروع موجود بالفعل';
    if (this.t < SUPERWEAPON.minT) return 'غير متاح قبل الدقيقة 45 من المباراة';
    if (!this.canPay(p, SUPERWEAPON.cost)) return 'موارد غير كافية';
    this.pay(p, SUPERWEAPON.cost);
    p.sw = { remaining: SUPERWEAPON.time, total: SUPERWEAPON.time, ready: false, used: false };
    this.addLog(null, `☢️ رصدت الأقمار الصناعية أن ${p.name} بدأ بناء سلاح نهائي! اقتحام عاصمته يؤخر المشروع`, 'warn');
    for (const b of Object.values(this.players)) if (b.bot && !this.allies(b.id, p.id)) this.changeRel(b.id, p.id, -10, false);
    return null;
  }
  cmdStrike(p, c) {
    const t = this.terr[c.target];
    if (!p.sw || !p.sw.ready || p.sw.used) return 'السلاح النهائي غير جاهز';
    if (!t || t.owner === p.id || this.allies(t.owner, p.id)) return 'هدف غير صالح';
    p.sw.used = true;
    const victim = t.owner ? this.players[t.owner] : null;
    const lost = { ...t.units };
    t.units = emptyUnits();
    if (t.type === 'capital') {
      for (const r of RES) victim.res[r] *= 0.5;
      victim.buildings.defense = 1;
      if (victim.sw && !victim.sw.ready) { victim.sw = null; this.addLog(null, `☢️ دُمّر مشروع ${victim.name} للسلاح النهائي`, 'warn'); }
    } else {
      t.owner = null;
    }
    if (victim && victim.general && victim.general.loc === t.id) this.generalDies(victim);
    this.addLog(null, `☢️☢️ ${p.name} أطلق السلاح النهائي على ${this.tname(t)}! أُبيدت الحامية (${this.unitsText(lost)})${t.type === 'capital' ? ' وخسرت العاصمة نصف مواردها وتحصيناتها' : ' وأصبح الموقع أرضاً محايدة'}. استنكار دولي واسع`, 'bad');
    for (const b of Object.values(this.players)) if (b.bot && !this.allies(b.id, p.id)) this.changeRel(b.id, p.id, -30, false);
    return null;
  }

  // ---------- geopolitical crises ----------
  startCrisis() {
    const ps = Object.values(this.players);
    const pairs = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (this.allies(a.id, b.id)) continue;
      const r = RIVALRIES.find((x) => (x.pair[0] === a.faction && x.pair[1] === b.faction) || (x.pair[1] === a.faction && x.pair[0] === b.faction));
      const key = [a.id, b.id].sort().join('|'), seen = (this.crisisSeen[key] || 0);
      pairs.push({ a, b, key, title: r ? r.title : GENERIC_CRISES[Math.floor(this.rand() * GENERIC_CRISES.length)], w: (r ? 3 : 1) / (1 + 3 * seen) });
    }
    if (!pairs.length) return;
    let roll = this.rand() * pairs.reduce((s, x) => s + x.w, 0);
    const pick = pairs.find((x) => (roll -= x.w) < 0) || pairs[0];
    const { a, b } = pick;
    this.crisisSeen[pick.key] = (this.crisisSeen[pick.key] || 0) + 1;
    this.crisis = { id: this.nextId++, a: a.id, b: b.id, title: pick.title, until: this.t + 10 * 60, stance: {}, party: {}, mediation: 0, support: { a: 0, b: 0 } };
    if (a.bot) this.changeRel(a.id, b.id, -20, false);
    if (b.bot) this.changeRel(b.id, a.id, -20, false);
    this.addLog(null, `🔥 أزمة دولية: ${pick.title} بين ${a.name} و${b.name}! اقتصاد الطرفين يتأثر بالحرب. باقي الدول تقدر تتوسط أو تدعم أحد الطرفين من تبويب العالم`, 'warn');
  }
  cmdCrisis(p, c) {
    const cr = this.crisis;
    if (!cr || cr.id !== c.id) return 'الأزمة انتهت';
    const side = this.partyOf(p.id);
    if (side) {
      if (!['escalate', 'calm'].includes(c.action)) return 'طلب غير صالح';
      if (cr.party[p.id]) return 'اتخذت موقفك بالفعل';
      cr.party[p.id] = c.action;
      this.addLog(null, c.action === 'escalate' ? `⚔️ ${p.name} يصعّد في أزمة ${cr.title} ويحشد قواته` : `🕊️ ${p.name} يعلن استعداده للتهدئة في أزمة ${cr.title}`, 'warn');
      this.checkCrisisPeace();
      return null;
    }
    const A = CRISIS_ACTIONS[c.action];
    if (!A) return 'طلب غير صالح';
    if (cr.stance[p.id]) return 'اتخذت موقفك بالفعل في هذه الأزمة';
    if (c.action !== 'mediate' && !['a', 'b'].includes(c.side)) return 'اختر الطرف';
    if (!this.canPay(p, A.cost)) return 'موارد غير كافية';
    this.pay(p, A.cost);
    const pa = this.players[cr.a], pb = this.players[cr.b];
    if (c.action === 'mediate') {
      cr.stance[p.id] = { action: 'mediate' };
      cr.mediation += this.fac(p).diplomacy;
      this.changeRel(cr.a, p.id, 8); this.changeRel(cr.b, p.id, 8);
      this.addLog(null, `🕊️ ${p.name} أطلق وساطة بين ${pa.name} و${pb.name}`, 'warn');
      this.checkCrisisPeace();
      return null;
    }
    const friend = c.side === 'a' ? pa : pb, foe = c.side === 'a' ? pb : pa;
    cr.stance[p.id] = { action: c.action, side: c.side };
    if (c.action === 'military') {
      cr.support[c.side] += 2;
      for (const r of RES) friend.res[r] += A.cost[r];
      this.changeRel(friend.id, p.id, 20); this.changeRel(foe.id, p.id, -30, false);
      this.addLog(null, `🪖 ${p.name} أرسل دعماً عسكرياً إلى ${friend.name} في أزمة ${cr.title}`, 'warn');
    } else {
      cr.support[c.side] += 1;
      this.changeRel(friend.id, p.id, 10); this.changeRel(foe.id, p.id, -12, false);
      this.addLog(null, `📢 ${p.name} أعلن دعمه السياسي والإعلامي لـ ${friend.name} في أزمة ${cr.title}`, 'warn');
    }
    return null;
  }
  checkCrisisPeace() {
    const cr = this.crisis;
    const esc = [cr.a, cr.b].filter((id) => cr.party[id] === 'escalate').length;
    const bothCalm = cr.party[cr.a] === 'calm' && cr.party[cr.b] === 'calm';
    if (cr.mediation >= 2 + esc || (bothCalm && cr.mediation >= 1)) this.endCrisis(true);
  }
  endCrisis(peace) {
    const cr = this.crisis;
    this.crisis = null;
    const pa = this.players[cr.a], pb = this.players[cr.b];
    const by = (fn) => Object.entries(cr.stance).filter(([, s]) => fn(s)).map(([id]) => this.players[id]);
    if (peace) {
      const mediators = by((s) => s.action === 'mediate');
      for (const m of mediators) { m.vp += 40; this.changeRel(cr.a, m.id, 12); this.changeRel(cr.b, m.id, 12); }
      for (const id of [cr.a, cr.b]) if (cr.party[id] === 'calm') this.players[id].vp += 20;
      this.addLog(null, `🕊️ انتهت أزمة ${cr.title} بالسلام${mediators.length ? ` بفضل وساطة ${mediators.map((m) => m.name).join(' و')} (+40 نقطة نصر لكل وسيط)` : ''}`, 'good');
      return;
    }
    const { a, b } = cr.support;
    if (a === b) { this.addLog(null, `انتهت أزمة ${cr.title} دون منتصر`, 'warn'); return; }
    const side = a > b ? 'a' : 'b', winner = side === 'a' ? pa : pb;
    winner.vp += 40;
    const backers = by((s) => s.side === side);
    for (const x of backers) x.vp += 20;
    this.addLog(null, `🏅 ${winner.name} خرج منتصراً من أزمة ${cr.title} (+40 نقطة نصر)${backers.length ? ` وداعموه ${backers.map((x) => x.name).join(' و')} (+20)` : ''}`, 'warn');
  }

  // ---------- Security Council ----------
  startVote() {
    const teams = {};
    for (const p of Object.values(this.players)) teams[p.team] = (teams[p.team] || 0) + p.vp;
    const sorted = Object.entries(teams).sort((x, y) => y[1] - x[1]);
    if (sorted.length < 3 || sorted[0][1] < 1) return;
    const team = sorted[0][0];
    const names = this.teamMembers(team).map((p) => p.name).join(' و');
    this.vote = { id: this.nextId++, team, names, until: this.t + 3 * 60, votes: {} };
    for (const p of this.teamMembers(team)) this.vote.votes[p.id] = 'no';
    this.addLog(null, `🏛️ مجلس الأمن يصوّت على فرض عقوبات على المتصدر ${names} (إنتاج -25٪ وإغلاق السوق لمدة 10 دقائق). صوّت من تبويب العالم`, 'warn');
  }
  cmdVote(p, c) {
    const v = this.vote;
    if (!v || v.id !== c.id) return 'التصويت انتهى';
    if (p.team === v.team) return 'لا يمكنك التصويت على نفسك';
    if (!['yes', 'no', 'veto'].includes(c.choice)) return 'طلب غير صالح';
    if (c.choice === 'veto' && !PERMANENT.includes(p.faction)) return 'حق النقض للأعضاء الدائمين فقط';
    v.votes[p.id] = c.choice;
    if (c.choice === 'veto') this.addLog(null, `✋ ${p.name} استخدم حق النقض (الفيتو)`, 'warn');
    return null;
  }
  endVote() {
    const v = this.vote;
    this.vote = null;
    const all = Object.values(v.votes);
    const yes = all.filter((x) => x === 'yes').length, no = all.filter((x) => x === 'no').length;
    if (all.includes('veto')) return this.addLog(null, `🏛️ سقط قرار العقوبات على ${v.names} بالفيتو (مع ${yes} / ضد ${no})`, 'warn');
    if (yes > no) {
      this.sanctions = { team: v.team, names: v.names, until: this.t + 10 * 60 };
      this.addLog(null, `🏛️ أقر مجلس الأمن عقوبات على ${v.names} (مع ${yes} / ضد ${no})`, 'warn');
    } else this.addLog(null, `🏛️ رُفض قرار العقوبات على ${v.names} (مع ${yes} / ضد ${no})`, 'warn');
  }

  // ---------- bot missions ----------
  genMissions() {
    const bots = Object.values(this.players).filter((p) => p.bot);
    const humans = Object.values(this.players).filter((p) => !p.bot);
    for (const b of bots) for (const h of humans) {
      if (this.allies(b.id, h.id)) continue;
      if (this.missions.some((m) => m.bot === b.id && m.pid === h.id)) continue;
      if ((b.rel[h.id] || 0) <= -60) continue;
      const m = this.makeMission(b, h);
      if (m) this.missions.push(m);
    }
  }
  makeMission(b, h) {
    const kinds = ['deliver', 'deliver', 'capture', 'battle', 'scout'];
    const kind = kinds[Math.floor(this.rand() * kinds.length)];
    const base = { id: this.nextId++, bot: b.id, pid: h.id, kind, expires: this.t + 20 * 60 };
    const hc = this.terr[h.capital];
    if (kind === 'deliver') {
      const res = RES[Math.floor(this.rand() * RES.length)];
      const amt = Math.round((400 + this.t / 6) / 50) * 50;
      return { ...base, res, amt, reward: 18, text: `أرسل ${RES_ICON[res]}${amt} ${RES_NAME[res]} إلى ${b.name}` };
    }
    const enemiesOfBot = Object.values(this.players).filter((x) => x.id !== b.id && x.id !== h.id && !this.allies(x.id, b.id) && !this.allies(x.id, h.id));
    if (kind === 'battle' && enemiesOfBot.length) {
      enemiesOfBot.sort((x, y) => (b.rel[x.id] || 0) - (b.rel[y.id] || 0));
      const foe = enemiesOfBot[0];
      return { ...base, target: foe.id, reward: 25, text: `انتصر في معركة هجومية ضد ${foe.name}` };
    }
    const pool = this.terr.filter((t) => t.type !== 'capital' && t.owner !== h.id && t.owner !== b.id && !this.allies(t.owner, h.id) && !this.allies(t.owner, b.id));
    if (!pool.length) return null;
    pool.sort((x, y) => dist(x, hc) - dist(y, hc));
    const t = pool[Math.floor(this.rand() * Math.min(5, pool.length))];
    if (kind === 'scout') return { ...base, kind: 'scout', target: t.id, reward: 10, text: `استطلع ${this.tname(t)} بالدرونز` };
    return { ...base, kind: 'capture', target: t.id, reward: 25, text: `سيطر على ${this.tname(t)}` };
  }
  cmdMission(p, c) {
    const m = this.missions.find((x) => x.id === c.id && x.pid === p.id && x.kind === 'deliver');
    if (!m) return 'المهمة غير متاحة';
    if (p.res[m.res] < m.amt) return 'موارد غير كافية';
    p.res[m.res] -= m.amt; this.players[m.bot].res[m.res] += m.amt;
    this.completeMission(m);
    return null;
  }
  completeMission(m) {
    this.missions = this.missions.filter((x) => x !== m);
    const b = this.players[m.bot], p = this.players[m.pid];
    this.changeRel(b.id, p.id, m.reward);
    const bonus = m.kind === 'deliver' ? 0 : 400;
    if (bonus) for (const r of ['money', 'oil', 'steel']) p.res[r] += bonus;
    this.addLog(p.id, `✅ أنجزت مهمة ${b.name}: ${m.text}. العلاقة +${Math.round(m.reward * this.fac(p).diplomacy)}${bonus ? ` ومكافأة 💰🛢️🔩 ${bonus}` : ''}`, 'good');
  }
  missionEvent(kind, pid, info) {
    for (const m of [...this.missions]) {
      if (m.pid !== pid || m.kind !== kind) continue;
      if ((kind === 'capture' || kind === 'scout') && m.target === info.terr) this.completeMission(m);
      if (kind === 'battle' && m.target === info.defender) this.completeMission(m);
    }
  }

  // ---------- movement ----------
  send(p, c) {
    const from = this.terr[c.from], to = this.terr[c.to];
    if (!from || !to || from === to) return 'هدف غير صالح';
    if (from.owner !== p.id) return 'هذا الموقع ليس لك';
    const units = emptyUnits();
    for (const u in units) {
      const n = Math.max(0, Math.floor((c.units && c.units[u]) || 0));
      if (n > from.units[u]) return 'لا تملك هذا العدد من الوحدات';
      units[u] = n;
    }
    if (sumUnits(units) === 0) return 'اختر وحدات للإرسال';
    let mission = c.mission;
    if (to.owner === p.id) mission = 'reinforce';
    else if (this.allies(to.owner, p.id)) return 'لا يمكن مهاجمة حليف';
    else if (mission !== 'scout') mission = 'attack';
    if (to.owner && this.t < PROTECTION) return `فترة الحماية: لا يمكن مهاجمة اللاعبين قبل الدقيقة ${PROTECTION / 60} من المباراة`;
    if (mission === 'scout' && sumUnits(units) !== units.drone) return 'الاستطلاع بالدرونز فقط';
    if (units.missile && mission !== 'attack') return 'الصواريخ للهجوم فقط';
    const withGeneral = !!c.withGeneral && p.general && p.general.loc === from.id && mission !== 'scout';
    for (const u in units) from.units[u] -= units[u];
    if (withGeneral) p.general.loc = null;
    this.dispatch(p.id, from, to, units, mission, null, withGeneral);
    return null;
  }

  dispatch(owner, from, to, units, mission, loot, general) {
    const p = this.players[owner];
    let speed = Infinity;
    for (const u in units) if (units[u] > 0) speed = Math.min(speed, UNITS[u].speed);
    speed *= this.ev('speed') * (this.has(p, 'logistics') ? 1.2 : 1) * (general && p.general.type === 'speed' ? 1.3 : 1);
    const travel = ((dist(from, to) * this.distScale) / speed) * 60;
    this.movements.push({
      id: this.nextId++, owner, from: from.id, to: to.id, units, mission, loot: loot || null, general: !!general,
      start: this.t, arrive: this.t + travel,
    });
  }

  // ---------- simulation ----------
  tick(realDt) {
    if (this.winner) return;
    const dt = realDt * this.speed;
    this.t += dt;
    this.tickEvents();
    for (const p of Object.values(this.players)) {
      const inc = this.income(p);
      inc.food -= this.upkeep(p);
      for (const r of RES) p.res[r] += (inc[r] * dt) / 60;
      this.tickStarvation(p, dt);
      if (p.upgrade) {
        p.upgrade.remaining -= dt;
        if (p.upgrade.remaining <= 0) {
          p.buildings[p.upgrade.b]++;
          this.addLog(p.id, `اكتمل تطوير ${BUILDINGS[p.upgrade.b].name} إلى المستوى ${p.buildings[p.upgrade.b]}`, 'good');
          p.upgrade = null;
        }
      }
      if (p.research) {
        p.research.remaining -= dt;
        if (p.research.remaining <= 0) {
          p.techs[p.research.tech] = true;
          this.addLog(p.id, `🔬 اكتمل بحث ${TECHS[p.research.tech].name}`, 'good');
          p.research = null;
        }
      }
      if (p.sw && !p.sw.ready) {
        p.sw.remaining -= dt;
        if (p.sw.remaining <= 0) { p.sw.ready = true; this.addLog(null, `☢️ السلاح النهائي لدى ${p.name} أصبح جاهزاً للإطلاق!`, 'bad'); }
      }
      let left = dt;
      while (left > 0 && p.queue.length) {
        const q = p.queue[0];
        if (q.remaining > left) { q.remaining -= left; break; }
        left -= q.remaining;
        this.terr[p.capital].units[q.unit]++;
        q.count--;
        if (q.count <= 0) p.queue.shift();
        else q.remaining = this.unitTime(p, q.unit);
      }
      if (p.bot) for (const k in p.rel) if (!this.allies(p.id, k)) p.rel[k] += ((0 - p.rel[k]) * 0.005 * dt) / 60;
    }
    for (const t of this.terr) {
      if (t.type === 'strategic' && t.owner) this.players[t.owner].vp += (VP_PER_MIN * dt) / 60;
    }
    const due = this.movements.filter((m) => m.arrive <= this.t).sort((a, b) => a.arrive - b.arrive);
    if (due.length) {
      this.movements = this.movements.filter((m) => m.arrive > this.t);
      for (const m of due) this.arrive(m);
    }
    this.missions = this.missions.filter((m) => m.expires > this.t);
    if (Math.floor((this.t - dt) / 60) !== Math.floor(this.t / 60)) this.genMissions();
    this.checkWin();
  }

  tickEvents() {
    if (this.crisis && this.t >= this.crisis.until) this.endCrisis(false);
    if (!this.crisis && this.t >= this.nextCrisisT) {
      this.startCrisis();
      this.nextCrisisT = this.t + (16 + this.rand() * 6) * 60;
    }
    if (this.vote && this.t >= this.vote.until) this.endVote();
    if (!this.vote && this.t >= this.nextVoteT) {
      this.startVote();
      this.nextVoteT = this.t + 25 * 60;
    }
    if (this.sanctions && this.t >= this.sanctions.until) {
      this.addLog(null, `🏛️ انتهت العقوبات على ${this.sanctions.names}`);
      this.sanctions = null;
    }
    if (this.event && this.t >= this.event.until) {
      this.addLog(null, `انتهى الحدث: ${this.event.name}`);
      this.event = null;
    }
    if (!this.event && this.t >= this.nextEventT) {
      const e = EVENTS[Math.floor(this.rand() * EVENTS.length)];
      this.event = { ...e, until: this.t + 8 * 60 };
      this.nextEventT = this.t + (14 + this.rand() * 8) * 60;
      this.addLog(null, `🌍 حدث عالمي: ${e.name}. ${e.desc}`, 'warn');
    }
  }

  tickStarvation(p, dt) {
    if (p.res.food > 0) { p.starveClock = 0; return; }
    p.res.food = 0;
    p.starveClock += dt;
    if (p.starveClock < 60) return;
    p.starveClock -= 60;
    const lost = emptyUnits();
    for (const t of this.terr) if (t.owner === p.id) {
      for (const u in t.units) {
        const n = t.units[u] * 0.05;
        const k = Math.floor(n) + (this.rand() < n % 1 ? 1 : 0);
        t.units[u] -= k; lost[u] += k;
      }
    }
    if (sumUnits(lost)) this.addLog(p.id, `🍞 مجاعة! انشق جنود بسبب نقص الغذاء: ${this.unitsText(lost)}`, 'bad');
  }

  arrive(m) {
    const p = this.players[m.owner], to = this.terr[m.to];
    const home = this.terr[p.capital];
    if (m.general && p.general && (m.mission === 'return' || m.mission === 'reinforce' || to.owner === p.id)) p.general.loc = to.id;
    if (m.mission === 'return') {
      for (const u in m.units) to.units[u] += m.units[u];
      if (m.loot) {
        for (const r of RES) p.res[r] += m.loot[r];
        this.addLog(p.id, `عادت قواتك بغنائم: ${RES.map((r) => RES_ICON[r] + Math.round(m.loot[r])).join(' ')}`, 'good');
      }
      return;
    }
    if (to.owner === p.id) {
      for (const u in m.units) to.units[u] += m.units[u];
      if (m.mission !== 'reinforce') this.addLog(p.id, `وصلت قواتك إلى ${this.tname(to)} وانضمت للحامية`);
      return;
    }
    if (this.allies(to.owner, p.id)) { this.dispatch(p.id, to, home, m.units, 'return', null, m.general); return; }
    if (to.owner && this.players[to.owner].bot) this.changeRel(to.owner, p.id, m.mission === 'scout' ? -8 : -35, false);
    if (m.mission === 'scout') return this.scout(m, p, to);
    this.battle(m, p, to);
  }

  tname(t) {
    const base = TERR[t.type].name;
    if (t.type === 'capital') return `${base} ${this.players[t.owner].name}`;
    return t.name ? `${base} ${t.name}` : `${base} #${t.id}`;
  }

  scout(m, p, to) {
    const ok = this.fac(p).scoutAlways || m.units.drone > to.units.drone;
    if (ok) {
      p.scouts[to.id] = { t: this.t, units: { ...to.units }, owner: to.owner };
      this.addLog(p.id, `🛸 تقرير استطلاع ${this.tname(to)}: ${this.unitsText(to.units)}`, 'good');
      this.dispatch(p.id, to, this.terr[p.capital], m.units, 'return');
      this.missionEvent('scout', p.id, { terr: to.id });
    } else {
      this.addLog(p.id, `🛸 أُسقطت درونزك فوق ${this.tname(to)}`, 'bad');
    }
    if (to.owner) this.addLog(to.owner, `🛸 رُصد درون استطلاع معادٍ فوق ${this.tname(to)}${ok ? '' : ' وتم إسقاطه'}`, 'warn');
  }

  unitsText(u) {
    const parts = Object.keys(UNITS).filter((k) => u[k] > 0).map((k) => `${UNITS[k].icon}${u[k]}`);
    return parts.length ? parts.join(' ') : 'لا شيء';
  }

  attackPower(p, units, general, def, target) {
    const f = this.fac(p);
    const mult = f.attack * (general ? this.generalMult(p, 'attack') : 1) * this.crisisAttackBonus(p, def);
    let g = 0, a = 0;
    for (const u in units) {
      const v = UNITS[u].att * units[u] * mult * (f.unitAtt[u] || 1) * (u === 'tank' && this.has(p, 'armor') ? 1.1 : 1)
        * (UNITS[u].siege && target && (target.type === 'capital' || target.type === 'strategic') ? UNITS[u].siege : 1);
      if (UNITS[u].air) a += v; else g += v;
    }
    return { g, a };
  }
  defensePower(t, shG, attacker) {
    const def = t.owner ? this.players[t.owner] : null;
    const defF = def ? this.fac(def) : FACTION_DEFAULTS;
    const shA = 1 - shG;
    const armor = def && this.has(def, 'armor') ? 1.25 : 1;
    const ew = attacker && this.has(attacker, 'ew') ? 0.7 : 1;
    let D = 0;
    for (const u in t.units) {
      const k = u === 'tank' ? armor : 1;
      D += t.units[u] * (UNITS[u].defG * shG * k + UNITS[u].defA * shA * k * (u === 'sam' ? ew : 1));
    }
    if (def && def.general && def.general.loc === t.id) D *= this.generalMult(def, 'defense');
    // home soil: sites close to their owner's capital are easier to hold
    if (def && t.type !== 'capital' && dist(t, this.terr[def.capital]) * this.distScale < HOME_RADIUS) D *= 1.3;
    let bonus = 0, base = 20;
    if (t.type === 'capital') { bonus = 0.15 * def.buildings.defense; base = 50 * def.buildings.defense; D *= defF.capitalDefense; }
    if (t.type === 'strategic') bonus = 0.25;
    return D * defF.defense * (1 + bonus) * this.ev('defense') + base;
  }

  battle(m, p, to) {
    const def = to.owner ? this.players[to.owner] : null;
    const gen = m.general && p.general ? p.general : null;
    // missile defence shoots down incoming ballistic missiles before the fight
    if (m.units.missile && to.units.abm) {
      const shot = Math.min(m.units.missile, to.units.abm * UNITS.abm.intercept);
      m.units.missile -= shot;
      this.addLog(p.id, `🛡️ الدفاع الصاروخي في ${this.tname(to)} أسقط ${shot} من صواريخك`, 'bad');
      if (def) this.addLog(def.id, `🛡️ دفاعك الصاروخي في ${this.tname(to)} أسقط ${shot} صاروخ من ${p.name}`, 'good');
    }
    const { g, a } = this.attackPower(p, m.units, !!gen, def, to);
    const A = g + a;
    const D = this.defensePower(to, A > 0 ? g / A : 0.5, p);
    const lossesA = emptyUnits(), lossesD = emptyUnits();
    const defGeneral = def && def.general && def.general.loc === to.id;
    const side = this.partyOf(p.id), crisisFight = side && def && this.partyOf(def.id) && this.partyOf(def.id) !== side;
    // missiles are spent whatever happens
    const missiles = m.units.missile;
    if (sumUnits(m.units) === 0) return;
    if (A > D) {
      const ratio = Math.pow(D / A, 1.5) * (gen && gen.type === 'speed' ? 0.85 : 1);
      for (const u in m.units) { lossesA[u] = Math.min(m.units[u], Math.round(m.units[u] * ratio)); m.units[u] -= lossesA[u]; }
      lossesA.missile = missiles; m.units.missile = 0;
      for (const u in to.units) { lossesD[u] = to.units[u]; to.units[u] = 0; }
      if (def) this.missionEvent('battle', p.id, { defender: def.id });
      if (defGeneral) this.generalDies(def);
      if (gen) this.generalWin(p);
      if (crisisFight) { this.crisis.support[side]++; p.vp += 10; this.addLog(null, `⚔️ ${p.name} حقق انتصاراً في أزمة ${this.crisis.title} (+10 نقاط نصر)`, 'warn'); }
      if (sumUnits(m.units) === 0) {
        this.addLog(p.id, `🚀 ضربة ناجحة على ${this.tname(to)}: أُبيدت الحامية (${this.unitsText(lossesD)}) لكن لا توجد قوات برية للسيطرة عليه`, 'good');
        if (def) this.addLog(def.id, `🚀 ضربة صاروخية من ${p.name} على ${this.tname(to)} أبادت الحامية`, 'bad');
        if (gen) this.dispatch(p.id, to, this.terr[p.capital], m.units, 'return', null, true);
      } else if (to.type === 'capital') {
        const loot = {};
        for (const r of RES) { loot[r] = def.res[r] * 0.3; def.res[r] -= loot[r]; }
        if (def.buildings.defense > 1) def.buildings.defense--;
        this.addLog(p.id, `⚔️ انتصار! اقتحمت ${this.tname(to)} وغنمت 30٪ من مواردها. خسائرك: ${this.unitsText(lossesA)}`, 'good');
        this.addLog(def.id, `🔥 ${p.name} اقتحم عاصمتك! خسرت 30٪ من مواردك وتراجعت التحصينات. خسائرك: ${this.unitsText(lossesD)}`, 'bad');
        if (def.sw && !def.sw.ready) {
          def.sw.remaining = Math.min(def.sw.total, def.sw.remaining + def.sw.total * 0.4);
          this.addLog(null, `💥 ${p.name} خرّب مشروع السلاح النهائي لدى ${def.name} وأخّره`, 'warn');
        }
        this.dispatch(p.id, to, this.terr[p.capital], m.units, 'return', loot, !!gen);
      } else {
        const prev = to.owner;
        to.owner = p.id;
        to.units = { ...m.units };
        if (gen) gen.loc = to.id;
        this.addLog(p.id, `⚔️ انتصار! سيطرت على ${this.tname(to)}. خسائرك: ${this.unitsText(lossesA)}`, 'good');
        if (prev) this.addLog(prev, `🔥 ${p.name} استولى على ${this.tname(to)}! خسائرك: ${this.unitsText(lossesD)}`, 'bad');
        if (to.type === 'strategic') this.addLog(null, `⭐ ${p.name} سيطر على ${this.tname(to)}`, 'warn');
        this.missionEvent('capture', p.id, { terr: to.id });
      }
    } else {
      const ratio = A > 0 ? Math.pow(A / D, 1.5) : 0;
      for (const u in to.units) { lossesD[u] = Math.min(to.units[u], Math.round(to.units[u] * ratio)); to.units[u] -= lossesD[u]; }
      for (const u in m.units) lossesA[u] = m.units[u];
      if (gen) this.generalDies(p);
      if (defGeneral) this.generalWin(def);
      if (crisisFight) this.crisis.support[side === 'a' ? 'b' : 'a']++;
      this.addLog(p.id, `💀 هزيمة عند ${this.tname(to)}. أُبيدت قواتك (${this.unitsText(lossesA)}). خسائر العدو: ${this.unitsText(lossesD)}`, 'bad');
      if (def) this.addLog(def.id, `🛡️ صددت هجوم ${p.name} على ${this.tname(to)}. خسائرك: ${this.unitsText(lossesD)}`, 'good');
    }
    p.scouts[to.id] = { t: this.t, units: { ...to.units }, owner: to.owner };
  }

  checkWin() {
    const teams = {};
    for (const p of Object.values(this.players)) teams[p.team] = (teams[p.team] || 0) + p.vp;
    let best = null;
    for (const [team, vp] of Object.entries(teams)) if (!best || vp > best.vp) best = { team, vp };
    if (best.vp >= this.vpTarget) return this.finish(best.team, 'وصل إلى هدف نقاط النصر');
    if (this.t >= this.endT) {
      const terrCount = (team) => this.terr.filter((t) => t.owner && this.players[t.owner].team === team).length;
      const sorted = Object.entries(teams).sort((a, b) => (Math.abs(b[1] - a[1]) < 0.5 ? terrCount(b[0]) - terrCount(a[0]) : b[1] - a[1]));
      this.finish(sorted[0][0], 'انتهى الوقت وهو صاحب أعلى نقاط');
    }
  }

  finish(team, why) {
    const members = this.teamMembers(team);
    this.winner = { team, names: members.map((p) => p.name), ids: members.map((p) => p.id), why };
    this.addLog(null, `🏆 الفائز: ${this.winner.names.join(' و ')} (${why})`, 'good');
  }

  // ---------- per-player view (fog of war) ----------
  view(pid) {
    const me = this.players[pid], f = this.fac(me);
    const friendly = (id) => id && (id === pid || this.allies(id, pid));
    const eyes = this.terr.filter((t) => friendly(t.owner)).map((t) => ({
      x: t.x, y: t.y, r: t.type === 'capital' ? this.visionRadius(this.players[t.owner]) : 110 / this.distScale,
    }));
    const allSeeing = f.intel || this.has(me, 'satellites');
    const seen = (t) => allSeeing || friendly(t.owner) || eyes.some((e) => dist(e, t) <= e.r);
    const terr = this.terr.map((t) => {
      const o = { id: t.id, x: t.x, y: t.y, type: t.type, owner: t.owner, name: t.name };
      if (seen(t)) o.units = t.units;
      else if (me.scouts[t.id]) o.scout = { age: (this.t - me.scouts[t.id].t) / this.speed, units: me.scouts[t.id].units };
      return o;
    });
    const movements = [];
    for (const m of this.movements) {
      const mine = friendly(m.owner);
      const incoming = this.terr[m.to].owner && friendly(this.terr[m.to].owner) && m.mission !== 'return';
      if (!mine && !incoming && !allSeeing) continue;
      movements.push({
        id: m.id, owner: m.owner, from: m.from, to: m.to, mission: m.mission,
        progress: Math.min(1, (this.t - m.start) / (m.arrive - m.start)),
        eta: (m.arrive - this.t) / this.speed,
        units: mine || allSeeing || f.seeIncoming ? m.units : null, general: mine && m.general,
        hostile: !mine,
      });
    }
    const teamOf = {};
    for (const p of Object.values(this.players)) (teamOf[p.team] = teamOf[p.team] || []).push(p.id);
    const players = Object.values(this.players).map((p) => ({
      id: p.id, name: p.name, faction: p.faction, color: p.color, team: p.team, allied: teamOf[p.team].length > 1,
      vp: p.vp, bot: p.bot, territories: this.terr.filter((t) => t.owner === p.id).length,
      rel: p.bot ? Math.round(p.rel[pid] || 0) : null,
    }));
    const pop = this.population(me), mil = this.military(me);
    const rs = (x) => x / this.speed;
    const cr = this.crisis;
    return {
      t: this.t, speed: this.speed, remaining: (this.endT - this.t) / this.speed,
      map: { W: this.W, H: this.H, world: this.world },
      crisis: cr ? {
        id: cr.id, a: cr.a, b: cr.b, title: cr.title, remaining: rs(cr.until - this.t), mediation: cr.mediation,
        needed: 2 + [cr.a, cr.b].filter((id) => cr.party[id] === 'escalate').length, support: cr.support, party: cr.party,
        stance: cr.stance, mine: cr.stance[pid] || null,
      } : null,
      nextCrisis: rs(this.nextCrisisT - this.t), protection: rs(Math.max(0, PROTECTION - this.t)),
      vote: this.vote ? { id: this.vote.id, team: this.vote.team, names: this.vote.names, remaining: rs(this.vote.until - this.t), mine: this.vote.votes[pid] || null,
        yes: Object.values(this.vote.votes).filter((x) => x === 'yes').length, no: Object.values(this.vote.votes).filter((x) => x === 'no').length } : null,
      sanctions: this.sanctions ? { team: this.sanctions.team, names: this.sanctions.names, remaining: rs(this.sanctions.until - this.t) } : null,
      projects: Object.values(this.players).filter((p) => p.sw && !p.sw.used).map((p) => ({ id: p.id, name: p.name, ready: p.sw.ready, progress: 1 - p.sw.remaining / p.sw.total, remaining: rs(Math.max(0, p.sw.remaining)) })),
      vpTarget: this.vpTarget, winner: this.winner, maxTeam: this.maxTeam, REL,
      event: this.event ? { name: this.event.name, desc: this.event.desc, remaining: (this.event.until - this.t) / this.speed } : null,
      me: {
        id: me.id, res: me.res, income: this.income(me), upkeep: this.upkeep(me), buildings: me.buildings,
        pop, mil, milQueued: this.military(me, true), productivity: this.productivity(me), marketRate: this.marketRate(me),
        upgrade: me.upgrade ? { ...me.upgrade, remaining: me.upgrade.remaining / this.speed, total: me.upgrade.total / this.speed } : null,
        queue: me.queue.map((q) => ({ unit: q.unit, count: q.count, remaining: q.remaining / this.speed })),
        capital: me.capital,
        techs: me.techs, research: me.research ? { tech: me.research.tech, remaining: rs(me.research.remaining), total: rs(me.research.total) } : null,
        techCosts: Object.fromEntries(Object.keys(TECHS).map((k) => [k, { cost: this.techCost(k), time: rs(TECH_TIME[TECHS[k].tier]) }])),
        general: me.general, generalCooldown: rs(Math.max(0, me.generalCooldown - this.t)), generalCost: GENERAL_COST,
        sw: me.sw ? { ...me.sw, remaining: rs(me.sw.remaining), total: rs(me.sw.total) } : null,
        swCost: SUPERWEAPON.cost, swTime: rs(SUPERWEAPON.time), swOpen: this.t >= SUPERWEAPON.minT, swOpensIn: rs(Math.max(0, SUPERWEAPON.minT - this.t)),
        crisisCosts: Object.fromEntries(Object.entries(CRISIS_ACTIONS).map(([k, v]) => [k, v.cost])),
        canVeto: PERMANENT.includes(me.faction),
        unitCosts: Object.fromEntries(Object.keys(UNITS).map((u) => [u, { cost: this.unitCost(me, u), time: this.unitTime(me, u) / this.speed }])),
        upgradeCosts: Object.fromEntries(Object.keys(BUILDINGS).map((b) => [b, { cost: this.upgradeCost(me, b), time: this.upgradeTime(me, b) / this.speed }])),
      },
      players, terr, movements,
      offers: this.offers.map((o) => ({ ...o, ownerName: this.players[o.owner].name })),
      proposalsIn: this.proposals.filter((x) => x.to === pid).map((x) => x.from),
      proposalsOut: this.proposals.filter((x) => x.from === pid).map((x) => x.to),
      missions: this.missions.filter((m) => m.pid === pid).map((m) => ({ id: m.id, bot: m.bot, kind: m.kind, text: m.text, reward: m.reward, res: m.res, amt: m.amt, left: (m.expires - this.t) / this.speed })),
      log: this.log.filter((l) => l.to === null || l.to === pid).slice(-50).map((l) => ({ ...l, ago: (this.t - l.t) / this.speed })),
    };
  }
}

module.exports = { RIVALRIES, GENERIC_CRISES, Game, FACTIONS, UNITS, BUILDINGS, TERR, EVENTS, RES, TECHS, GENERALS, CRISIS_ACTIONS, PERMANENT, MAP_W, MAP_H, WORLD_DRAW, GAME_MINUTES, REL, emptyUnits, sumUnits, dist };
