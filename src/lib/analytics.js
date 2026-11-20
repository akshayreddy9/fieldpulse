// Pulse Insights analytics: frequencies, roll-ups (booth -> state), cross-tabs and round comparison.
// Questions are found by their role (lib/roles.js), not by fixed ids, so any questionnaire works.
import { GEO, CONST_BY_ID, MANDAL_BY_ID, BOOTH_BY_ID, ageBand, defaultTargets } from '../data/geo.js';
import { findQuestion, optionLabel, allQuestions } from '../data/questionnaire.js';
import { R, A, AGE_BANDS, activeQuestionnaire } from './roles.js';

// Ways to break results down: geography plus the questionnaire's profile questions (when it has them)
export function dimensions(qn = activeQuestionnaire()) {
  const r = (role) => R(role, qn);
  return [
    { key: 'constituency', en: 'Constituency' },
    { key: 'mandal', en: 'Mandal' },
    r('gender') && { key: r('gender'), en: 'Gender' },
    r('age') && { key: 'ageBand', en: 'Age group' },
    r('caste') && { key: r('caste'), en: 'Caste category' },
    r('occupation') && { key: r('occupation'), en: 'Occupation' },
    r('scheme') && { key: r('scheme'), en: findQuestion(qn, r('scheme'))?.label.en || 'Yes / No group' },
  ].filter(Boolean);
}

const AGE_ORDER = AGE_BANDS;

export function valueOf(i, key) {
  switch (key) {
    case 'constituency': return i.constituencyId;
    case 'mandal': return i.mandalId;
    case 'booth': return i.boothId;
    case 'ageBand': return ageBand(A(i, 'age'));
    case 'round': return `R${i.round}`;
    default: return i.answers[key];
  }
}

export function keyLabel(qn, key, lang = 'en') {
  const d = dimensions(qn).find((x) => x.key === key);
  const q = findQuestion(qn, key);
  if (q) return q.label[lang] || q.label.en;
  if (d) return d.en;
  return key;
}

export function valueLabel(qn, key, v, lang = 'en') {
  if (key === 'constituency') return CONST_BY_ID[v]?.name[lang] || v;
  if (key === 'mandal') return MANDAL_BY_ID[v]?.name[lang] || v;
  if (key === 'booth') return BOOTH_BY_ID[v]?.short || v;
  if (key === 'ageBand') return v;
  if (key === 'round') return v === 'R3' ? 'Round 3 (Nov)' : v === 'R2' ? 'Round 2 (Aug)' : 'Round 1 (May)';
  return optionLabel(findQuestion(qn, key), v, lang);
}

export function domainOf(qn, key, list) {
  if (key === 'constituency') return GEO.constituencies.map((c) => c.id);
  if (key === 'mandal') return GEO.mandals.map((m) => m.id).filter((id) => list.some((i) => i.mandalId === id));
  if (key === 'ageBand') return AGE_ORDER;
  const q = findQuestion(qn, key);
  if (q && q.options) return [...q.options.map((o) => o.v), ...(q.allowOther ? ['OTHER'] : [])];
  return [...new Set(list.map((i) => valueOf(i, key)).filter((x) => x !== undefined))];
}

export function applyFilters(list, f = {}) {
  return list.filter((i) =>
    (!f.constituency || i.constituencyId === f.constituency) &&
    (!f.mandal || i.mandalId === f.mandal) &&
    (!f.booth || i.boothId === f.booth) &&
    (!f.gender || A(i, 'gender') === f.gender) &&
    (!f.ageBand || ageBand(A(i, 'age')) === f.ageBand) &&
    (!f.caste || A(i, 'caste') === f.caste) &&
    (!f.occupation || A(i, 'occupation') === f.occupation));
}

// Frequency for one question. Returns { type, base, rows, mean?, gridRows?, samples? }, or null if the
// questionnaire has no such question (callers must then skip that chart).
export function frequency(qn, qid, list, lang = 'en') {
  const q = qid ? findQuestion(qn, qid) : null;
  if (!q) return null;
  const asked = list.filter((i) => i.answers[qid] !== undefined && i.answers[qid] !== '');
  const base = asked.length;
  if (q.type === 'single' || q.type === 'multiple') {
    const counts = {};
    asked.forEach((i) => {
      const v = i.answers[qid];
      (Array.isArray(v) ? v : [v]).forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    });
    const keys = [...q.options.map((o) => o.v), ...(q.allowOther ? ['OTHER'] : [])];
    const rows = keys.map((k) => ({ key: k, label: optionLabel(q, k, lang), count: counts[k] || 0, pct: base ? ((counts[k] || 0) / base) * 100 : 0 }));
    const others = q.allowOther ? asked.map((i) => i.answers[`${qid}_other`]).filter(Boolean) : [];
    return { q, type: q.type, base, rows, others };
  }
  if (q.type === 'number') {
    const vals = asked.map((i) => Number(i.answers[qid])).filter((x) => !Number.isNaN(x));
    const mean = vals.reduce((s, x) => s + x, 0) / (vals.length || 1);
    let bins;
    if (q.max && q.max <= 10) {
      bins = Array.from({ length: q.max - (q.min || 1) + 1 }, (_, k) => (q.min || 1) + k).map((v) => ({ key: String(v), label: String(v), count: vals.filter((x) => x === v).length }));
    } else {
      bins = AGE_ORDER.map((b) => ({ key: b, label: b, count: vals.filter((x) => ageBand(x) === b).length }));
    }
    bins.forEach((b) => { b.pct = base ? (b.count / base) * 100 : 0; });
    return { q, type: 'number', base, rows: bins, mean };
  }
  if (q.type === 'grid') {
    const gridRows = q.rows.map((r) => {
      const dist = q.cols.map((c) => ({ key: c.v, label: c[lang] || c.en, count: 0 }));
      let sum = 0;
      let n = 0;
      asked.forEach((i) => {
        const v = i.answers[qid]?.[r.v];
        const d = dist.find((x) => x.key === v);
        if (d) { d.count++; sum += Number(v); n++; }
      });
      dist.forEach((d) => { d.pct = n ? (d.count / n) * 100 : 0; });
      // "Good" = the top two points of the scale (Good + Very good on a 5-point scale)
      const top = dist.slice(-2).reduce((a, d) => a + d.count, 0);
      return { key: r.v, label: r[lang] || r.en, mean: n ? sum / n : 0, dist, goodPct: n ? (top / n) * 100 : 0 };
    });
    return { q, type: 'grid', base, gridRows };
  }
  if (q.type === 'cascade') {
    const rows = GEO.constituencies.map((c) => {
      const count = asked.filter((i) => i.constituencyId === c.id).length;
      return { key: c.id, label: c.name[lang], count, pct: base ? (count / base) * 100 : 0 };
    });
    return { q, type: 'cascade', base, rows };
  }
  if (q.type === 'date') {
    const counts = {};
    asked.forEach((i) => { counts[i.answers[qid]] = (counts[i.answers[qid]] || 0) + 1; });
    const rows = Object.keys(counts).sort().map((k) => ({ key: k, label: new Date(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), count: counts[k], pct: (counts[k] / base) * 100 }));
    return { q, type: 'date', base, rows };
  }
  if (q.type === 'gps' || q.type === 'photo') {
    const yes = asked.filter((i) => !!i.answers[qid]).length;
    return { q, type: q.type, base: list.length, rows: [{ key: 'Y', label: q.type === 'gps' ? 'Location captured' : 'Photo attached', count: yes, pct: list.length ? (yes / list.length) * 100 : 0 }, { key: 'N', label: 'Missing', count: list.length - yes, pct: list.length ? ((list.length - yes) / list.length) * 100 : 0 }] };
  }
  // text
  return { q, type: 'text', base, samples: asked.slice(0, 8).map((i) => ({ id: i.id, value: i.answers[qid] })) };
}

// Cross-tab: rows = rowKey values, cols = colKey values, cell = row %
export function crosstab(qn, rowKey, colKey, list, lang = 'en') {
  const rowsDom = domainOf(qn, rowKey, list);
  const colsDom = domainOf(qn, colKey, list);
  const rows = rowsDom.map((rv) => {
    const sub = list.filter((i) => {
      const v = valueOf(i, rowKey);
      return Array.isArray(v) ? v.includes(rv) : v === rv;
    });
    const cells = colsDom.map((cv) => {
      const c = sub.filter((i) => {
        const v = valueOf(i, colKey);
        return Array.isArray(v) ? v.includes(cv) : v === cv;
      }).length;
      return { key: cv, count: c, pct: sub.length ? (c / sub.length) * 100 : 0 };
    });
    return { key: rv, label: valueLabel(qn, rowKey, rv, lang), base: sub.length, cells };
  }).filter((r) => r.base > 0);
  const cols = colsDom.map((cv) => ({ key: cv, label: valueLabel(qn, colKey, cv, lang) }));
  return { rows, cols };
}

// Safe helpers for screens: empty results instead of a crash when the questionnaire lacks the question
export const freqRows = (qn, qid, list, lang) => frequency(qn, qid, list, lang)?.rows || [];
export const gridRowsOf = (qn, qid, list, lang) => frequency(qn, qid, list, lang)?.gridRows || [];

export function compareRounds(qn, qid, cur, prev, lang = 'en') {
  const a = frequency(qn, qid, cur, lang);
  const b = frequency(qn, qid, prev, lang);
  if (!a || !b || !a.rows) return null;
  return a.rows.map((r) => {
    const p = b.rows.find((x) => x.key === r.key);
    return { key: r.key, label: r.label, now: r.pct, prev: p ? p.pct : 0, change: r.pct - (p ? p.pct : 0) };
  });
}

// Achievement against quota for a set of booths
export function boothProgress(boothId, list, targetsMap) {
  const t = (targetsMap && targetsMap[boothId]) || defaultTargets(BOOTH_BY_ID[boothId]);
  const sub = list.filter((i) => i.boothId === boothId);
  const g = {};
  const a = {};
  const c = {};
  const inc = (o, k) => { if (k !== undefined && k !== null && k !== '') o[k] = (o[k] || 0) + 1; };
  sub.forEach((i) => {
    inc(g, A(i, 'gender'));
    inc(a, ageBand(A(i, 'age')));
    inc(c, A(i, 'caste'));
  });
  return { target: t, done: sub.length, pct: t.total ? Math.min(100, (sub.length / t.total) * 100) : 0, gender: g, age: a, caste: c };
}

// Roll-up: booth -> mandal -> constituency -> state, with totals computed automatically.
// metricKey: the question whose answer shares are shown (default: the questionnaire's "Main result" question).
export function rollup(list, targetsMap, metricKey = R('main')) {
  const node = (sub, target) => {
    const counts = {};
    if (metricKey) sub.forEach((i) => { const v = i.answers[metricKey]; if (v !== undefined) counts[v] = (counts[v] || 0) + 1; });
    const share = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / (sub.length || 1)) * 100]));
    return { n: sub.length, target, pct: target ? (sub.length / target) * 100 : 0, share };
  };
  const tOf = (bid) => ((targetsMap && targetsMap[bid]) || defaultTargets(BOOTH_BY_ID[bid])).total;
  const state = { id: 'STATE', level: 'State', children: [] };
  let stateTarget = 0;
  GEO.constituencies.forEach((c) => {
    const cNode = { id: c.id, level: 'Constituency', name: c.name, children: [] };
    let cT = 0;
    c.mandalIds.forEach((mid) => {
      const m = MANDAL_BY_ID[mid];
      const mNode = { id: mid, level: 'Mandal', name: m.name, children: [] };
      let mT = 0;
      m.boothIds.forEach((bid) => {
        const b = BOOTH_BY_ID[bid];
        const t = tOf(bid);
        mT += t;
        mNode.children.push({ id: bid, level: 'Booth', name: b.name, short: b.short, ...node(list.filter((i) => i.boothId === bid), t) });
      });
      cT += mT;
      Object.assign(mNode, node(list.filter((i) => i.mandalId === mid), mT));
      cNode.children.push(mNode);
    });
    stateTarget += cT;
    Object.assign(cNode, node(list.filter((i) => i.constituencyId === c.id), cT));
    state.children.push(cNode);
  });
  Object.assign(state, node(list, stateTarget));
  return state;
}

export function questionsForAnalysis(qn) {
  return allQuestions(qn).filter((q) => !q.pii);
}

export const istDay = (t) => new Date(t + 19800000).toISOString().slice(0, 10);
export const latestDay = (list) => list.reduce((m, i) => (istDay(i.startedAt) > m ? istDay(i.startedAt) : m), '');

export const fmtPct =(x, d = 1) => `${(x || 0).toFixed(d)}%`;
export const fmtNum = (x) => (x || 0).toLocaleString('en-IN');
