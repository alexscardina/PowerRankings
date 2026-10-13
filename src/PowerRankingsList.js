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
import TeamRankCard from './TeamRankCard';

export default function PowerRankingsList({ teams, isAdmin, onReorder }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

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
              powerRank={teams.length - index}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
