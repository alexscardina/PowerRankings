export function getCompletedWeek(leagueData) {
  const current =
    leagueData?.status?.currentMatchupPeriod ||
    leagueData?.scoringPeriodId ||
    1;
  return Math.max(1, current - 1);
}

function scoringPointsByStatId(leagueData) {
  const items = leagueData?.settings?.scoringSettings?.scoringItems;
  if (!Array.isArray(items) || !items.length) return null;

  const pointsByStatId = new Map();
  for (const item of items) {
    if (item?.statId == null || typeof item.points !== "number") continue;
    pointsByStatId.set(Number(item.statId), item.points);
  }
  return pointsByStatId.size ? pointsByStatId : null;
}

/** League-settings fantasy points for a week (half-PPR, etc.). */
function getWeekPoints(entry, week, pointsByStatId) {
  const stats = entry?.playerPoolEntry?.player?.stats || [];
  const actual = stats.find(
    (stat) =>
      stat.scoringPeriodId === week &&
      stat.statSourceId === 0 &&
      stat.statSplitTypeId === 1
  );
  if (!actual) return null;

  if (pointsByStatId && actual.stats && typeof actual.stats === "object") {
    let total = 0;
    let scored = false;
    for (const [statId, value] of Object.entries(actual.stats)) {
      const points = pointsByStatId.get(Number(statId));
      if (points == null || typeof value !== "number") continue;
      total += points * value;
      scored = true;
    }
    if (scored) return total;
  }

  // Fall back to ESPN appliedTotal only if league settings were unavailable
  return actual.appliedTotal ?? null;
}

function playerHeadshotUrl(playerId) {
  if (!playerId) return null;
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png`;
}

// ESPN lineupSlotId: 20 = Bench, 21 = IR
const NON_STARTER_SLOTS = new Set([20, 21]);

function isStarterEntry(entry) {
  const slot = entry?.lineupSlotId;
  return typeof slot === "number" && !NON_STARTER_SLOTS.has(slot);
}

export function ordinal(n) {
  const value = Number(n);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function scoringPlaces(matchups) {
  const scores = [];
  for (const matchup of matchups) {
    for (const side of [matchup.home, matchup.away]) {
      if (!side?.teamId || typeof side.totalPoints !== "number") continue;
      scores.push({ teamId: side.teamId, points: side.totalPoints });
    }
  }

  scores.sort((a, b) => b.points - a.points || a.teamId - b.teamId);

  const places = new Map();
  scores.forEach((row, index) => {
    const place = index + 1;
    places.set(row.teamId, {
      place,
      placeLabel: ordinal(place),
      medianResult: place <= 6 ? "W" : "L",
      points: row.points
    });
  });
  return places;
}

function emptyRecord() {
  return { wins: 0, losses: 0, ties: 0 };
}

function formatRecord(record) {
  if (!record) return "0-0";
  const { wins = 0, losses = 0, ties = 0 } = record;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/** H2H + median through `week` (2 results per completed week). */
function recordsThroughWeek(schedule, week) {
  const records = new Map();

  function ensure(teamId) {
    if (!records.has(teamId)) {
      records.set(teamId, emptyRecord());
    }
    return records.get(teamId);
  }

  for (let period = 1; period <= week; period++) {
    const matchups = (schedule || []).filter(
      (matchup) => matchup.matchupPeriodId === period
    );
    if (!matchups.length) continue;

    const places = scoringPlaces(matchups);

    for (const matchup of matchups) {
      if (!matchup.winner || matchup.winner === "UNDECIDED") continue;

      const home = ensure(matchup.home.teamId);
      const away = ensure(matchup.away.teamId);

      if (matchup.winner === "TIE") {
        home.ties += 1;
        away.ties += 1;
      } else if (matchup.winner === "HOME") {
        home.wins += 1;
        away.losses += 1;
      } else if (matchup.winner === "AWAY") {
        away.wins += 1;
        home.losses += 1;
      }
    }

    for (const [teamId, scoring] of places) {
      const record = ensure(teamId);
      if (scoring.medianResult === "W") {
        record.wins += 1;
      } else {
        record.losses += 1;
      }
    }
  }

  return records;
}

function teamNameFor(team, teamNames) {
  if (!team) return "Opponent";
  return (
    teamNames?.[String(team.id)] ||
    teamNames?.[team.id] ||
    team.name ||
    "Opponent"
  );
}

export default function buildTeamCardStats(
  leagueData,
  teams,
  weekOverride,
  teamNames = {}
) {
  const week = weekOverride ?? getCompletedWeek(leagueData);
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const schedule = leagueData.schedule || [];
  const matchups = schedule.filter(
    (matchup) => matchup.matchupPeriodId === week
  );
  const places = scoringPlaces(matchups);
  const records = recordsThroughWeek(schedule, week);
  const pointsByStatId = scoringPointsByStatId(leagueData);
  const byTeamId = {};

  for (const matchup of matchups) {
    const sides = [
      { self: matchup.home, opp: matchup.away, won: matchup.winner === "HOME" },
      { self: matchup.away, opp: matchup.home, won: matchup.winner === "AWAY" }
    ];

    for (const side of sides) {
      if (!side.self?.teamId) continue;
      const opponent = teamsById.get(side.opp?.teamId);
      const points = side.self.totalPoints ?? 0;
      const oppPoints = side.opp?.totalPoints ?? 0;
      const result =
        matchup.winner === "UNDECIDED"
          ? "TBD"
          : side.won
            ? "W"
            : points === oppPoints
              ? "T"
              : "L";
      const scoring = places.get(side.self.teamId);
      const record = records.get(side.self.teamId) || emptyRecord();

      byTeamId[side.self.teamId] = {
        week,
        result,
        points,
        oppPoints,
        opponentName: teamNameFor(opponent, teamNames),
        opponentOwner: opponent?.owner || "",
        medianResult: scoring?.medianResult ?? null,
        scoringPlace: scoring?.place ?? null,
        scoringPlaceLabel: scoring?.placeLabel ?? null,
        record,
        recordLabel: formatRecord(record)
      };
    }
  }

  for (const team of teams) {
    const entries = team.roster?.entries || [];
    let topPlayer = null;

    for (const entry of entries) {
      if (!isStarterEntry(entry)) continue;
      const weekPts = getWeekPoints(entry, week, pointsByStatId);
      if (weekPts == null) continue;
      if (!topPlayer || weekPts > topPlayer.points) {
        topPlayer = {
          name: entry.playerPoolEntry?.player?.fullName || "Unknown",
          points: Number(weekPts.toFixed(2)),
          playerId: entry.playerId,
          headshotUrl: playerHeadshotUrl(entry.playerId)
        };
      }
    }

    const scoring = places.get(team.id);
    const record = records.get(team.id) || emptyRecord();

    byTeamId[team.id] = {
      week,
      result: null,
      points: null,
      oppPoints: null,
      opponentName: null,
      opponentOwner: null,
      medianResult: scoring?.medianResult ?? null,
      scoringPlace: scoring?.place ?? null,
      scoringPlaceLabel: scoring?.placeLabel ?? null,
      record,
      recordLabel: formatRecord(record),
      ...byTeamId[team.id],
      topPlayer
    };
  }

  return { week, byTeamId };
}
