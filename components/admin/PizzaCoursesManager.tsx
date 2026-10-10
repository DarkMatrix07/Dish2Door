"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { SectionCard } from "@/components/admin/AdminShell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Course = { id: string; name: string; sortOrder: number; itemCount: number };

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Action failed");
  return data;
}

// 40px square so a thumb can hit it; the arrow itself stays small and quiet.
const arrowClass =
  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-35";

export function PizzaCoursesManager({ restaurantId, initialCourses }: { restaurantId: string; initialCourses: Course[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [courseName, setCourseName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  async function createCourse() {
    const name = courseName.trim();
    if (name.length < 2) {
      toast.error("Enter a course name (at least 2 characters).");
      return;
    }
    setCreating(true);
    try {
      const { course } = await postAction({ action: "course.create", restaurantId, name, sortOrder: courses.length });
      setCourses((current) => [...current, { ...course, itemCount: 0 }]);
      setCourseName("");
      toast.success("Course added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add course");
    } finally {
      setCreating(false);
    }
  }

  function startRename(course: Course) {
    setRenamingId(course.id);
    setRenameValue(course.name);
  }

  async function renameCourse(course: Course) {
    const next = renameValue.trim();
    if (next === course.name) {
      setRenamingId(null);
      return;
    }
    if (next.length < 2) {
      toast.error("Course name must be at least 2 characters.");
      return;
    }
    setRenaming(true);
    try {
      await postAction({ action: "course.update", id: course.id, name: next });
      setCourses((current) => current.map((entry) => (entry.id === course.id ? { ...entry, name: next } : entry)));
      setRenamingId(null);
      toast.success("Course updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update course");
    } finally {
      setRenaming(false);
    }
  }

  async function moveCourse(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= courses.length) return;
    const reordered = [...courses];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setCourses(reordered);
    try {
      await postAction({ action: "course.reorder", restaurantId, orderedIds: reordered.map((course) => course.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder courses");
    }
  }

  async function deleteCourse(course: Course) {
    const ok = await confirm({
      title: `Delete "${course.name}"?`,
      description: "Move or delete its menu items first.",
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    try {
      await postAction({ action: "course.delete", id: course.id });
      setCourses((current) => current.filter((entry) => entry.id !== course.id));
      toast.success("Course deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete course");
    }
  }

  return (
    <SectionCard title="Courses" description="Add courses/categories and reorder them for the customer menu.">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-xs font-semibold text-neutral-500">
          New course name
          <span className="mt-1 block">
            <Input
              placeholder="e.g. Desserts"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createCourse();
              }}
            />
          </span>
        </label>
        <Button variant="outline" className="w-full whitespace-nowrap sm:w-auto" disabled={creating} onClick={createCourse}>
          {creating ? "Adding..." : "Add course"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {courses.map((course, index) => (
          <div key={course.id} className="min-w-0 rounded-xl bg-neutral-50 p-3">
            {renamingId === course.id ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-500">
                  Course name
                  <span className="mt-1 block">
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") renameCourse(course);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="h-10" disabled={renaming} onClick={() => setRenamingId(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-10" disabled={renaming} onClick={() => renameCourse(course)}>
                    {renaming ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="break-words font-semibold">{course.name}</p>
                <p className="text-xs text-neutral-500">
                  {course.itemCount} item{course.itemCount === 1 ? "" : "s"}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button type="button" className={arrowClass} disabled={index === 0} aria-label="Move up" onClick={() => moveCourse(index, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className={arrowClass} disabled={index === courses.length - 1} aria-label="Move down" onClick={() => moveCourse(index, 1)}>
                    <ArrowDown size={16} />
                  </button>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" className="h-10 px-3 sm:h-9" onClick={() => startRename(course)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-10 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700 sm:h-9 sm:px-3" onClick={() => deleteCourse(course)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        {!courses.length ? (
          <div className="col-span-full rounded-xl bg-neutral-50">
            <EmptyState title="No courses yet" description="Add your first one above." />
          </div>
        ) : null}
      </div>
      {confirmDialog}
    </SectionCard>
  );
}
