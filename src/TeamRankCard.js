import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

  // Positive = improved toward #1; negative = fell toward #12
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

function DraftMiddle({ draftNotes }) {
  return (
    <div className="team-rank-card__middle">
      <div className="team-rank-card__matchup">
        <span className="team-rank-card__week-badge">Draft Recap</span>
        <p className="team-rank-card__matchup-line">
          <span className="draft-label is-strength">Strengths:</span>{' '}
          {draftNotes?.strengths || '—'}
        </p>
        <p className="team-rank-card__matchup-line">
          <span className="draft-label is-weakness">Weaknesses:</span>{' '}
          {draftNotes?.weaknesses || '—'}
        </p>
      </div>
      <div className="team-rank-card__player team-rank-card__draft-picks">
        <div>
          <span className="team-rank-card__player-label">Best pick</span>
          <span className="team-rank-card__player-name">
            {draftNotes?.bestPick || '—'}
          </span>
          <span className="team-rank-card__player-label">Worst pick</span>
          <span className="team-rank-card__player-name">
            {draftNotes?.worstPick || '—'}
          </span>
        </div>
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

export default function TeamRankCard({
  team,
  teamName,
  powerRank,
  rankChange,
  isAdmin,
  stats,
  draftNotes = null,
  showMatchup = true,
  blurb,
  onBlurbChange
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
  const [imgFailed, setImgFailed] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1
  };

  const showDraftMiddle = Boolean(draftNotes) && !showMatchup;

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
          {showMatchup && (
            <span className="team-rank-card__record">
              {stats?.recordLabel || '0-0'}
            </span>
          )}
        </div>
        <div className="team-rank-card__change-wrap">
          <RankChange rankChange={rankChange} />
        </div>
      </div>

      {showDraftMiddle ? (
        <DraftMiddle draftNotes={draftNotes} />
      ) : showMatchup ? (
        <MatchupMiddle
          stats={stats}
          imgFailed={imgFailed}
          setImgFailed={setImgFailed}
        />
      ) : null}

      <div className="team-rank-card__bottom">
        {isAdmin ? (
          <textarea
            className="team-rank-card__blurb-input"
            value={blurb || ''}
            placeholder="Write this week's blurb…"
            rows={3}
            onChange={(e) => onBlurbChange(team.id, e.target.value)}
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
