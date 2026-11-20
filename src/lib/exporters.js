// Excel and PDF exports (run fully in the browser).
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { allQuestions, optionLabel } from '../data/questionnaire.js';
import { GEO, CONST_BY_ID, MANDAL_BY_ID, BOOTH_BY_ID, ageBand } from '../data/geo.js';
import { frequency } from './analytics.js';
import { codeFor } from './privacy.js';
import { piiQuestions, piiKind, A } from './roles.js';

const NAVY = [30, 58, 95];
const TEAL = [13, 148, 136];

function save(wb, name) {
  XLSX.writeFile(wb, name);
}

function answerText(q, v) {
  if (v === undefined || v === null || v === '') return '';
  if (q.type === 'single') return optionLabel(q, v);
  if (q.type === 'multiple') return v.map((x) => optionLabel(q, x)).join('; ');
  if (q.type === 'grid') return q.rows.map((r) => `${r.en}: ${v[r.v] || ''}`).join('; ');
  if (q.type === 'cascade') return `${CONST_BY_ID[v.constituency]?.name.en} / ${MANDAL_BY_ID[v.mandal]?.name.en} / ${BOOTH_BY_ID[v.booth]?.short}`;
  if (q.type === 'gps') return `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} (±${v.acc}m)`;
  if (q.type === 'photo') return v ? 'Yes' : 'No';
  return String(v);
}

export function exportResultsExcel(qn, list, { privacy = true, title = 'MSR-Pulse-Results' } = {}) {
  const wb = XLSX.utils.book_new();
  const qs = allQuestions(qn);
  const pii = new Set(piiQuestions(qn));
  // Summary sheet: every question's frequency table
  const rows = [[qn.title.en], [`Base: ${list.length} interviews`, `Exported ${new Date().toLocaleString('en-IN')}`], []];
  qs.filter((q) => !pii.has(q.id)).forEach((q) => {
    const f = frequency(qn, q.id, list);
    if (!f) return;
    rows.push([`${q.id.toUpperCase()} · ${q.label.en}`, `Base ${f.base}`]);
    if (f.rows) {
      rows.push(['Answer', 'Count', '%']);
      f.rows.forEach((r) => rows.push([r.label, r.count, Number(r.pct.toFixed(1))]));
      if (f.mean !== undefined) rows.push(['Average', Number(f.mean.toFixed(2))]);
    }
    if (f.gridRows) {
      if (!f.gridRows.length) { rows.push([]); return; }
      rows.push(['Item', ...f.gridRows[0].dist.map((d) => d.label + ' %'), `Average (1-${f.gridRows[0].dist.length})`]);
      f.gridRows.forEach((g) => rows.push([g.label, ...g.dist.map((d) => Number(d.pct.toFixed(1))), Number(g.mean.toFixed(2))]));
    }
    if (f.samples) f.samples.forEach((s) => rows.push([privacy ? codeFor(s.value) : s.value]));
    rows.push([]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1['!cols'] = [{ wch: 60 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Results');
  // Raw data
  const header = ['Interview ID', 'Constituency', 'Mandal', 'Booth', 'Surveyor', 'Start time', 'Duration (min)', 'Age group', ...qs.map((q) => q.label.en)];
  const data = list.map((i) => [
    i.id, CONST_BY_ID[i.constituencyId]?.name.en, MANDAL_BY_ID[i.mandalId]?.name.en, BOOTH_BY_ID[i.boothId]?.short, i.surveyorId,
    new Date(i.startedAt).toLocaleString('en-IN'), Number((i.durationSec / 60).toFixed(1)), ageBand(A(i, 'age', qn)) || '',
    ...qs.map((q) => {
      const v = i.answers[q.id];
      if (pii.has(q.id) && privacy) return codeFor(v, piiKind(qn, q.id));
      return answerText(q, v);
    }),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), 'Raw data');
  save(wb, `${title}.xlsx`);
}

export function exportTableExcel(sheetName, header, rows, fileName) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), sheetName.slice(0, 31));
  save(wb, fileName);
}

export function downloadSurveyorTemplate() {
  exportTableExcel('Surveyors', ['Name', 'Mobile', 'Gender', 'Role', 'Constituency code', 'Booth IDs (comma separated)', 'Device'], [
    // Examples use booths from the current booth list, so the IDs are ones that will be accepted
    ['Ravi Kumar', '9876543210', 'Male', 'Surveyor', GEO.booths[0]?.constituencyId || 'KNR', GEO.booths[0]?.id || 'KNR-101', 'Android'],
    ['Swathi Reddy', '9123456780', 'Female', 'Surveyor', GEO.booths[1]?.constituencyId || 'KNR', [GEO.booths[1]?.id, GEO.booths[2]?.id].filter(Boolean).join(',') || 'KNR-102', 'iPhone'],
  ], 'MSR-Pulse-Surveyor-Template.xlsx');
}

export async function readSheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// ---------- PDF ----------
function header(doc, title, sub) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('MSR Pulse', 14, 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(sub || '', w - 14, 11.5, { align: 'right' });
  doc.setTextColor(20, 30, 45);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 30);
  return 38;
}

function footer(doc) {
  const n = doc.internal.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 145);
    doc.text('Micro Studies and Research Organisation · Confidential', 14, h - 8);
    doc.text(`Page ${p} of ${n}`, w - 14, h - 8, { align: 'right' });
  }
}

function bars(doc, x, y, w, rows, opts = {}) {
  const max = opts.max || Math.max(...rows.map((r) => r.value), 1);
  const lw = opts.labelWidth || 48;
  rows.forEach((r, k) => {
    const yy = y + k * 8;
    doc.setFontSize(8.5);
    doc.setTextColor(50, 60, 75);
    doc.text(String(r.label).slice(0, 30), x, yy + 4.2);
    doc.setFillColor(235, 239, 245);
    doc.roundedRect(x + lw, yy, w - lw - 16, 5.5, 1, 1, 'F');
    const c = r.color ? hexToRgb(r.color) : TEAL;
    doc.setFillColor(...c);
    doc.roundedRect(x + lw, yy, Math.max(1, ((w - lw - 16) * r.value) / max), 5.5, 1, 1, 'F');
    doc.text(opts.fmt ? opts.fmt(r.value) : `${r.value.toFixed(1)}%`, x + w - 14, yy + 4.2);
  });
  return y + rows.length * 8 + 4;
}

function hexToRgb(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function paragraph(doc, text, y, opts = {}) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 10);
  doc.setTextColor(...(opts.color || [40, 48, 60]));
  const clean = text.replace(/[−–—]/g, '-').replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/•/g, '-');
  const lines = doc.splitTextToSize(clean, w - 28);
  lines.forEach((ln) => {
    if (y > h - 20) { doc.addPage(); y = 20; }
    doc.text(ln, 14, y);
    y += (opts.size || 10) * 0.5;
  });
  return y + 2;
}

export function exportReportPdf({ qn, sections, charts, status, meta }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  // Cover
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, h, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, h * 0.62, w, 3, 'F');
  doc.setTextColor(160, 230, 220);
  doc.setFontSize(11);
  doc.text('MICRO STUDIES AND RESEARCH ORGANISATION', 20, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(doc.splitTextToSize(qn.title.en.replace('·', '-'), w - 40), 20, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('Public Opinion Survey - Client Report', 20, 100);
  doc.setFontSize(11);
  doc.text(`Prepared for: ${meta.client}`, 20, h * 0.62 + 18);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, h * 0.62 + 26);
  doc.text(`Sample: ${meta.n.toLocaleString('en-IN')} interviews · ${meta.booths} booths`, 20, h * 0.62 + 34);
  doc.text(`Status: ${status}`, 20, h * 0.62 + 42);
  // Body
  doc.addPage();
  let y = header(doc, 'Contents', meta.client);
  sections.forEach((s, k) => { y = paragraph(doc, `${k + 1}.  ${s.title}`, y, { size: 11 }); });
  sections.forEach((s, k) => {
    doc.addPage();
    y = header(doc, `${k + 1}. ${s.title}`, meta.client);
    if (s.source === 'msr') {
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(...TEAL);
      doc.roundedRect(14, y - 4, w - 28, 8, 1.5, 1.5, 'FD');
      doc.setFontSize(8.5);
      doc.setTextColor(...TEAL);
      doc.text('Written by MSR analysts', 18, y + 1.3);
      y += 10;
    }
    y = paragraph(doc, s.body || '(Section not yet written)', y);
    const ch = s.chart && charts[s.chart];
    if (ch) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 40, 55);
      doc.text(ch.title, 14, y);
      y = bars(doc, 14, y + 4, w - 28, ch.rows, ch.opts || {});
    }
  });
  footer(doc);
  doc.save(`${qn.id}-Client-Report.pdf`);
}

export function exportComparePdf({ title, subtitle, table, cols, chartRows }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  let y = header(doc, title, subtitle);
  doc.setFontSize(9.5);
  doc.setTextColor(90, 100, 115);
  doc.text(subtitle, 14, y);
  y += 6;
  if (chartRows) y = bars(doc, 14, y, 180, chartRows);
  autoTable(doc, {
    startY: y + 2,
    head: [cols],
    body: table,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: NAVY },
    alternateRowStyles: { fillColor: [245, 248, 252] },
  });
  footer(doc);
  doc.save(`${title.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
}
