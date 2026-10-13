const express = require("express");
const router = express.Router();

const { getLeagueData } = require("./server/getLeagueData");
const { readRankings, writeRankings } = require("./server/rankingsStore");
const { login, isValidToken } = require("./server/adminAuth");

router.get("/league", async (req, res) => {
  try {
    const scoringPeriodId = req.query.scoringPeriodId
      ? Number(req.query.scoringPeriodId)
      : undefined;

    const data = await getLeagueData(
      2026,
      ["mTeam", "mRoster", "mMatchupScore"],
      Number.isFinite(scoringPeriodId) ? scoringPeriodId : undefined
    );
    res.json(data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to retrieve ESPN league"
    });
  }
});

router.get("/rankings", (req, res) => {
  try {
    res.json(readRankings());
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to read rankings" });
  }
});

router.put("/rankings", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!isValidToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { week, teamIds, blurbs, names, activeWeek } = req.body || {};
  if (week !== undefined && (typeof week !== "number" || week < 1)) {
    return res.status(400).json({ error: "week must be a positive number" });
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
  if (
    week === undefined &&
    teamIds === undefined &&
    blurbs === undefined &&
    names === undefined &&
    activeWeek === undefined
  ) {
    return res.status(400).json({ error: "Nothing to save" });
  }

  try {
    res.json(writeRankings({ week, teamIds, blurbs, names, activeWeek }));
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
