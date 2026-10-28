export const EDITION_TYPES = {
  week: 'week',
  draft: 'draft',
  midseason: 'midseason',
  playoff: 'playoff',
  retrospective: 'retrospective'
};

export const CREATE_TYPE_OPTIONS = [
  { type: EDITION_TYPES.week, label: 'Regular week' },
  { type: EDITION_TYPES.draft, label: 'Draft Recap' },
  { type: EDITION_TYPES.midseason, label: 'Mid-Season Report Card' },
  { type: EDITION_TYPES.playoff, label: 'Playoff Predictor' },
  { type: EDITION_TYPES.retrospective, label: 'Season Retrospective' }
];

export function seasonStamp(year) {
  return String(year);
}

export function usesEspnMatchup(edition, live) {
  return Boolean(live && edition?.type === EDITION_TYPES.week);
}

export function usesEspnMidseason(edition, live) {
  return Boolean(live && edition?.type === EDITION_TYPES.midseason);
}

export function usesEspnSeasonStats(edition, live) {
  return Boolean(
    live &&
      (edition?.type === EDITION_TYPES.midseason ||
        edition?.type === EDITION_TYPES.playoff ||
        edition?.type === EDITION_TYPES.retrospective)
  );
}

export function usesDraftMiddle(edition) {
  return edition?.type === EDITION_TYPES.draft;
}

export function usesMetaMiddle(edition) {
  return (
    edition?.type === EDITION_TYPES.midseason ||
    edition?.type === EDITION_TYPES.playoff ||
    edition?.type === EDITION_TYPES.retrospective ||
    edition?.type === EDITION_TYPES.draft ||
    // archival weeks store matchup lines in meta
    (edition?.type === EDITION_TYPES.week && edition?.meta)
  );
}

export function scoringPeriodForEdition(edition) {
  if (!edition) return null;
  if (edition.type === EDITION_TYPES.week && edition.week) return edition.week;
  if (edition.type === EDITION_TYPES.midseason && edition.week) {
    return edition.week;
  }
  if (edition.type === EDITION_TYPES.playoff && edition.week) {
    return edition.week;
  }
  return null;
}

export function previousEditionId(editions, currentId) {
  const list = [...(editions || [])].sort((a, b) => a.order - b.order);
  const index = list.findIndex((e) => e.id === currentId);
  if (index <= 0) return null;
  return list[index - 1]?.id ?? null;
}
