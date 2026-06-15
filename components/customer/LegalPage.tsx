import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";

type Section = {
  title: string;
  body: string[];
};

export function LegalPage({
  eyebrow,
  title,
  updated,
  sections
}: {
  eyebrow: string;
  title: string;
  updated: string;
  sections: Section[];
}) {
  return (
    <main className="min-h-screen bg-[#fff8ec] text-neutral-950">
      <section className="relative border-b border-neutral-200 bg-[#fff8ec]">
        <SiteNav />
        <div className="ambient-grid absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-28 sm:px-6 lg:px-8">
          <p className="font-semibold text-amber-700">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{title}</h1>
          <p className="mt-4 text-sm font-semibold text-neutral-500">Last updated: {updated}</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-black">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-neutral-600 sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
