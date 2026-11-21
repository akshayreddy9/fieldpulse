// The sample questionnaire: bilingual (English / Telugu), all question types, groups/pages and skip logic.
const o = (v, en, te) => ({ v, en, te });

export const QUESTION_TYPES = [
  { type: 'single', en: 'Single choice', icon: 'CircleDot' },
  { type: 'multiple', en: 'Multiple choice', icon: 'ListChecks' },
  { type: 'grid', en: 'Grid / matrix', icon: 'Grid3x3' },
  { type: 'cascade', en: 'Cascading list', icon: 'GitBranch' },
  { type: 'text', en: 'Text', icon: 'Type' },
  { type: 'number', en: 'Number', icon: 'Hash' },
  { type: 'date', en: 'Date', icon: 'CalendarDays' },
  { type: 'gps', en: 'GPS location', icon: 'MapPin' },
  { type: 'photo', en: 'Photo', icon: 'Camera' },
];

export const PARTY_COLORS = {
  A: '#2563EB',
  B: '#F97316',
  C: '#16A34A',
  IND: '#A855F7',
  UND: '#94A3B8',
  NS: '#CBD5E1',
};

export const SAMPLE_QUESTIONNAIRE = {
  id: 'TSP-R3',
  title: { en: 'Telangana Pulse · Round 3', te: 'తెలంగాణ పల్స్ · రౌండ్ 3' },
  client: 'Deccan Policy Foundation',
  round: 3,
  status: 'Live',
  version: 7,
  languages: ['en', 'te'],
  consentScript: {
    en: 'Namaste. I am from Micro Studies and Research. We are doing a survey on public issues. It will take about 8 minutes. Your answers are confidential and will be used only for research. This interview will be audio recorded for quality checks. Do you agree to take part?',
    te: 'నమస్తే. నేను మైక్రో స్టడీస్ అండ్ రీసెర్చ్ నుండి వచ్చాను. ప్రజా సమస్యలపై సర్వే చేస్తున్నాము. సుమారు 8 నిమిషాలు పడుతుంది. మీ సమాధానాలు గోప్యంగా ఉంచబడతాయి, పరిశోధనకు మాత్రమే ఉపయోగిస్తాము. నాణ్యత తనిఖీ కోసం ఈ ఇంటర్వ్యూ రికార్డ్ చేయబడుతుంది. మీరు పాల్గొనడానికి అంగీకరిస్తారా?',
  },
  groups: [
    {
      id: 'g1',
      title: { en: 'Location & consent', te: 'ప్రాంతం & అంగీకారం' },
      questions: [
        { id: 'q_loc', type: 'cascade', required: true, levels: ['constituency', 'mandal', 'booth'],
          label: { en: 'Select constituency, mandal and polling booth', te: 'నియోజకవర్గం, మండలం మరియు పోలింగ్ బూత్ ఎంచుకోండి' } },
        { id: 'q_consent', type: 'single', required: true, endIf: 'N',
          label: { en: 'Consent statement read out. Does the respondent agree to take part?', te: 'అంగీకార ప్రకటన చదివి వినిపించారు. ప్రతివాది పాల్గొనడానికి అంగీకరిస్తారా?' },
          options: [o('Y', 'Yes, agrees', 'అవును, అంగీకరిస్తున్నారు'), o('N', 'No, declines (end interview)', 'లేదు (ఇంటర్వ్యూ ముగించండి)')] },
      ],
    },
    {
      id: 'g2',
      title: { en: 'Respondent profile', te: 'ప్రతివాది వివరాలు' },
      questions: [
        { id: 'q_name', type: 'text', pii: true, required: true, label: { en: 'Respondent name', te: 'ప్రతివాది పేరు' } },
        { id: 'q_phone', type: 'text', pii: true, inputMode: 'tel', label: { en: 'Mobile number (optional)', te: 'మొబైల్ నంబర్ (ఐచ్ఛికం)' } },
        { id: 'q_gender', type: 'single', required: true, label: { en: 'Gender', te: 'లింగం' },
          options: [o('Male', 'Male', 'పురుషుడు'), o('Female', 'Female', 'స్త్రీ'), o('Other', 'Other', 'ఇతర')] },
        { id: 'q_age', type: 'number', required: true, min: 18, max: 100, label: { en: 'Age (completed years)', te: 'వయస్సు (పూర్తి సంవత్సరాలు)' } },
        { id: 'q_caste', type: 'single', required: true, label: { en: 'Caste category', te: 'కుల వర్గం' },
          options: [o('SC', 'SC', 'ఎస్సీ'), o('ST', 'ST', 'ఎస్టీ'), o('BC', 'BC', 'బీసీ'), o('OC', 'OC', 'ఓసీ'), o('Minority', 'Minority', 'మైనారిటీ')] },
        { id: 'q_occupation', type: 'single', allowOther: true, label: { en: 'Main occupation', te: 'ప్రధాన వృత్తి' },
          options: [
            o('FARM', 'Farmer', 'రైతు'), o('ALAB', 'Agricultural labour', 'వ్యవసాయ కూలీ'), o('DWAGE', 'Daily wage worker', 'రోజువారీ కూలీ'),
            o('PVT', 'Private job', 'ప్రైవేట్ ఉద్యోగం'), o('GOVT', 'Government job', 'ప్రభుత్వ ఉద్యోగం'), o('BIZ', 'Business / self-employed', 'వ్యాపారం / స్వయం ఉపాధి'),
            o('HOME', 'Homemaker', 'గృహిణి'), o('STU', 'Student', 'విద్యార్థి'), o('UNEMP', 'Unemployed', 'నిరుద్యోగి'),
          ] },
      ],
    },
    {
      id: 'g3',
      title: { en: 'Issues & governance', te: 'సమస్యలు & పాలన' },
      questions: [
        { id: 'q_issues', type: 'multiple', allowOther: true, maxSelect: 3,
          label: { en: 'What are the three biggest problems in your area?', te: 'మీ ప్రాంతంలో మూడు ప్రధాన సమస్యలు ఏమిటి?' },
          options: [
            o('JOBS', 'Unemployment', 'నిరుద్యోగం'), o('PRICE', 'Price rise', 'ధరల పెరుగుదల'), o('WATER', 'Drinking water', 'తాగునీరు'),
            o('ROADS', 'Roads', 'రోడ్లు'), o('AGRI', 'Farm income / MSP', 'వ్యవసాయ ఆదాయం / మద్దతు ధర'), o('HEALTH', 'Health care', 'వైద్యం'),
            o('EDU', 'Education', 'విద్య'), o('HOUSE', 'Housing', 'ఇళ్లు'), o('CORR', 'Corruption', 'అవినీతి'),
          ] },
        { id: 'q_services', type: 'grid',
          label: { en: 'How would you rate these services in your area?', te: 'మీ ప్రాంతంలో ఈ సేవలను ఎలా రేట్ చేస్తారు?' },
          rows: [o('roads', 'Roads', 'రోడ్లు'), o('water', 'Drinking water', 'తాగునీరు'), o('power', 'Electricity', 'విద్యుత్'), o('health', 'Govt. hospitals', 'ప్రభుత్వ ఆసుపత్రులు'), o('school', 'Govt. schools', 'ప్రభుత్వ పాఠశాలలు')],
          cols: [o('1', 'Very poor', 'చాలా అధ్వాన్నం'), o('2', 'Poor', 'అధ్వాన్నం'), o('3', 'Average', 'సగటు'), o('4', 'Good', 'బాగుంది'), o('5', 'Very good', 'చాలా బాగుంది')] },
        { id: 'q_govt_rating', type: 'number', min: 1, max: 10, required: true,
          label: { en: 'On a scale of 1 to 10, how would you rate the state government?', te: '1 నుండి 10 స్కేల్‌లో రాష్ట్ర ప్రభుత్వానికి ఎంత రేటింగ్ ఇస్తారు?' } },
        { id: 'q_scheme', type: 'single', required: true,
          label: { en: 'Has your household benefited from any government welfare scheme?', te: 'మీ కుటుంబం ఏదైనా ప్రభుత్వ సంక్షేమ పథకం నుండి లబ్ధి పొందిందా?' },
          options: [o('Y', 'Yes', 'అవును'), o('N', 'No', 'లేదు')] },
        { id: 'q_scheme_which', type: 'multiple', allowOther: true, showIf: { q: 'q_scheme', op: 'eq', value: 'Y' },
          label: { en: 'Which schemes? (select all that apply)', te: 'ఏ పథకాలు? (వర్తించేవన్నీ ఎంచుకోండి)' },
          options: [o('PEN', 'Pension', 'పెన్షన్'), o('FARM', 'Farmer investment support', 'రైతు పెట్టుబడి సాయం'), o('HOUSE', 'Housing', 'గృహ నిర్మాణం'), o('HEALTH', 'Health insurance', 'ఆరోగ్య బీమా'), o('RATION', 'Free / subsidised ration', 'ఉచిత / సబ్సిడీ రేషన్')] },
      ],
    },
    {
      id: 'g4',
      title: { en: 'Voting', te: 'ఓటింగ్' },
      questions: [
        { id: 'q_voted_last', type: 'single', label: { en: 'Did you vote in the last assembly election?', te: 'గత అసెంబ్లీ ఎన్నికల్లో మీరు ఓటు వేశారా?' },
          options: [o('Y', 'Yes', 'అవును'), o('N', 'No', 'లేదు'), o('DK', "Don't remember", 'గుర్తు లేదు')] },
        { id: 'q_vote_intent', type: 'single', required: true,
          label: { en: 'If elections were held today, which party would you vote for?', te: 'ఈరోజు ఎన్నికలు జరిగితే, మీరు ఏ పార్టీకి ఓటు వేస్తారు?' },
          options: [o('A', 'Party A', 'పార్టీ A'), o('B', 'Party B', 'పార్టీ B'), o('C', 'Party C', 'పార్టీ C'), o('IND', 'Independent / Others', 'స్వతంత్ర / ఇతరులు'), o('UND', 'Undecided', 'ఇంకా నిర్ణయించలేదు'), o('NS', "Won't say", 'చెప్పను')] },
        { id: 'q_vote_reason', type: 'single', allowOther: true, showIf: { q: 'q_vote_intent', op: 'in', value: ['A', 'B', 'C'] },
          label: { en: 'What is the main reason for your choice?', te: 'మీ ఎంపికకు ప్రధాన కారణం ఏమిటి?' },
          options: [o('LEADER', 'Party leader', 'పార్టీ నాయకుడు'), o('CAND', 'Local candidate', 'స్థానిక అభ్యర్థి'), o('WELF', 'Welfare schemes', 'సంక్షేమ పథకాలు'), o('DEV', 'Development work', 'అభివృద్ధి పనులు'), o('COMM', 'Community / caste', 'సామాజిక వర్గం')] },
        { id: 'q_lean', type: 'single', showIf: { q: 'q_vote_intent', op: 'eq', value: 'UND' },
          label: { en: 'Which party are you leaning towards?', te: 'మీరు ఏ పార్టీ వైపు మొగ్గు చూపుతున్నారు?' },
          options: [o('A', 'Party A', 'పార్టీ A'), o('B', 'Party B', 'పార్టీ B'), o('C', 'Party C', 'పార్టీ C'), o('NONE', 'None yet', 'ఇంకా ఏదీ లేదు')] },
        { id: 'q_leader', type: 'single', allowOther: true,
          label: { en: 'Who is your preferred Chief Minister?', te: 'మీకు ఇష్టమైన ముఖ్యమంత్రి అభ్యర్థి ఎవరు?' },
          options: [o('LA', 'Leader A (Party A)', 'నాయకుడు A (పార్టీ A)'), o('LB', 'Leader B (Party B)', 'నాయకుడు B (పార్టీ B)'), o('LC', 'Leader C (Party C)', 'నాయకుడు C (పార్టీ C)')] },
      ],
    },
    {
      id: 'g5',
      title: { en: 'Verification', te: 'ధృవీకరణ' },
      questions: [
        { id: 'q_date', type: 'date', required: true, label: { en: 'Interview date', te: 'ఇంటర్వ్యూ తేదీ' } },
        { id: 'q_gps', type: 'gps', required: true, label: { en: 'Capture GPS location', te: 'GPS స్థానాన్ని నమోదు చేయండి' } },
        { id: 'q_photo', type: 'photo', label: { en: 'Photo of house / landmark (no faces)', te: 'ఇల్లు / గుర్తు ఫోటో (ముఖాలు వద్దు)' } },
      ],
    },
  ],
};

export function allQuestions(qn) {
  return qn.groups.flatMap((g) => g.questions);
}

export function findQuestion(qn, id) {
  return allQuestions(qn).find((q) => q.id === id);
}

export function optionLabel(q, v, lang = 'en') {
  if (!q) return v;
  const list = q.options || q.cols || [];
  const opt = list.find((x) => x.v === v);
  if (opt) return opt[lang] || opt.en;
  if (v === 'OTHER') return lang === 'te' ? 'ఇతర' : 'Other';
  return v;
}

// Skip logic evaluation. Returns true if a question should be shown for the given answers.
export function isVisible(q, answers) {
  if (!q.showIf) return true;
  const { q: dep, op, value } = q.showIf;
  const a = answers[dep];
  switch (op) {
    case 'eq': return a === value;
    case 'neq': return a !== undefined && a !== value;
    case 'in': return Array.isArray(value) && value.includes(a);
    case 'nin': return a !== undefined && Array.isArray(value) && !value.includes(a);
    case 'answered': return a !== undefined && a !== '' && a !== null;
    default: return true;
  }
}

export function describeRule(qn, rule, lang = 'en') {
  if (!rule) return '';
  const dep = findQuestion(qn, rule.q);
  const name = dep ? dep.label[lang] || dep.label.en : rule.q;
  const vals = (Array.isArray(rule.value) ? rule.value : [rule.value]).map((v) => optionLabel(dep, v, lang)).join(' or ');
  const ops = { eq: 'is', neq: 'is not', in: 'is any of', nin: 'is none of', answered: 'is answered' };
  return `Show only if “${name}” ${ops[rule.op] || rule.op}${rule.op === 'answered' ? '' : ' ' + vals}`;
}
