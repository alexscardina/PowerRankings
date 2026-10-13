const express = require("express");
const router = express.Router();

const { getLeagueData } = require("./server/getLeagueData");
const { readRankings, writeRankings } = require("./server/rankingsStore");
const { login, isValidToken } = require("./server/adminAuth");
const { envValue } = require("./server/env");

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
      2026,
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

router.get("/rankings", async (req, res) => {
  try {
    res.json(await readRankings());
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

  const { week, teamIds, blurbs, names, intro, activeWeek } = req.body || {};
  if (
    week !== undefined &&
    (typeof week !== "number" || !Number.isFinite(week) || week < 0)
  ) {
    return res.status(400).json({ error: "week must be a non-negative number" });
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
    week === undefined &&
    teamIds === undefined &&
    blurbs === undefined &&
    names === undefined &&
    intro === undefined &&
    activeWeek === undefined
  ) {
    return res.status(400).json({ error: "Nothing to save" });
  }

  try {
    res.json(
      await writeRankings({ week, teamIds, blurbs, names, intro, activeWeek })
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to save rankings" });
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
