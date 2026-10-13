import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function formatRecord(team) {
  const overall = team.record?.overall;
  if (!overall) return '0-0';
  const { wins = 0, losses = 0, ties = 0 } = overall;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export default function TeamRankCard({ team, powerRank, isAdmin }) {
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
    opacity: isDragging ? 0.85 : 1,
    cursor: isAdmin ? 'grab' : 'default'
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="team-rank-card"
      {...attributes}
      {...(isAdmin ? listeners : {})}
    >
      <div className="team-rank-card__top">
        <span className="team-rank-card__rank">{powerRank}</span>
        <div className="team-rank-card__meta">
          <span className="team-rank-card__owner">{team.owner}</span>
          <span className="team-rank-card__name">{team.name}</span>
          <span className="team-rank-card__record">{formatRecord(team)}</span>
        </div>
      </div>
    </article>
  );
}
