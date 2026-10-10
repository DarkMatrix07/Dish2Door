import { cn } from "@/lib/utils";

// Three small number cards in one row. The grid is explicit (always 3 equal columns) and
// the labels wrap instead of being cut off, so on a 320px phone every label stays readable
// no matter how wide the phone's own font renders. Used by the Domino's Store, Today and
// Menu items pages in place of the roomier StatCard, which needs more width than a phone has.
export function PizzaStatRow({
  stats,
  className
}: {
  stats: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("grid w-full grid-cols-3 gap-2 sm:gap-4", className)}>
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 rounded-xl bg-white p-3 shadow-[0_10px_35px_rgba(30,32,38,0.05)] sm:p-5">
          <p className="break-words text-[11px] font-bold leading-tight text-[#85878e] sm:text-sm">{stat.label}</p>
          <p className="mt-1.5 text-xl font-black leading-none tracking-[-0.04em] tabular-nums sm:mt-2 sm:text-3xl">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
