const express = require("express");
const router = express.Router();

const { getLeagueData } = require("./server/getLeagueData");
const {
  readRankings,
  writeRankings,
  listYears,
  getYearBucket
} = require("./server/rankingsStore");
const { login, isValidToken } = require("./server/adminAuth");
const { envValue } = require("./server/env");
const { sortedEditionEntries } = require("./server/editionUtils");

const LIVE_SEASON = 2026;

router.get("/league", async (req, res) => {
  try {
    if (!envValue("LEAGUE_ID") || !envValue("ESPN_S2") || !envValue("ESPN_SWID")) {
      return res.status(500).json({
        error: "Missing LEAGUE_ID, ESPN_S2, or ESPN_SWID environment variables"
      });
    }

    const scoringPeriodId = req.query.scoringPeriodId
      ? Number(req.query.scoringPeriodId)
      : undefined;

    const data = await getLeagueData(
      LIVE_SEASON,
      ["mTeam", "mRoster", "mMatchupScore", "mSettings"],
      Number.isFinite(scoringPeriodId) ? scoringPeriodId : undefined
    );
    res.json(data);
  } catch (error) {
    const details = error.response?.data || error.message;
    console.error(details);
    res.status(500).json({
      error: "Failed to retrieve ESPN league",
      details: typeof details === "string" ? details : JSON.stringify(details)
    });
  }
});

router.get("/rankings/years", async (req, res) => {
  try {
    const data = await readRankings();
    res.json({
      currentYear: data.currentYear,
      years: listYears(data)
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "Failed to list ranking years",
      details: error.message
    });
  }
});

router.get("/rankings", async (req, res) => {
  try {
    const data = await readRankings();
    const year = req.query.year ? Number(req.query.year) : data.currentYear;
    const bucket = getYearBucket(data, year);
    if (!bucket) {
      return res.status(404).json({ error: `No rankings for year ${year}` });
    }

    const editions = sortedEditionEntries(bucket.editions).map(([id, edition]) => ({
      id,
      ...edition
    }));

    res.json({
      currentYear: data.currentYear,
      year,
      live: bucket.live,
      activeEditionId: bucket.activeEditionId,
      editions,
      years: listYears(data)
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      error: "Failed to read rankings",
      details: error.message
    });
  }
});

router.put("/rankings", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!isValidToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    year,
    editionId,
    type,
    create,
    teamIds,
    blurbs,
    names,
    owners,
    meta,
    intro,
    label,
    week,
    activeEditionId
  } = req.body || {};

  if (year !== undefined && (typeof year !== "number" || !Number.isFinite(year))) {
    return res.status(400).json({ error: "year must be a number" });
  }
  if (teamIds !== undefined && !Array.isArray(teamIds)) {
    return res.status(400).json({ error: "teamIds must be an array" });
  }
  if (
    blurbs !== undefined &&
    (typeof blurbs !== "object" || blurbs === null || Array.isArray(blurbs))
  ) {
    return res.status(400).json({ error: "blurbs must be an object" });
  }
  if (
    names !== undefined &&
    (typeof names !== "object" || names === null || Array.isArray(names))
  ) {
    return res.status(400).json({ error: "names must be an object" });
  }
  if (intro !== undefined && typeof intro !== "string") {
    return res.status(400).json({ error: "intro must be a string" });
  }
  if (
    year === undefined &&
    editionId === undefined &&
    !create &&
    teamIds === undefined &&
    blurbs === undefined &&
    names === undefined &&
    owners === undefined &&
    meta === undefined &&
    intro === undefined &&
    activeEditionId === undefined
  ) {
    return res.status(400).json({ error: "Nothing to save" });
  }

  try {
    const next = await writeRankings({
      year,
      editionId,
      type,
      create: Boolean(create),
      teamIds,
      blurbs,
      names,
      owners,
      meta,
      intro,
      label,
      week,
      activeEditionId
    });

    const y = year ?? next.currentYear;
    const bucket = getYearBucket(next, y);
    const editions = sortedEditionEntries(bucket.editions).map(([id, edition]) => ({
      id,
      ...edition
    }));

    res.json({
      currentYear: next.currentYear,
      year: y,
      live: bucket.live,
      activeEditionId: bucket.activeEditionId,
      editions,
      years: listYears(next)
    });
  } catch (error) {
    console.error("Failed to save rankings:", error);
    res.status(500).json({
      error: "Failed to save rankings",
      details: error.message
    });
  }
});

router.post("/admin/login", (req, res) => {
  const { password } = req.body || {};
  const token = login(password);

  if (!token) {
    return res.status(401).json({ error: "Invalid password" });
  }

  res.json({ token });
});

module.exports = router;
