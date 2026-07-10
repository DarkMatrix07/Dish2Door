import Link from "next/link";

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-and-conditions", label: "Terms and Conditions" },
  { href: "/cancellation-refund-policy", label: "Cancellation and Refund" },
  { href: "/contact", label: "Contact" }
];

export function SiteFooter() {
  return (
    <footer className="bg-[#f7f3eb]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 py-10 text-sm text-[#6c6458] sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:py-12">
        <div>
          <p className="text-xl font-black tracking-[-0.03em] text-[#171713]">Dish2Door</p>
          <p className="mt-2">Good food, from campus kitchens to your door.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal and support">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="font-semibold transition-colors hover:text-[#c65d24]">{link.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
