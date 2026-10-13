const axios = require("axios");

const ESPN_BASE =
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

async function getLeagueData(season, view) {
  const url =
    `${ESPN_BASE}/seasons/${season}/segments/0/leagues/` +
    `${process.env.LEAGUE_ID}`;

  const response = await axios.get(url, {
    params: {
      view
    },
    // ESPN expects ?view=mTeam&view=mRoster, not view[]=
    paramsSerializer: {
      indexes: null
    },
    headers: {
      Cookie:
        `espn_s2=${process.env.ESPN_S2}; ` +
        `SWID=${process.env.ESPN_SWID}`
    }
  });

  return response.data;
}

module.exports = {
  getLeagueData
};
