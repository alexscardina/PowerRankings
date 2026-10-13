const fs = require("fs");
const path = require("path");

const RANKINGS_PATH = path.join(__dirname, "..", "data", "rankings.json");

function ensureFile() {
  const dir = path.dirname(RANKINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(RANKINGS_PATH)) {
    fs.writeFileSync(
      RANKINGS_PATH,
      JSON.stringify({ teamIds: [] }, null, 2)
    );
  }
}

function readRankings() {
  ensureFile();
  const raw = fs.readFileSync(RANKINGS_PATH, "utf8");
  const data = JSON.parse(raw);
  return {
    teamIds: Array.isArray(data.teamIds) ? data.teamIds : []
  };
}

function writeRankings(teamIds) {
  ensureFile();
  if (!Array.isArray(teamIds)) {
    throw new Error("teamIds must be an array");
  }
  fs.writeFileSync(
    RANKINGS_PATH,
    JSON.stringify({ teamIds }, null, 2)
  );
  return { teamIds };
}

module.exports = {
  readRankings,
  writeRankings
};
