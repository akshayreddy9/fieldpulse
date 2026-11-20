import React from 'react';
import { ShieldCheck, RotateCcw, ScrollText } from 'lucide-react';
import { useStore, ROLES, MODULES, DEFAULT_PERMISSIONS } from '../../store.jsx';
import { PageHead, Card, fmtTime } from '../../components/ui.jsx';
import PeopleLogins from './PeopleLogins.jsx';

export default function Access() {
  const s = useStore();
  const roles = Object.keys(ROLES);
  const flip = (role, mod) => {
    if (role === 'admin' && (mod === 'admin.access' || mod === 'overview')) return s.toast('Admins always keep access control', 'error');
    s.update((st) => ({ permissions: { ...st.permissions, [role]: { ...st.permissions[role], [mod]: !st.permissions[role][mod] } } }));
    s.log(`${s.permissions[role][mod] ? 'Removed' : 'Granted'} “${MODULES.find((m) => m[0] === mod)[1]}” for ${ROLES[role].label}`);
  };
  return (
    <div>
      <PageHead eyebrow="Set up" icon={ShieldCheck} title="Who can see what" desc="Add the people who can sign in, and choose what each role can see. Surveyors only see their own booths; clients only see their own approved results.">
        <button className="btn" onClick={() => { s.update({ permissions: DEFAULT_PERMISSIONS }); s.toast('Default permissions restored', 'success'); }}><RotateCcw size={15} />Restore defaults</button>
      </PageHead>
      <div style={{ marginBottom: 16 }}><PeopleLogins /></div>
      <div className="grid g-2-1">
        <Card flush title="Permissions by role">
          <div className="table-wrap" style={{ maxHeight: 640 }}>
            <table className="t">
              <thead><tr><th>Module</th>{roles.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLES[r].label}</th>)}</tr></thead>
              <tbody>
                {MODULES.map(([k, label]) => (
                  <tr key={k}>
                    <td className="bold small">{label}</td>
                    {roles.map((r) => (
                      <td key={r} style={{ textAlign: 'center' }}>
                        <input type="checkbox" style={{ width: 17, height: 17, accentColor: 'var(--teal)' }} checked={!!s.permissions[r]?.[k]} onChange={() => flip(r, k)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="stack">
          <Card title="Data scope rules">
            <div className="stack small" style={{ gap: 10 }}>
              <div><b>Surveyors</b> see only the booths assigned to them, and only their own interviews.</div>
              <div><b>Supervisors</b> see their constituency’s surveyors, alerts and back-checks.</div>
              <div><b>Analysts</b> see all results, with personal details hidden by the privacy lock.</div>
              <div><b>Clients</b> see only their own surveys, and only reports MSR has approved.</div>
              <div><b>Personal details</b> (name, mobile) can only be revealed by roles with “Reveal personal details”, with a recorded reason.</div>
            </div>
          </Card>
          <Card title={<span className="row"><ScrollText size={16} />Audit trail</span>} sub="Every important action is recorded" flush>
            <div className="scroll-y" style={{ maxHeight: 360 }}>
              {s.audit.slice(0, 40).map((a, k) => (
                <div key={k} className="list-item" style={{ padding: '9px 16px' }}>
                  <div style={{ minWidth: 0 }}><div className="small">{a.what}</div><div className="tiny muted">{a.who} · {fmtTime(a.t)}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
