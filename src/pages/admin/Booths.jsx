import React, { useState } from 'react';
import { MapPin, Download, Upload, AlertTriangle, CheckCircle2, Info, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Stat, fmtTime } from '../../components/ui.jsx';
import { GEO, STATE, CONST_BY_ID, MANDAL_BY_ID, GEO_COLUMNS, geoFromRows } from '../../data/geo.js';
import { exportTableExcel, readSheet } from '../../lib/exporters.js';

// The booth list ("booth master"): constituency -> mandal -> booth, with each booth's location.
// It feeds the cascading location question, booth targets, surveyor booth assignment, the live map and all roll-ups.
export default function Booths() {
  const s = useStore();
  const [preview, setPreview] = useState(null); // { geo, errors, file }
  const [stateName, setStateName] = useState({ en: GEO.sample || GEO.empty ? 'Telangana' : STATE.name.en, te: GEO.sample || GEO.empty ? 'తెలంగాణ' : STATE.name.te || '' });

  const template = () => exportTableExcel('Booth list', GEO_COLUMNS, [
    ['KNR', 'Karimnagar', 'కరీంనగర్', 'Karimnagar', 'Karimnagar Urban', 'కరీంనగర్ అర్బన్', 101, 'ZP High School', 'జడ్పీ ఉన్నత పాఠశాల', 18.4386, 79.1288, 1250],
    ['KNR', 'Karimnagar', 'కరీంనగర్', 'Karimnagar', 'Kothapalli', 'కొత్తపల్లి', 102, 'Community Hall', 'కమ్యూనిటీ హాల్', 18.4710, 79.0850, 980],
  ], 'MSR-Pulse-Booth-List-Template.xlsx');

  const current = () => exportTableExcel('Booth list', GEO_COLUMNS, GEO.booths.map((b) => {
    const c = CONST_BY_ID[b.constituencyId];
    const m = MANDAL_BY_ID[b.mandalId];
    const venue = (b.name.en || '').split(' · ').slice(1).join(' · ');
    const venueTe = (b.name.te || '').split(' · ').slice(1).join(' · ');
    return [c.id, c.name.en, c.name.te, c.district || '', m.name.en, m.name.te, b.no, venue, venueTe, Number(b.lat.toFixed(6)), Number(b.lng.toFixed(6)), b.voters ?? ''];
  }), 'MSR-Pulse-Booth-List.xlsx');

  const read = async (file) => {
    try {
      const rows = await readSheet(file);
      const missingCols = ['Constituency code', 'Constituency', 'Mandal', 'Booth no', 'Latitude', 'Longitude'].filter((c) => rows.length && !(c in rows[0]));
      if (missingCols.length) { setPreview({ geo: null, errors: [`The sheet is missing these columns: ${missingCols.join(', ')}. Start from the template.`], file: file.name }); return; }
      setPreview({ ...geoFromRows(rows, stateName), file: file.name });
    } catch { s.toast('Could not read that file. Save it as .xlsx and try again.', 'error'); }
  };

  // Surveyors / targets that point at booths which would no longer exist
  const newIds = new Set(preview?.geo?.booths.map((b) => b.id) || []);
  const strandedSurveyors = preview?.geo ? s.surveyors.filter((x) => (x.boothIds || []).length && !(x.boothIds || []).some((b) => newIds.has(b))) : [];
  const droppedTargets = preview?.geo ? Object.keys(s.targets || {}).filter((id) => !newIds.has(id)) : [];

  const apply = () => {
    const g = { ...preview.geo, state: { ...preview.geo.state, name: stateName } };
    if (!window.confirm(`Use this booth list for all surveys?\n\n${g.constituencies.length} constituencies · ${g.mandals.length} mandals · ${g.booths.length} booths${strandedSurveyors.length ? `\n\n${strandedSurveyors.length} surveyor(s) are assigned to booths that are not in this list. Fix their booths on Surveyors & team.` : ''}`)) return;
    s.update({ geo: g });
    s.log(`Loaded booth list from ${preview.file}: ${g.constituencies.length} constituencies, ${g.mandals.length} mandals, ${g.booths.length} booths`);
    s.toast('Booth list saved. Phones get it the next time they connect.', 'success');
    setPreview(null);
  };

  return (
    <div>
      <PageHead eyebrow="Set up" icon={MapPin} title="Booth list" desc="MSR's list of constituencies, mandals and polling booths with their locations. It is used by the location question, booth targets, surveyor assignments, the live map, the fake-interview GPS check and all totals.">
        <button className="btn" onClick={template}><FileSpreadsheet size={15} />Download template</button>
        {!GEO.empty && <button className="btn" onClick={current}><Download size={15} />Download current list</button>}
        <label className="btn primary" style={{ cursor: 'pointer' }}><Upload size={15} />Upload booth list<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files[0]) read(e.target.files[0]); e.target.value = ''; }} /></label>
      </PageHead>

      {GEO.sample && <div className="callout amber small" style={{ marginBottom: 12 }}><AlertTriangle size={15} style={{ flexShrink: 0 }} /><div>This is the <b>sample booth list</b> (made-up booths for testing). Upload MSR's real booth list before real fieldwork.</div></div>}
      {GEO.empty && <div className="callout amber small" style={{ marginBottom: 12 }}><AlertTriangle size={15} style={{ flexShrink: 0 }} /><div>No booth list yet. Surveyors cannot start interviews until it is uploaded.</div></div>}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Constituencies" value={GEO.constituencies.length} icon={MapPin} />
        <Stat label="Mandals" value={GEO.mandals.length} tone="blue" />
        <Stat label="Booths" value={GEO.booths.length.toLocaleString('en-IN')} tone="green" />
        <Stat label="Source" value={GEO.sample ? 'Sample' : GEO.empty ? 'None' : 'Uploaded'} hint={s.geo?.uploadedAt ? fmtTime(s.geo.uploadedAt) : undefined} tone={GEO.sample || GEO.empty ? 'amber' : 'green'} />
      </div>

      {preview && (
        <Card title={`Check before saving · ${preview.file}`} style={{ marginBottom: 16 }}>
          {preview.errors.length ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="callout red small"><AlertTriangle size={15} style={{ flexShrink: 0 }} /><div><b>{preview.errors.length} problem(s) found.</b> Nothing was saved. Fix them in Excel and upload again.</div></div>
              {preview.errors.slice(0, 25).map((e) => <div key={e} className="small row nowrap"><AlertTriangle size={13} color="#d97706" style={{ flexShrink: 0 }} />{e}</div>)}
              {preview.errors.length > 25 && <div className="tiny muted">…and {preview.errors.length - 25} more</div>}
            </div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="row"><CheckCircle2 size={16} color="#16a34a" /><b>{preview.geo.constituencies.length} constituencies · {preview.geo.mandals.length} mandals · {preview.geo.booths.length.toLocaleString('en-IN')} booths</b></div>
              <div className="grid g2" style={{ gap: 10 }}>
                <div className="field"><label>State · English</label><input className="input" value={stateName.en} onChange={(e) => setStateName({ ...stateName, en: e.target.value })} /></div>
                <div className="field"><label>State · Telugu</label><input className="input te" value={stateName.te} onChange={(e) => setStateName({ ...stateName, te: e.target.value })} /></div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 260 }}>
                <table className="t">
                  <thead><tr><th>Constituency</th><th className="num">Mandals</th><th className="num">Booths</th></tr></thead>
                  <tbody>{preview.geo.constituencies.map((c) => <tr key={c.id}><td><b>{c.name.en}</b> <span className="mono tiny faint">{c.id}</span>{!c.name.te && <Badge tone="amber">no Telugu name</Badge>}</td><td className="num">{c.mandalIds.length}</td><td className="num">{preview.geo.booths.filter((b) => b.constituencyId === c.id).length}</td></tr>)}</tbody>
                </table>
              </div>
              {strandedSurveyors.length > 0 && <div className="callout amber small"><AlertTriangle size={15} style={{ flexShrink: 0 }} /><div><b>{strandedSurveyors.length} surveyor(s)</b> are assigned to booths that are not in this list (e.g. {strandedSurveyors[0].name}: {strandedSurveyors[0].boothIds.join(', ')}). They cannot work until their booth is corrected on Surveyors &amp; team.</div></div>}
              {droppedTargets.length > 0 && <div className="callout blue small"><Info size={15} style={{ flexShrink: 0 }} /><div>Custom targets for {droppedTargets.length} booth(s) that are not in this list will no longer be shown.</div></div>}
              <div className="row"><div className="spacer" /><button className="btn" onClick={() => setPreview(null)}>Cancel</button><button className="btn primary" onClick={apply}><CheckCircle2 size={15} />Use this booth list</button></div>
            </div>
          )}
        </Card>
      )}

      <Card title="How to fill the sheet" sub="One row per polling booth">
        <div className="stack small" style={{ gap: 6 }}>
          <div><b>Constituency code</b>: short code, letters/numbers (e.g. KNR). Booth IDs are made from it: KNR + booth 101 = <span className="mono">KNR-101</span>. Use these IDs in the surveyor and target sheets.</div>
          <div><b>Constituency, Mandal</b>: names in English; the Telugu columns are optional but shown on the phones.</div>
          <div><b>Booth no</b>: the polling station number (whole number, unique within the constituency).</div>
          <div><b>Latitude, Longitude</b>: the booth's location in decimal degrees (e.g. 18.4386, 79.1288). Used for the live map and the “away from booth” check.</div>
          <div><b>Booth name, District, Voters</b>: optional.</div>
        </div>
      </Card>
    </div>
  );
}
