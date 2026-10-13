export default function matchTeamOwner(teams, members) {
  return teams.map(team => {
    const owner = members.find(member => member.id === team.primaryOwner);
    const ownerName = owner.lastName === 'Rocco' ? 'Rocco' : owner.firstName;
    return {
      owner: owner.firstName === 'S' ? 'Steven' : ownerName,
      ...team
    };
  });
}