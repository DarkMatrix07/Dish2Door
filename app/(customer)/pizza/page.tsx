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

  return (
    <PizzaStorefront
      shop={shop}
      campuses={campuses.map(toPublicCampus)}
      serverNowMs={Date.now()}
    />
  );
}
