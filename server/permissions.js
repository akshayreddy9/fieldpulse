// Server copy of the default role permissions (kept in sync with src/store.jsx MODULES).
const MODULE_KEYS = ['overview', 'admin.builder', 'admin.targets', 'admin.team', 'admin.access', 'field', 'live.map', 'live.alerts', 'live.digest',
  'insights.results', 'insights.rollup', 'insights.compare', 'insights.ask', 'insights.reports', 'addons.privacy', 'addons.checker', 'addons.import',
  'addons.api', 'settings.compliance', 'settings.delivery', 'client.portal', 'pii.reveal'];
const only = (keys) => Object.fromEntries(MODULE_KEYS.map((k) => [k, keys.includes(k)]));

export const DEFAULT_PERMISSIONS_SERVER = {
  admin: Object.fromEntries(MODULE_KEYS.map((k) => [k, true])),
  supervisor: only(['overview', 'field', 'live.map', 'live.alerts', 'live.digest', 'admin.targets', 'admin.team', 'insights.results', 'insights.rollup', 'addons.checker']),
  analyst: only(['overview', 'admin.builder', 'live.map', 'insights.results', 'insights.rollup', 'insights.compare', 'insights.ask', 'insights.reports', 'addons.import', 'client.portal']),
  surveyor: only(['field']),
  client: only(['client.portal']),
};

// Which permission is needed to change each piece of shared state, and whether updates merge (maps) or replace.
export const STATE_RULES = {
  questionnaire: { perm: 'admin.builder' },
  draftQuestionnaire: { perm: 'admin.builder' },
  publishedVersion: { perm: 'admin.builder' },
  targets: { perm: 'admin.targets', merge: true },
  surveyors: { perm: 'admin.team' },
  permissions: { perm: 'admin.access' },
  statuses: { perm: 'live.alerts', merge: true },
  notes: { perm: 'live.alerts', merge: true },
  report: { perm: 'insights.reports' },
  reportStatus: { perm: 'insights.reports' },
  reportHistory: { perm: 'insights.reports' },
  privacyLock: { perm: 'addons.privacy' },
  round1Imported: { perm: 'addons.import' },
  webhooks: { perm: 'addons.api' },
  peakMonths: { perm: 'settings.delivery' },
  retentionDays: { perm: 'settings.compliance' },
  geo: { perm: 'admin.access' }, // booth list: shared by all surveys, admins only
  team: { perm: 'admin.team' }, // who works on a survey (null = everyone), per survey
};

// What each role may read from shared state
export const READABLE = {
  client: ['questionnaire', 'report', 'reportStatus', 'privacyLock', 'round1Imported', 'permissions', 'geo', 'targets'],
  surveyor: ['questionnaire', 'publishedVersion', 'targets', 'surveyors', 'permissions', 'privacyLock', 'geo', 'team'],
};
