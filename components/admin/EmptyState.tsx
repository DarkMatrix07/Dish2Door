import type { ReactNode } from "react";

// The admin's one "nothing here" block, so empty lists read the same on every page.
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-bold text-neutral-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-neutral-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
