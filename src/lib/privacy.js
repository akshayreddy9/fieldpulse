// Extra privacy lock: personal details are replaced by stable codes everywhere.
import { hashCode } from '../data/rng.js';

export function codeFor(value, kind = 'name') {
  if (!value) return '—';
  const h = hashCode(`${kind}:${value}`).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return kind === 'phone' ? `PH-${h}` : `R-${h}`;
}

export function maskPhone(p) {
  if (!p) return '—';
  const s = String(p).replace(/\D/g, '');
  return `${s.slice(0, 2)}••••••${s.slice(-2)}`;
}
