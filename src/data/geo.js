// Geography hierarchy: State -> Constituency -> Mandal -> Booth
//
// The booth list ("booth master") is data, not code. MSR uploads it from Excel (Set up > Booth list); it is stored on
// the server as the shared setting "geo". Until one is uploaded, the 72 sample booths below are used (test site only).
// GEO, STATE and the *_BY_ID lookups are filled in place by setGeo(), so every screen that imports them sees the
// current list without having to change.
import { mulberry32 } from './rng.js';
import { targetCategories, AGE_BANDS } from '../lib/roles.js';

const SAMPLE_STATE = { id: 'TS', name: { en: 'Telangana', te: 'తెలంగాణ' }, center: [17.6, 79.1] };
export const STATE = { ...SAMPLE_STATE };

const RAW = [
  { id: 'WGW', en: 'Warangal West', te: 'వరంగల్ పశ్చిమ', district: 'Hanamkonda', c: [17.995, 79.56], st: 0.06,
    mandals: [['Hanamkonda', 'హనుమకొండ'], ['Kazipet', 'కాజీపేట'], ['Hasanparthy', 'హసన్‌పర్తి']] },
  { id: 'KNR', en: 'Karimnagar', te: 'కరీంనగర్', district: 'Karimnagar', c: [18.438, 79.128], st: 0.04,
    mandals: [['Karimnagar Urban', 'కరీంనగర్ అర్బన్'], ['Kothapalli', 'కొత్తపల్లి'], ['Karimnagar Rural', 'కరీంనగర్ రూరల్']] },
  { id: 'NLG', en: 'Nalgonda', te: 'నల్గొండ', district: 'Nalgonda', c: [17.054, 79.267], st: 0.1,
    mandals: [['Nalgonda', 'నల్గొండ'], ['Kanagal', 'కనగల్'], ['Tipparthy', 'తిప్పర్తి']] },
  { id: 'KMM', en: 'Khammam', te: 'ఖమ్మం', district: 'Khammam', c: [17.247, 80.151], st: 0.18,
    mandals: [['Khammam Urban', 'ఖమ్మం అర్బన్'], ['Raghunadhapalem', 'రఘునాథపాలెం'], ['Khammam Rural', 'ఖమ్మం రూరల్']] },
  { id: 'SDP', en: 'Siddipet', te: 'సిద్దిపేట', district: 'Siddipet', c: [18.102, 78.852], st: 0.05,
    mandals: [['Siddipet Urban', 'సిద్దిపేట అర్బన్'], ['Chinnakodur', 'చిన్నకోడూరు'], ['Nanganur', 'నంగునూరు']] },
  { id: 'MBN', en: 'Mahabubnagar', te: 'మహబూబ్‌నగర్', district: 'Mahabubnagar', c: [16.737, 77.985], st: 0.08,
    mandals: [['Mahabubnagar Urban', 'మహబూబ్‌నగర్ అర్బన్'], ['Hanwada', 'హన్వాడ'], ['Koilkonda', 'కోయిలకొండ']] },
];

const VENUES = [
  ['ZP High School', 'జడ్పీ ఉన్నత పాఠశాల'],
  ['MPP Primary School', 'ఎంపీపీ ప్రాథమిక పాఠశాల'],
  ['Gram Panchayat Office', 'గ్రామ పంచాయతీ కార్యాలయం'],
  ['Community Hall', 'కమ్యూనిటీ హాల్'],
  ['Govt. Junior College', 'ప్రభుత్వ జూనియర్ కళాశాల'],
  ['Anganwadi Centre', 'అంగన్‌వాడీ కేంద్రం'],
];

const MANDAL_OFFSETS = [[0.0, 0.0], [0.07, -0.08], [-0.08, 0.07]];

function build() {
  const rnd = mulberry32(42);
  const constituencies = [];
  const mandals = [];
  const booths = [];
  RAW.forEach((c) => {
    const con = { id: c.id, name: { en: c.en, te: c.te }, district: c.district, center: c.c, stShare: c.st, mandalIds: [] };
    c.mandals.forEach((m, mi) => {
      const mid = `${c.id}-M${mi + 1}`;
      const mc = [c.c[0] + MANDAL_OFFSETS[mi][0], c.c[1] + MANDAL_OFFSETS[mi][1]];
      const mandal = { id: mid, name: { en: m[0], te: m[1] }, constituencyId: c.id, center: mc, boothIds: [] };
      for (let b = 0; b < 4; b++) {
        const no = mi * 4 + b + 1 + 100;
        const v = VENUES[Math.floor(rnd() * VENUES.length)];
        const bid = `${c.id}-${String(no).padStart(3, '0')}`;
        const booth = {
          id: bid,
          no,
          name: { en: `Booth ${no} · ${v[0]}, ${m[0]}`, te: `బూత్ ${no} · ${v[1]}, ${m[1]}` },
          short: `Booth ${no}`,
          mandalId: mid,
          constituencyId: c.id,
          lat: mc[0] + (rnd() - 0.5) * 0.06,
          lng: mc[1] + (rnd() - 0.5) * 0.06,
          voters: 900 + Math.floor(rnd() * 600),
        };
        booths.push(booth);
        mandal.boothIds.push(bid);
      }
      mandals.push(mandal);
      con.mandalIds.push(mid);
    });
    constituencies.push(con);
  });
  return { constituencies, mandals, booths };
}

export const SAMPLE_GEO = { sample: true, state: SAMPLE_STATE, ...build() };

export const GEO = { sample: true, constituencies: [], mandals: [], booths: [] };
export const CONST_BY_ID = {};
export const MANDAL_BY_ID = {};
export const BOOTH_BY_ID = {};
let current = null;

const refill = (obj, entries) => { Object.keys(obj).forEach((k) => { delete obj[k]; }); entries.forEach(([k, v]) => { obj[k] = v; }); };

// A production install starts with no booths (never the sample ones) until MSR uploads its list.
export const EMPTY_GEO = { empty: true, state: { id: 'ST', name: { en: 'State', te: '' }, center: SAMPLE_STATE.center }, constituencies: [], mandals: [], booths: [] };

// Switches every screen to a booth list. null -> the sample list (test sites); { empty: true } -> no booths yet.
// Returns true when something changed.
export function setGeo(data) {
  let g = SAMPLE_GEO;
  if (data?.empty) g = EMPTY_GEO;
  else if (data && Array.isArray(data.booths) && data.booths.length) g = data;
  if (g === current) return false;
  current = g;
  Object.assign(STATE, g.state || SAMPLE_STATE);
  GEO.sample = !!g.sample;
  GEO.empty = !!g.empty;
  GEO.constituencies = g.constituencies;
  GEO.mandals = g.mandals;
  GEO.booths = g.booths;
  refill(CONST_BY_ID, g.constituencies.map((c) => [c.id, c]));
  refill(MANDAL_BY_ID, g.mandals.map((m) => [m.id, m]));
  refill(BOOTH_BY_ID, g.booths.map((b) => [b.id, b]));
  return true;
}
setGeo(null);

// ---------- Booth list upload (Excel) ----------
export const GEO_COLUMNS = ['Constituency code', 'Constituency', 'Constituency (Telugu)', 'District', 'Mandal', 'Mandal (Telugu)',
  'Booth no', 'Booth name', 'Booth name (Telugu)', 'Latitude', 'Longitude', 'Voters'];

const txt = (v) => String(v ?? '').trim();
const num = (v) => (txt(v) === '' ? NaN : Number(v));
const avg = (xs) => xs.reduce((a, x) => a + x, 0) / (xs.length || 1);

// Turns spreadsheet rows (one per booth) into a booth list. Returns { geo, errors }; geo is null when there are errors.
// Booth IDs follow the sample pattern <CODE>-<booth no, 3 digits>, e.g. KNR-101, so surveyor and target sheets stay simple.
export function geoFromRows(rows, stateName = { en: 'Telangana', te: 'తెలంగాణ' }) {
  const errors = [];
  const cons = new Map();
  const mandals = new Map();
  const booths = [];
  const seen = new Set();
  rows.forEach((r, k) => {
    const line = k + 2; // row 1 is the header in Excel
    if (GEO_COLUMNS.every((c) => txt(r[c]) === '')) return; // blank line
    const code = txt(r['Constituency code']).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cName = txt(r.Constituency);
    const mName = txt(r.Mandal);
    const no = num(r['Booth no']);
    const lat = num(r.Latitude);
    const lng = num(r.Longitude);
    const miss = [!code && 'Constituency code', !cName && 'Constituency', !mName && 'Mandal', !Number.isInteger(no) && 'Booth no (whole number)'].filter(Boolean);
    if (miss.length) { errors.push(`Row ${line}: missing ${miss.join(', ')}`); return; }
    if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98)) { errors.push(`Row ${line}: Latitude/Longitude are missing or not in India (${txt(r.Latitude) || '?'}, ${txt(r.Longitude) || '?'})`); return; }
    const id = `${code}-${String(no).padStart(3, '0')}`;
    if (seen.has(id)) { errors.push(`Row ${line}: booth ${no} appears twice in constituency ${code}`); return; }
    seen.add(id);
    if (!cons.has(code)) cons.set(code, { id: code, name: { en: cName, te: txt(r['Constituency (Telugu)']) }, district: txt(r.District), mandalIds: [], pts: [] });
    const con = cons.get(code);
    if (con.name.en.toLowerCase() !== cName.toLowerCase()) errors.push(`Row ${line}: code ${code} is used for both “${con.name.en}” and “${cName}”`);
    const mKey = `${code}|${mName.toLowerCase()}`;
    if (!mandals.has(mKey)) {
      const m = { id: `${code}-M${con.mandalIds.length + 1}`, name: { en: mName, te: txt(r['Mandal (Telugu)']) }, constituencyId: code, boothIds: [], pts: [] };
      mandals.set(mKey, m);
      con.mandalIds.push(m.id);
    }
    const m = mandals.get(mKey);
    const bName = txt(r['Booth name']);
    booths.push({
      id, no, short: `Booth ${no}`, mandalId: m.id, constituencyId: code, lat, lng,
      name: { en: bName ? `Booth ${no} · ${bName}` : `Booth ${no}`, te: txt(r['Booth name (Telugu)']) ? `బూత్ ${no} · ${txt(r['Booth name (Telugu)'])}` : '' },
      ...(Number.isFinite(num(r.Voters)) ? { voters: num(r.Voters) } : {}),
    });
    m.boothIds.push(id);
    m.pts.push([lat, lng]);
    con.pts.push([lat, lng]);
  });
  if (!booths.length && !errors.length) errors.push('No booths found. Use the template: one row per booth.');
  if (errors.length) return { geo: null, errors };
  const centre = (pts) => [avg(pts.map((p) => p[0])), avg(pts.map((p) => p[1]))];
  const constituencies = [...cons.values()].map(({ pts, ...c }) => ({ ...c, center: centre(pts) }));
  const mandalList = [...mandals.values()].map(({ pts, ...m }) => ({ ...m, center: centre(pts) }));
  const geo = {
    state: { id: 'ST', name: stateName, center: centre(booths.map((b) => [b.lat, b.lng])) },
    constituencies, mandals: mandalList, booths, uploadedAt: Date.now(),
  };
  return { geo, errors: [] };
}

// Server-side check of an uploaded booth list (the browser builds it with geoFromRows).
export function validateGeo(g) {
  if (g === null) return null; // back to the sample list
  if (g?.empty === true) return null; // no booths yet
  if (!g || !Array.isArray(g.booths) || !Array.isArray(g.mandals) || !Array.isArray(g.constituencies)) return 'Booth list is not in the expected format';
  if (!g.booths.length) return 'Booth list is empty';
  if (g.booths.length > 100000) return 'Booth list is too large (over 100,000 booths)';
  const m = new Set(g.mandals.map((x) => x.id));
  const c = new Set(g.constituencies.map((x) => x.id));
  const ids = new Set();
  for (const b of g.booths) {
    if (!b || typeof b.id !== 'string' || ids.has(b.id)) return `Booth ${b?.id || '?'} is missing or repeated`;
    ids.add(b.id);
    if (!m.has(b.mandalId) || !c.has(b.constituencyId)) return `Booth ${b.id} points to an unknown mandal or constituency`;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return `Booth ${b.id} has no location`;
  }
  return null;
}

// Splits a total as evenly as possible over some keys (remainder goes to the first ones).
export function evenSplit(total, keys) {
  const base = Math.floor(total / (keys.length || 1));
  let rest = total - base * keys.length;
  return Object.fromEntries(keys.map((k) => [k, base + (rest-- > 0 ? 1 : 0)]));
}

// Default quota per booth: 40 interviews split by gender, age band and caste category.
// The categories come from the questionnaire's Gender and Caste questions (see lib/roles.js).
export function defaultTargets(booth, cats = targetCategories()) {
  const total = 40;
  const con = booth && CONST_BY_ID[booth.constituencyId];
  const castes = cats.caste.map((o) => o.v);
  let caste;
  if (castes.join() === 'SC,ST,BC,OC,Minority') {
    // MSR's usual split, with the ST share following the constituency where it is known
    const st = Math.max(2, Math.round(total * (con?.stShare ?? 0.08)));
    caste = { SC: 7, ST: st, BC: total - st - 7 - 3 - 7, OC: 7, Minority: 3 };
  } else caste = evenSplit(total, castes);
  return {
    total,
    gender: evenSplit(total, cats.gender.map((o) => o.v)),
    age: AGE_BANDS.join() === '18-25,26-35,36-50,51+' ? { '18-25': 8, '26-35': 10, '36-50': 12, '51+': 10 } : evenSplit(total, AGE_BANDS),
    caste,
  };
}

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function ageBand(age) {
  if (age === undefined || age === null || age === '' || Number.isNaN(Number(age))) return undefined;
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 50) return '36-50';
  return '51+';
}
