import React, { useState } from 'react';
import { Sparkles, Send, Wand2, Filter } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge } from '../../components/ui.jsx';
import { HBar, VBar, Stacked, Grouped, colorFor } from '../../components/charts.jsx';
import { parseQuestion, SUGGESTIONS } from '../../lib/nlq.js';
import { applyFilters, frequency, crosstab, compareRounds, keyLabel, domainOf, valueOf, valueLabel } from '../../lib/analytics.js';

function answer(s, text, parsed) {
  const qn = s.questionnaire;
  const p = parsed || parseQuestion(text);
  const list = applyFilters(s.valid, p.filters);
  const qLabel = keyLabel(qn, p.qid);
  let chart; let insight;
  if (p.by === 'round') {
    const rows = compareRounds(qn, p.qid, list, applyFilters(s.round2, p.filters));
    if (!rows) return { ...p, error: true };
    const big = [...rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    chart = <Grouped data={rows.map((r) => ({ label: r.label, prev: +r.prev.toFixed(1), now: +r.now.toFixed(1) }))} series={[{ key: 'prev', label: 'Round 2 (Aug)', color: '#cbd5e1' }, { key: 'now', label: 'Round 3 (Nov)', color: '#0d9488' }]} fmt={(v) => `${v}%`} />;
    insight = `The biggest change since Round 2 is “${big.label}”, which moved ${big.change > 0 ? 'up' : 'down'} ${Math.abs(big.change).toFixed(1)} points to ${big.now.toFixed(1)}%.`;
  } else if (p.qid === 'q_services') {
    const f = frequency(qn, 'q_services', list);
    if (p.by) {
      const dom = domainOf(qn, p.by, list);
      const data = f.gridRows.map((g) => ({ label: g.label, ...Object.fromEntries(dom.map((d) => { const sub = list.filter((i) => valueOf(i, p.by) === d); const fr = frequency(qn, 'q_services', sub).gridRows.find((x) => x.key === g.key); return [d, +fr.mean.toFixed(2)]; })) }));
      chart = <Grouped data={data} series={dom.map((d, k) => ({ key: d, label: valueLabel(qn, p.by, d), color: colorFor('', d, k) }))} fmt={(v) => `${v}/5`} />;
    } else {
      const rows = [...f.gridRows].sort((a, b) => a.mean - b.mean).map((g) => ({ key: g.key, label: g.label, mean: +g.mean.toFixed(2) }));
      chart = <HBar rows={rows} valueKey="mean" fmt={(v) => `${v}/5`} single="#4f46e5" />;
    }
    const worst = [...f.gridRows].sort((a, b) => a.mean - b.mean)[0];
    insight = `${worst.label} is rated worst, averaging ${worst.mean.toFixed(2)} out of 5; only ${worst.goodPct.toFixed(0)}% rate it good or very good.`;
  } else if (p.qid === 'q_govt_rating') {
    if (p.by) {
      const dom = domainOf(qn, p.by, list);
      const rows = dom.map((d) => { const sub = list.filter((i) => valueOf(i, p.by) === d); return { key: d, label: valueLabel(qn, p.by, d), mean: sub.length ? +(sub.reduce((a, i) => a + i.answers.q_govt_rating, 0) / sub.length).toFixed(2) : 0 }; }).filter((r) => r.mean);
      chart = <VBar rows={rows} valueKey="mean" color="#4f46e5" />;
      const hi = [...rows].sort((a, b) => b.mean - a.mean);
      insight = `Highest rating among ${hi[0].label} (${hi[0].mean}/10), lowest among ${hi[hi.length - 1].label} (${hi[hi.length - 1].mean}/10).`;
    } else {
      const f = frequency(qn, p.qid, list);
      chart = <VBar rows={f.rows} />;
      insight = `The state government is rated ${f.mean.toFixed(1)} out of 10 on average.`;
    }
  } else if (p.by) {
    const ct = crosstab(qn, p.by, p.qid, list);
    chart = <Stacked rows={ct.rows} cols={ct.cols} qid={p.qid} />;
    const lead = ct.rows.map((r) => { const top = [...r.cells].sort((a, b) => b.pct - a.pct)[0]; return `${r.label}: ${ct.cols.find((c) => c.key === top.key).label} (${top.pct.toFixed(0)}%)`; });
    insight = `Top answer by ${keyLabel(qn, p.by).toLowerCase()} — ${lead.slice(0, 6).join('; ')}.`;
  } else {
    const f = frequency(qn, p.qid, list);
    const rows = f.rows.filter((r) => r.count > 0);
    chart = <HBar rows={rows} qid={p.qid} />;
    const top = [...rows].sort((a, b) => b.pct - a.pct);
    insight = `“${top[0].label}” is the top answer at ${top[0].pct.toFixed(1)}%${top[1] ? `, followed by “${top[1].label}” at ${top[1].pct.toFixed(1)}%` : ''}.`;
  }
  return { ...p, text, qLabel, chart, insight, n: list.length };
}

export default function Ask() {
  const s = useStore();
  const [text, setText] = useState('');
  const [items, setItems] = useState(() => [answer(s, 'Who is leading in each constituency?')]);
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
            <input className="input" style={{ height: 44, paddingLeft: 38, fontSize: 15 }} placeholder="e.g. Vote share among women in Karimnagar by age group" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <button className="btn ai lg" type="submit" disabled={busy}><Send size={16} /><span className="hide-sm">{busy ? 'Thinking…' : 'Ask'}</span></button>
        </form>
        <div className="row mt12">{SUGGESTIONS.map((x) => <button key={x} className="chip" onClick={() => ask(x)}>{x}</button>)}</div>
      </Card>
      <div className="stack">
        {items.map((it, k) => (
          <Card key={`${it.text}-${k}`} title={<span className="row"><Sparkles size={15} color="#4f46e5" />{it.text}</span>}
            sub={<span className="row" style={{ gap: 6, marginTop: 4 }}><Filter size={12} />Understood as: <Badge tone="indigo">{it.qLabel}</Badge>{it.by && <Badge tone="teal">by {it.by === 'round' ? 'round' : keyLabel(s.questionnaire, it.by)}</Badge>}{it.notes.map((n) => <Badge key={n} tone="amber">{n}</Badge>)}{it.ai && <Badge tone="indigo">understood by Claude</Badge>}<span className="tiny muted">base {it.n?.toLocaleString('en-IN')}</span></span>}>
            {it.error ? <div className="muted">This question can’t be compared across rounds.</div> : <>{it.chart}<div className="callout indigo small mt12"><Sparkles size={15} style={{ flexShrink: 0, marginTop: 2 }} />{it.insight}</div></>}
          </Card>
        ))}
      </div>
    </div>
  );
}
