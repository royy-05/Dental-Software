"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DragHandleProps {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  label: string;
}

export function DragHandle({ attributes, listeners, label }: DragHandleProps) {
  return (
    <button type="button" className="cursor-grab touch-none rounded p-1 text-slate-500 hover:bg-muted active:cursor-grabbing" aria-label={`Drag to reorder ${label}`} {...attributes} {...listeners}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function Row<T extends { id: string }>({ item, render }: { item: T; render: (item: T, handle: Omit<DragHandleProps, "label">) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-80 shadow-lg")}>
      {render(item, { attributes, listeners })}
    </li>
  );
}

/** Drag-to-reorder list (mouse, touch and keyboard: focus the handle, Space, arrows, Space). */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  render: (item: T, handle: Omit<DragHandleProps, "label">) => React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={cn("grid gap-2", className)}>
          {items.map((item) => (
            <Row key={item.id} item={item} render={render} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
