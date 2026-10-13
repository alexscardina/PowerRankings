const fs = require("fs");
const path = require("path");

const RANKINGS_PATH = path.join(__dirname, "..", "data", "rankings.json");
const BLOB_KEY = "rankings.json";

// Static require so Netlify/esbuild always bundles the seed data
const SEED_RANKINGS = require("../data/rankings.json");

function emptyWeek() {
  return { teamIds: [], blurbs: {}, names: {} };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isNetlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV);
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

function readRankingsFromFile() {
  try {
    if (fs.existsSync(RANKINGS_PATH)) {
      const raw = fs.readFileSync(RANKINGS_PATH, "utf8");
      return normalize(JSON.parse(raw));
    }
  } catch (error) {
    console.error("Rankings file read failed:", error.message);
  }

  return normalize(SEED_RANKINGS);
}

function writeRankingsToFile(next) {
  if (isNetlifyRuntime()) {
    throw new Error("Filesystem writes are not available on Netlify");
  }

  const dir = path.dirname(RANKINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(RANKINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function getBlobStore() {
  const { getStore } = require("@netlify/blobs");
  return getStore("rankings");
}

async function readRankings() {
  if (isNetlifyRuntime()) {
    try {
      const store = await getBlobStore();
      const data = await store.get(BLOB_KEY, { type: "json" });
      if (data) {
        return normalize(data);
      }
    } catch (error) {
      console.error("Blob read failed, using seed rankings:", error.message);
    }

    return normalize(SEED_RANKINGS);
  }

  return readRankingsFromFile();
}

function buildNextRankings(current, { week, teamIds, blurbs, names, activeWeek }) {
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

  return {
    activeWeek:
      activeWeek != null
        ? Number(activeWeek)
        : current.activeWeek != null
          ? current.activeWeek
          : Number(targetWeek),
    weeks
  };
}

async function writeRankings(payload = {}) {
  const current = await readRankings();
  const next = buildNextRankings(current, payload);

  if (isNetlifyRuntime()) {
    const store = await getBlobStore();
    await store.setJSON(BLOB_KEY, next);
    return next;
  }

  return writeRankingsToFile(next);
}

module.exports = {
  readRankings,
  writeRankings
};
