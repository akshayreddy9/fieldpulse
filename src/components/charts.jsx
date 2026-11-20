import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend, LabelList } from 'recharts';
import { PARTY_COLORS } from '../data/questionnaire.js';
import { R } from '../lib/roles.js';

export const SCALE5 = ['#e11d48', '#fb923c', '#cbd5e1', '#5eead4', '#0d9488'];
export const CAT = ['#1e3a5f', '#0d9488', '#4f46e5', '#f59e0b', '#e11d48', '#0ea5e9', '#84cc16', '#a855f7', '#64748b', '#f97316'];

// Party colours for the main result when its answers use party codes (A, B, C, IND, UND, NS); otherwise a palette
export function colorFor(qid, key, k = 0) {
  if (qid && (qid === 'q_vote_intent' || qid === 'q_lean' || qid === R('main')) && PARTY_COLORS[key]) return PARTY_COLORS[key];
  if (qid === 'q_leader' && ['LA', 'LB', 'LC'].includes(key)) return { LA: PARTY_COLORS.A, LB: PARTY_COLORS.B, LC: PARTY_COLORS.C }[key];
  if (/^(und|ns|dk|none)$/i.test(String(key))) return '#94a3b8';
  return CAT[(k || 0) % CAT.length];
}

const pct = (v) => `${Number(v).toFixed(1)}%`;

export function HBar({ rows, qid, height, valueKey = 'pct', fmt = pct, single }) {
  const h = height || Math.max(120, rows.length * 34 + 10);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip formatter={(v) => fmt(v)} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} barSize={18}>
            {rows.map((r, k) => <Cell key={r.key} fill={single || colorFor(qid, r.key, k)} />)}
            <LabelList dataKey={valueKey} position="right" formatter={fmt} style={{ fontSize: 11.5, fill: '#334155', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VBar({ rows, color = '#0d9488', height = 220, valueKey = 'count', fmt }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11.5, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={fmt} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey={valueKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={44}>
            <LabelList dataKey={valueKey} position="top" formatter={fmt} style={{ fontSize: 11, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 100% stacked horizontal bars: rows [{label, cells:[{key,pct}]}], cols [{key,label}]
export function Stacked({ rows, cols, qid, height, colors }) {
  const data = rows.map((r) => ({ label: r.label, ...Object.fromEntries(r.cells.map((c) => [c.key, Number(c.pct.toFixed(1))])) }));
  const h = height || Math.max(160, rows.length * 38 + 60);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} stackOffset="expand">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip formatter={(v) => `${v}%`} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {cols.map((c, k) => (
            <Bar key={c.key} dataKey={c.key} name={c.label} stackId="a" fill={colors ? colors[k] : colorFor(qid, c.key, k)} barSize={22}>
              <LabelList dataKey={c.key} position="center" formatter={(v) => (v >= 8 ? `${Math.round(v)}` : '')} style={{ fontSize: 10.5, fill: '#fff', fontWeight: 700 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Grouped({ data, series, height = 260, fmt = pct }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11.5, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={fmt} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[5, 5, 0, 0]} maxBarSize={34} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
