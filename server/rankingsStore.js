const fs = require("fs");
const path = require("path");

const RANKINGS_PATH = path.join(__dirname, "..", "data", "rankings.json");

function emptyWeek() {
  return { teamIds: [], blurbs: {}, names: {} };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function ensureFile() {
  const dir = path.dirname(RANKINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(RANKINGS_PATH)) {
    fs.writeFileSync(
      RANKINGS_PATH,
      JSON.stringify({ activeWeek: null, weeks: {} }, null, 2)
    );
  }
}

function normalize(data) {
  if (data && data.weeks && typeof data.weeks === "object") {
    const weeks = {};
    for (const [key, value] of Object.entries(data.weeks)) {
      weeks[String(key)] = {
        teamIds: Array.isArray(value?.teamIds) ? value.teamIds : [],
        blurbs: asObject(value?.blurbs),
        names: asObject(value?.names)
      };
    }
    const weekNums = Object.keys(weeks)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    return {
      activeWeek:
        data.activeWeek == null
          ? weekNums.length
            ? Math.max(...weekNums)
            : null
          : Number(data.activeWeek),
      weeks
    };
  }

  return {
    activeWeek: null,
    weeks: {},
    legacy: {
      teamIds: Array.isArray(data?.teamIds) ? data.teamIds : [],
      blurbs: asObject(data?.blurbs),
      names: asObject(data?.names)
    }
  };
}

function readRankings() {
  ensureFile();
  const raw = fs.readFileSync(RANKINGS_PATH, "utf8");
  return normalize(JSON.parse(raw));
}

function writeRankings({ week, teamIds, blurbs, names, activeWeek } = {}) {
  ensureFile();
  const current = readRankings();
  const weeks = { ...current.weeks };

  if (
    current.legacy &&
    (current.legacy.teamIds.length ||
      Object.keys(current.legacy.blurbs).length ||
      Object.keys(current.legacy.names).length)
  ) {
    const legacyWeek = String(week ?? activeWeek ?? 1);
    if (!weeks[legacyWeek]) {
      weeks[legacyWeek] = {
        teamIds: current.legacy.teamIds,
        blurbs: current.legacy.blurbs,
        names: current.legacy.names
      };
    }
  }

  if (
    week == null &&
    activeWeek == null &&
    teamIds === undefined &&
    blurbs === undefined &&
    names === undefined
  ) {
    throw new Error("Nothing to save");
  }

  const targetWeek = String(week ?? activeWeek ?? current.activeWeek ?? 1);
  const existing = weeks[targetWeek] || emptyWeek();
  weeks[targetWeek] = {
    teamIds: Array.isArray(teamIds) ? teamIds : existing.teamIds,
    blurbs: blurbs !== undefined ? asObject(blurbs) : existing.blurbs,
    names: names !== undefined ? asObject(names) : existing.names
  };

  const next = {
    activeWeek:
      activeWeek != null
        ? Number(activeWeek)
        : current.activeWeek != null
          ? current.activeWeek
          : Number(targetWeek),
    weeks
  };

  fs.writeFileSync(RANKINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  readRankings,
  writeRankings
};
