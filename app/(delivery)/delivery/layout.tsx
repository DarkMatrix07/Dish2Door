import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["DELIVERY"]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/88 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Delivery</p>
            <h1 className="font-black">Assigned hostel orders</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/60 sm:inline">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
