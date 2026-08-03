"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutList } from "lucide-react";
import { SectionCard } from "@/components/admin/AdminShell";
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

export function PizzaCoursesManager({ restaurantId, initialCourses }: { restaurantId: string; initialCourses: Course[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [courseName, setCourseName] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function renameCourse(course: Course) {
    const next = window.prompt("Course/category name", course.name)?.trim();
    if (!next) return;
    if (next.length < 2) {
      toast.error("Course name must be at least 2 characters.");
      return;
    }
    try {
      await postAction({ action: "course.update", id: course.id, name: next });
      setCourses((current) => current.map((entry) => (entry.id === course.id ? { ...entry, name: next } : entry)));
      toast.success("Course updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update course");
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
    if (!window.confirm(`Delete "${course.name}"? Move or delete its menu items first.`)) return;
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
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input placeholder="New course/category" value={courseName} onChange={(event) => setCourseName(event.target.value)} />
        <Button variant="outline" disabled={creating} onClick={createCourse}>
          {creating ? "Adding..." : "Add course"}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {courses.map((course, index) => (
          <div key={course.id} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30" disabled={index === 0} aria-label="Move up" onClick={() => moveCourse(index, -1)}>
                  ▲
                </button>
                <button type="button" className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30" disabled={index === courses.length - 1} aria-label="Move down" onClick={() => moveCourse(index, 1)}>
                  ▼
                </button>
              </div>
              <div>
                <span className="font-semibold">{course.name}</span>
                <p className="text-xs text-neutral-500">
                  {course.itemCount} item{course.itemCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => renameCourse(course)}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteCourse(course)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {!courses.length ? (
          <div className="col-span-full grid place-items-center gap-3 rounded-xl bg-neutral-50 p-10 text-center text-neutral-500">
            <LayoutList size={28} className="text-neutral-300" />
            <p>No courses yet. Add your first one above.</p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
