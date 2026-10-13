export function powerRankForIndex(index, listLength) {
  return listLength - index;
}

export function ranksFromTeamIds(teamIds, listLength) {
  const ranks = new Map();
  (teamIds || []).forEach((id, index) => {
    ranks.set(Number(id), powerRankForIndex(index, listLength));
  });
  return ranks;
}

/** Positive = moved toward #1 (better); negative = moved toward #12 (worse). */
export function rankDelta(teamId, currentTeamIds, previousTeamIds) {
  if (!previousTeamIds?.length || !currentTeamIds?.length) return null;

  const listLength = currentTeamIds.length;
  const currentRanks = ranksFromTeamIds(currentTeamIds, listLength);
  const previousRanks = ranksFromTeamIds(previousTeamIds, previousTeamIds.length);
  const current = currentRanks.get(Number(teamId));
  const previous = previousRanks.get(Number(teamId));

  if (current == null || previous == null) return null;
  return previous - current;
}

export function availableWeeks(weeks) {
  return Object.keys(weeks || {})
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}
