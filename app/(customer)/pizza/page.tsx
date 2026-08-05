import Link from "next/link";
import { PizzaStorefront } from "@/components/customer/PizzaStorefront";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";
import { listActiveCampuses, toPublicCampus } from "@/lib/campus";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

async function getPizzaShop() {
  return prisma.restaurant.findUnique({
    where: { slug: SHOP_SLUG },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      imageUrl: true,
      active: true,
      acceptingOrders: true,
      restrictedToCampusCode: true,
      whatsappNumber: true,
      courses: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      menuItems: {
        where: { available: true },
        select: {
          id: true,
          name: true,
          description: true,
          pricePaise: true,
          discountPercent: true,
          imageUrl: true,
          courseId: true,
          sizeLabel: true,
          isVeg: true,
          sizeOrder: true
        },
        orderBy: [{ name: "asc" }, { sizeOrder: "asc" }]
      },
      combos: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          comboPricePaise: true,
          items: {
            select: {
              id: true,
              quantity: true,
              menuItem: {
                select: { id: true, name: true, imageUrl: true, pricePaise: true, discountPercent: true, available: true }
              }
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
      }
    }
  });
}

// This page is intentionally isolated from /menu: a WhatsApp-mode shop has its own
// checkout flow (no Razorpay, no lib/cart.ts) and its own brand feel.
export default async function PizzaPage() {
  const [shop, campuses] = await Promise.all([getPizzaShop(), listActiveCampuses()]);

  if (!shop || !shop.active) {
    return (
      <main id="main-content" className="min-h-screen bg-white text-[#0B1F33]">
        <SiteNav />
        <section className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#E31837]/10 text-4xl">🍕</span>
          <h1 className="mt-8 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Pizza is coming soon.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#5A6B7B]">
            We&apos;re still setting up this storefront. Check back shortly, or explore the rest of the menu in the meantime.
          </p>
        </section>
        <SiteFooter />
      </main>
    );
  }

  // Gate a closed shop on the SERVER so the menu is never even sent to the browser.
  // The client has the same guard, but doing it here makes the closed page genuinely
  // empty rather than a hidden menu.
  if (!shop.acceptingOrders) {
    return (
      <main id="main-content" className="min-h-screen bg-white text-[#0B1F33]">
        <SiteNav />
        <section className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#5A6B7B]/10 text-4xl">🍕</span>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5A6B7B]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#5A6B7B]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5A6B7B]" /> Closed
          </span>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{shop.name} is closed.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#5A6B7B]">
            We&apos;re not taking pizza orders right now. Check back a little later, or browse the other
            campus kitchens in the meantime.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/menu" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#E31837] px-6 text-sm font-black text-white transition hover:bg-[#c81330]">
              Browse other kitchens
            </Link>
            <Link href="/" className="inline-flex min-h-12 items-center rounded-md border border-[#0B1F33]/15 px-6 text-sm font-black text-[#0B1F33] transition hover:border-[#0B1F33]/35">
              Back home
            </Link>
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <PizzaStorefront shop={shop} campuses={campuses.map(toPublicCampus)} />
  );
}
