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

function normalizeDraftNotes(value) {
  const draft = asObject(value);
  const next = {};
  for (const [teamId, notes] of Object.entries(draft)) {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) continue;
    const entry = {};
    for (const key of ["strengths", "weaknesses", "bestPick", "worstPick"]) {
      if (typeof notes[key] === "string" && notes[key].trim()) {
        entry[key] = notes[key].trim();
      }
    }
    if (Object.keys(entry).length) {
      next[String(teamId)] = entry;
    }
  }
  return next;
}

function normalizeWeek(value) {
  const week = {
    teamIds: Array.isArray(value?.teamIds) ? value.teamIds : [],
    blurbs: asObject(value?.blurbs),
    names: asObject(value?.names)
  };
  if (typeof value?.intro === "string" && value.intro.trim()) {
    week.intro = value.intro.trim();
  }
  const draft = normalizeDraftNotes(value?.draft);
  if (Object.keys(draft).length) {
    week.draft = draft;
  }
  return week;
}

function isNetlifyRuntime() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV);
}

function normalize(data) {
  if (data && data.weeks && typeof data.weeks === "object") {
    const weeks = {};
    for (const [key, value] of Object.entries(data.weeks)) {
      weeks[String(key)] = normalizeWeek(value);
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
  return getStore({ name: "rankings", consistency: "strong" });
}

function mergeMissingSeedWeeks(stored) {
  const seed = normalize(SEED_RANKINGS);
  const weeks = { ...stored.weeks };
  for (const [key, value] of Object.entries(seed.weeks)) {
    if (!weeks[key]) {
      weeks[key] = value;
    }
  }
  return {
    ...stored,
    weeks
  };
}

async function readRankings() {
  if (isNetlifyRuntime()) {
    try {
      const store = await getBlobStore();
      const data = await store.get(BLOB_KEY, { type: "json" });
      if (data) {
        return mergeMissingSeedWeeks(normalize(data));
      }
    } catch (error) {
      console.error("Blob read failed, using seed rankings:", error.message);
    }

    return normalize(SEED_RANKINGS);
  }

  return mergeMissingSeedWeeks(readRankingsFromFile());
}

function buildNextRankings(
  current,
  { week, teamIds, blurbs, names, intro, activeWeek }
) {
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
    names === undefined &&
    intro === undefined
  ) {
    throw new Error("Nothing to save");
  }

  const targetWeek = String(week ?? activeWeek ?? current.activeWeek ?? 1);
  const existing = weeks[targetWeek] || emptyWeek();
  weeks[targetWeek] = normalizeWeek({
    teamIds: Array.isArray(teamIds) ? teamIds : existing.teamIds,
    blurbs: blurbs !== undefined ? asObject(blurbs) : existing.blurbs,
    names: names !== undefined ? asObject(names) : existing.names,
    intro: intro !== undefined ? intro : existing.intro,
    draft: existing.draft
  });

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
