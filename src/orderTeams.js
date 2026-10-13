export default function orderTeams(teams, teamIds) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const ordered = [];

  for (const id of teamIds) {
    const team = byId.get(id);
    if (team) {
      ordered.push(team);
      byId.delete(id);
    }
  }

  for (const team of byId.values()) {
    ordered.push(team);
  }

  return ordered;
}

export function mergeTeamsByOrder(prevTeams, nextTeams) {
  const orderIds = prevTeams.length
    ? prevTeams.map((team) => team.id)
    : nextTeams.map((team) => team.id);
  return orderTeams(nextTeams, orderIds);
}
