const axios = require("axios");
const { envValue } = require("./env");

const ESPN_BASE =
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

async function getLeagueData(season, view, scoringPeriodId) {
  const leagueId = envValue("LEAGUE_ID");
  const espnS2 = envValue("ESPN_S2");
  const swid = envValue("ESPN_SWID");

  const url =
    `${ESPN_BASE}/seasons/${season}/segments/0/leagues/` + `${leagueId}`;

  const params = { view };
  if (scoringPeriodId != null) {
    params.scoringPeriodId = scoringPeriodId;
  }

  const response = await axios.get(url, {
    params,
    // ESPN expects ?view=mTeam&view=mRoster, not view[]=
    paramsSerializer: {
      indexes: null
    },
    headers: {
      Cookie: `espn_s2=${espnS2}; SWID=${swid}`
    }
  });

  return response.data;
}

module.exports = {
  getLeagueData
};
