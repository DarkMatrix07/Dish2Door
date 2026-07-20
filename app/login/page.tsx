import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Staff login | Dish2Door",
  description: "Secure access for Dish2Door administrators and delivery staff."
};

export default function LoginPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f4efe6] text-[#17130e] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(30rem,0.92fr)]">
      <section className="relative min-h-56 overflow-hidden sm:min-h-72 lg:min-h-[100dvh]" aria-label="Dish2Door staff portal">
        <Image
          src="/dish2door-home-hero.png"
          alt="Fresh wraps, biryani, fries, and cold coffee prepared for Dish2Door orders"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover object-[center_48%] lg:object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,14,10,0.16)_0%,rgba(18,14,10,0.28)_45%,rgba(18,14,10,0.92)_100%)] lg:bg-[linear-gradient(90deg,rgba(18,14,10,0.2)_0%,rgba(18,14,10,0.08)_48%,rgba(18,14,10,0.58)_100%)]" />

        <div className="relative flex h-full min-h-56 flex-col justify-between p-5 text-white sm:min-h-72 sm:p-8 lg:min-h-[100dvh] lg:p-12 xl:p-16">
          <Link
            href="/"
            className="group inline-flex w-fit items-center gap-3 rounded-full bg-[#17130e]/78 py-2 pl-2 pr-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-white/15 backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="grid size-9 place-items-center rounded-full bg-[#f4b942] text-sm font-black text-[#17130e]">D2</span>
            <span className="font-bold tracking-[-0.02em]">Dish2Door</span>
            <ArrowUpRight className="size-4 text-white/55 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </Link>

          <div className="hidden max-w-xl lg:block">
            <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#f4b942]">Operations workspace</p>
            <h1 className="mt-5 max-w-lg text-5xl font-black leading-[0.96] tracking-[-0.055em] xl:text-6xl">
              Every order,<br />moving together.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white/72">
              One secure workspace for campus orders, restaurant coordination, and doorstep handoffs.
            </p>
            <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-white/82">
              {['Live order control', 'Delivery handoffs', 'Menu operations'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-white/12 ring-1 ring-white/15">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-14rem)] flex-col px-5 py-8 sm:min-h-[calc(100dvh-18rem)] sm:px-10 sm:py-12 lg:min-h-[100dvh] lg:px-14 lg:py-12 xl:px-20">
        <div className="mx-auto flex w-full max-w-[31rem] flex-1 items-center">
          <LoginForm />
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-[31rem] flex-wrap items-center justify-between gap-3 border-t border-[#d9cebe] pt-5 text-xs font-semibold text-[#766b5d]">
          <span>Dish2Door staff access</span>
          <div className="flex gap-5">
            <Link href="/privacy-policy" className="transition-colors hover:text-[#17130e]">Privacy</Link>
            <Link href="/terms-and-conditions" className="transition-colors hover:text-[#17130e]">Terms</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
