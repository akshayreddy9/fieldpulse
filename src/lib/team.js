// Survey teams: who works on which survey, and at which booths.
//
// Each survey has a "team" setting: null = everyone in the team list (the default, as before), or
// { members: { [personId]: { boothIds: [...] } } } = only these people. A member with no booths listed
// works at their usual booths (from Surveyors & team); listed booths apply to this survey only.
// Used by the browser (team page, field app) and the server (who may see / send to a survey).

export const onTeam = (team, personId) => !team || !team.members || !!team.members[personId];

// Booths a person works at in a survey
export function boothsFor(person, team) {
  if (!person) return [];
  const m = team?.members?.[person.id];
  return m?.boothIds?.length ? m.boothIds : (person.boothIds || []);
}

// Number of people on a survey's team (null team = everyone)
export const teamSize = (team, people) => people.filter((p) => onTeam(team, p.id)).length;
