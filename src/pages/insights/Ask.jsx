import React, { useState } from 'react';
import { Sparkles, Send, Wand2, Filter } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge } from '../../components/ui.jsx';
import { HBar, VBar, Stacked, Grouped, colorFor } from '../../components/charts.jsx';
import { parseQuestion, suggestions } from '../../lib/nlq.js';
import { applyFilters, frequency, crosstab, compareRounds, keyLabel, domainOf, valueOf, valueLabel } from '../../lib/analytics.js';
import { findQuestion } from '../../data/questionnaire.js';
import { GEO } from '../../data/geo.js';

function answer(s, text, parsed) {
  const qn = s.questionnaire;
  const p = parsed || parseQuestion(text, qn);
  const q = p.qid ? findQuestion(qn, p.qid) : null;
  if (!q) return { ...p, text, qLabel: '—', notes: p.notes || [], error: 'This questionnaire has no question that matches. Try the words used in the question itself.' };
  const list = applyFilters(s.valid, p.filters);
  const qLabel = keyLabel(qn, p.qid);
  if (!list.length) return { ...p, text, qLabel, n: 0, error: 'No interviews match these filters yet.' };
  let chart; let insight;
  if (p.by === 'round') {
    const rows = compareRounds(qn, p.qid, list, applyFilters(s.round2, p.filters));
    if (!rows || !s.round2.length) return { ...p, text, qLabel, error: 'This question can’t be compared across rounds (no earlier round for it).' };
    const big = [...rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    chart = <Grouped data={rows.map((r) => ({ label: r.label, prev: +r.prev.toFixed(1), now: +r.now.toFixed(1) }))} series={[{ key: 'prev', label: 'Round 2 (Aug)', color: '#cbd5e1' }, { key: 'now', label: 'Round 3 (Nov)', color: '#0d9488' }]} fmt={(v) => `${v}%`} />;
    insight = `The biggest change since Round 2 is “${big.label}”, which moved ${big.change > 0 ? 'up' : 'down'} ${Math.abs(big.change).toFixed(1)} points to ${big.now.toFixed(1)}%.`;
  } else if (q.type === 'grid') {
    const f = frequency(qn, p.qid, list);
    const top = q.cols?.length || 5;
    if (!f.gridRows.length) return { ...p, text, qLabel, error: 'No answers to this question yet.' };
    if (p.by) {
      const dom = domainOf(qn, p.by, list);
      const data = f.gridRows.map((g) => ({ label: g.label, ...Object.fromEntries(dom.map((d) => { const sub = list.filter((i) => valueOf(i, p.by) === d); const fr = frequency(qn, p.qid, sub).gridRows.find((x) => x.key === g.key); return [d, +(fr?.mean || 0).toFixed(2)]; })) }));
      chart = <Grouped data={data} series={dom.map((d, k) => ({ key: d, label: valueLabel(qn, p.by, d), color: colorFor('', d, k) }))} fmt={(v) => `${v}/${top}`} />;
    } else {
      const rows = [...f.gridRows].sort((a, b) => a.mean - b.mean).map((g) => ({ key: g.key, label: g.label, mean: +g.mean.toFixed(2) }));
      chart = <HBar rows={rows} valueKey="mean" fmt={(v) => `${v}/${top}`} single="#4f46e5" />;
    }
    const worst = [...f.gridRows].sort((a, b) => a.mean - b.mean)[0];
    insight = `${worst.label} is rated lowest, averaging ${worst.mean.toFixed(2)} out of ${top}; ${worst.goodPct.toFixed(0)}% give it one of the top two ratings.`;
  } else if (q.type === 'number') {
    const max = q.max ? `/${q.max}` : '';
    if (p.by) {
      const dom = domainOf(qn, p.by, list);
      const rows = dom.map((d) => {
        const vals = list.filter((i) => valueOf(i, p.by) === d).map((i) => Number(i.answers[p.qid])).filter((x) => !Number.isNaN(x));
        return { key: d, label: valueLabel(qn, p.by, d), mean: vals.length ? +(vals.reduce((a, x) => a + x, 0) / vals.length).toFixed(2) : 0 };
      }).filter((r) => r.mean);
      if (!rows.length) return { ...p, text, qLabel, error: 'No answers to this question yet.' };
      chart = <VBar rows={rows} valueKey="mean" color="#4f46e5" />;
      const hi = [...rows].sort((a, b) => b.mean - a.mean);
      insight = `Highest average among ${hi[0].label} (${hi[0].mean}${max}), lowest among ${hi[hi.length - 1].label} (${hi[hi.length - 1].mean}${max}).`;
    } else {
      const f = frequency(qn, p.qid, list);
      chart = <VBar rows={f.rows} />;
      insight = `The average answer is ${f.mean.toFixed(1)}${max ? ` out of ${q.max}` : ''}.`;
    }
  } else if (p.by) {
    const ct = crosstab(qn, p.by, p.qid, list);
    chart = <Stacked rows={ct.rows} cols={ct.cols} qid={p.qid} />;
    if (!ct.rows.length) return { ...p, text, qLabel, error: 'No answers to this question yet.' };
    const lead = ct.rows.map((r) => { const top = [...r.cells].sort((a, b) => b.pct - a.pct)[0]; return `${r.label}: ${ct.cols.find((c) => c.key === top.key).label} (${top.pct.toFixed(0)}%)`; });
    insight = `Top answer by ${keyLabel(qn, p.by).toLowerCase()} — ${lead.slice(0, 6).join('; ')}.`;
  } else {
    const f = frequency(qn, p.qid, list);
    const rows = (f.rows || []).filter((r) => r.count > 0);
    if (!rows.length) return { ...p, text, qLabel, error: 'No answers to this question yet.' };
    chart = <HBar rows={rows} qid={p.qid} />;
    const top = [...rows].sort((a, b) => b.pct - a.pct);
    insight = `“${top[0].label}” is the top answer at ${top[0].pct.toFixed(1)}%${top[1] ? `, followed by “${top[1].label}” at ${top[1].pct.toFixed(1)}%` : ''}.`;
  }
  return { ...p, text, qLabel, chart, insight, n: list.length };
}

export default function Ask() {
  const s = useStore();
  const [text, setText] = useState('');
  const tips = suggestions(s.questionnaire);
  const [items, setItems] = useState(() => (tips[0] ? [answer(s, tips[0])] : []));
  const [busy, setBusy] = useState(false);
  const ask = async (t) => {
    const q = (t ?? text).trim();
    if (!q) return;
    setText('');
    let parsed = null;
    if (s.server?.ai) {
      setBusy(true);
      try { parsed = await s.aiAsk(q); } catch { parsed = null; }
      setBusy(false);
    }
    setItems((x) => [answer(s, q, parsed), ...x].slice(0, 8));
  };
  return (
    <div>
      <PageHead eyebrow="Results & reports" icon={Sparkles} title="Ask the data in plain English" desc="Type a question the way you would ask a colleague. MSR Pulse works out which question, breakdown and filters you mean, and draws the chart. Every answer shows how it was understood, so it can be checked." />
      <Card style={{ marginBottom: 16 }}>
        <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Wand2 size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--indigo)' }} />
            <input className="input" style={{ height: 44, paddingLeft: 38, fontSize: 15 }} placeholder={`e.g. ${tips[1] || tips[0] || 'Results by gender'}${GEO.constituencies[0] ? ` in ${GEO.constituencies[0].name.en}` : ''}`} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button className="btn ai lg" type="submit" disabled={busy}><Send size={16} /><span className="hide-sm">{busy ? 'Thinking…' : 'Ask'}</span></button>
        </form>
        <div className="row mt12">{tips.map((x) => <button key={x} className="chip" onClick={() => ask(x)}>{x}</button>)}</div>
      </Card>
      <div className="stack">
        {items.map((it, k) => (
          <Card key={`${it.text}-${k}`} title={<span className="row"><Sparkles size={15} color="#4f46e5" />{it.text}</span>}
            sub={<span className="row" style={{ gap: 6, marginTop: 4 }}><Filter size={12} />Understood as: <Badge tone="indigo">{it.qLabel}</Badge>{it.by && <Badge tone="teal">by {it.by === 'round' ? 'round' : keyLabel(s.questionnaire, it.by)}</Badge>}{(it.notes || []).map((n) => <Badge key={n} tone="amber">{n}</Badge>)}{it.ai && <Badge tone="indigo">understood by Claude</Badge>}<span className="tiny muted">base {it.n?.toLocaleString('en-IN')}</span></span>}>
            {it.error ? <div className="muted">{it.error}</div> :<>{it.chart}<div className="callout indigo small mt12"><Sparkles size={15} style={{ flexShrink: 0, marginTop: 2 }} />{it.insight}</div></>}
          </Card>
        ))}
      </div>
    </div>
  );
}
