"use client";

import { type CSSProperties, type ReactNode } from "react";
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
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { type WidgetSpan } from "@/lib/dashboard-widgets";

// Flexbox sizing per span. Items GROW to fill their row and divide the width evenly
// (`flexGrow: 1`, equal basis within a section), so 1 item → full width, 2 → 50% each,
// 3 → thirds, and hiding one makes the rest expand — no gaps. `flexBasis`/`minWidth` set the
// responsive wrap point (items stack on narrow screens). span 12 always takes its own row.
function spanStyle(span: WidgetSpan): CSSProperties {
  if (span === 12) return { flexBasis: "100%", flexGrow: 1, flexShrink: 1, minWidth: 0 };
  const cfg = { 2: { basis: 180, min: 150 }, 4: { basis: 280, min: 240 }, 6: { basis: 360, min: 300 } }[span];
  return { flexGrow: 1, flexShrink: 1, flexBasis: `${cfg.basis}px`, minWidth: `${cfg.min}px` };
}

export type GridItem = {
  id: string;
  span: WidgetSpan;
  node: ReactNode;
  // Optional lightweight stand-in shown while editing (avoids re-rendering heavy charts on
  // every drag frame). Falls back to `node` when absent.
  placeholder?: ReactNode;
  title?: string; // used by the drag overlay preview
};

// A 12-col dashboard grid. In view mode it's a plain grid (zero dnd-kit overhead). In edit
// mode each cell becomes draggable via an explicit handle, and reordering emits the new
// VISIBLE id sequence — the parent merges that back into its full order (incl. hidden ids).
export function DashboardGrid({
  items,
  editing = false,
  onReorder,
}: {
  items: GridItem[];
  editing?: boolean;
  onReorder?: (visibleIds: string[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!editing) {
    return (
      <div className="flex flex-wrap items-stretch gap-4">
        {items.map((it) => (
          <div key={it.id} style={spanStyle(it.span)}>
            {it.node}
          </div>
        ))}
      </div>
    );
  }

  const ids = items.map((it) => it.id);
  const activeItem = items.find((it) => it.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder?.(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="flex flex-wrap items-stretch gap-4">
          {items.map((it) => (
            <SortableCell key={it.id} id={it.id} span={it.span} dimmed={activeId === it.id}>
              {it.placeholder ?? it.node}
            </SortableCell>
          ))}
        </div>
      </SortableContext>
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

function SortableCell({
  id,
  span,
  dimmed,
  children,
}: {
  id: string;
  span: WidgetSpan;
  dimmed: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ ...spanStyle(span), transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", (isDragging || dimmed) && "opacity-40")}
    >
      {/* Drag handle — listeners live here only, so interactive widget content isn't hijacked. */}
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
      {/* pointer-events-none so clicks inside widgets don't fire while arranging. */}
      <div className="pointer-events-none select-none rounded-2xl outline-dashed outline-1 outline-offset-2 outline-accent/40">
        {children}
      </div>
    </div>
  );
}
