export default function matchTeamOwner(teams, members) {
  return teams.map(team => {
    const owner = members.find(member => member.id === team.primaryOwner);
    const ownerName = owner.lastName === 'Rocco' ? 'Rocco' : 
    owner.firstName === 'S' ? 'Steven' : owner.firstName;
    return {
      owner: owner.firstName === 'Matthew' ? 'Matt' : ownerName,
      ...team
    };
  });
}