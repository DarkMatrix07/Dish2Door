import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared campus chip for admin views. Each campus gets a stable colour so a long list
// of orders can be scanned by colour rather than read word by word. Orders placed
// before campuses existed have no campus and render as "Unassigned".
const TONES: Record<string, string> = {
  VIT_AP: "bg-[#c65d24]/10 text-[#a2481a] ring-[#c65d24]/20",
  SRM_AP: "bg-[#2b6e56]/10 text-[#1f5741] ring-[#2b6e56]/20"
};

const FALLBACK_TONE = "bg-[#f3f4f6] text-[#70727a] ring-black/10";

export function campusLabel(campus?: { code: string; name: string } | null) {
  return campus?.name ?? "Unassigned";
}

export function CampusBadge({
  campus,
  className,
  showIcon = true
}: {
  campus?: { code: string; name: string } | null;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ring-inset",
        campus ? TONES[campus.code] ?? FALLBACK_TONE : FALLBACK_TONE,
        className
      )}
    >
      {showIcon ? <GraduationCap size={11} /> : null}
      {campusLabel(campus)}
    </span>
  );
}
