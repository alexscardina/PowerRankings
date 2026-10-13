const express = require("express");
const router = express.Router();

const { getLeagueData } = require("./server/getLeagueData");
const { readRankings, writeRankings } = require("./server/rankingsStore");
const { login, isValidToken } = require("./server/adminAuth");

router.get("/league", async (req, res) => {
  try {
    const data = await getLeagueData(2026, [
      "mTeam",
      "mRoster",
      "mMatchupScore"
    ]);
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

  const { teamIds } = req.body || {};
  if (!Array.isArray(teamIds)) {
    return res.status(400).json({ error: "teamIds must be an array" });
  }

  try {
    res.json(writeRankings(teamIds));
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
