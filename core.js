/* Plan Omset & Plan SO — core logic (no DOM). Dipakai web (app.js) dan test node. */
(function (root) {
'use strict';

const MONTH_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_EN = {jan:1,feb:2,mar:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,agu:8,agt:8,sep:9,oct:10,okt:10,nov:11,dec:12,des:12};
const DOW_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const STATUSES = ['Normal','Pengganti','Baru','Cuti','Resign'];

/* ---------- util ---------- */
function simp(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return simp(v.result);
    if (v.richText) return v.richText.map(x => x.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}
function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function sameName(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  let ta = na.split(' '), tb = nb.split(' ');
  if (ta.length > tb.length) [ta, tb] = [tb, ta];
  return ta.every(t => t.length >= 3 && tb.includes(t));  // semua kata nama pendek ada di nama panjang
}
function num(v) {
  v = simp(v);
  if (v == null || v === '' || v instanceof Date) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dowOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

function sheetToRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, rn) => {
    const arr = [];
    row.eachCell({ includeEmpty: true }, (cell, cn) => { arr[cn - 1] = simp(cell.value); });
    rows[rn - 1] = arr;
  });
  return rows;
}

/* ---------- parsers ---------- */
function parsePeriod(v) {
  v = String(simp(v) == null ? '' : simp(v));
  const m = v.match(/([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTH_EN[m[1].slice(0, 3).toLowerCase()];
  return mo ? { year: +m[2], month: mo } : null;
}

function parseOmset(rows) {
  let period = null, hi = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const c0 = norm(simp(r[0]));
    if (c0 === 'period ymwd') period = parsePeriod(r[1]);
    if (c0 === 'szname') { hi = i; break; }
  }
  if (hi < 0) throw new Error('Header "szName" tidak ketemu — ini bukan file NetSales per day?');
  const hdr = rows[hi];
  const dayCols = [];
  for (let c = 1; c < hdr.length; c++) {
    const t = String(simp(hdr[c]) == null ? '' : simp(hdr[c])).trim();
    if (/^\d{1,2}$/.test(t)) dayCols.push([c, +t]);
  }
  const data = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = String(simp(r[0]) == null ? '' : simp(r[0])).trim();
    if (!name) continue;
    if (/grand total/i.test(name)) break;
    const o = {};
    for (const [c, d] of dayCols) { const v = num(r[c]); if (v !== null && v !== 0) o[d] = v; }
    data[name] = o;
  }
  return { period, data };
}

function parseTargets(rows) {
  const out = {};
  const isNamaArea = x => /^(nama(\s+(area|salesman|sales|salesmen|sm))?|salesman|area)$/i.test(String(simp(x) == null ? '' : simp(x)).trim());
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      const t = String(simp(r[c]) == null ? '' : simp(r[c])).trim();
      let type = null;
      if (/^target\s+bti/i.test(t)) type = 'bti'; else if (/^target\s+milestone/i.test(t)) type = 'ms';
      if (!type) continue;
      let h = i + 1;
      while (h < rows.length && !((rows[h] || []).some(isNamaArea))) h++;
      if (h >= rows.length) continue;
      const hr = rows[h];
      let nameCol = -1; for (let k = 0; k < hr.length; k++) if (isNamaArea(hr[k])) { nameCol = k; break; }
      const cols = []; let totalCol = -1;
      for (let k = nameCol + 1; k < hr.length; k++) {
        const ht = String(simp(hr[k]) == null ? '' : simp(hr[k])).trim();
        if (!ht) continue;
        const clean = ht.replace(/^sum of\s+/i, '').replace(/^t\s+/i, '').trim();
        if (/total/i.test(clean)) totalCol = k; else cols.push([k, clean]);
      }
      const data = {};
      for (let j = h + 1; j < rows.length; j++) {
        const rr = rows[j] || [];
        const name = String(simp(rr[nameCol]) == null ? '' : simp(rr[nameCol])).trim();
        if (!name) continue;
        if (/grand total/i.test(name)) break;
        const cats = {}; let sum = 0;
        for (const [k, cn] of cols) { const v = num(rr[k]); if (v) { cats[cn] = v; sum += v; } }
        const tot = totalCol >= 0 ? num(rr[totalCol]) : null;
        data[name] = { total: tot != null ? tot : sum, cats };
      }
      out[type] = data;
    }
  }
  if (!out.bti && !out.ms) throw new Error('Tabel "TARGET BTI" / "TARGET MILESTONE" tidak ketemu (judul tabel harus diawali kata TARGET BTI / TARGET MILESTONE, dan ada baris header "Nama Area" atau "Nama Salesman").');
  return out;
}

/* ---------- state ---------- */
function newState() {
  return {
    v: 1, seq: 1,
    period: null, prev: null, lastDay: 0,
    settings: { target: 'bti', basis: 'target', growth: 0.05, pattern: 0.6, offDays: [0], lag: 2, lagMode: 'cal', cmp: 'dow', autoLast: true },
    teams: [{ id: 'arjuna', name: 'Arjuna' }, { id: 'bima', name: 'Bima' }],
    people: [], prevData: {}, curData: {}, targets: { bti: {}, ms: {} }, plan: {}
  };
}
function addPerson(st, name, team) {
  const p = { id: 'p' + (st.seq++), name: String(name).trim(), team: team || (st.teams[0] && st.teams[0].id) || '', status: 'Normal',
    baseFrom: null, adjAbs: 0, adjPct: 0, depo: 'SP Kebayoran', type: '', nik: '', sac: '', ly: null, exp: true };
  st.people.push(p);
  return p;
}
function findPerson(st, name) { return st.people.find(p => sameName(p.name, name)); }
function syncPeriod(st) {
  const shift = (p, k) => { let m = p.month + k, y = p.year; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } return { year: y, month: m }; };
  if (!st.period && st.prev) st.period = shift(st.prev, 1);
  if (st.period && !st.prev) st.prev = shift(st.period, -1);
  if (st.settings.autoLast) {
    let mx = 0;
    for (const id in st.curData) for (const d in st.curData[id]) mx = Math.max(mx, +d);
    st.lastDay = mx;
  }
}
function ingestOmset(st, parsed, kind, teamId) {
  const store = kind === 'prev' ? st.prevData : st.curData;
  const created = [], matched = [];
  for (const [name, days] of Object.entries(parsed.data)) {
    let p = findPerson(st, name);
    if (!p) { p = addPerson(st, name, teamId); created.push(p.name); }
    else { matched.push(p.name); if (norm(name).split(' ').length > norm(p.name).split(' ').length) p.name = name.trim(); }
    store[p.id] = days;
  }
  if (parsed.period) { if (kind === 'cur') st.period = parsed.period; else st.prev = parsed.period; }
  syncPeriod(st);
  return { created, matched };
}
function ingestTargets(st, parsed, teamId) {
  const created = [], matched = [];
  for (const type of ['bti', 'ms']) {
    if (!parsed[type]) continue;
    for (const [name, o] of Object.entries(parsed[type])) {
      let p = findPerson(st, name);
      if (!p) { p = addPerson(st, name, teamId); created.push(p.name); } else matched.push(p.name);
      st.targets[type][p.id] = o;
    }
  }
  return { created, matched };
}

/* ---------- kalender ---------- */
function mkCal(st, per) {
  const { year: y, month: m } = per;
  const n = daysIn(y, m), off = new Set(st.settings.offDays);
  const days = [];
  for (let d = 1; d <= n; d++) { const dw = dowOf(y, m, d); days.push({ d, dow: dw, off: off.has(dw) }); }
  const work = days.filter(x => !x.off).map(x => x.d);
  return { y, m, n, days, work, dow1: days[0].dow, nWeeks: Math.floor((n - 1 + days[0].dow) / 7) + 1 };
}
const weekOf = (c, d) => Math.floor((d - 1 + c.dow1) / 7);

/* ---------- baseline ---------- */
/* Pasangan hari bulan lalu untuk hari d bulan ini. null = tidak ada pasangan */
function pairDay(st, c, pc, d) {
  const mode = st.settings.cmp, info = c.days[d - 1];
  if (mode === 'date') return d <= pc.n ? d : null;
  if (mode === 'workday') { const k = c.work.indexOf(d); return k >= 0 && k < pc.work.length ? pc.work[k] : null; }
  if (mode === 'week') { const w = weekOf(c, d); const x = pc.days.find(y => y.dow === info.dow && weekOf(pc, y.d) === w); return x ? x.d : null; }
  // 'dow' (default): hari yang sama ke-N dalam bulan (Selasa ke-2 <-> Selasa ke-2)
  const nth = c.days.filter(y => y.dow === info.dow && y.d <= d).length;
  const cand = pc.days.filter(y => y.dow === info.dow);
  return cand[nth - 1] ? cand[nth - 1].d : null;
}
function mapPrev(st, c, pc, series, d) {
  const p = pairDay(st, c, pc, d);
  if (p != null) return series[p] || 0;
  const dw = c.days[d - 1].dow, by = st.settings.cmp === 'dow' || st.settings.cmp === 'week';
  const same = pc.days.filter(y => y.dow === dw && !y.off).map(y => y.d);
  const pool = by && same.length ? same : pc.work;
  return pool.reduce((a, k) => a + (series[k] || 0), 0) / (pool.length || 1);
}
function prevSeries(st, pc, src) {
  const s = new Array(pc.n + 2).fill(0); let any = false;
  for (const [id, pct] of src) {
    const dd = st.prevData[id]; if (!dd) continue;
    for (const k in dd) { s[+k] += dd[k] * pct; any = true; }
  }
  return { s, any, raw: s.reduce((a, b) => a + b, 0) };
}
function teamShape(st, c, pc, teamId) {
  const acc = new Array(c.n + 1).fill(0); let any = false;
  for (const p of st.people) {
    if (p.team !== teamId || !st.prevData[p.id]) continue;
    const { s } = prevSeries(st, pc, [[p.id, 1]]);
    for (const d of c.work) acc[d] += mapPrev(st, c, pc, s, d);
    any = true;
  }
  const mean = c.work.reduce((a, d) => a + acc[d], 0) / (c.work.length || 1);
  const sh = new Array(c.n + 1).fill(1);
  if (any && mean > 0) for (const d of c.work) sh[d] = acc[d] / mean;
  return sh;
}
function baseOf(st, c, pc, p, tshape) {
  const src = (p.baseFrom && p.baseFrom.length) ? p.baseFrom.map(b => [b.id, b.pct]) : [[p.id, 1]];
  const { s, any, raw } = prevSeries(st, pc, src);
  const adjAbs = +p.adjAbs || 0, adjPct = +p.adjPct || 0;
  const total = any ? Math.max(raw * (1 + adjPct) + adjAbs, 0) : Math.max(adjAbs, 0);
  const day = new Array(c.n + 1).fill(0), shape = new Array(c.n + 1).fill(1);
  if (any && raw > 0) {
    const f = total / raw;
    for (const d of c.work) day[d] = mapPrev(st, c, pc, s, d) * f;
    const mean = c.work.reduce((a, d) => a + day[d], 0) / (c.work.length || 1);
    if (mean > 0) for (const d of c.work) shape[d] = day[d] / mean;
    else for (const d of c.work) shape[d] = tshape[d];
  } else {
    for (const d of c.work) { shape[d] = tshape[d]; day[d] = total / (c.work.length || 1) * tshape[d]; }
  }
  return { total, day, shape, hasPrev: any, raw };
}

/* ---------- hitung per orang ---------- */
function calcPerson(st, c, pc, p, tshape) {
  const base = baseOf(st, c, pc, p, tshape);
  const act = st.curData[p.id] || {};
  const last = st.lastDay || 0;
  let actMTD = 0; for (let d = 1; d <= Math.min(last, c.n); d++) actMTD += act[d] || 0;
  const tB = st.targets.bti[p.id], tM = st.targets.ms[p.id];
  const tgtObj = st.settings.target === 'ms' ? tM : tB;
  const tgt = tgtObj ? tgtObj.total : 0;
  const pl = st.plan[p.id] || {};
  let total, src;
  if (p.status === 'Resign') { total = actMTD; src = 'resign'; }
  else if (pl.total) { total = pl.total.type === 'abs' ? pl.total.v : base.total * (1 + pl.total.v); src = 'manual'; }
  else if (st.settings.basis === 'growth' && base.total > 0) { total = base.total * (1 + st.settings.growth); src = 'growth'; }
  else if (tgtObj) { total = tgt; src = 'target'; }
  else if (base.total > 0) { total = base.total * (1 + st.settings.growth); src = 'growth'; }
  else { total = actMTD; src = 'none'; }

  const plan = new Array(c.n + 1).fill(0), kind = new Array(c.n + 1).fill('');
  let editedSum = 0; const free = [];
  for (let d = 1; d <= c.n; d++) {
    const info = c.days[d - 1];
    if (d <= last) { plan[d] = act[d] || 0; kind[d] = 'act'; continue; }
    if (p.status === 'Resign' || info.off) { kind[d] = info.off ? 'off' : 'plan'; continue; }
    const ov = pl.days && pl.days[d];
    if (ov) { plan[d] = Math.max(0, ov.type === 'abs' ? ov.v : base.day[d] * (1 + ov.v)); kind[d] = 'edit'; editedSum += plan[d]; continue; }
    free.push(d);
  }
  const remaining = total - actMTD - editedSum;
  const a = st.settings.pattern;
  const w = d => (1 - a) + a * base.shape[d];
  const sw = free.reduce((x, d) => x + w(d), 0);
  const over = remaining < -0.5;
  if (free.length && sw > 0) { const R = Math.max(remaining, 0); for (const d of free) { plan[d] = R * w(d) / sw; kind[d] = 'plan'; } }
  const planTotal = plan.reduce((x, y) => x + y, 0);
  const weeks = new Array(c.nWeeks).fill(0);
  for (let d = 1; d <= c.n; d++) weeks[weekOf(c, d)] += plan[d];
  return {
    id: p.id, base, plan, kind, weeks, planTotal, actMTD, total, src, over,
    tgt, tgtBti: tB ? tB.total : 0, tgtMs: tM ? tM.total : 0, hasTarget: !!tgtObj,
    growth: base.total > 0 ? planTotal / base.total - 1 : null,
    reqGrowth: base.total > 0 && tgt ? tgt / base.total - 1 : null,
    rawPrev: Object.values(st.prevData[p.id] || {}).reduce((x, y) => x + y, 0),
    gapUnfilled: free.length === 0 && Math.abs(total - planTotal) > 1 && p.status !== 'Resign'
  };
}

function compute(st) {
  const c = mkCal(st, st.period), pc = mkCal(st, st.prev);
  const shapes = {}; for (const t of st.teams) shapes[t.id] = teamShape(st, c, pc, t.id);
  const res = {};
  for (const p of st.people) res[p.id] = calcPerson(st, c, pc, p, shapes[p.team] || new Array(c.n + 1).fill(1));
  return { c, pc, res, so: soMap(st, c) };
}

function agg(st, comp, persons) {
  const { c } = comp;
  const out = { planDays: new Array(c.n + 1).fill(0), baseDays: new Array(c.n + 1).fill(0), weeks: new Array(c.nWeeks).fill(0),
    planTotal: 0, actMTD: 0, base: 0, tgt: 0, tgtBti: 0, tgtMs: 0, rawPrev: 0 };
  for (const p of persons) {
    const r = comp.res[p.id];
    for (let d = 1; d <= c.n; d++) { out.planDays[d] += r.plan[d]; out.baseDays[d] += r.base.day[d]; }
    r.weeks.forEach((v, i) => out.weeks[i] += v);
    out.planTotal += r.planTotal; out.actMTD += r.actMTD; out.tgt += r.tgt; out.tgtBti += r.tgtBti; out.tgtMs += r.tgtMs;
    out.rawPrev += r.rawPrev; out.base += r.base.total;
  }
  out.growth = out.rawPrev > 0 ? out.planTotal / out.rawPrev - 1 : null;
  out.reqGrowth = out.rawPrev > 0 && out.tgt ? out.tgt / out.rawPrev - 1 : null;
  return out;
}

/* ---------- Plan SO (omset hari D berasal dari SO D-lag) ---------- */
function soMap(st, c) {
  const lag = st.settings.lag, mode = st.settings.lagMode;
  const deps = {}, soOf = {};
  c.work.forEach((D, i) => {
    let s;
    if (mode === 'work') { const j = i - lag; if (j < 0) return; s = c.work[j]; }
    else { s = D - lag; while (s >= 1 && c.days[s - 1].off) s--; if (s < 1) return; }
    (deps[s] = deps[s] || []).push(D); soOf[D] = s;
  });
  return { deps, soOf };
}
function soSeries(c, so, arr) {
  const out = new Array(c.n + 1).fill(null);
  for (const s in so.deps) out[+s] = so.deps[s].reduce((a, D) => a + (arr[D] || 0), 0);
  return out;
}
function soState(st, c, so, s) {
  const deps = so.deps[s]; if (!deps) return 'none';
  const lockedAll = deps.every(D => D <= st.lastDay);
  return lockedAll ? 'act' : (deps.some(D => D <= st.lastDay) ? 'mix' : 'plan');
}
function setDayOverride(st, pid, d, ov) {
  st.plan[pid] = st.plan[pid] || {};
  const pl = st.plan[pid];
  pl.days = pl.days || {};
  if (ov == null) delete pl.days[d]; else pl.days[d] = ov;
}
function soEdit(st, comp, pid, s, inp) {
  const deps = comp.so.deps[s]; if (!deps) return false;
  const r = comp.res[pid];
  const open = deps.filter(D => D > st.lastDay);
  if (!open.length) return false;
  if (inp.clear) { open.forEach(D => setDayOverride(st, pid, D, null)); return true; }
  const soBase = deps.reduce((a, D) => a + r.base.day[D], 0);
  const v = inp.type === 'pct' ? soBase * (1 + inp.v) : inp.v;
  const lockedSum = deps.filter(D => D <= st.lastDay).reduce((a, D) => a + r.plan[D], 0);
  const target = Math.max(0, v - lockedSum);
  const cur = open.reduce((a, D) => a + r.plan[D], 0);
  open.forEach(D => {
    const val = open.length === 1 ? target : (cur > 0 ? r.plan[D] * target / cur : target / open.length);
    setDayOverride(st, pid, D, { type: 'abs', v: Math.round(val) });
  });
  return true;
}

/* ---------- input parser: "25jt", "1,2m", "+10%", "21.500.000" ---------- */
function parseNum(s) {
  s = s.replace(/\s/g, '').replace(/^\+/, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const hasD = s.includes('.'), hasC = s.includes(',');
  if (hasD && hasC) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasC) s = s.replace(',', '.');
  else if (hasD && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function parseInput(t, ctx) {
  t = String(t == null ? '' : t).trim().toLowerCase();
  if (!t) return { clear: true };
  if (t.endsWith('%')) { const n = parseNum(t.slice(0, -1)); return n == null ? { err: true } : { type: 'pct', v: n / 100 }; }
  let mult = 1; const m = t.match(/(juta|jt|miliar|m|ribu|rb|k)$/);
  if (m) { t = t.slice(0, -m[0].length).trim(); mult = { juta: 1e6, jt: 1e6, miliar: 1e9, m: 1e9, ribu: 1e3, rb: 1e3, k: 1e3 }[m[0]]; }
  const n = parseNum(t); if (n == null) return { err: true };
  return ctx === 'pct' ? { type: 'pct', v: n / 100 } : { type: 'abs', v: ctx === 'signed' ? n * mult : Math.max(0, n * mult) };
}

root.Core = { pairDay, MONTH_ID, DOW_ID, STATUSES, simp, norm, sameName, sheetToRows, parseOmset, parseTargets, newState, addPerson, findPerson,
  ingestOmset, ingestTargets, syncPeriod, mkCal, weekOf, compute, agg, soMap, soSeries, soState, soEdit, setDayOverride, parseInput, daysIn, dowOf };
if (typeof module !== 'undefined') module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
