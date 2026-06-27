import Link from "next/link";

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-and-conditions", label: "Terms and Conditions" },
  { href: "/cancellation-refund-policy", label: "Cancellation and Refund" },
  { href: "/contact", label: "Contact" }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-[#fff8ec]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-neutral-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="font-black text-neutral-950">Dish2Door</p>
          <p className="mt-1">Campus food ordering — gate pickup or hostel delivery.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="font-semibold hover:text-neutral-950">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
