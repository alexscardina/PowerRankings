#!/usr/bin/env node
/**
 * Builds multi-year rankings seed from archival txt dumps + current 2026 data.
 */
const fs = require("fs");
const path = require("path");
const {
  EDITION_TYPES,
  slugify,
  editionIdFor,
  migrateLegacyYear,
  normalizeEdition
} = require("../server/editionUtils");

const ROOT = path.join(__dirname, "..");
const RANKINGS_PATH = path.join(ROOT, "data", "rankings.json");
const ARCHIVAL_YEARS = [2024, 2025];

const SECTION_RE =
  /^(Season Retrospective|Draft Recap|Mid-Season Report Cards?\s*[—\-–-]?\s*Week\s+\d+|Week \d+(?:\s*&\s*\d+)?(?:\s*-\s*.+)?|Weeks?\s+\d+\s*&\s*\d+)\s*$/im;

/**
 * Parse "12. Team Name (Owner)" headers.
 * Owner is the final parenthetical; an optional (W-L) record may follow.
 * Team names may themselves contain parentheses.
 */
function parseTeamHeader(line) {
  const trimmed = String(line || "").trim();
  const rankMatch = trimmed.match(/^(\d{1,2})\.\s+(.+)$/);
  if (!rankMatch) return null;

  let rest = rankMatch[2].trim();
  let deltaHint = "";

  const deltaMatch = rest.match(
    /^(.*\))\s+([+-]?\d+|0)(?:\s+from.+)?$/i
  );
  if (deltaMatch) {
    rest = deltaMatch[1].trim();
    deltaHint = deltaMatch[2];
  }

  let recordHint = "";
  const recordMatch = rest.match(/^(.*)\s+\((\d+-\d+)\)\s*$/);
  if (recordMatch) {
    rest = recordMatch[1].trim();
    recordHint = recordMatch[2];
  }

  const ownerMatch = rest.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  if (!ownerMatch || !ownerMatch[1].trim() || !ownerMatch[2].trim()) {
    return null;
  }

  return {
    rank: Number(rankMatch[1]),
    name: ownerMatch[1].trim(),
    owner: ownerMatch[2].trim(),
    recordHint,
    deltaHint
  };
}

function splitSections(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_RE.test(trimmed) && !trimmed.includes("Ranking:")) {
      if (current) sections.push(current);
      current = { title: trimmed, body: [] };
      continue;
    }
    if (!current) {
      // Preface before first section
      current = { title: "__preface__", body: [] };
    }
    current.body.push(line);
  }
  if (current) sections.push(current);
  return sections.filter((s) => s.title !== "__preface__");
}

function classifySection(title) {
  const t = title.trim();
  if (/^Season Retrospective$/i.test(t)) {
    return {
      type: EDITION_TYPES.retrospective,
      id: "retrospective",
      label: "Season Retrospective",
      week: null
    };
  }
  if (/^Draft Recap$/i.test(t)) {
    return {
      type: EDITION_TYPES.draft,
      id: "draft",
      label: "Draft Recap",
      week: null
    };
  }
  if (/Mid-Season/i.test(t)) {
    const week = Number((t.match(/Week\s+(\d+)/i) || [])[1]) || 7;
    return {
      type: EDITION_TYPES.midseason,
      id: editionIdFor(EDITION_TYPES.midseason, week),
      label: "Mid-Season Report Card",
      week
    };
  }
  if (/Playoff Predictor/i.test(t)) {
    const week = Number((t.match(/Week\s+(\d+)/i) || [])[1]) || 14;
    return {
      type: EDITION_TYPES.playoff,
      id: editionIdFor(EDITION_TYPES.playoff, week),
      label: "Playoff Predictor",
      week
    };
  }
  const bi = t.match(/^Weeks?\s+(\d+)\s*&\s*(\d+)/i);
  if (bi) {
    const a = Number(bi[1]);
    const b = Number(bi[2]);
    return {
      type: EDITION_TYPES.week,
      id: `week-${a}-${b}`,
      label: `Weeks ${a} & ${b}`,
      week: b
    };
  }
  const single = t.match(/^Week\s+(\d+)/i);
  if (single) {
    const week = Number(single[1]);
    return {
      type: EDITION_TYPES.week,
      id: `week-${week}`,
      label: `Week ${week}`,
      week
    };
  }
  return null;
}

function parseTeamBlocks(bodyText) {
  const lines = bodyText.split("\n");
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const header = parseTeamHeader(line);
    if (header) {
      if (current) blocks.push(current);
      current = {
        ...header,
        lines: []
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function takeField(lines, prefixes) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const prefix of prefixes) {
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        const value = trimmed.slice(prefix.length).replace(/^:\s*/, "").trim();
        lines.splice(i, 1);
        return value;
      }
    }
  }
  return null;
}

function extractMetaAndBlurb(block, type) {
  const lines = [...block.lines];
  const meta = {};

  if (block.recordHint) meta.record = block.recordHint;

  if (type === EDITION_TYPES.draft) {
    const strengths = takeField(lines, ["Strengths"]);
    const weaknesses = takeField(lines, ["Weaknesses"]);
    const bestPick = takeField(lines, ["Best Pick"]);
    const worstPick = takeField(lines, ["Worst Pick"]);
    if (strengths) meta.strengths = strengths;
    if (weaknesses) meta.weaknesses = weaknesses;
    if (bestPick) meta.bestPick = bestPick;
    if (worstPick) meta.worstPick = worstPick;
  } else if (type === EDITION_TYPES.midseason) {
    const h2h = takeField(lines, ["H2H  Record", "H2H Record"]);
    const med = takeField(lines, ["Med. Record", "Median Record"]);
    const points = takeField(lines, ["Points Scored"]);
    const best = takeField(lines, ["Best Pick"]);
    const worst = takeField(lines, ["Worst Pick"]);
    const grade = takeField(lines, ["Midterm grade"]);
    if (h2h) meta.h2hRecord = h2h;
    if (med) meta.medianRecord = med;
    if (points) meta.pointsScored = points;
    if (best) meta.bestPick = best;
    if (worst) meta.worstPick = worst;
    if (grade) meta.grade = grade;
  } else if (type === EDITION_TYPES.retrospective) {
    const record = takeField(lines, ["Record"]);
    const medianWins = takeField(lines, ["Median Wins"]);
    const playoff = takeField(lines, ["Playoff Performance"]);
    const draftRank = takeField(lines, ["Draft Recap Ranking"]);
    const midRank = takeField(lines, ["Mid-Season Ranking"]);
    const playoffPred = takeField(lines, ["Playoff Pred. Ranking"]);
    const best = takeField(lines, ["Best Player"]);
    const worst = takeField(lines, ["Worst Player"]);
    if (record) meta.record = record;
    if (medianWins) meta.medianWins = medianWins;
    if (playoff) meta.playoffPerformance = playoff;
    if (draftRank) meta.draftRecapRanking = draftRank;
    if (midRank) meta.midSeasonRanking = midRank;
    if (playoffPred) meta.playoffPredRanking = playoffPred;
    if (best) meta.bestPlayer = best;
    if (worst) meta.worstPlayer = worst;
  } else if (type === EDITION_TYPES.playoff) {
    const h2h = takeField(lines, ["H2H  Record", "H2H Record"]);
    const med = takeField(lines, ["Med. Record", "Median Record"]);
    const points = takeField(lines, ["Points Scored"]);
    const wings = takeField(lines, [
      "Chances of Wings",
      "Chances of wings"
    ]);
    const champ = takeField(lines, ["Championship Chances"]);
    if (h2h) meta.h2hRecord = h2h;
    if (med) meta.medianRecord = med;
    if (points) meta.pointsScored = points;
    if (wings) meta.chances = wings;
    if (champ) meta.chances = champ;
    // 2024-style biweekly lines inside playoff predictor
    const performanceLines = [];
    for (let i = 0; i < lines.length; ) {
      const trimmed = lines[i].trim();
      if (/^Week\s+\d+\s+(Performance|vs\.\s*Median):/i.test(trimmed)) {
        performanceLines.push(trimmed);
        lines.splice(i, 1);
        continue;
      }
      i += 1;
    }
    if (performanceLines.length) meta.performanceLines = performanceLines;
  } else {
    // regular / biweekly weeks
    const lastWeek = takeField(lines, ["Last Week"]);
    const median = takeField(lines, ["Median Performance"]);
    const best = takeField(lines, ["Best Player"]);
    const worst = takeField(lines, ["Worst Player"]);
    const playoffChances = takeField(lines, ["Playoff Chances"]);
    // 2025-style bi-week lines
    const w9h = takeField(lines, ["Week 9 H2H"]);
    const w9m = takeField(lines, ["Week 9 Median"]);
    const w10h = takeField(lines, ["Week 10 H2H"]);
    const w10m = takeField(lines, ["Week 10 Median"]);
    const w11h = takeField(lines, ["Week 11 H2H"]);
    const w11m = takeField(lines, ["Week 11 Median"]);
    const w12h = takeField(lines, ["Week 12 H2H"]);
    const w12m = takeField(lines, ["Week 12 Median"]);
    // 2024-style "Week NN Performance / vs. Median"
    const performanceLines = [];
    for (let i = 0; i < lines.length; ) {
      const trimmed = lines[i].trim();
      if (/^Week\s+\d+\s+(Performance|vs\.\s*Median|H2H|Median):/i.test(trimmed)) {
        performanceLines.push(trimmed);
        lines.splice(i, 1);
        continue;
      }
      i += 1;
    }
    if (lastWeek) meta.lastWeek = lastWeek;
    if (median) meta.medianPerformance = median;
    if (best) meta.bestPlayer = best;
    if (worst) meta.worstPlayer = worst;
    if (playoffChances) meta.playoffChances = playoffChances;
    if (w9h) meta.week9H2H = w9h;
    if (w9m) meta.week9Median = w9m;
    if (w10h) meta.week10H2H = w10h;
    if (w10m) meta.week10Median = w10m;
    if (w11h) meta.week11H2H = w11h;
    if (w11m) meta.week11Median = w11m;
    if (w12h) meta.week12H2H = w12h;
    if (w12m) meta.week12Median = w12m;
    if (performanceLines.length) meta.performanceLines = performanceLines;
  }

  const blurb = lines.join("\n").trim();
  return { meta, blurb };
}

function classifySectionWithBody(title, body) {
  let info = classifySection(title);
  if (!info) return null;

  // Bare "Week N" playoff predictor — toilet/playoff brackets (2024)
  // Require section headers, not blurb mentions of championship/wings chances
  if (
    info.type === EDITION_TYPES.week &&
    /^(Non-Playoff Teams|Toilet Bowl Teams)\s*$/m.test(body) &&
    /^Playoff Teams\s*$/m.test(body)
  ) {
    info = {
      type: EDITION_TYPES.playoff,
      id: editionIdFor(EDITION_TYPES.playoff, info.week || 14),
      label: "Playoff Predictor",
      week: info.week || 14
    };
  }
  return info;
}

function parseArchivalYear(text) {
  const sections = splitSections(text);
  const editions = {};
  const ownerIds = new Map();

  function idFor(owner, name) {
    const key = owner.toLowerCase();
    if (!ownerIds.has(key)) {
      ownerIds.set(key, slugify(`${owner}-${name}`) || slugify(owner));
    }
    return ownerIds.get(key);
  }

  const classified = [];
  for (const section of sections) {
    const body = section.body.join("\n");
    const info = classifySectionWithBody(section.title, body);
    if (!info) continue;

    const firstTeam = body.search(/^\d{1,2}\.\s+/m);
    const intro =
      firstTeam >= 0 ? body.slice(0, firstTeam).trim() : body.trim();
    const teamPart = firstTeam >= 0 ? body.slice(firstTeam) : "";
    const blocks = parseTeamBlocks(teamPart);

    const teamIds = [];
    const blurbs = {};
    const names = {};
    const owners = {};
    const meta = {};

    // Playoff brackets restart ranks (6→1 twice); keep file order.
    // Other editions are listed 12→1 — sort by rank to be safe.
    const ordered =
      info.type === EDITION_TYPES.playoff
        ? blocks
        : [...blocks].sort((a, b) => b.rank - a.rank);

    for (const block of ordered) {
      const id = idFor(block.owner, block.name);
      teamIds.push(id);
      names[id] = block.name;
      owners[id] = block.owner;
      const parsed = extractMetaAndBlurb(block, info.type);
      blurbs[id] = parsed.blurb;
      if (Object.keys(parsed.meta).length) meta[id] = parsed.meta;
    }

    classified.push({
      ...info,
      intro,
      teamIds,
      blurbs,
      names,
      owners,
      meta
    });
  }

  classified.sort((a, b) => {
    const wa =
      a.type === EDITION_TYPES.draft
        ? -1
        : a.type === EDITION_TYPES.retrospective
          ? 999
          : a.type === EDITION_TYPES.playoff
            ? 900 + (a.week || 0)
            : a.week || 0;
    const wb =
      b.type === EDITION_TYPES.draft
        ? -1
        : b.type === EDITION_TYPES.retrospective
          ? 999
          : b.type === EDITION_TYPES.playoff
            ? 900 + (b.week || 0)
            : b.week || 0;
    if (wa !== wb) return wa - wb;
    return String(a.id).localeCompare(String(b.id));
  });

  classified.forEach((edition, index) => {
    editions[edition.id] = normalizeEdition({
      type: edition.type,
      week: edition.week,
      order: index,
      label: edition.label,
      intro: edition.intro,
      teamIds: edition.teamIds,
      blurbs: edition.blurbs,
      names: edition.names,
      owners: edition.owners,
      meta: edition.meta
    });
  });

  const activeEditionId = classified.length
    ? classified[classified.length - 1].id
    : null;

  return {
    live: false,
    activeEditionId,
    editions
  };
}

function main() {
  const legacy = JSON.parse(fs.readFileSync(RANKINGS_PATH, "utf8"));

  let year2026;
  if (legacy.years?.["2026"]) {
    year2026 = legacy.years["2026"];
  } else {
    year2026 = migrateLegacyYear(legacy, 2026);
    year2026.live = true;
  }

  const years = {
    "2026": year2026
  };

  for (const year of ARCHIVAL_YEARS) {
    const txtPath = path.join(ROOT, "data", `${year}-ranks.txt`);
    if (!fs.existsSync(txtPath)) {
      console.warn("Skipping missing", txtPath);
      continue;
    }
    const parsed = parseArchivalYear(fs.readFileSync(txtPath, "utf8"));
    years[String(year)] = parsed;
    console.log(
      `${year} editions (${Object.keys(parsed.editions).length}):`,
      Object.keys(parsed.editions).join(", ")
    );
  }

  const seed = {
    currentYear: 2026,
    years
  };

  fs.writeFileSync(RANKINGS_PATH, JSON.stringify(seed, null, 2) + "\n");
  console.log(
    "Wrote seed years:",
    Object.keys(years)
      .sort()
      .join(", ")
  );
}

main();
