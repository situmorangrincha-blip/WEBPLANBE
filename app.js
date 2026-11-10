/* Plan Omset & Plan SO — UI */
(function () {
'use strict';
const Core = window.Core;
const LS = 'planomset.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- state ---------- */
function migrate(o) {
  const d = Core.newState();
  const s = Object.assign(d, o);
  s.settings = Object.assign(d.settings, o.settings || {});
  s.targets = Object.assign({ bti: {}, ms: {} }, o.targets || {});
  ['plan', 'prevData', 'curData'].forEach(k => s[k] = s[k] || {});
  s.people.forEach(p => { if (p.exp === undefined) p.exp = true; });
  return s;
}
let S = (() => { try { const j = localStorage.getItem(LS); return j ? migrate(JSON.parse(j)) : Core.newState(); } catch (e) { return Core.newState(); } })();
const UI = { tab: 'plan', team: 'all', modal: null, log: [] };
let COMP = null;
const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };

/* ---------- format ---------- */
const nf = (v, d) => v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const jt = v => (v == null || Math.abs(v) < 1) ? '' : nf(v / 1e6, 1);
const big = v => Math.abs(v) >= 1e9 ? 'Rp ' + nf(v / 1e9, 2) + ' M' : 'Rp ' + nf(v / 1e6, 1) + ' jt';
const pct = (g, d = 1) => g == null ? '–' : (g >= 0 ? '+' : '') + nf(g * 100, d) + '%';
const pcls = g => g == null ? 'mut' : g >= 0 ? 'pos' : 'neg';
const short = n => n.split(' ').slice(0, 2).join(' ');
const monthName = p => p ? Core.MONTH_ID[p.month - 1] + ' ' + p.year : '';
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600); }
const logMsg = m => { UI.log.unshift(m); UI.log = UI.log.slice(0, 30); };

/* ---------- selectors ---------- */
const teamName = id => (S.teams.find(t => t.id === id) || {}).name || id;
function persons() {
  const order = S.teams.map(t => t.id);
  const all = S.people.slice().sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team));
  return UI.team === 'all' ? all : all.filter(p => p.team === UI.team);
}
function groups() {
  const ps = persons();
  if (UI.team !== 'all') return [{ name: teamName(UI.team), ps }];
  return S.teams.map(t => ({ name: t.name, ps: ps.filter(p => p.team === t.id) })).filter(g => g.ps.length);
}

/* ---------- render ---------- */
function render() {
  const keep = {}; document.querySelectorAll('.tw').forEach((e, i) => keep[i] = [e.scrollLeft, e.scrollTop]);
  COMP = S.period ? Core.compute(S) : null;
  const hasData = !!COMP;
  $('#app').innerHTML = header() + tabs() + '<main>' + (UI.tab === 'data' || UI.tab === 'roster' || hasData ? body() : empty()) + '</main>' + modal();
  document.querySelectorAll('.tw').forEach((e, i) => { if (keep[i]) { e.scrollLeft = keep[i][0]; e.scrollTop = keep[i][1]; } });
}
function header() {
  const tm = [['all', 'Semua']].concat(S.teams.map(t => [t.id, t.name]));
  return `<div class="top">
    <div class="brand">Plan Omset &amp; SO<small>SP Kebayoran${S.period ? ' · ' + monthName(S.period) : ''}</small></div>
    <div class="pills">${tm.map(([id, n]) => `<button data-act="team" data-v="${id}" class="${UI.team === id ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
    <div class="pills" title="Target acuan plan">${[['bti', 'BTI'], ['ms', 'Milestone']].map(([k, n]) => `<button data-act="target" data-v="${k}" class="${S.settings.target === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="sp"></div>
    <button class="btn" data-act="savejson">Simpan JSON</button>
    <button class="btn" data-act="loadjson">Muat JSON</button>
    <button class="btn pri" data-act="export">⬇ Export Excel</button>
    <input type="file" id="jsonin" accept=".json" hidden></div>`;
}
function tabs() {
  const t = [['plan', 'Plan Omset'], ['so', 'Plan SO'], ['roster', 'Roster & Mapping'], ['data', 'Data & Setting']];
  return `<div class="tabs">${t.map(([k, n]) => `<button data-act="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}
function empty() {
  return `<div class="empty"><h2>Belum ada data</h2><p>Upload omset bulan lalu, omset bulan ini, dan target di tab <b>Data &amp; Setting</b>.</p>
  <button class="btn pri" data-act="tab" data-v="data">Upload data</button> <button class="btn" data-act="sample">Muat contoh (Arjuna Nov 2026)</button></div>`;
}
function body() {
  if (UI.tab === 'data') return dataTab();
  if (UI.tab === 'roster') return rosterTab();
  return kpis() + (UI.tab === 'so' ? soTable() : planTable());
}

/* ----- KPI + chart ----- */
function kpis() {
  const ps = persons(), a = Core.agg(S, COMP, ps), c = COMP.c, tn = S.settings.target === 'ms' ? 'Milestone' : 'BTI';
  const last = S.lastDay, remWork = c.work.filter(d => d > last).length;
  const sisa = a.planTotal - a.actMTD;
  const cards = [
    ['Target ' + tn, big(a.tgt), `BTI ${big(a.tgtBti)} · MS ${big(a.tgtMs)}`],
    ['Plan Omset (BE)', big(a.planTotal), a.tgt ? `<span class="${a.planTotal >= a.tgt ? 'pos' : 'neg'}">${nf(a.planTotal / a.tgt * 100, 1)}% dari target</span> · gap ${big(a.planTotal - a.tgt)}` : '–'],
    ['Aktual s/d tgl ' + last, big(a.actMTD), a.tgt ? nf(a.actMTD / a.tgt * 100, 1) + '% dari target' : '–'],
    ['Sisa plan', big(sisa), remWork + ' hari kerja · ' + big(remWork ? sisa / remWork : 0) + '/hari'],
    ['Growth plan vs ' + Core.MONTH_ID[S.prev.month - 1], `<span class="${pcls(a.growth)}">${pct(a.growth)}</span>`, `Okt ${big(a.rawPrev)} → ${big(a.planTotal)}`],
    ['Growth dibutuhkan target', `<span class="${pcls(a.reqGrowth)}">${pct(a.reqGrowth)}</span>`, `selisih ${big(a.tgt - a.rawPrev)}`]
  ];
  const flags = [];
  ps.forEach(p => {
    const r = COMP.res[p.id];
    if (p.status === 'Resign') return;
    if (r.growth != null && r.growth < 0 && r.src !== 'manual') flags.push(`${esc(short(p.name))} ${pct(r.growth)}`);
  });
  const over = ps.filter(p => COMP.res[p.id].over && p.status !== 'Resign').map(p => esc(short(p.name)));
  const noT = ps.filter(p => p.status !== 'Resign' && !COMP.res[p.id].hasTarget).map(p => esc(short(p.name)));
  return `<div class="kpis">${cards.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>
  ${flags.length ? `<div class="warn">⚠ Growth plan negatif vs bulan lalu: <b>${flags.join(' · ')}</b>. Biasanya karena toko pindah — cek kolom adjustment di tab Roster &amp; Mapping.</div>` : ''}
  ${over.length ? `<div class="warn">⚠ Aktual + edit sudah melebihi plan total: <b>${over.join(', ')}</b>. Naikkan Plan Total atau kurangi edit harian.</div>` : ''}
  ${noT.length ? `<div class="warn">⚠ Belum ada target ${tn}: <b>${noT.join(', ')}</b> (plan pakai growth global).</div>` : ''}
  <div class="card">${chart(a)}</div>`;
}
function chart(a) {
  const c = COMP.c, W = 1000, H = 92, pad = 14, n = c.n;
  const mx = Math.max(1, ...a.planDays.slice(1), ...a.baseDays.slice(1)) * 1.08;
  const bw = (W - pad * 2) / n, y = v => H - 14 - (v / mx) * (H - 24);
  let bars = '', lab = '', line = [];
  for (let d = 1; d <= n; d++) {
    const x = pad + (d - 1) * bw, v = a.planDays[d], off = c.days[d - 1].off;
    if (!off) { const col = d <= S.lastDay ? '#4f46e5' : '#a5b4fc'; bars += `<rect x="${x + 1}" y="${y(v)}" width="${bw - 2}" height="${H - 14 - y(v)}" rx="2" fill="${col}"><title>Tgl ${d}: ${jt(v)} jt</title></rect>`; line.push(`${x + bw / 2},${y(a.baseDays[d])}`); }
    lab += `<text x="${x + bw / 2}" y="${H - 3}" font-size="8" text-anchor="middle" fill="${off ? '#b91c1c' : '#64748b'}">${d}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${bars}<polyline points="${line.join(' ')}" fill="none" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4 3"/>${lab}</svg>
  <div class="legend"><span><i style="background:#4f46e5"></i>Aktual</span><span><i style="background:#a5b4fc"></i>Plan</span><span><i style="background:#f97316"></i>Pola ${Core.MONTH_ID[S.prev.month - 1]} (setelah mapping)</span><span style="color:#b91c1c">▮ Minggu</span></div>`;
}

/* ----- tabel Plan Omset ----- */
function dayHeads(c) {
  const r1 = c.days.map(x => x.off ? `<th class="off">${Core.DOW_ID[x.dow][0]}</th>` : `<th>${Core.DOW_ID[x.dow].slice(0, 3)}</th>`).join('');
  const r2 = c.days.map(x => x.off ? `<th class="off">${x.d}</th>` : `<th>${x.d}</th>`).join('');
  return [r1, r2];
}
function planTable() {
  const c = COMP.c, tn = S.settings.target === 'ms' ? 'Milestone' : 'BTI';
  const [d1, d2] = dayHeads(c);
  const wkH = Array.from({ length: c.nWeeks }, (_, i) => `W${i + 1}`);
  const metricH = ['Target ' + tn, 'Base ' + Core.MONTH_ID[S.prev.month - 1].slice(0, 3), 'Plan Total', 'Growth', 'Aktual', 'Sisa'];
  let rows = '';
  const sub = (label, a, cls, last) => {
    const cells = c.days.map(x => x.off ? '<td class="off"></td>' : `<td>${jt(a.planDays[x.d])}</td>`).join('');
    return `<tr class="${cls}"><td class="nm">${esc(label)}</td><td>${jt(a.tgt)}</td><td>${jt(a.rawPrev)}</td><td>${jt(a.planTotal)}</td><td>${pct(a.growth)}</td><td>${jt(a.actMTD)}</td><td>${jt(a.planTotal - a.actMTD)}</td>${cells}${a.weeks.map(v => `<td class="wk">${jt(v)}</td>`).join('')}<td></td></tr>`;
  };
  const gs = groups(), all = [];
  gs.forEach(g => {
    g.ps.forEach(p => { all.push(p); rows += personRow(p, c); });
    if (gs.length > 1 || true) rows += sub('Total ' + g.name, Core.agg(S, COMP, g.ps), 'sub');
  });
  if (gs.length > 1) rows += sub('GRAND TOTAL', Core.agg(S, COMP, all), 'grand');
  return `<div class="legend"><span><i style="background:var(--act)"></i>Aktual (terkunci s/d tgl ${S.lastDay})</span><span><i style="background:#fff"></i>Plan otomatis</span><span><i style="background:var(--edit)"></i>Diedit manual</span>
    <span>Klik sel untuk edit: <b>25jt</b>, <b>25000000</b>, atau <b>+10%</b> (vs pola ${Core.MONTH_ID[S.prev.month - 1]}). Kosongkan = reset. Satuan: Rp juta.</span></div>
  <div class="tw"><table><thead><tr><th class="nm" rowspan="2">Salesman</th>${metricH.map(h => `<th rowspan="2">${h}</th>`).join('')}${d1}${wkH.map(h => `<th rowspan="2">${h}</th>`).join('')}<th rowspan="2"></th></tr><tr class="r2">${d2}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function personRow(p, c) {
  const r = COMP.res[p.id], pl = S.plan[p.id] || {};
  const manualTotal = !!pl.total, nEdits = pl.days ? Object.keys(pl.days).length : 0;
  const badge = p.status !== 'Normal' ? `<span class="badge ${p.status}">${p.status}</span>` : '';
  const cells = c.days.map(x => {
    const d = x.d, k = r.kind[d];
    if (k === 'off') return '<td class="off"></td>';
    const v = r.plan[d], ed = k === 'plan' || k === 'edit';
    const b = r.base.day[d];
    const tt = ed ? ` title="Pola bln lalu: ${jt(b)} jt${b > 0 ? ' · ' + pct(v / b - 1) : ''}"` : '';
    return `<td class="c ${k}"${ed ? ` data-edit="day" data-p="${p.id}" data-d="${d}" data-raw="${Math.round(v)}"` : ''}${tt}>${jt(v)}</td>`;
  }).join('');
  const gcls = r.growth != null && r.growth < 0 && p.status !== 'Resign' ? 'neg' : pcls(r.growth);
  const edtot = p.status !== 'Resign';
  return `<tr class="${p.status === 'Resign' ? 'res' : ''}"><td class="nm" title="${esc(p.name)} · ${esc(teamName(p.team))}">${badge}${esc(short(p.name))}</td>
    <td class="m">${jt(r.tgt)}</td><td class="m">${jt(r.base.total)}</td>
    <td class="m"${edtot ? ` data-edit="total" data-p="${p.id}" data-raw="${Math.round(r.planTotal)}"` : ''}><b>${jt(r.planTotal)}</b>${manualTotal ? '<span class="dot">●</span>' : ''}</td>
    <td class="m ${gcls}"${edtot ? ` data-edit="growth" data-p="${p.id}" data-raw="${r.growth == null ? '' : nf(r.growth * 100, 1) + '%'}"` : ''}>${pct(r.growth)}</td>
    <td class="m">${jt(r.actMTD)}</td><td class="m">${jt(r.planTotal - r.actMTD)}</td>${cells}
    ${r.weeks.map(v => `<td class="wk">${jt(v)}</td>`).join('')}<td>${(manualTotal || nEdits) ? `<button class="btn sm" data-act="reset" data-p="${p.id}" title="Reset semua edit baris ini">↺</button>` : ''}</td></tr>`;
}

/* ----- tabel Plan SO ----- */
function soTable() {
  const c = COMP.c, so = COMP.so;
  const head = c.days.map(x => x.off ? `<th class="off">${Core.DOW_ID[x.dow][0]}</th>` : `<th>${Core.DOW_ID[x.dow].slice(0, 3)}</th>`).join('');
  const head2 = c.days.map(x => x.off ? `<th class="off">${x.d}</th>` : `<th>${x.d}</th>`).join('');
  const row = (label, series, cls, p) => {
    let tot = 0;
    const cells = c.days.map(x => {
      const d = x.d, v = series[d];
      if (x.off) return '<td class="off"></td>';
      if (v == null) return '<td class="mut">·</td>';
      tot += v;
      const st = Core.soState(S, c, so, d), ed = p && st !== 'act';
      return `<td class="c ${st === 'act' ? 'act' : (st === 'mix' ? 'edit' : 'plan')}"${ed ? ` data-edit="so" data-p="${p.id}" data-d="${d}" data-raw="${Math.round(v)}"` : ''} title="SO tgl ${d} → omset tgl ${so.deps[d].join(' & ')}">${jt(v)}</td>`;
    }).join('');
    return `<tr class="${cls}"><td class="nm">${p ? `${p.status !== 'Normal' ? `<span class="badge ${p.status}">${p.status}</span>` : ''}${esc(short(p.name))}` : esc(label)}</td><td class="m"><b>${jt(tot)}</b></td>${cells}</tr>`;
  };
  let rows = '';
  const gs = groups(), allArr = [];
  const sumSeries = ps => { const t = new Array(c.n + 1).fill(null); ps.forEach(p => Core.soSeries(c, so, COMP.res[p.id].plan).forEach((v, d) => { if (v != null) t[d] = (t[d] || 0) + v; })); return t; };
  gs.forEach(g => {
    g.ps.forEach(p => { allArr.push(p); rows += row('', Core.soSeries(c, so, COMP.res[p.id].plan), p.status === 'Resign' ? 'res' : '', p); });
    rows += row('Total ' + g.name, sumSeries(g.ps), 'sub');
  });
  if (gs.length > 1) rows += row('GRAND TOTAL', sumSeries(allArr), 'grand');
  const lagTxt = S.settings.lagMode === 'work' ? `${S.settings.lag} hari kerja` : `${S.settings.lag} hari kalender (SO Minggu digeser ke Sabtu)`;
  return `<div class="legend"><span>SO tgl X menghasilkan omset tgl X+${S.settings.lag} · aturan: <b>${lagTxt}</b> (ubah di Data &amp; Setting)</span>
    <span><i style="background:var(--act)"></i>SO sudah terealisasi</span><span><i style="background:var(--edit)"></i>Sebagian terealisasi</span>
    <span>Edit SO = ubah plan omset tanggal turunannya (tooltip sel). SO tgl terakhir → omset bulan depan, tidak tampil.</span></div>
  <div class="tw"><table><thead><tr><th class="nm" rowspan="2">Salesman</th><th rowspan="2">Total SO</th>${head}</tr><tr class="r2">${head2}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ----- Roster ----- */
function baseLabel(p) {
  if (!p.baseFrom || !p.baseFrom.length) return 'data sendiri';
  return p.baseFrom.map(b => { const q = S.people.find(x => x.id === b.id); return (q ? short(q.name) : '?') + ' ' + Math.round(b.pct * 100) + '%'; }).join(' + ');
}
function rosterTab() {
  const rows = S.people.map(p => {
    const r = COMP ? COMP.res[p.id] : null, t1 = S.targets.bti[p.id], t2 = S.targets.ms[p.id];
    const inp = (f, v, w) => `<input type="text" data-rf="${f}" data-p="${p.id}" value="${esc(v == null ? '' : v)}" ${w ? `style="width:${w}px;min-width:0"` : ''}>`;
    return `<tr><td><input type="checkbox" data-rf="exp" data-p="${p.id}" ${p.exp !== false ? 'checked' : ''} title="Ikut export"></td>
      <td>${inp('name', p.name, 150)}</td>
      <td><select data-rf="team" data-p="${p.id}">${S.teams.map(t => `<option value="${t.id}" ${t.id === p.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
      <td><select data-rf="status" data-p="${p.id}">${Core.STATUSES.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="chip" data-act="basemodal" data-p="${p.id}">${esc(baseLabel(p))} ✎</button></td>
      <td>${inp('adjPct', p.adjPct ? p.adjPct * 100 : '', 48)}</td><td>${inp('adjAbs', p.adjAbs || '', 90)}</td>
      <td class="n">${r ? jt(r.base.total) : ''}</td>
      <td>${inp('tbti', t1 ? t1.total : '', 100)}</td><td>${inp('tms', t2 ? t2.total : '', 100)}</td>
      <td>${inp('depo', p.depo, 90)}</td><td>${inp('type', p.type, 170)}</td><td>${inp('nik', p.nik, 60)}</td><td>${inp('sac', p.sac, 110)}</td><td>${inp('ly', p.ly || '', 90)}</td>
      <td><button class="btn sm" data-act="delperson" data-p="${p.id}">🗑</button></td></tr>`;
  }).join('');
  return `<div class="card"><b>Mapping baseline</b> — tentukan omset bulan lalu mana yang jadi acuan tiap salesman. Contoh: Steven pengganti Rossi → <i>Baseline dari</i> = Rossi 100%. Pindah toko → isi <i>Adj %</i> (mis. -10) atau <i>Adj Rp</i> (mis. -25jt). Baru/tanpa riwayat → pola harian pakai rata-rata tim; isi <i>Adj Rp</i> sebagai estimasi baseline bila mau ada growth.
  Angka target boleh diedit di sini (Rp penuh atau 25jt). Kolom Depo/Type/NIK/SAC/LY ikut ke export Excel.</div>
  <div class="tw"><table class="rt"><thead><tr><th>Export</th><th>Nama</th><th>Tim</th><th>Status</th><th>Baseline dari</th><th>Adj %</th><th>Adj Rp</th><th>Base (jt)</th><th>Target BTI</th><th>Target MS</th><th>Depo</th><th>Type Salesman</th><th>NIK</th><th>Nama SAC</th><th>LY</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="row" style="margin-top:8px"><button class="btn" data-act="addperson">+ Salesman</button></div>`;
}

/* ----- Data & Setting ----- */
function dataTab() {
  const tsel = id => `<select id="${id}">${S.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>`;
  const cards = [['prev', 'Omset bulan lalu', 'NetSales per day (hasil SO 2 hari sebelumnya)'], ['cur', 'Omset bulan ini', 'NetSales per day s/d hari terakhir'], ['tgt', 'Target', 'Tabel TARGET BTI &amp; TARGET MILESTONE']]
    .map(([k, t, s]) => `<div class="up"><b>${t}</b><div class="mut">${s}</div><div class="row" style="justify-content:center">Tim ${tsel('ts-' + k)}</div><input type="file" accept=".xlsx" multiple data-up="${k}"></div>`).join('');
  const checks = [];
  if (S.period) S.people.forEach(p => {
    const hp = !!S.prevData[p.id], hc = !!S.curData[p.id], ht = !!S.targets[S.settings.target][p.id];
    const m = [];
    if (!hp && !(p.baseFrom && p.baseFrom.length) && p.status !== 'Baru') m.push('tanpa omset bulan lalu');
    if (!hc && p.status !== 'Resign') m.push('belum ada omset bulan ini');
    if (!ht && p.status !== 'Resign') m.push('tanpa target');
    if (m.length) checks.push(`<div><b>${esc(short(p.name))}</b> (${p.status}): ${m.join(', ')}</div>`);
  });
  const s = S.settings, sel = (k, opts) => `<select data-set="${k}">${opts.map(([v, n]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const dow = Core.DOW_ID.map((n, i) => `<label style="min-width:0"><input type="checkbox" data-off="${i}" ${s.offDays.includes(i) ? 'checked' : ''}> ${n}</label>`).join(' ');
  return `<div class="grid2">${cards}</div>
  <div class="card" style="margin-top:8px"><h3>Status data</h3><div class="log">
    ${S.period ? `<div>Periode plan: <b>${monthName(S.period)}</b> · pembanding: <b>${monthName(S.prev)}</b> · aktual s/d tgl <b>${S.lastDay}</b> · ${S.people.length} salesman</div>` : '<div class="mut">Belum ada data.</div>'}
    ${checks.join('')}${UI.log.map(m => `<div>${m}</div>`).join('')}</div>
    <div class="row"><button class="btn" data-act="sample">Muat contoh (Arjuna Nov 2026)</button></div></div>
  <div class="grid2"><div class="card"><h3>Perhitungan plan</h3>
    <div class="row"><label>Total plan per salesman</label>${sel('basis', [['target', 'Ikut target (BTI/Milestone)'], ['growth', 'Growth global vs bulan lalu']])}</div>
    <div class="row"><label>Growth global (%)</label><input type="number" step="0.5" data-set="growth" value="${nf(s.growth * 100, 1).replace(',', '.')}" style="width:70px"> <span class="mut">dipakai bila basis = growth, atau tanpa target</span></div>
    <div class="row"><label>Ikuti pola bulan lalu (%)</label><input type="number" min="0" max="100" step="5" data-set="pattern" value="${Math.round(s.pattern * 100)}" style="width:70px"> <span class="mut">0 = merata, 100 = persis pola</span></div>
    <div class="row"><label>Aktual s/d tanggal</label><input type="number" min="0" max="31" data-set="lastDay" value="${S.lastDay}" style="width:70px"> <label style="min-width:0"><input type="checkbox" data-set="autoLast" ${s.autoLast ? 'checked' : ''}> otomatis dari data</label></div>
    <div class="row"><label>Hari libur (tanpa omset)</label>${dow}</div>
    <div class="row"><label>Pembanding growth harian</label>${sel('cmp', [['workday', 'Hari kerja ke-N'], ['date', 'Tanggal yang sama']])}</div></div>
  <div class="card"><h3>Plan SO</h3>
    <div class="row"><label>Jeda SO → omset (hari)</label><input type="number" min="0" max="7" data-set="lag" value="${s.lag}" style="width:70px"></div>
    <div class="row"><label>Cara hitung jeda</label>${sel('lagMode', [['cal', 'Hari kalender (SO Minggu → Sabtu)'], ['work', 'Hari kerja']])}</div>
    <h3 style="margin-top:10px">Tim</h3>
    ${S.teams.map(t => `<div class="row"><input type="text" data-tn="${t.id}" value="${esc(t.name)}" style="width:140px"></div>`).join('')}
    <div class="row"><button class="btn sm" data-act="addteam">+ Tim</button> <button class="btn sm" data-act="resetall" style="margin-left:auto;color:#b91c1c">Hapus semua data</button></div></div></div>`;
}

/* ----- modal baseline ----- */
function modal() {
  const m = UI.modal; if (!m) return '';
  const p = S.people.find(x => x.id === m.pid);
  const opts = id => S.people.filter(x => x.id !== m.pid || true).map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(short(x.name))}${S.prevData[x.id] ? '' : ' (tanpa data)'}</option>`).join('');
  return `<div class="modal"><div class="box"><h3>Baseline ${esc(short(p.name))}</h3>
    <div class="mut" style="margin-bottom:6px">Omset bulan lalu siapa yang jadi acuan? Boleh gabungan (mis. Rossi 60% + Steven 40%).</div>
    ${m.rows.map((r, i) => `<div class="row"><select data-mb="id" data-i="${i}">${opts(r.id)}</select><input type="number" data-mb="pct" data-i="${i}" value="${Math.round(r.pct * 100)}" style="width:64px"> % <button class="btn sm" data-act="mbdel" data-i="${i}">✕</button></div>`).join('')}
    <div class="row"><button class="btn sm" data-act="mbadd">+ Tambah sumber</button></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="mbself">Pakai data sendiri</button><button class="btn" data-act="mbcancel">Batal</button><button class="btn pri" data-act="mbsave">Simpan</button></div></div></div>`;
}

/* ---------- edit inline ---------- */
function startEdit(td) {
  if (td.classList.contains('editing')) return;
  const kind = td.dataset.edit, raw = td.dataset.raw || '';
  const html = td.innerHTML; td.classList.add('editing'); td.textContent = '';
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = raw; td.appendChild(inp); inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    if (!ok) { td.classList.remove('editing'); td.innerHTML = html; return; }
    commit(kind, td.dataset.p, +td.dataset.d, inp.value);
    save(); render();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(inp.value !== raw));
}
function commit(kind, pid, d, text) {
  const ctx = kind === 'growth' ? 'pct' : 'amount';
  const inp = Core.parseInput(text, ctx);
  if (inp.err) return toast('Format tidak dikenali: ' + text);
  S.plan[pid] = S.plan[pid] || {};
  if (kind === 'day') Core.setDayOverride(S, pid, d, inp.clear ? null : inp);
  else if (kind === 'so') { if (!Core.soEdit(S, COMP, pid, d, inp)) toast('SO ini sudah terealisasi'); }
  else if (kind === 'total' || kind === 'growth') { if (inp.clear) delete S.plan[pid].total; else S.plan[pid].total = inp; }
}

/* ---------- upload / io ---------- */
async function readRows(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Format harus .xlsx (simpan ulang dulu kalau .xls)');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
  return Core.sheetToRows(wb.worksheets[0]);
}
async function handleUpload(kind, files) {
  const team = ($('#ts-' + kind) || {}).value || S.teams[0].id;
  for (const f of files) {
    try {
      const rows = await readRows(f);
      if (kind === 'tgt') {
        const r = Core.ingestTargets(S, Core.parseTargets(rows), team);
        logMsg(`✅ ${esc(f.name)}: target ${r.matched.length + r.created.length} salesman${r.created.length ? ' · baru: ' + esc(r.created.join(', ')) : ''}`);
      } else {
        const p = Core.parseOmset(rows);
        const r = Core.ingestOmset(S, p, kind, team);
        logMsg(`✅ ${esc(f.name)}: ${Object.keys(p.data).length} salesman, periode ${p.period ? monthName(p.period) : '(tidak terbaca)'}${r.created.length ? ' · baru: ' + esc(r.created.join(', ')) : ''}`);
      }
    } catch (e) { logMsg(`❌ ${esc(f.name)}: ${esc(e.message)}`); }
  }
  Core.syncPeriod(S); save(); render();
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---------- export Excel (format template Plan BE) ---------- */
const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
function buildSheet(wb, name, mode, ps, comp) {
  const c = comp.c, n = c.n, D0 = 10, dc = d => D0 + d - 1, blank = D0 + n, tot = blank + 1, wk0 = tot + 1;
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 9, ySplit: 3 }] });
  const NUM = '#,###,,', FILL = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
  [[2, 13], [3, 36], [4, 8], [5, 24], [6, 24], [7, 14], [8, 12], [9, 12]].forEach(([i, w]) => ws.getColumn(i).width = w);
  for (let d = 1; d <= n; d++) ws.getColumn(dc(d)).width = 7.5;
  ws.getColumn(blank).width = 3; ws.getColumn(tot).width = 13; for (let w = 0; w < c.nWeeks; w++) ws.getColumn(wk0 + w).width = 12;
  const bold = { name: 'Calibri', size: 11, bold: true };
  ws.getCell(1, D0).value = mode === 'so' ? 'SO' : 'BE'; ws.getCell(1, D0).font = bold;
  ws.getCell(2, 7).value = Core.MONTH_ID[S.period.month - 1]; ws.getCell(2, 7).font = bold;
  c.days.forEach(x => ws.getCell(2, dc(x.d)).value = Core.DOW_ID[x.dow]);
  ws.getCell(2, wk0).value = 'Total'; ws.getCell(2, wk0).font = bold;
  const tn = S.settings.target === 'ms' ? 'Milestone' : 'BTI', mon3 = Core.MONTH_ID[S.period.month - 1].slice(0, 3);
  const heads = ['Depo', 'Type Salesman', 'Nik', 'Nama Salesman', 'Nama SAC'];
  heads.forEach((h, i) => { const x = ws.getCell(3, 2 + i); x.value = h; x.font = bold; x.fill = FILL('FFD9E1F2'); });
  [[7, 'Total Target ' + tn], [8, 'Tgt Daily'], [9, `LY ${mon3}'${String(S.period.year - 1).slice(2)}`]].forEach(([i, h]) => { const x = ws.getCell(3, i); x.value = h; x.font = bold; x.fill = FILL('FFED7D31'); x.alignment = { horizontal: 'center' }; });
  for (let d = 1; d <= n; d++) { const x = ws.getCell(3, dc(d)); x.value = d; x.fill = FILL('FF00B0F0'); x.alignment = { horizontal: 'center' }; }
  ws.getCell(3, blank).fill = FILL('FF00B0F0');
  const yh = (col, v) => { const x = ws.getCell(3, col); x.value = v; x.font = bold; x.fill = FILL('FFFFFF00'); x.alignment = { horizontal: 'center' }; };
  yh(tot, mode === 'so' ? 'Total SO' : 'Total BE'); for (let w = 0; w < c.nWeeks; w++) yh(wk0 + w, (mode === 'so' ? 'SO WEEK' : 'BE WEEK') + (w + 1));
  const wkRange = w => { const ds = c.days.filter(x => Core.weekOf(c, x.d) === w).map(x => x.d); return [dc(ds[0]), dc(ds[ds.length - 1])]; };
  const nWork = c.work.length;
  const byDepo = []; ps.forEach(p => { const k = p.depo || 'SP Kebayoran'; let g = byDepo.find(x => x.k === k); if (!g) byDepo.push(g = { k, ps: [] }); g.ps.push(p); });
  let r = 4; const subRows = [], sums = [];
  const style = (cell, o) => { cell.numFmt = NUM; if (o.fill) cell.fill = FILL(o.fill); if (o.bold) cell.font = bold; };
  byDepo.forEach(g => {
    const first = r, gs = { g: 0, h: 0, i: 0, days: new Array(n + 1).fill(0), t: 0, wk: new Array(c.nWeeks).fill(0) };
    g.ps.forEach(p => {
      const res = comp.res[p.id];
      const arr = mode === 'so' ? Core.soSeries(c, comp.so, res.plan) : res.plan.map((v, d) => c.days[d - 1] && c.days[d - 1].off ? null : v);
      [p.depo || 'SP Kebayoran', p.type, p.nik, p.name, p.sac].forEach((v, i) => ws.getCell(r, 2 + i).value = v || null);
      const tg = res.tgt; ws.getCell(r, 7).value = tg || null; style(ws.getCell(r, 7), {});
      ws.getCell(r, 8).value = { formula: `G${r}/${nWork}`, result: tg / nWork }; style(ws.getCell(r, 8), { fill: 'FFD9D9D9' });
      const ly = +p.ly || null; ws.getCell(r, 9).value = ly; style(ws.getCell(r, 9), {});
      let t = 0; const wk = new Array(c.nWeeks).fill(0);
      for (let d = 1; d <= n; d++) {
        const cell = ws.getCell(r, dc(d)), v = arr[d]; style(cell, {});
        if (c.days[d - 1].off) cell.fill = FILL('FFC00000');
        if (v != null && !c.days[d - 1].off) { const rv = Math.round(v); cell.value = rv; t += rv; wk[Core.weekOf(c, d)] += rv; gs.days[d] += rv; }
      }
      ws.getCell(r, tot).value = { formula: `SUM(${colL(dc(1))}${r}:${colL(dc(n))}${r})`, result: t }; style(ws.getCell(r, tot), {});
      for (let w = 0; w < c.nWeeks; w++) { const [a, b] = wkRange(w); const cell = ws.getCell(r, wk0 + w); cell.value = { formula: `SUM(${colL(a)}${r}:${colL(b)}${r})`, result: wk[w] }; style(cell, { fill: 'FFD9D9D9' }); gs.wk[w] += wk[w]; }
      gs.g += tg; gs.h += tg / nWork; gs.i += ly || 0; gs.t += t; r++;
    });
    const last = r - 1, sr = r; subRows.push(sr);
    for (let col = 2; col < wk0 + c.nWeeks; col++) { const x = ws.getCell(sr, col); x.fill = FILL('FFD9E1F2'); x.numFmt = NUM; }
    ws.getCell(sr, 2).value = 'Total ' + g.k; ws.getCell(sr, 2).font = bold;
    const sf = (col, val) => { ws.getCell(sr, col).value = { formula: `SUM(${colL(col)}${first}:${colL(col)}${last})`, result: val }; };
    sf(7, gs.g); sf(8, gs.h); sf(9, gs.i);
    for (let d = 1; d <= n; d++) if (!c.days[d - 1].off) sf(dc(d), gs.days[d]);
    sf(tot, gs.t); for (let w = 0; w < c.nWeeks; w++) sf(wk0 + w, gs.wk[w]);
    sums.push(gs); r++;
  });
  if (byDepo.length > 1) {
    const sr = r;
    for (let col = 2; col < wk0 + c.nWeeks; col++) { const x = ws.getCell(sr, col); x.fill = FILL('FFD9E1F2'); x.numFmt = NUM; x.font = bold; }
    ws.getCell(sr, 2).value = 'GRAND TOTAL';
    const gf = (col, val) => { ws.getCell(sr, col).value = { formula: subRows.map(x => colL(col) + x).join('+'), result: val }; };
    gf(7, sums.reduce((a, s) => a + s.g, 0)); gf(8, sums.reduce((a, s) => a + s.h, 0)); gf(9, sums.reduce((a, s) => a + s.i, 0));
    for (let d = 1; d <= n; d++) if (!c.days[d - 1].off) gf(dc(d), sums.reduce((a, s) => a + s.days[d], 0));
    gf(tot, sums.reduce((a, s) => a + s.t, 0)); for (let w = 0; w < c.nWeeks; w++) gf(wk0 + w, sums.reduce((a, s) => a + s.wk[w], 0));
  }
}
async function exportXlsx() {
  if (!COMP) return toast('Belum ada data');
  const ps = persons().filter(p => p.exp !== false);
  if (!ps.length) return toast('Tidak ada salesman yang ikut export');
  const wb = new ExcelJS.Workbook();
  buildSheet(wb, 'Plan BE', 'omset', ps, COMP);
  buildSheet(wb, 'Plan SO', 'so', ps, COMP);
  const buf = await wb.xlsx.writeBuffer();
  const tn = UI.team === 'all' ? 'Semua' : teamName(UI.team);
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Plan_BE_${Core.MONTH_ID[S.period.month - 1]}_${S.period.year}_${tn}.xlsx`);
  toast('Export selesai');
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]');
  if (ed && !e.target.closest('input')) { startEdit(ed); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v, pid = b.dataset.p;
  if (a === 'tab') UI.tab = v;
  else if (a === 'team') UI.team = v;
  else if (a === 'target') { S.settings.target = v; save(); }
  else if (a === 'export') return exportXlsx();
  else if (a === 'savejson') { download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `plan-omset-${S.period ? S.period.year + '-' + String(S.period.month).padStart(2, '0') : 'data'}.json`); return; }
  else if (a === 'loadjson') { $('#jsonin').click(); return; }
  else if (a === 'sample') { try { const r = await fetch('sample-state.json'); S = migrate(await r.json()); save(); UI.tab = 'plan'; toast('Contoh dimuat'); } catch (er) { toast('Gagal memuat contoh'); return; } }
  else if (a === 'reset') { delete S.plan[pid]; save(); }
  else if (a === 'addperson') { const n = prompt('Nama salesman:'); if (n) { Core.addPerson(S, n, UI.team === 'all' ? S.teams[0].id : UI.team); save(); } }
  else if (a === 'delperson') { const p = S.people.find(x => x.id === pid); if (confirm('Hapus ' + p.name + ' beserta datanya?')) { S.people = S.people.filter(x => x.id !== pid); [S.prevData, S.curData, S.plan, S.targets.bti, S.targets.ms].forEach(o => delete o[pid]); S.people.forEach(q => q.baseFrom && (q.baseFrom = q.baseFrom.filter(x => x.id !== pid))); save(); } }
  else if (a === 'addteam') { const n = prompt('Nama tim baru:'); if (n) { S.teams.push({ id: 't' + Date.now(), name: n }); save(); } }
  else if (a === 'resetall') { if (confirm('Hapus SEMUA data dan edit?')) { S = Core.newState(); save(); UI.log = []; } }
  else if (a === 'basemodal') { const p = S.people.find(x => x.id === pid); UI.modal = { pid, rows: (p.baseFrom && p.baseFrom.length ? p.baseFrom : [{ id: pid, pct: 1 }]).map(x => ({ ...x })) }; }
  else if (a === 'mbadd') UI.modal.rows.push({ id: UI.modal.pid, pct: 0.5 });
  else if (a === 'mbdel') UI.modal.rows.splice(+b.dataset.i, 1);
  else if (a === 'mbcancel') UI.modal = null;
  else if (a === 'mbself') { S.people.find(x => x.id === UI.modal.pid).baseFrom = null; UI.modal = null; save(); }
  else if (a === 'mbsave') { const p = S.people.find(x => x.id === UI.modal.pid); const rs = UI.modal.rows.filter(x => x.pct > 0); p.baseFrom = rs.length ? rs : null; UI.modal = null; save(); }
  render();
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'jsonin') { try { S = migrate(JSON.parse(await t.files[0].text())); save(); toast('Data dimuat'); } catch (er) { toast('File JSON tidak valid'); } render(); return; }
  if (t.dataset.up) { await handleUpload(t.dataset.up, [...t.files]); return; }
  if (t.dataset.mb) { const r = UI.modal.rows[+t.dataset.i]; if (t.dataset.mb === 'id') r.id = t.value; else r.pct = Math.max(0, (parseFloat(t.value) || 0) / 100); return; }
  if (t.dataset.set) {
    const k = t.dataset.set, s = S.settings;
    if (k === 'growth' || k === 'pattern') s[k] = (parseFloat(t.value) || 0) / 100;
    else if (k === 'lag') s.lag = Math.max(0, parseInt(t.value) || 0);
    else if (k === 'lastDay') { S.lastDay = Math.max(0, parseInt(t.value) || 0); s.autoLast = false; }
    else if (k === 'autoLast') { s.autoLast = t.checked; Core.syncPeriod(S); }
    else s[k] = t.value;
    save(); render(); return;
  }
  if (t.dataset.off !== undefined) { const i = +t.dataset.off, o = S.settings.offDays; S.settings.offDays = t.checked ? [...new Set([...o, i])] : o.filter(x => x !== i); save(); render(); return; }
  if (t.dataset.tn) { S.teams.find(x => x.id === t.dataset.tn).name = t.value || 'Tim'; save(); render(); return; }
  if (t.dataset.rf) {
    const p = S.people.find(x => x.id === t.dataset.p), f = t.dataset.rf, v = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'adjPct') p.adjPct = (parseFloat(String(v).replace(',', '.')) || 0) / 100;
    else if (f === 'adjAbs') { const i = Core.parseInput(v, 'signed'); p.adjAbs = i.clear ? 0 : (i.err ? p.adjAbs : (i.type === 'abs' ? i.v : 0)); }
    else if (f === 'ly') { const i = Core.parseInput(v, 'amount'); p.ly = i.clear || i.err ? null : i.v; }
    else if (f === 'tbti' || f === 'tms') { const i = Core.parseInput(v, 'amount'), tt = S.targets[f === 'tbti' ? 'bti' : 'ms']; if (i.clear) delete tt[p.id]; else if (!i.err) tt[p.id] = { total: i.v, cats: (tt[p.id] || {}).cats || {} }; }
    else if (f === 'exp') p.exp = v;
    else p[f] = v;
    save(); render();
  }
});
render();
})();
