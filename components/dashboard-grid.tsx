"use client";

import { type ReactNode, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WidgetSpan } from "@/lib/dashboard-widgets";

export type GridItem = {
  id: string;
  span: WidgetSpan;
  node: ReactNode;
  placeholder?: ReactNode;
  title?: string;
};

// Row-based dashboard grid. Each row is a separate flex container — cards never
// flow between rows. In edit mode, cards can be dragged between rows.
export function DashboardGrid({
  rows,
  editing = false,
  onReorder,
}: {
  rows: GridItem[][];
  editing?: boolean;
  onReorder?: (newRows: string[][]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveRows, setLiveRows] = useState<string[][] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allItems = new Map<string, GridItem>();
  for (const row of rows) for (const it of row) allItems.set(it.id, it);
  const activeItem = activeId ? allItems.get(activeId) ?? null : null;

  if (!editing) {
    return (
      <div className="space-y-4">
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-stretch gap-4">
            {row.map((it) => (
              <div key={it.id} className="min-w-0 flex flex-1 flex-col">
                {it.node}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // In edit mode, maintain a live copy of row ids for cross-row drag.
  const currentRows = liveRows ?? rows.map((r) => r.map((it) => it.id));

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setLiveRows(rows.map((r) => r.map((it) => it.id)));
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || !liveRows) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Find which rows contain active and over
    let fromRow = -1, toRow = -1;
    for (let i = 0; i < liveRows.length; i++) {
      if (liveRows[i].includes(activeIdStr)) fromRow = i;
      if (liveRows[i].includes(overIdStr)) toRow = i;
      // over might be a row droppable id (e.g. "row-3")
      if (overIdStr === `row-${i}`) toRow = i;
    }
    if (fromRow < 0 || toRow < 0 || fromRow === toRow) return;

    // Move the item from its current row to the target row
    setLiveRows((prev) => {
      if (!prev) return prev;
      const next = prev.map((r) => [...r]);
      next[fromRow] = next[fromRow].filter((id) => id !== activeIdStr);
      const targetIdx = next[toRow].indexOf(overIdStr);
      if (targetIdx >= 0) {
        next[toRow].splice(targetIdx, 0, activeIdStr);
      } else {
        next[toRow].push(activeIdStr);
      }
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!liveRows) { setLiveRows(null); return; }

    if (over && active.id !== over.id) {
      // Handle within-row reorder
      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);
      let updated = liveRows.map((r) => [...r]);
      for (let i = 0; i < updated.length; i++) {
        const fromIdx = updated[i].indexOf(activeIdStr);
        const toIdx = updated[i].indexOf(overIdStr);
        if (fromIdx >= 0 && toIdx >= 0) {
          updated[i] = arrayMove(updated[i], fromIdx, toIdx);
          break;
        }
      }
      // Remove empty rows
      updated = updated.filter((r) => r.length > 0);
      onReorder?.(updated);
    } else {
      // Drop in place — still emit because cross-row moves happened in onDragOver
      const updated = liveRows.filter((r) => r.length > 0);
      onReorder?.(updated);
    }
    setLiveRows(null);
  };

  const displayRows = currentRows.map((rowIds) =>
    rowIds.map((id) => allItems.get(id)).filter(Boolean) as GridItem[],
  ).filter((r) => r.length > 0);

  const allIds = currentRows.flat();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setLiveRows(null); }}
    >
      <div className="space-y-4">
        {displayRows.map((row, ri) => (
          <DroppableRow key={ri} rowIndex={ri} items={row} activeId={activeId} />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-2xl border-2 border-accent bg-panel px-4 py-3 text-sm font-bold text-accent shadow-lg">
            {activeItem.title ?? activeItem.id}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DroppableRow({
  rowIndex,
  items,
  activeId,
}: {
  rowIndex: number;
  items: GridItem[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row-${rowIndex}` });
  const ids = items.map((it) => it.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-stretch gap-4 rounded-xl p-1 transition-colors",
        isOver && "bg-accent/5 outline-dashed outline-1 outline-accent/30",
      )}
    >
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        {items.map((it) => (
          <SortableCell key={it.id} id={it.id} dimmed={activeId === it.id}>
            {it.placeholder ?? it.node}
          </SortableCell>
        ))}
      </SortableContext>
    </div>
  );
}

function SortableCell({
  id,
  dimmed,
  children,
}: {
  id: string;
  dimmed: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative min-w-0 flex flex-1 flex-col", (isDragging || dimmed) && "opacity-40")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="absolute -top-2 -left-2 z-20 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-lg border border-accent/40 bg-accent text-white shadow active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="pointer-events-none select-none rounded-2xl outline-dashed outline-1 outline-offset-2 outline-accent/40">
        {children}
      </div>
    </div>
  );
}
