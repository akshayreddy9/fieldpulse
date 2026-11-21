// Builds MSR-Pulse-Test-Checklist-v2.xlsx for the internal test team.
const ExcelJS = require('../browser-test/node_modules/exceljs');
const OUT = process.argv[2];

const S = (id, title) => ({ section: true, id, title });
const T = (id, prio, who, todo, expect) => ({ id, prio, who, todo, expect });
const SV = 'Surveyor (Android app)';
const AD = 'Admin (laptop)';
const SU = 'Supervisor (laptop)';
const AN = 'Analyst (laptop)';
const CL = 'Client (laptop or phone)';
const ALL = 'Everyone';

const rows = [
  S('A', 'A. Sign-in and the Android app'),
  T('A1', 'Must', ALL, 'Open the website and enter a WRONG test-site password', 'Message: "That password is not right." You cannot get in.'),
  T('A2', 'Must', ALL, 'Enter the correct test-site password', 'The MSR Pulse sign-in page opens'),
  T('A3', 'Should', ALL, 'Type a mobile number that has no login and tap Send code', 'Neutral message; no way in'),
  T('A4', 'Must', ALL, 'Sign in as each demo role: Try a demo account > role > Use demo code (482913)', 'Admin, Supervisor and Analyst each get their own home and menu; Surveyor gets the phone app; Client gets the client portal'),
  T('A5', 'Should', ALL, 'Compare the menus of Supervisor, Analyst and Client', 'Each sees only their own pages; Client sees no staff pages'),
  T('A6', 'Should', ALL, 'Sign out and open the site again', 'Back at the sign-in page'),
  T('A7', 'Must', SV, 'UNINSTALL the old MSR Pulse app. Open the website on the phone, sign in, tap "Download Android app", install it and open it', 'The app asks for the TEST-SITE PASSWORD once. It does NOT ask for a server address'),
  T('A8', 'Must', SV, 'In the app, enter a wrong password first, then the right one', 'Wrong: "That test-site password is not right". Right: sign-in screen shows "Connected to MSR Pulse server" and "App version 2026-11-21 06:08". Write the version in Notes'),
  T('A9', 'Should', SV, 'Close the app completely and open it again', 'Still signed in; no password asked again'),

  S('B', 'B. Doing an interview on the phone'),
  T('B1', 'Must', SV, 'Look at the home screen', 'Your name, your booth, what is still needed in words (e.g. "Female: 3 more"), big "Start new interview" button'),
  T('B2', 'Must', SV, 'Start new interview. Allow the microphone when asked', 'Consent screen: Telugu statement with English below, says "about 8 minutes"; red REC timer running'),
  T('B3', 'Should', SV, 'At the consent screen tap No', '"Refusal noted"; back to home; nothing saved'),
  T('B4', 'Must', SV, 'Tap "Yes, agrees" and go through all pages', 'Every question in Telugu with English below; buttons in English; your booth is already filled in on page 1'),
  T('B5', 'Must', SV, 'Tap Next without answering a required question', 'Red message at the TOP naming the question; the page scrolls to it'),
  T('B6', 'Should', SV, 'Welfare scheme: answer Yes, then change to No', 'Yes: a follow-up question appears. No: it disappears'),
  T('B7', 'Should', SV, 'Vote question: choose Undecided', 'The "leaning towards" question appears'),
  T('B8', 'Should', SV, 'Choose "Other (please specify)" on a question', 'A text box appears'),
  T('B9', 'Should', SV, 'Main occupation question', 'Shown as ONE pick-list (tap to choose), not a long page of buttons'),
  T('B10', 'Must', SV, 'Mobile number: type 5 digits and tap Next; then type a correct 10-digit number', '5 digits: "Enter a valid 10-digit mobile number". 10 digits: accepted. The phone keypad opens, not the full keyboard'),
  T('B11', 'Should', SV, 'Age: type 12, tap Next; then 35', '12: "Enter a number between 18 and 100". 35: accepted'),
  T('B12', 'Must', SV, 'Last page: tap "Capture location". Allow location', 'Your coordinates and accuracy (± metres) appear'),
  T('B13', 'Must', SV, 'Last page: Take photo of a house or landmark (no faces)', 'The camera opens; the photo appears'),
  T('B14', 'Must', SV, 'Tap Finish & send', '"Interview sent". It appears under My interviews. Note the interview number (INT-...) for test G1'),
  T('B15', 'Should', SV, 'Phone settings: block the microphone for MSR Pulse, then start an interview', '"Microphone is blocked - not recording", with instructions; "Yes, agrees" stays disabled. Allow it again afterwards'),
  T('B16', 'Should', SV, 'Start an interview, tap the X and confirm', 'Interview discarded; back to home'),

  S('C', 'C. No internet (offline) - nothing must be lost'),
  T('C1', 'Must', SV, 'Turn on Airplane mode. Do a full interview with a photo and send', '"Interview saved ... sent automatically when internet returns". Home: "1 waiting to send" and "recordings / photos waiting to upload"'),
  T('C2', 'Must', SV, 'Still offline: close the app completely (swipe it away) and open it again', 'Opens signed in; the interview is still waiting'),
  T('C3', 'Must', SV, 'Turn Airplane mode off and keep the app open', 'Within about 30 seconds: "saved interviews sent"; both waiting counters go to 0'),
  T('C4', 'Must', SV + ' + ' + AD, 'Offline again: do 3 interviews in a row, then go online', 'All 3 arrive. Admin checks they appear on the live map / Recording checker > Most recent, each once (no duplicates)'),
  T('C5', 'Should', SV, 'Use poor signal (e.g. turn mobile data on/off while sending)', 'Nothing lost or duplicated; app keeps retrying by itself'),

  S('D', 'D. Several surveys and survey teams (reported earlier - check carefully)'),
  T('D1', 'Must', AD + ' + ' + SV, 'Phone signed in as surveyor and left open. Admin: Surveys > New survey "TEST <your name>", publish its questionnaire, Start fieldwork', 'Within a few seconds, WITHOUT touching the phone, the survey appears under "Your surveys (2)" on the phone'),
  T('D2', 'Must', SV, 'Tap the new survey on the phone', '"Working on" moves to it; booth and counts change to that survey'),
  T('D3', 'Must', AD + ' + ' + SV, 'Admin: Surveys > your TEST survey > Team > "Only selected people" > untick the surveyor', 'The phone moves off that survey by itself and shows a message'),
  T('D4', 'Must', AD + ' + ' + SV, 'Lock the phone for 1 minute. Admin ticks the surveyor again. Unlock the phone', 'The survey is back without restarting the app'),
  T('D5', 'Must', AD + ' + ' + SV, 'Admin: Edit the surveyor > under "Survey: TEST ..." pick a different booth > Save', 'On the phone that survey shows the new booth; the other survey keeps the usual booth'),
  T('D6', 'Must', AD + ' + ' + SV, 'Admin closes the TEST survey', 'It disappears from the phone'),
  T('D7', 'Should', SV, 'Offline: switch between two surveys you opened before', 'Works. A survey never opened on this phone gives a clear message'),
  T('D8', 'Should', AD, 'Surveys list', 'Shows Team size ("Everyone" or "N people") and a Team button for each survey'),

  S('E', 'E. Setting up (admin)'),
  T('E1', 'Must', AD, 'Surveys > New survey: try Blank, MSR starter and copy of an existing survey', 'Each is created as Draft and opens in the questionnaire builder'),
  T('E2', 'Should', AD, 'Use the survey switcher in the top bar', 'Every page switches to the chosen survey'),
  T('E3', 'Must', AD, 'Questionnaire: edit a question in English and Telugu', 'Phone preview updates at once'),
  T('E4', 'Must', AD, 'Add one question of each type: single, multiple, grid, cascading list, text, number, date, GPS, photo', 'Each appears and works in the preview'),
  T('E5', 'Should', AD, 'Add skip logic ("Ask only when an earlier answer is...")', 'Plain-words description; preview hides/shows the question as you answer'),
  T('E6', 'Must', AD, 'Leave a Telugu text empty, then press Publish', 'Publishing is blocked; "Checks before publishing" lists the missing Telugu'),
  T('E7', 'Must', AD, 'Fill everything and Publish to field', 'Version number goes up; phones get the new version (check on a phone)'),
  T('E8', 'Must', AD, '"Used for": open the Gender question; then mark two questions as "Main result"', 'Gender shows "Used for: Gender". Two Main results: a problem is listed and Publish is blocked'),
  T('E9', 'Should', AD, 'Make a change, then try to leave the page; use Save draft and Discard', 'Unsaved-changes warning; Save draft keeps it; Discard goes back to the published version'),
  T('E10', 'Should', AD, 'Booth list: Download template and Download current list', 'Two Excel files download'),
  T('E11', 'Must', AD, 'Booth list: Upload the CURRENT list you just downloaded (unchanged)', 'Preview shows the same counts. Press CANCEL. (Do NOT save a different list on this shared site)'),
  T('E12', 'Should', AD, 'In that Excel file change one Latitude to "abc", upload it', '"Row N: Latitude/Longitude..." error; nothing is saved'),
  T('E13', 'Should', AD, 'Booth targets: edit one booth; try "Apply to all booths in this mandal"', 'Warns if the split does not add up; change saved'),
  T('E14', 'Should', AD, 'Booth targets: Export to Excel, change a value, Import', 'Changed value appears in the table'),
  T('E15', 'Should', AD, 'Booth targets: look for cells above their target', 'Over-quota cells are purple with "+n"'),
  T('E16', 'Should', AD, 'Team & people: Excel template; fill 2 people (one with a wrong mobile number); Upload', 'Preview shows the error row; only the good row is added'),
  T('E17', 'Must', AD, 'Team & people > Add person: open the Role list', 'Surveyor, Supervisor, Analyst, Admin, Client'),
  T('E18', 'Must', AD, 'Add an ANALYST with your own spare mobile number', 'Listed under "Office staff & client logins"; that number can sign in and sees analyst screens'),
  T('E19', 'Should', AD, 'Edit that analyst: rename, then set "Switched off"', 'New name shows; the number can no longer sign in'),
  T('E20', 'Should', AD, 'Add a person with a mobile number that already has a login', 'Clear error; nothing added'),
  T('E21', 'Should', SU, 'Sign in as Supervisor > Team & people > Add person', 'Only Surveyor and Supervisor are offered'),
  T('E22', 'Should', AD, 'Who can see what: untick one page for Supervisor', 'Supervisor\'s menu loses that page (sign in as Supervisor to check). Tick it back afterwards'),

  S('F', 'F. Watching fieldwork (supervisor / admin)'),
  T('F1', 'Should', AD, 'Dashboard: "Needs your attention"', 'Each item opens the right screen when clicked'),
  T('F2', 'Must', SU + ' + ' + SV, 'Live map open on the laptop; surveyor sends an interview', 'A new dot appears and counts go up without refreshing'),
  T('F3', 'Must', SU, 'Live map on the laptop AND on a phone browser', 'Map pieces show (streets, places). NO "Access blocked" pictures'),
  T('F4', 'Must', SU, 'On a PHONE: open the Live map, then tap the menu (three lines)', 'The menu opens ON TOP of the map'),
  T('F5', 'Must', SU, 'Alerts to review: open a flagged interview', 'Reasons (too short, away from booth...), mini map, answers'),
  T('F6', 'Must', SU, 'Accept / Send for back-check / Reject an interview', 'It moves to that tab; rejected ones disappear from Results'),
  T('F7', 'Should', SU, '"Surveyors with repeated flags": click a surveyor', 'List shows only that person; "Back-check all" button works; "Show everyone" goes back'),
  T('F8', 'Should', AD, 'Field app preview > switch on "Surveyor is at home, 8 km away" > send an interview', 'It appears in Alerts flagged "Away from booth"'),
  T('F9', 'Should', SU, 'Do a VERY short interview on a phone (under 2 minutes)', 'It appears in Alerts flagged "Too short"'),
  T('F10', 'Should', SU, 'Click a masked name (R-XXXX), give a reason', 'Real name shown for 30 seconds; recorded in the Privacy lock access log'),
  T('F11', 'Should', SU, 'Evening summary > Back-check list (Excel); then press "Send now"', 'Excel downloads. "Send now" says automatic sending is not set up yet'),
  T('F12', 'Should', SU, 'Recording checker', 'Shows the amber "Preview - not connected yet" note'),

  S('G', 'G. Recordings and photos (new)'),
  T('G1', 'Must', SU, 'Recording checker > "Most recent" > pick YOUR interview from test B14 (or open it in Alerts)', 'Section RECORDING has "Play recording"; it plays YOUR voice from the interview'),
  T('G2', 'Must', SU, 'Same interview: "Show photo"', 'The photo you took is shown'),
  T('G3', 'Should', SU, 'Look under the recording and photo', '"Kept until <date>" (about 90 days after the interview) and the privacy note'),
  T('G4', 'Must', AD, 'Privacy lock page > access log', 'Entries "Recording" and "Photo" with the supervisor\'s name and time'),
  T('G5', 'Must', CL, 'Sign in as Client and look for recordings or photos', 'None anywhere in the client portal'),
  T('G6', 'Must', AD, 'Security & DPDP > "Recordings & photos" > change "Keep for" to 60 days, then back to 90', 'Saved; storage used and free space shown'),
  T('G7', 'Should', SV + ' + ' + SU, 'Offline interview (test C1): after going online, open it as supervisor', 'Recording and photo are there once the phone has uploaded them'),
  T('G8', 'Should', SU, 'Note the recording size for an ~8-minute interview (shown next to Play)', 'About 1.5 MB or less'),

  S('H', 'H. Results and reports (analyst)'),
  T('H1', 'Should', AN, 'Analyst home', 'Leading answer, share, change since last round, close seats'),
  T('H2', 'Must', AN, 'Results: apply filters (constituency, gender, age, caste)', 'All charts update'),
  T('H3', 'Must', AN, 'Results > Export to Excel', 'Workbook with all questions and raw data; names and mobiles shown as codes'),
  T('H4', 'Must', AN, 'Booth > state totals: open a constituency, then a mandal', 'Totals add up correctly at each level'),
  T('H5', 'Should', AN, 'Compare: Gender x Vote intention', 'Stacked chart and colour-coded table'),
  T('H6', 'Should', AN, 'Compare: this round vs previous round > Export PDF', 'PDF downloads'),
  T('H7', 'Should', AN, 'Ask the data: "Vote share among women by age group"', 'Chart, "Understood as ..." and a one-line finding'),
  T('H8', 'Must', AN, 'Client report > Write first draft. Compare 2 numbers with the Results page', 'Sections with real numbers that MATCH Results; sentences read correctly'),
  T('H9', 'Must', AN, 'Try Approve while "MSR strategic advice" is empty', 'Blocked with a message'),
  T('H10', 'Must', AN, 'Write the advice > Start MSR review > Approve > Send to client > Download PDF', 'Branded PDF downloads; status "Sent to client"'),

  S('I', 'I. Client portal'),
  T('I1', 'Must', CL, 'Sign in as Client BEFORE the report is sent', '"Your report is being prepared" and Fieldwork progress bars per constituency'),
  T('I2', 'Must', CL, 'Sign in as Client AFTER test H10', 'Full report visible; PDF downloads'),
  T('I3', 'Should', CL, 'Open Key results and All surveys tabs', 'Only this client\'s surveys; no names, phone numbers or recordings'),
  T('I4', 'Must', AD + ' + ' + CL, 'Admin adds a second Client login (test E17-E18) and a TEST survey for it. Sign in as that client', 'Sees only its own survey, not Deccan Policy Foundation\'s'),

  S('J', 'J. Add-ons and settings'),
  T('J1', 'Should', AD, 'Privacy lock: switch off, then on', 'Off: names visible to staff. On: names shown as codes everywhere'),
  T('J2', 'Should', AD, 'GoSurvey import', 'Amber "Preview - not connected yet" note; sample import works and can be undone'),
  T('J3', 'Should', AD, 'Connect to other software: create an API key, then Revoke it', 'Key shown once; Revoke works'),
  T('J4', 'Should', AD, 'Security & DPDP: read the checklist; press "Run deletion now"', 'Items marked "In place" / "Before go-live"; message says how many records were cleaned'),
  T('J5', 'Should', AD, 'Delivery & support: click months', 'Peak months switch on and off'),

  S('K', 'K. Different phones and general'),
  T('K1', 'Must', ALL, 'Admin on a laptop + surveyor on a phone in another city', 'Interviews appear live on the laptop'),
  T('K2', 'Should', ALL, 'iPhone: Safari > open the site > Share > Add to Home Screen > do an interview', 'Opens full-screen like an app; interview works'),
  T('K3', 'Must', ALL, 'Check Telugu text on different phones (write the phone model in Notes)', 'Readable; no boxes or broken letters'),
  T('K4', 'Should', ALL, 'Rotate the phone; use the menu on staff pages', 'Layout fits; nothing cut off'),
  T('K5', 'Should', ALL, 'Speed: open pages from India', 'Loads within a few seconds (test server is in Australia; production will be in Mumbai)'),
  T('K6', 'Should', SV, 'Use the app for a full morning of interviews', 'Note battery and mobile data used in Notes'),
];

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MSR Pulse';
  wb.calcProperties.fullCalcOnLoad = true; // Excel recalculates the progress lines when the file opens
  const NAVY = 'FF0F2342'; const TEAL = 'FF0D9488';
  const border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

  // ---------- How to test ----------
  const h = wb.addWorksheet('How to test', { views: [{ showGridLines: false }] });
  h.columns = [{ width: 24 }, { width: 110 }];
  h.addRow(['MSR Pulse - Test checklist v2 (21 Nov 2026)']).font = { bold: true, size: 16, color: { argb: NAVY } };
  h.addRow(['Fill in "Result" on the Test checklist sheet (Pass / Fail / Blocked). Report every Fail on the Bug reports sheet. Test the "Must" rows first.']);
  h.addRow([]);
  const info = [
    ['Website', 'https://13-210-51-39.sslip.io'],
    ['Test-site password', 'Same password as before (ask the project lead if you do not have it). Do not share it outside the team.'],
    ['Sign in', 'Tap "Try a demo account (test site only)" > choose the role > "Use demo code" (482913)'],
    ['Demo accounts', 'Admin 9848012345 · Supervisor 9848012346 · Analyst 9848012347 · Surveyor (Ravi Kumar) 9848012348 · Client 9848012349'],
    ['Android app', 'UNINSTALL the old app first. Open the website on the phone > sign in > "Download Android app" > install > open > enter the test-site password once. The sign-in screen must show "App version 2026-11-21 06:08".'],
    ['iPhone', 'Safari > open the website > Share > Add to Home Screen'],
    ['Team split (suggested)', 'Person 1: Admin (sections D, E, J). Person 2: Surveyor phone (A, B, C, D, G). Person 3: Supervisor + Analyst + Client (F, G, H, I). Everyone: K.'],
    ['Survey names', 'Start every survey you create with "TEST" and close it when you finish.'],
    ['DO NOT', 'Do not press the circular-arrow "Reset" button. Do not save a different booth list (test E11 cancels). Do not enter real people\'s names or phone numbers - sample data only.'],
    ['How to report a bug', 'Bug reports sheet: test number, what you did, what happened, what you expected, phone model, screenshot. Please also tell us the App version from the sign-in screen.'],
    ['Previews', 'Some features are previews and are labelled "Preview - not connected yet" in the app. See the Known limits sheet - please do not report these as bugs.'],
  ];
  info.forEach(([k, v]) => { const r = h.addRow([k, v]); r.getCell(1).font = { bold: true, color: { argb: NAVY } }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; r.getCell(1).alignment = { vertical: 'top' }; });
  h.eachRow((r) => { if (r.getCell(1).value === 'DO NOT') { r.getCell(1).font = { bold: true, color: { argb: 'FFBE123C' } }; r.getCell(2).font = { bold: true, color: { argb: 'FFBE123C' } }; } });
  h.addRow([]);
  const ph = h.addRow(['Progress (updates automatically)']); ph.font = { bold: true, size: 13, color: { argb: NAVY } };
  const sectionsList = rows.filter((r) => r.section);

  // ---------- Test checklist ----------
  const ws = wb.addWorksheet('Test checklist', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '#', key: 'id', width: 6 }, { header: 'Section', key: 'sec', width: 24 }, { header: 'Priority', key: 'prio', width: 9 },
    { header: 'Who tests', key: 'who', width: 22 }, { header: 'What to do', key: 'todo', width: 60 }, { header: 'What should happen', key: 'expect', width: 60 },
    { header: 'Result', key: 'res', width: 12 }, { header: 'Tester name', key: 'tester', width: 14 }, { header: 'Device / browser / app version', key: 'dev', width: 22 },
    { header: 'Date', key: 'date', width: 11 }, { header: 'Notes / screenshot link', key: 'notes', width: 34 },
  ];
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; hr.alignment = { vertical: 'middle', wrapText: true }; hr.height = 28;
  let curSec = '';
  const secRanges = {};
  rows.forEach((r) => {
    if (r.section) {
      curSec = r.title;
      const sr = ws.addRow({ id: r.id, sec: r.title });
      sr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
      ws.mergeCells(sr.number, 2, sr.number, 11);
      return;
    }
    const row = ws.addRow({ id: r.id, sec: curSec.replace(/^[A-K]\. /, ''), prio: r.prio, who: r.who, todo: r.todo, expect: r.expect, res: 'Not tested' });
    row.alignment = { wrapText: true, vertical: 'top' };
    row.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
    if (r.prio === 'Must') { row.getCell('prio').font = { bold: true, color: { argb: 'FFBE123C' } }; }
    row.getCell('res').dataValidation = { type: 'list', allowBlank: false, formulae: ['"Not tested,Pass,Fail,Blocked"'], showErrorMessage: true, errorTitle: 'Result', error: 'Choose Not tested, Pass, Fail or Blocked' };
    (secRanges[curSec] ||= []).push(row.number);
  });
  const last = ws.rowCount;
  // colour the Result cell automatically
  ws.addConditionalFormatting({ ref: `G2:G${last}`, rules: [
    { type: 'cellIs', operator: 'equal', formulae: ['"Pass"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCFCE7' } }, font: { color: { argb: 'FF15803D' }, bold: true } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Fail"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } }, font: { color: { argb: 'FFBE123C' }, bold: true } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Blocked"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } }, font: { color: { argb: 'FFB45309' }, bold: true } } },
  ] });
  ws.autoFilter = { from: 'A1', to: `K${last}` };

  // ---------- Progress on "How to test": one readable line per section (Excel formulas, update automatically) ----------
  const line = (R, P) => ({ formula: `ROWS(${R})&" tests  ·  "&COUNTIF(${P},"Must")&" must  ·  "&COUNTIF(${R},"Pass")&" pass  ·  "&COUNTIF(${R},"Fail")&" fail  ·  "&COUNTIF(${R},"Blocked")&" blocked  ·  "&COUNTIF(${R},"Not tested")&" not tested"` });
  sectionsList.forEach((sct) => {
    const rr = secRanges[sct.title];
    const row = h.addRow([sct.title]);
    row.getCell(2).value = line(`'Test checklist'!G${rr[0]}:G${rr[rr.length - 1]}`, `'Test checklist'!C${rr[0]}:C${rr[rr.length - 1]}`);
  });
  const tot = h.addRow(['TOTAL']);
  tot.font = { bold: true };
  // whole list: COUNTIF ignores the section title rows (their Result cell is empty)
  tot.getCell(2).value = { formula: `COUNTIF('Test checklist'!G2:G${last},"<>")&" tests  ·  "&COUNTIF('Test checklist'!C2:C${last},"Must")&" must  ·  "&COUNTIF('Test checklist'!G2:G${last},"Pass")&" pass  ·  "&COUNTIF('Test checklist'!G2:G${last},"Fail")&" fail  ·  "&COUNTIF('Test checklist'!G2:G${last},"Blocked")&" blocked  ·  "&COUNTIF('Test checklist'!G2:G${last},"Not tested")&" not tested"` };

  // ---------- Bug reports ----------
  const bug = wb.addWorksheet('Bug reports', { views: [{ state: 'frozen', ySplit: 1 }] });
  bug.columns = [
    { header: 'Bug #', width: 7 }, { header: 'Test #', width: 8 }, { header: 'Who (role)', width: 14 }, { header: 'Device / browser / app version', width: 24 },
    { header: 'Page / screen', width: 18 }, { header: 'What I did (steps)', width: 40 }, { header: 'What happened', width: 36 }, { header: 'What I expected', width: 36 },
    { header: 'Screenshot link', width: 22 }, { header: 'How bad?', width: 16 }, { header: 'Reported by', width: 14 }, { header: 'Date', width: 11 }, { header: 'Status (developer)', width: 16 },
  ];
  const br = bug.getRow(1); br.font = { bold: true, color: { argb: 'FFFFFFFF' } }; br.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; br.alignment = { wrapText: true, vertical: 'middle' }; br.height = 28;
  for (let k = 1; k <= 60; k++) {
    const r = bug.addRow([k]);
    r.getCell(10).dataValidation = { type: 'list', allowBlank: true, formulae: ['"A. Not working,B. Change before go-live,C. Nice to have"'] };
    r.getCell(13).dataValidation = { type: 'list', allowBlank: true, formulae: ['"New,Fixing,Fixed - please re-test,Closed,Not a bug"'] };
    r.alignment = { wrapText: true, vertical: 'top' };
  }

  // ---------- Known limits ----------
  const kl = wb.addWorksheet('Known limits', { views: [{ showGridLines: false }] });
  kl.columns = [{ width: 40 }, { width: 90 }];
  kl.addRow(['Known limits - please do NOT report these as bugs']).font = { bold: true, size: 14, color: { argb: NAVY } };
  kl.addRow([]);
  [
    ['Speech-to-text of recordings (AI interview checker)', 'Preview. Transcripts on the Recording checker are simulated. Real recordings ARE uploaded and playable.'],
    ['GoSurvey import', 'Preview. Loads sample data, not the file you choose.'],
    ['Evening summary "Send now"', 'Automatic SMS / WhatsApp / email sending is not connected yet. The Excel back-check list works.'],
    ['Webhooks (Connect to other software)', 'Preview; API keys work.'],
    ['SMS login codes', 'Test site uses the fixed demo code 482913. Real SMS comes with MSR\'s SMS provider.'],
    ['iPhone App Store app', 'Not yet. iPhone uses the website (Add to Home Screen).'],
    ['Server location', 'Test server is in Australia (temporary account, sample data). Production will be in MSR\'s own AWS account in Mumbai, so it will be faster in India.'],
    ['Sample data', 'All names, booths and the "Telangana Pulse" survey are made up. Old sample interviews may show ~15 minutes; new ones ~6-8 minutes.'],
    ['Recordings & photos of SAMPLE interviews', 'Sample interviews have no real recording (a simulated waveform is shown and labelled). Interviews you do in the app have real ones.'],
    ['Encryption on the phone', 'Planned before go-live.'],
  ].forEach(([a, b]) => { const r = kl.addRow([a, b]); r.getCell(1).font = { bold: true }; r.alignment = { wrapText: true, vertical: 'top' }; });

  await wb.xlsx.writeFile(OUT);
  const tests = rows.filter((r) => !r.section);
  console.log(`written: ${tests.length} tests (${tests.filter((r) => r.prio === 'Must').length} must) in ${sectionsList.length} sections`);
})();
