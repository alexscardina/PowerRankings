import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EDITION_TYPES } from './editionUtils';
import useDraftField from './useDraftField';

function RankChange({ rankChange }) {
  if (rankChange == null) {
    return (
      <span className="team-rank-card__change is-same" title="No prior week">
        <span aria-hidden="true">—</span>
      </span>
    );
  }

  if (rankChange === 0) {
    return (
      <span className="team-rank-card__change is-same" title="No change">
        <span aria-hidden="true">—</span>
        <span>0</span>
      </span>
    );
  }

  if (rankChange > 0) {
    return (
      <span
        className="team-rank-card__change is-up"
        title={`Up ${rankChange} toward #1`}
      >
        <span aria-hidden="true">▲</span>
        <span>{rankChange}</span>
      </span>
    );
  }

  return (
    <span
      className="team-rank-card__change is-down"
      title={`Down ${Math.abs(rankChange)} toward #12`}
    >
      <span aria-hidden="true">▼</span>
      <span>{Math.abs(rankChange)}</span>
    </span>
  );
}

function MetaLine({ label, value, tone }) {
  if (!value) return null;
  return (
    <p className="team-rank-card__matchup-line">
      {label ? (
        <>
          <span className={`draft-label${tone ? ` is-${tone}` : ''}`}>
            {label}
          </span>{' '}
        </>
      ) : null}
      {value}
    </p>
  );
}

/** Parse optional "Label: W|L rest" archival result lines. */
function parseLeadingResult(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*?:\s*)?(W|L)\b\s*(.*)$/i);
  if (!match) {
    return { prefix: '', result: null, rest: trimmed };
  }
  return {
    prefix: match[1] || '',
    result: match[2].toUpperCase(),
    rest: (match[3] || '').trim()
  };
}

function placeFlags(text) {
  const sample = String(text || '');
  return {
    isTop: /\b1st\b/i.test(sample) || /🏆/.test(sample),
    isBottom: /\b12th\b/i.test(sample) || /💩/.test(sample)
  };
}

function medianClassName(result, rest) {
  const { isTop, isBottom } = placeFlags(`${result || ''} ${rest || ''}`);
  return [
    'team-rank-card__median',
    result === 'W' ? 'is-up' : '',
    result === 'L' ? 'is-down' : '',
    isTop ? 'is-trophy' : '',
    isBottom ? 'is-poop' : ''
  ]
    .filter(Boolean)
    .join(' ');
}

function looksLikeMedianLine(prefix, rest, forceMedian) {
  if (forceMedian) return true;
  if (/median/i.test(prefix)) return true;
  return /^\d+(st|nd|rd|th)\b/i.test(String(rest || ''));
}

/**
 * Archival H2H / median / performance lines with 2026 W/L colors
 * and top/bottom scorer nameplates.
 */
function ResultLine({ label, value, forceMedian = false }) {
  if (!value) return null;
  const parsed = parseLeadingResult(value);
  if (!parsed) return null;

  const { prefix, result, rest } = parsed;
  const leftLabel = [label, prefix].filter(Boolean).join(' ');

  if (!result) {
    const { isTop, isBottom } = placeFlags(value);
    if (isTop || isBottom) {
      return (
        <p
          className={[
            'team-rank-card__median',
            isTop ? 'is-trophy' : '',
            isBottom ? 'is-poop' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {label ? `${label} ` : ''}
          {value}
        </p>
      );
    }
    return <MetaLine label={label} value={value} />;
  }

  if (looksLikeMedianLine(leftLabel, rest, forceMedian)) {
    return (
      <p className={medianClassName(result, rest)}>
        {leftLabel ? `${leftLabel} ` : ''}
        {result}
        {rest ? ` ${rest}` : ''}
      </p>
    );
  }

  return (
    <p className="team-rank-card__matchup-line">
      {leftLabel ? `${leftLabel} ` : ''}
      <span
        className={
          result === 'W'
            ? 'matchup-result is-win'
            : 'matchup-result is-loss'
        }
      >
        {result}
      </span>
      {rest ? ` ${rest}` : ''}
    </p>
  );
}

function MetaDraftInput({
  label,
  saved,
  draftKey,
  placeholder,
  multiline = false,
  rows = 2,
  align = 'left',
  tone,
  onChange
}) {
  const [value, setValue] = useDraftField(saved || '', `${draftKey}:${label}`);

  function handleChange(next) {
    setValue(next);
    onChange(next);
  }

  return (
    <label className="team-rank-card__meta-field">
      {label ? (
        <span
          className={`team-rank-card__player-label${tone ? ` is-${tone}` : ''}`}
        >
          {label}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          className="team-rank-card__grade-note-input"
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
        />
      ) : (
        <input
          className={`team-rank-card__pick-input${
            align === 'right' ? '' : ' is-left'
          }`}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </label>
  );
}

function DraftMiddle({ meta, badge, isAdmin, onMetaChange, draftKey }) {
  function patchMeta(patch) {
    onMetaChange?.(patch);
  }

  return (
    <div className="team-rank-card__middle">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">{badge || 'Draft Recap'}</span>
        {isAdmin ? (
          <>
            <MetaDraftInput
              label="Strengths"
              saved={meta?.strengths}
              draftKey={draftKey}
              placeholder="What this team got right…"
              multiline
              tone="strength"
              onChange={(value) => patchMeta({ strengths: value })}
            />
            <MetaDraftInput
              label="Weaknesses"
              saved={meta?.weaknesses}
              draftKey={draftKey}
              placeholder="Where this team is thin…"
              multiline
              tone="weakness"
              onChange={(value) => patchMeta({ weaknesses: value })}
            />
          </>
        ) : (
          <>
            <MetaLine label="Strengths:" value={meta?.strengths} tone="strength" />
            <MetaLine label="Weaknesses:" value={meta?.weaknesses} tone="weakness" />
          </>
        )}
      </div>
      <div className="team-rank-card__player team-rank-card__draft-picks">
        <div>
          {isAdmin ? (
            <>
              <MetaDraftInput
                label="Best pick"
                saved={meta?.bestPick}
                draftKey={draftKey}
                placeholder="Best draft pick"
                align="right"
                onChange={(value) => patchMeta({ bestPick: value })}
              />
              <MetaDraftInput
                label="Worst pick"
                saved={meta?.worstPick}
                draftKey={draftKey}
                placeholder="Worst draft pick"
                align="right"
                onChange={(value) => patchMeta({ worstPick: value })}
              />
            </>
          ) : (
            <>
              <span className="team-rank-card__player-label">Best pick</span>
              <span className="team-rank-card__player-name">
                {meta?.bestPick || '—'}
              </span>
              <span className="team-rank-card__player-label">Worst pick</span>
              <span className="team-rank-card__player-name">
                {meta?.worstPick || '—'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function parseLetterGrade(grade) {
  const match = String(grade || '')
    .trim()
    .match(/^([A-F])([+-])?/i);
  if (!match) return null;
  return {
    letter: match[1].toUpperCase(),
    modifier: match[2] || '',
    display: `${match[1].toUpperCase()}${match[2] || ''}`
  };
}

function gradeExplanation(meta) {
  if (meta?.gradeNote) return meta.gradeNote;
  if (!meta?.grade) return '';
  return String(meta.grade).replace(/^[A-F][+-]?\s*[-–—:]?\s*/i, '').trim();
}

const GRADE_OPTIONS = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F'
];

function MidseasonMiddle({ meta, stats, isAdmin, onMetaChange, draftKey }) {
  const h2hRecord = stats?.h2hRecord || meta?.h2hRecord;
  const medianRecord = stats?.medianRecord || meta?.medianRecord;
  const pointsScored = stats?.pointsScored || meta?.pointsScored;
  const savedLetter = parseLetterGrade(meta?.grade)?.display || '';
  const savedNote = gradeExplanation(meta);
  const [letter, setLetter] = useDraftField(savedLetter, draftKey);
  const [note, setNote] = useDraftField(savedNote, draftKey);
  const [bestPick, setBestPick] = useDraftField(meta?.bestPick || '', draftKey);
  const [worstPick, setWorstPick] = useDraftField(
    meta?.worstPick || '',
    draftKey
  );
  const parsedGrade = parseLetterGrade(letter);

  function patchMeta(patch) {
    onMetaChange?.(patch);
  }

  return (
    <div className="team-rank-card__middle is-midseason">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">Mid-Season</span>
        <MetaLine label="H2H:" value={h2hRecord} />
        <MetaLine label="Median:" value={medianRecord} />
        <ResultLine label="Points:" value={pointsScored} />
        {isAdmin ? (
          <div
            className={`team-rank-card__grade-edit${
              parsedGrade ? ` is-${parsedGrade.letter.toLowerCase()}` : ''
            }`}
          >
            <label className="team-rank-card__grade-letter-field">
              <span className="team-rank-card__player-label">Grade</span>
              <select
                className="team-rank-card__grade-select"
                value={letter}
                onChange={(e) => {
                  setLetter(e.target.value);
                  patchMeta({ grade: e.target.value });
                }}
                aria-label="Midterm grade"
              >
                <option value="">—</option>
                {GRADE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="team-rank-card__grade-note-field">
              <span className="team-rank-card__player-label">
                Grade explanation
              </span>
              <textarea
                className="team-rank-card__grade-note-input"
                value={note}
                placeholder="See me after class…"
                rows={2}
                onChange={(e) => {
                  setNote(e.target.value);
                  patchMeta({ gradeNote: e.target.value });
                }}
              />
            </label>
          </div>
        ) : parsedGrade ? (
          <div
            className={`team-rank-card__grade is-${parsedGrade.letter.toLowerCase()}`}
          >
            <span className="team-rank-card__grade-letter">
              {parsedGrade.display}
            </span>
            {note ? (
              <span className="team-rank-card__grade-note">{note}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="team-rank-card__player team-rank-card__draft-picks">
        <div>
          <span className="team-rank-card__player-label">Best pick</span>
          {isAdmin ? (
            <input
              className="team-rank-card__pick-input"
              type="text"
              value={bestPick}
              placeholder="Best draft pick"
              onChange={(e) => {
                setBestPick(e.target.value);
                patchMeta({ bestPick: e.target.value });
              }}
            />
          ) : (
            <span className="team-rank-card__player-name">
              {meta?.bestPick || '—'}
            </span>
          )}
          <span className="team-rank-card__player-label">Worst pick</span>
          {isAdmin ? (
            <input
              className="team-rank-card__pick-input"
              type="text"
              value={worstPick}
              placeholder="Worst draft pick"
              onChange={(e) => {
                setWorstPick(e.target.value);
                patchMeta({ worstPick: e.target.value });
              }}
            />
          ) : (
            <span className="team-rank-card__player-name">
              {meta?.worstPick || '—'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function playoffChancesLabel(powerRank) {
  return powerRank != null && powerRank <= 6
    ? 'Championship Chances'
    : 'Wing Chances';
}

function PlayoffMiddle({
  meta,
  stats,
  isAdmin,
  onMetaChange,
  draftKey,
  powerRank
}) {
  const performanceLines = meta?.performanceLines || [];
  const h2hRecord = stats?.h2hRecord || meta?.h2hRecord;
  const medianRecord = stats?.medianRecord || meta?.medianRecord;
  const pointsScored = stats?.pointsScored || meta?.pointsScored;
  const chancesLabel = playoffChancesLabel(powerRank);
  const isChampionship = chancesLabel === 'Championship Chances';

  return (
    <div className="team-rank-card__middle is-single">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">Playoff Predictor</span>
        <MetaLine label="H2H:" value={h2hRecord} />
        <MetaLine label="Median:" value={medianRecord} />
        <ResultLine label="Points:" value={pointsScored} />
        {performanceLines.map((line) => (
          <ResultLine key={line} value={line} />
        ))}
        {isAdmin ? (
          <MetaDraftInput
            label={chancesLabel}
            saved={meta?.chances}
            draftKey={draftKey}
            placeholder={
              isChampionship
                ? 'e.g. 35% to win it all'
                : 'e.g. favorite for the wings'
            }
            multiline
            rows={2}
            onChange={(value) => onMetaChange?.({ chances: value })}
          />
        ) : meta?.chances ? (
          <p className="team-rank-card__median">
            {chancesLabel}: {meta.chances}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RetrospectiveMiddle({
  meta,
  stats,
  isAdmin,
  onMetaChange,
  draftKey
}) {
  const record = stats?.recordLabel || meta?.record;
  const medianWins = stats?.medianWins || meta?.medianWins;

  function patchMeta(patch) {
    onMetaChange?.(patch);
  }

  return (
    <div className="team-rank-card__middle">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">Season Retrospective</span>
        <MetaLine label="Record:" value={record} />
        <MetaLine label="Median wins:" value={medianWins} />
        {isAdmin ? (
          <>
            <MetaDraftInput
              label="Playoffs"
              saved={meta?.playoffPerformance}
              draftKey={draftKey}
              placeholder="e.g. 1st in Playoffs 🥇"
              onChange={(value) => patchMeta({ playoffPerformance: value })}
            />
            <MetaDraftInput
              label="Draft rank"
              saved={meta?.draftRecapRanking}
              draftKey={draftKey}
              placeholder="e.g. 4th"
              onChange={(value) => patchMeta({ draftRecapRanking: value })}
            />
            <MetaDraftInput
              label="Mid-season"
              saved={meta?.midSeasonRanking}
              draftKey={draftKey}
              placeholder="e.g. 2nd"
              onChange={(value) => patchMeta({ midSeasonRanking: value })}
            />
          </>
        ) : (
          <>
            <MetaLine label="Playoffs:" value={meta?.playoffPerformance} />
            <MetaLine label="Draft rank:" value={meta?.draftRecapRanking} />
            <MetaLine label="Mid-season:" value={meta?.midSeasonRanking} />
          </>
        )}
      </div>
      <div className="team-rank-card__player team-rank-card__draft-picks">
        <div>
          {isAdmin ? (
            <>
              <MetaDraftInput
                label="Best player"
                saved={meta?.bestPlayer}
                draftKey={draftKey}
                placeholder="Best player"
                align="right"
                onChange={(value) => patchMeta({ bestPlayer: value })}
              />
              <MetaDraftInput
                label="Worst player"
                saved={meta?.worstPlayer}
                draftKey={draftKey}
                placeholder="Worst player"
                align="right"
                onChange={(value) => patchMeta({ worstPlayer: value })}
              />
            </>
          ) : (
            <>
              <span className="team-rank-card__player-label">Best player</span>
              <span className="team-rank-card__player-name">
                {meta?.bestPlayer || '—'}
              </span>
              <span className="team-rank-card__player-label">Worst player</span>
              <span className="team-rank-card__player-name">
                {meta?.worstPlayer || '—'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ArchivalWeekMiddle({ meta, badge }) {
  const performanceLines = meta?.performanceLines || [];
  const biWeek =
    meta?.week9H2H ||
    meta?.week10H2H ||
    meta?.week11H2H ||
    meta?.week12H2H;

  return (
    <div className="team-rank-card__middle is-single">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">{badge || 'Week'}</span>
        {performanceLines.length ? (
          <>
            {performanceLines.map((line) => (
              <ResultLine key={line} value={line} />
            ))}
            <MetaLine label="Playoff chances:" value={meta.playoffChances} />
          </>
        ) : biWeek ? (
          <>
            <ResultLine value={meta.week9H2H || meta.week11H2H} />
            <ResultLine
              value={meta.week9Median || meta.week11Median}
              forceMedian
            />
            <ResultLine value={meta.week10H2H || meta.week12H2H} />
            <ResultLine
              value={meta.week10Median || meta.week12Median}
              forceMedian
            />
            <MetaLine label="Playoff chances:" value={meta.playoffChances} />
          </>
        ) : (
          <>
            <ResultLine value={meta?.lastWeek} />
            <ResultLine
              label="Median:"
              value={meta?.medianPerformance}
              forceMedian
            />
          </>
        )}
      </div>
    </div>
  );
}

function MatchupMiddle({ stats, imgFailed, setImgFailed }) {
  const isTopScorer = stats?.scoringPlace === 1;
  const isBottomScorer = stats?.scoringPlace === 12;
  const medianEmoji = isTopScorer ? ' 🏆' : isBottomScorer ? ' 💩' : '';
  const medianLine =
    stats?.medianResult && stats?.scoringPlaceLabel
      ? `${stats.medianResult} ${stats.scoringPlaceLabel}${medianEmoji}`
      : '—';
  const medianClass = [
    'team-rank-card__median',
    stats?.medianResult === 'W' ? 'is-up' : '',
    stats?.medianResult === 'L' ? 'is-down' : '',
    isTopScorer ? 'is-trophy' : '',
    isBottomScorer ? 'is-poop' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const topPlayer = stats?.topPlayer;

  return (
    <div className="team-rank-card__middle">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">
          Week {stats?.week || '—'}
        </span>
        {stats?.opponentName ? (
          <p className="team-rank-card__matchup-line">
            <span
              className={
                stats.result === 'W'
                  ? 'matchup-result is-win'
                  : stats.result === 'L'
                    ? 'matchup-result is-loss'
                    : 'matchup-result'
              }
            >
              {stats.result}
            </span>{' '}
            {stats.points?.toFixed?.(1) ?? stats.points}–
            {stats.oppPoints?.toFixed?.(1) ?? stats.oppPoints} vs{' '}
            {stats.opponentOwner || stats.opponentName}
          </p>
        ) : (
          <p className="team-rank-card__matchup-line">No matchup data</p>
        )}
        <p className={medianClass}>Median Performance: {medianLine}</p>
      </div>
      <div className="team-rank-card__player">
        <div className="team-rank-card__headshot">
          {topPlayer?.headshotUrl && !imgFailed ? (
            <img
              src={topPlayer.headshotUrl}
              alt=""
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="team-rank-card__headshot-fallback">
              {topPlayer?.name?.slice(0, 1) || '?'}
            </span>
          )}
        </div>
        <div>
          <span className="team-rank-card__player-label">Top performer</span>
          <span className="team-rank-card__player-name">
            {topPlayer?.name || '—'}
          </span>
          <span className="team-rank-card__player-pts">
            {topPlayer ? `${topPlayer.points} pts` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function EditionMiddle({
  editionType,
  editionLabel,
  meta,
  stats,
  live,
  isAdmin,
  onMetaChange,
  draftKey,
  powerRank
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (editionType === EDITION_TYPES.draft) {
    return (
      <DraftMiddle
        meta={meta}
        badge={editionLabel}
        isAdmin={isAdmin}
        onMetaChange={onMetaChange}
        draftKey={draftKey}
      />
    );
  }
  if (editionType === EDITION_TYPES.midseason) {
    return (
      <MidseasonMiddle
        meta={meta}
        stats={stats}
        isAdmin={isAdmin}
        onMetaChange={onMetaChange}
        draftKey={draftKey}
      />
    );
  }
  if (editionType === EDITION_TYPES.playoff) {
    return (
      <PlayoffMiddle
        meta={meta}
        stats={stats}
        isAdmin={isAdmin}
        onMetaChange={onMetaChange}
        draftKey={draftKey}
        powerRank={powerRank}
      />
    );
  }
  if (editionType === EDITION_TYPES.retrospective) {
    return (
      <RetrospectiveMiddle
        meta={meta}
        stats={stats}
        isAdmin={isAdmin}
        onMetaChange={onMetaChange}
        draftKey={draftKey}
      />
    );
  }
  if (live && editionType === EDITION_TYPES.week) {
    return (
      <MatchupMiddle
        stats={stats}
        imgFailed={imgFailed}
        setImgFailed={setImgFailed}
      />
    );
  }
  if (meta && Object.keys(meta).length) {
    return <ArchivalWeekMiddle meta={meta} badge={editionLabel} />;
  }
  return null;
}

export default function TeamRankCard({
  team,
  teamName,
  powerRank,
  rankChange,
  isAdmin,
  stats,
  teamMeta = null,
  editionType = EDITION_TYPES.week,
  editionLabel = '',
  live = true,
  recordLabel = null,
  blurb,
  onBlurbChange,
  onMetaChange
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: team.id,
    disabled: !isAdmin
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1
  };

  const draftKey = `${editionType}:${editionLabel}:${team.id}`;
  const [draftBlurb, setDraftBlurb] = useDraftField(blurb || '', draftKey);

  const showRecord =
    live &&
    (editionType === EDITION_TYPES.week ||
      editionType === EDITION_TYPES.midseason ||
      editionType === EDITION_TYPES.playoff ||
      editionType === EDITION_TYPES.retrospective)
      ? true
      : Boolean(recordLabel || teamMeta?.record);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="team-rank-card"
      {...attributes}
    >
      <div className={`team-rank-card__top${isAdmin ? ' is-admin' : ''}`}>
        {isAdmin && (
          <button
            type="button"
            className="team-rank-card__drag"
            aria-label={`Drag ${team.owner}`}
            {...listeners}
          >
            ⋮⋮
          </button>
        )}
        <span className="team-rank-card__rank">{powerRank}</span>
        <div className="team-rank-card__meta">
          <span className="team-rank-card__owner">{team.owner}</span>
          <span className="team-rank-card__name">{teamName || team.name}</span>
          {showRecord && (
            <span className="team-rank-card__record">
              {recordLabel ||
                teamMeta?.record ||
                stats?.recordLabel ||
                '0-0'}
            </span>
          )}
        </div>
        <div className="team-rank-card__change-wrap">
          <RankChange rankChange={rankChange} />
        </div>
      </div>

      <EditionMiddle
        editionType={editionType}
        editionLabel={editionLabel}
        meta={teamMeta}
        stats={stats}
        live={live}
        isAdmin={isAdmin}
        onMetaChange={
          onMetaChange
            ? (patch) => onMetaChange(team.id, patch)
            : undefined
        }
        draftKey={draftKey}
        powerRank={powerRank}
      />

      <div className="team-rank-card__bottom">
        {isAdmin ? (
          <textarea
            className="team-rank-card__blurb-input"
            value={draftBlurb}
            placeholder="Write this week's blurb…"
            rows={3}
            onChange={(e) => {
              setDraftBlurb(e.target.value);
              onBlurbChange(team.id, e.target.value);
            }}
          />
        ) : (
          <p className="team-rank-card__blurb">
            {blurb || 'No blurb yet.'}
          </p>
        )}
      </div>
    </article>
  );
}
