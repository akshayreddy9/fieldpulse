import React, { useMemo, useState } from 'react';
import { AudioLines, CheckCircle2, XCircle, Sparkles, Languages, Mic } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Stat, Badge, Seg } from '../../components/ui.jsx';
import InterviewReview from '../../components/InterviewReview.jsx';
import { BOOTH_BY_ID } from '../../data/geo.js';

export default function Checker() {
  const s = useStore();
  const [view, setView] = useState('missing');
  const missing = useMemo(() => s.interviews.filter((i) => !i.consent.consentRead), [s.interviews]);
  const ok = s.interviews.length - missing.length;
  const list = view === 'missing' ? missing : s.interviews.slice(-30).reverse();
  const [sel, setSel] = useState(null);
  const cur = s.interviews.find((i) => i.id === sel) || list[0];
  return (
    <div>
      <PageHead eyebrow="Fieldwork" icon={AudioLines} title="Recording checker" desc="Every recording is turned into text in Telugu and English. The checker confirms the consent line was read out and flags suspicious recordings, such as no respondent voice, the same voice across interviews, or a recording much shorter than the interview." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Recordings transcribed" value={s.interviews.length.toLocaleString('en-IN')} icon={Languages} />
        <Stat label="Consent line confirmed" value={`${((ok / s.interviews.length) * 100).toFixed(1)}%`} tone="green" icon={CheckCircle2} />
        <Stat label="Consent line missing" value={missing.length} tone="red" icon={XCircle} />
        <Stat label="Avg. processing time" value="~40 s" tone="indigo" icon={Sparkles} hint="per 15-minute recording" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)' }}>
        <Card flush title="Recordings" right={<Seg value={view} onChange={(v) => { setView(v); setSel(null); }} options={[{ value: 'missing', label: 'Consent missing' }, { value: 'recent', label: 'Most recent' }]} />}>
          <div className="scroll-y" style={{ maxHeight: 640 }}>
            {list.map((i) => (
              <div key={i.id} className="list-item click" style={{ background: cur?.id === i.id ? '#eefaf8' : undefined }} onClick={() => setSel(i.id)}>
                <Mic size={16} className="muted" />
                <div style={{ flex: 1, minWidth: 0 }}><div className="small bold">{i.id}</div><div className="tiny muted">{i.surveyorId} · {BOOTH_BY_ID[i.boothId]?.short} · {Math.round(i.consent.recordingSec / 60)} min</div></div>
                {i.consent.consentRead ? <Badge tone="green">Consent ✓</Badge> : <Badge tone="red">No consent line</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Transcript & checks">{cur && <InterviewReview interview={cur} />}</Card>
      </div>
      <style>{`@media (max-width: 1100px){ .content .grid[style*="1.3fr"]{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}
