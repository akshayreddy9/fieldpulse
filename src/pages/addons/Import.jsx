import React, { useState } from 'react';
import { DatabaseZap, Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Link2 } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Progress, PreviewNote } from '../../components/ui.jsx';
import { readSheet } from '../../lib/exporters.js';

const MAPPING = [
  ['Q1_AC_NAME', 'q_loc · Constituency', 98], ['Q2_MANDAL', 'q_loc · Mandal', 97], ['Q3_PS_NO', 'q_loc · Booth', 95], ['RESP_GENDER', 'q_gender', 99],
  ['RESP_AGE', 'q_age', 99], ['CASTE_GRP', 'q_caste', 96], ['OCCUPATION', 'q_occupation', 91], ['MAIN_PROBLEMS', 'q_issues', 88],
  ['GOVT_RATING_10', 'q_govt_rating', 97], ['WELFARE_YN', 'q_scheme', 93], ['VOTE_TODAY', 'q_vote_intent', 99], ['CM_CHOICE', 'q_leader', 94],
  ['LAT', 'GPS latitude', 100], ['LONG', 'GPS longitude', 100], ['SURVEYOR_CODE', 'Surveyor ID', 90], ['RESP_NAME', 'q_name (privacy lock)', 100],
];

export default function Import() {
  const s = useStore();
  const [step, setStep] = useState(s.round1Imported ? 4 : 0);
  const [file, setFile] = useState(null);
  const [prog, setProg] = useState(0);

  const pick = async (f) => {
    let rows = 2410;
    if (f) { try { rows = (await readSheet(f)).length || rows; } catch { /* use default */ } }
    setFile({ name: f ? f.name : 'GoSurvey_TS_Round1_May2026.xlsx', rows });
    setStep(1);
  };
  const run = () => {
    setStep(3);
    setProg(0);
    const id = setInterval(() => setProg((p) => {
      if (p >= 100) {
        clearInterval(id);
        s.setRound1(true).catch((e) => s.toast(e.message, 'error'));
        if (!s.serverMode) s.log(`Imported Round 1 (May 2026) from GoSurvey: ${file.name}`);
        s.toast('Round 1 imported. It is now available in Compare & trends.', 'success');
        setStep(4);
        return 100;
      }
      return p + 4;
    }), 70);
  };

  return (
    <div>
      <PageHead eyebrow="Add-ons" icon={DatabaseZap} title="Bring in old GoSurvey data" desc="Move recent surveys of MSR’s choice from GoSurvey into MSR Pulse, so they can be compared with new rounds. Questions are matched automatically and checked before anything is imported." />
      <PreviewNote>This shows how a GoSurvey import will work. The column matching and checks are an example, and finishing the import loads <b>generated sample data</b> as an earlier round, not the rows of the file you choose. The real import is built once MSR shares an actual GoSurvey export.</PreviewNote>
      <div className="row" style={{ marginBottom: 16, gap: 6 }}>
        {['Choose file', 'Match questions', 'Check data', 'Import', 'Done'].map((x, k) => (
          <React.Fragment key={x}><Badge tone={k < step ? 'green' : k === step ? 'navy' : ''}>{k + 1}. {x}</Badge>{k < 4 && <ArrowRight size={13} className="faint" />}</React.Fragment>
        ))}
      </div>
      {step === 0 && (
        <Card>
          <div className="empty">
            <FileSpreadsheet size={36} className="faint" />
            <div className="bold mt8">Upload a GoSurvey export (Excel or CSV)</div>
            <div className="small muted mt8">Or try it with a sample GoSurvey export</div>
            <div className="row mt16" style={{ justifyContent: 'center' }}>
              <label className="btn primary" style={{ cursor: 'pointer' }}><Upload size={15} />Choose file<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files[0] && pick(e.target.files[0])} /></label>
              <button className="btn" onClick={() => pick(null)}>Use sample GoSurvey export</button>
            </div>
          </div>
        </Card>
      )}
      {step === 1 && (
        <Card title={`Match questions · ${file.name}`} sub={`${MAPPING.length} GoSurvey columns matched to the MSR Pulse questionnaire`} right={<button className="btn primary" onClick={() => setStep(2)}>Looks right <ArrowRight size={15} /></button>} flush>
          <table className="t">
            <thead><tr><th>GoSurvey column</th><th /><th>MSR Pulse question</th><th>Match confidence</th></tr></thead>
            <tbody>{MAPPING.map(([a, b, c]) => (
              <tr key={a}><td className="mono">{a}</td><td><Link2 size={14} className="faint" /></td><td className="small bold">{b}</td><td style={{ width: 200 }}><div className="row nowrap"><div style={{ flex: 1 }}><Progress value={c} sm tone={c >= 95 ? 'green' : ''} /></div><span className="tiny">{c}%</span></div></td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {step === 2 && (
        <Card title="Data check" right={<button className="btn primary" onClick={run}>Import {(file.rows - 37).toLocaleString('en-IN')} rows <ArrowRight size={15} /></button>}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="callout teal"><CheckCircle2 size={16} />{(file.rows - 37).toLocaleString('en-IN')} rows are valid and ready to import.</div>
            <div className="callout amber"><AlertTriangle size={16} style={{ flexShrink: 0 }} /><div>37 rows will be skipped: 21 with no booth number, 12 with age under 18, 4 duplicates. A list is saved for MSR to review.</div></div>
            <div className="callout blue"><DatabaseZap size={16} style={{ flexShrink: 0 }} /><div>Answer codes are converted (e.g. GoSurvey “1/2/3” → Party A/B/C), and respondent names are coded by the privacy lock on import.</div></div>
          </div>
        </Card>
      )}
      {step === 3 && <Card title="Importing…"><div className="row"><Loader2 size={16} className="spin" /><div style={{ flex: 1 }}><Progress value={prog} /></div><b>{prog}%</b></div></Card>}
      {step === 4 && (
        <Card>
          <div className="empty">
            <CheckCircle2 size={40} color="#16a34a" />
            <div className="bold mt8" style={{ fontSize: 16 }}>Sample earlier round loaded</div>
            <div className="small muted mt8">{s.round1.length.toLocaleString('en-IN')} sample interviews now appear in Compare & trends as an earlier round.</div>
            <div className="row mt16" style={{ justifyContent: 'center' }}>
              <a className="btn primary" href="#/insights/compare">Open trends</a>
              <button className="btn" onClick={() => { s.setRound1(false).catch((e) => s.toast(e.message, 'error')); setStep(0); }}>Undo import</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
