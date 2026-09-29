import Link from "next/link";

// Previous/next links for server-rendered admin lists. Keeps every other query
// parameter (search, sort, filters) so paging never resets what the admin chose.
export function Pager({
  basePath,
  params,
  page,
  totalPages,
  total,
  shown,
  noun
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
  shown: number;
  noun: string;
}) {
  if (total === 0) return null;
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const link = "inline-flex h-9 items-center rounded-md border border-neutral-200 px-3 text-sm font-semibold";
  return (
    <nav aria-label="Pages" className="flex flex-col items-center justify-between gap-3 border-t border-neutral-100 pt-4 sm:flex-row">
      <p className="text-sm text-neutral-500">
        Page {page} of {totalPages} · showing {shown} of {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${link} hover:bg-neutral-50`}>Previous</Link>
        ) : (
          <span className={`${link} cursor-not-allowed text-neutral-300`} aria-disabled="true">Previous</span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={`${link} hover:bg-neutral-50`}>Next</Link>
        ) : (
          <span className={`${link} cursor-not-allowed text-neutral-300`} aria-disabled="true">Next</span>
        )}
      </div>
    </nav>
  );
}

// Page number from a search param, clamped to at least 1.
export function readPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : 1;
}
