const fs = require("fs");
const path = require("path");
const {
  EDITION_TYPES,
  asObject,
  emptyEdition,
  editionIdFor,
  defaultLabel,
  normalizeEdition,
  sortedEditionEntries,
  nextWeekNumber,
  nextOrder,
  migrateLegacyYear
} = require("./editionUtils");

const RANKINGS_PATH = path.join(__dirname, "..", "data", "rankings.json");
const BLOB_KEY = "rankings.json";
const SEED_RANKINGS = require("../data/rankings.json");

function isServerlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.NETLIFY_BLOBS_CONTEXT
  );
}

function normalizeYear(yearKey, value) {
  const yearNum = Number(yearKey);
  const editions = {};
  for (const [id, edition] of Object.entries(asObject(value?.editions))) {
    editions[id] = normalizeEdition(edition, id);
  }

  let activeEditionId =
    typeof value?.activeEditionId === "string" ? value.activeEditionId : null;
  if (activeEditionId && !editions[activeEditionId]) {
    activeEditionId = null;
  }
  if (!activeEditionId) {
    const sorted = sortedEditionEntries(editions);
    activeEditionId = sorted.length ? sorted[sorted.length - 1][0] : null;
  }

  return {
    live: value?.live != null ? Boolean(value.live) : yearNum >= 2026,
    activeEditionId,
    editions
  };
}

function normalize(data) {
  // Already multi-year
  if (data && data.years && typeof data.years === "object") {
    const years = {};
    for (const [key, value] of Object.entries(data.years)) {
      years[String(key)] = normalizeYear(key, value);
    }
    const yearNums = Object.keys(years)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    return {
      currentYear:
        data.currentYear != null
          ? Number(data.currentYear)
          : yearNums.length
            ? Math.max(...yearNums)
            : 2026,
      years
    };
  }

  // Legacy single-year { activeWeek, weeks }
  if (data && data.weeks && typeof data.weeks === "object") {
    return {
      currentYear: 2026,
      years: {
        "2026": migrateLegacyYear(data, 2026)
      }
    };
  }

  return {
    currentYear: 2026,
    years: {}
  };
}

/**
 * Merge one edition: stored Netlify/local content wins; seed fills gaps
 * (so admin blurbs on Blobs are never overwritten by the repo seed).
 */
function mergeEdition(storedEdition, seedEdition) {
  if (!storedEdition) return seedEdition;
  if (!seedEdition) return storedEdition;

  return normalizeEdition(
    {
      type: storedEdition.type || seedEdition.type,
      week:
        storedEdition.week != null ? storedEdition.week : seedEdition.week,
      order:
        storedEdition.order != null ? storedEdition.order : seedEdition.order,
      label: storedEdition.label || seedEdition.label,
      teamIds: storedEdition.teamIds?.length
        ? storedEdition.teamIds
        : seedEdition.teamIds,
      blurbs: { ...asObject(seedEdition.blurbs), ...asObject(storedEdition.blurbs) },
      names: { ...asObject(seedEdition.names), ...asObject(storedEdition.names) },
      owners: {
        ...asObject(seedEdition.owners),
        ...asObject(storedEdition.owners)
      },
      meta: { ...asObject(seedEdition.meta), ...asObject(storedEdition.meta) },
      intro:
        typeof storedEdition.intro === "string" && storedEdition.intro.trim()
          ? storedEdition.intro
          : seedEdition.intro || ""
    },
    storedEdition.id
  );
}

function mergeMissingSeed(stored) {
  const seed = normalize(SEED_RANKINGS);
  const years = { ...stored.years };

  for (const [yearKey, seedYear] of Object.entries(seed.years)) {
    if (!years[yearKey]) {
      years[yearKey] = seedYear;
      continue;
    }

    const storedYear = years[yearKey];
    const editions = { ...storedYear.editions };

    for (const [editionId, seedEdition] of Object.entries(seedYear.editions)) {
      editions[editionId] = mergeEdition(editions[editionId], seedEdition);
    }

    // Prefer an explicit stored active edition; otherwise keep seed's
    const activeEditionId =
      storedYear.activeEditionId && editions[storedYear.activeEditionId]
        ? storedYear.activeEditionId
        : seedYear.activeEditionId && editions[seedYear.activeEditionId]
          ? seedYear.activeEditionId
          : storedYear.activeEditionId;

    years[yearKey] = {
      live:
        storedYear.live != null
          ? Boolean(storedYear.live)
          : Boolean(seedYear.live),
      activeEditionId,
      editions
    };
  }

  const currentYear = stored.currentYear || seed.currentYear;
  // Current season must stay live for ESPN fetches
  if (years[String(currentYear)]) {
    years[String(currentYear)] = {
      ...years[String(currentYear)],
      live: true
    };
  }

  return {
    currentYear,
    years
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
  if (isServerlessRuntime()) {
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
  if (isServerlessRuntime()) {
    try {
      const store = await getBlobStore();
      const data = await store.get(BLOB_KEY, { type: "json" });
      if (data) {
        return mergeMissingSeed(normalize(data));
      }
    } catch (error) {
      console.error("Blob read failed, using seed rankings:", error.message);
    }

    return normalize(SEED_RANKINGS);
  }

  return mergeMissingSeed(readRankingsFromFile());
}

function listYears(data) {
  return Object.keys(data.years || {})
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      live: Boolean(data.years[String(year)]?.live),
      label: String(year)
    }));
}

function getYearBucket(data, year) {
  const key = String(year ?? data.currentYear);
  return data.years[key] || null;
}

function buildNextRankings(current, payload = {}) {
  const year = Number(payload.year ?? current.currentYear);
  const yearKey = String(year);
  const years = { ...current.years };
  const bucket = {
    live: years[yearKey]?.live ?? year >= 2026,
    activeEditionId: years[yearKey]?.activeEditionId ?? null,
    editions: { ...(years[yearKey]?.editions || {}) }
  };

  const {
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
  } = payload;

  if (
    !create &&
    editionId == null &&
    activeEditionId === undefined &&
    teamIds === undefined &&
    blurbs === undefined &&
    names === undefined &&
    owners === undefined &&
    meta === undefined &&
    intro === undefined
  ) {
    throw new Error("Nothing to save");
  }

  let targetId = editionId;

  if (create) {
    const editionType = EDITION_TYPES[type] || EDITION_TYPES.week;
    let editionWeek = week != null ? Number(week) : null;
    if (editionType === EDITION_TYPES.week && editionWeek == null) {
      editionWeek = nextWeekNumber(bucket.editions);
    }
    if (editionType === EDITION_TYPES.midseason && editionWeek == null) {
      editionWeek = 7;
    }
    if (editionType === EDITION_TYPES.playoff && editionWeek == null) {
      editionWeek = 14;
    }

    targetId = editionIdFor(editionType, editionWeek);
    if (bucket.editions[targetId] && !payload.force) {
      throw new Error(`Edition ${targetId} already exists`);
    }

    const prevId = bucket.activeEditionId;
    const prev = bucket.editions[prevId] || emptyEdition(EDITION_TYPES.week);
    bucket.editions[targetId] = normalizeEdition({
      type: editionType,
      week: editionWeek,
      order: nextOrder(bucket.editions),
      label: defaultLabel(editionType, editionWeek, label),
      teamIds: Array.isArray(teamIds)
        ? teamIds
        : prev.teamIds?.length
          ? prev.teamIds
          : [],
      blurbs: blurbs !== undefined ? asObject(blurbs) : {},
      names: names !== undefined ? asObject(names) : asObject(prev.names),
      owners: owners !== undefined ? asObject(owners) : asObject(prev.owners),
      meta: meta !== undefined ? meta : {},
      intro: intro !== undefined ? intro : ""
    });
  } else if (targetId) {
    const existing = bucket.editions[targetId] || emptyEdition(EDITION_TYPES.week);
    bucket.editions[targetId] = normalizeEdition({
      ...existing,
      type: type ? EDITION_TYPES[type] || existing.type : existing.type,
      week: week !== undefined ? week : existing.week,
      label: label || existing.label,
      teamIds: Array.isArray(teamIds) ? teamIds : existing.teamIds,
      blurbs: blurbs !== undefined ? asObject(blurbs) : existing.blurbs,
      names: names !== undefined ? asObject(names) : existing.names,
      owners: owners !== undefined ? asObject(owners) : existing.owners,
      meta: meta !== undefined ? meta : existing.meta,
      intro: intro !== undefined ? intro : existing.intro,
      order: existing.order
    });
  }

  if (activeEditionId !== undefined) {
    if (activeEditionId != null && !bucket.editions[String(activeEditionId)]) {
      throw new Error(`Cannot activate missing edition ${activeEditionId}`);
    }
    bucket.activeEditionId =
      activeEditionId == null ? bucket.activeEditionId : String(activeEditionId);
  }

  years[yearKey] = bucket;

  return {
    currentYear: current.currentYear,
    years
  };
}

async function writeRankings(payload = {}) {
  const current = await readRankings();
  const next = buildNextRankings(current, payload);

  if (isServerlessRuntime()) {
    try {
      const store = await getBlobStore();
      await store.setJSON(BLOB_KEY, next);
      return next;
    } catch (error) {
      throw new Error(
        `Netlify Blobs write failed: ${error.message}. ` +
          "Ensure Blobs is enabled for this site and the function can access it."
      );
    }
  }

  return writeRankingsToFile(next);
}

module.exports = {
  readRankings,
  writeRankings,
  listYears,
  getYearBucket,
  normalize
};
