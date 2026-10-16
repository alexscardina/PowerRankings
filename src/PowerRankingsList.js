import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { rankDelta } from './rankUtils';
import { EDITION_TYPES } from './editionUtils';
import TeamRankCard from './TeamRankCard';

export default function PowerRankingsList({
  teams,
  isAdmin,
  onReorder,
  cardStats,
  blurbs,
  teamMeta = {},
  teamNames,
  onBlurbChange,
  previousTeamIds,
  editionType = EDITION_TYPES.week,
  editionLabel = '',
  live = true
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const currentTeamIds = teams.map((team) => team.id);

  function handleDragEnd(event) {
    if (!isAdmin) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = teams.findIndex((team) => team.id === active.id);
    const newIndex = teams.findIndex((team) => team.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(teams, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={teams.map((team) => team.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="power-rankings-list">
          {teams.map((team, index) => (
            <TeamRankCard
              key={team.id}
              team={team}
              teamName={
                teamNames?.[String(team.id)] ||
                teamNames?.[team.id] ||
                team.name
              }
              powerRank={teams.length - index}
              rankChange={rankDelta(team.id, currentTeamIds, previousTeamIds)}
              isAdmin={isAdmin}
              stats={cardStats?.byTeamId?.[team.id]}
              teamMeta={teamMeta[String(team.id)] || teamMeta[team.id] || null}
              editionType={editionType}
              editionLabel={editionLabel}
              live={live}
              recordLabel={
                teamMeta[String(team.id)]?.record ||
                teamMeta[team.id]?.record ||
                null
              }
              blurb={blurbs[String(team.id)] || blurbs[team.id] || ''}
              onBlurbChange={onBlurbChange}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
