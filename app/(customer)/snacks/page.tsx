import Link from "next/link";
import { GroceriesStorefront } from "@/components/customer/GroceriesStorefront";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";
import { listActiveCampuses, toPublicCampus } from "@/lib/campus";
import { prisma } from "@/lib/db";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

async function getGroceriesShop() {
  return prisma.restaurant.findUnique({
    where: { slug: GROCERIES_SLUG },
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

function QuietPage({ title, body, closed = false }: { title: string; body: string; closed?: boolean }) {
  return (
    <main id="main-content" className="min-h-screen bg-[#f7f3eb] text-[#171713]">
      <SiteNav />
      <section className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-32 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e9e5dd] text-3xl" aria-hidden>🧺</span>
        {closed ? (
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#e9e5dd] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#746c5f]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#746c5f]" /> Closed
          </span>
        ) : null}
        <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-md text-base leading-7 text-[#625b50]">{body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/menu" className="inline-flex min-h-12 items-center rounded-md bg-[#171713] px-6 text-sm font-black text-white transition hover:bg-[#c65d24]">
            Browse kitchens
          </Link>
          <Link href="/" className="inline-flex min-h-12 items-center rounded-md border border-black/15 px-6 text-sm font-black transition hover:border-black/30">
            Back home
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

// Isolated from /menu on purpose: a WhatsApp shop checks out on this page, with no
// Razorpay charge and no shared cart.
export default async function GroceriesPage() {
  const [shop, campuses] = await Promise.all([getGroceriesShop(), listActiveCampuses()]);

  if (!shop || !shop.active) {
    return (
      <QuietPage
        title="Snacks is coming soon."
        body="We're still setting up this storefront. Check back shortly, or explore the campus kitchens in the meantime."
      />
    );
  }

  // Gate a closed shop on the server so the catalogue is never sent to the browser.
  if (!shop.acceptingOrders) {
    return (
      <QuietPage
        closed
        title={`${shop.name} is closed.`}
        body="We're not taking snack orders right now. Check back a little later, or browse the campus kitchens in the meantime."
      />
    );
  }

  return <GroceriesStorefront shop={shop} campuses={campuses.map(toPublicCampus)} />;
}
