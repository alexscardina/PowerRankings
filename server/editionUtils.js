const EDITION_TYPES = {
  week: "week",
  draft: "draft",
  midseason: "midseason",
  playoff: "playoff",
  retrospective: "retrospective"
};

const TYPE_LABELS = {
  week: "Week",
  draft: "Draft Recap",
  midseason: "Mid-Season Report Card",
  playoff: "Playoff Predictor",
  retrospective: "Season Retrospective"
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function editionIdFor(type, week) {
  if (type === EDITION_TYPES.draft) return "draft";
  if (type === EDITION_TYPES.retrospective) return "retrospective";
  if (type === EDITION_TYPES.midseason) {
    return week != null ? `midseason-${week}` : "midseason";
  }
  if (type === EDITION_TYPES.playoff) {
    return week != null ? `playoff-${week}` : "playoff";
  }
  return `week-${week}`;
}

function defaultLabel(type, week, customLabel) {
  if (customLabel) return customLabel;
  if (type === EDITION_TYPES.week) return `Week ${week}`;
  return TYPE_LABELS[type] || type;
}

function emptyEdition(type, { week, order, label } = {}) {
  return {
    type,
    week: week != null ? Number(week) : null,
    order: order != null ? Number(order) : 0,
    label: defaultLabel(type, week, label),
    teamIds: [],
    blurbs: {},
    names: {},
    owners: {},
    meta: {},
    intro: ""
  };
}

function normalizeMeta(value) {
  const meta = asObject(value);
  const next = {};
  for (const [teamId, entry] of Object.entries(meta)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const cleaned = {};
    for (const [key, val] of Object.entries(entry)) {
      if (typeof val === "string" && val.trim()) cleaned[key] = val.trim();
      else if (typeof val === "number" || typeof val === "boolean") {
        cleaned[key] = val;
      } else if (Array.isArray(val)) {
        const lines = val
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim());
        if (lines.length) cleaned[key] = lines;
      }
    }
    if (Object.keys(cleaned).length) next[String(teamId)] = cleaned;
  }
  return next;
}

function normalizeEdition(value, fallbackId) {
  const type = EDITION_TYPES[value?.type] || EDITION_TYPES.week;
  const week =
    value?.week == null || value.week === ""
      ? type === EDITION_TYPES.week
        ? Number(String(fallbackId || "").replace(/\D/g, "")) || null
        : null
      : Number(value.week);

  const edition = {
    type,
    week: Number.isFinite(week) ? week : null,
    order: Number.isFinite(Number(value?.order)) ? Number(value.order) : 0,
    label: defaultLabel(type, week, value?.label),
    teamIds: Array.isArray(value?.teamIds) ? value.teamIds : [],
    blurbs: asObject(value?.blurbs),
    names: asObject(value?.names),
    owners: asObject(value?.owners),
    meta: normalizeMeta(value?.meta || value?.draft)
  };

  if (typeof value?.intro === "string" && value.intro.trim()) {
    edition.intro = value.intro;
  } else {
    edition.intro = "";
  }

  return edition;
}

function sortedEditionEntries(editions) {
  return Object.entries(editions || {}).sort(([, a], [, b]) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

function nextWeekNumber(editions) {
  let max = 0;
  for (const edition of Object.values(editions || {})) {
    if (edition.type === EDITION_TYPES.week && Number.isFinite(edition.week)) {
      max = Math.max(max, edition.week);
    }
  }
  return max + 1;
}

function nextOrder(editions) {
  let max = -1;
  for (const edition of Object.values(editions || {})) {
    if (Number.isFinite(edition.order)) max = Math.max(max, edition.order);
  }
  return max + 1;
}

/** Migrate legacy { activeWeek, weeks: { "0"|"1"|... } } into a year bucket. */
function migrateLegacyYear(legacy, year = 2026) {
  const weeks = asObject(legacy?.weeks);
  const editions = {};

  for (const [key, value] of Object.entries(weeks)) {
    const num = Number(key);
    let type = EDITION_TYPES.week;
    let week = num;
    let id = `week-${num}`;
    let order = num;
    let label = `Week ${num}`;

    if (num === 0 || key === "draft") {
      type = EDITION_TYPES.draft;
      week = null;
      id = "draft";
      order = 0;
      label = "Draft Recap";
    }

    const edition = normalizeEdition(
      {
        ...value,
        type,
        week,
        order,
        label,
        meta: value?.draft || value?.meta
      },
      id
    );
    editions[id] = edition;
  }

  const activeWeek = legacy?.activeWeek;
  let activeEditionId = null;
  if (activeWeek === 0) activeEditionId = "draft";
  else if (activeWeek != null) activeEditionId = `week-${activeWeek}`;
  else {
    const sorted = sortedEditionEntries(editions);
    activeEditionId = sorted.length ? sorted[sorted.length - 1][0] : null;
  }

  return {
    live: Number(year) >= 2026,
    activeEditionId,
    editions
  };
}

module.exports = {
  EDITION_TYPES,
  TYPE_LABELS,
  asObject,
  slugify,
  editionIdFor,
  defaultLabel,
  emptyEdition,
  normalizeEdition,
  normalizeMeta,
  sortedEditionEntries,
  nextWeekNumber,
  nextOrder,
  migrateLegacyYear
};
