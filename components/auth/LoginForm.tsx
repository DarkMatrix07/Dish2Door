"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({ error: "The login service returned an invalid response." }));
      if (!response.ok) throw new Error(data.error ?? "Login failed");
      window.location.href = data.user.role === "ADMIN" ? "/admin" : "/delivery";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      className="w-full"
    >
      <Link
        href="/"
        className="group mb-10 inline-flex items-center gap-2 text-sm font-bold text-[#766b5d] transition-colors duration-300 hover:text-[#17130e] lg:mb-14"
      >
        <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true" />
        Customer site
      </Link>

      <div className="mb-9">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-[#c65d24]" />
          <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#a64a18]">Secure staff access</p>
        </div>
        <h2 className="mt-5 text-[clamp(2.6rem,7vw,4.35rem)] font-black leading-[0.92] tracking-[-0.06em]">Welcome back.</h2>
        <p className="mt-5 max-w-md text-[0.96rem] leading-7 text-[#6f6558]">
          Sign in once. We will open the right workspace for your role.
        </p>
      </div>

      <form onSubmit={login} className="space-y-5">
        <div>
          <label htmlFor="staff-email" className="mb-2 block text-sm font-bold text-[#30291f]">Work email</label>
          <div className="group relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 size-[1.1rem] -translate-y-1/2 text-[#9a8c79] transition-colors duration-300 group-focus-within:text-[#a64a18]" aria-hidden="true" />
            <input
              id="staff-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@dish2door.store"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-14 w-full rounded-xl bg-[#fffaf2] pl-12 pr-4 text-base font-semibold text-[#17130e] outline-none ring-1 ring-[#d9cebe] transition-[box-shadow,background-color] duration-300 placeholder:font-medium placeholder:text-[#a89c8c] hover:bg-white focus:bg-white focus:ring-2 focus:ring-[#b95822]/70"
            />
          </div>
        </div>

        <div>
          <label htmlFor="staff-password" className="mb-2 block text-sm font-bold text-[#30291f]">Password</label>
          <div className="group relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-[1.1rem] -translate-y-1/2 text-[#9a8c79] transition-colors duration-300 group-focus-within:text-[#a64a18]" aria-hidden="true" />
            <input
              id="staff-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-14 w-full rounded-xl bg-[#fffaf2] pl-12 pr-12 text-base font-semibold text-[#17130e] outline-none ring-1 ring-[#d9cebe] transition-[box-shadow,background-color] duration-300 placeholder:font-medium placeholder:text-[#a89c8c] hover:bg-white focus:bg-white focus:ring-2 focus:ring-[#b95822]/70"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-[#807464] transition-colors duration-300 hover:bg-[#eee4d5] hover:text-[#17130e] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#b95822]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-[1.15rem]" /> : <Eye className="size-[1.15rem]" />}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {errorMessage ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              role="alert"
              className="rounded-lg bg-[#f7dfd5] px-4 py-3 text-sm font-semibold text-[#8a2f16]"
            >
              {errorMessage}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <button
          type="submit"
          disabled={busy}
          className="group flex h-14 w-full items-center justify-between rounded-xl bg-[#17130e] py-2 pl-5 pr-2 text-base font-bold text-white shadow-[0_16px_38px_rgba(48,35,22,0.16)] transition-[transform,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-[#2b241b] hover:shadow-[0_20px_44px_rgba(48,35,22,0.2)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <span>{busy ? "Opening workspace" : "Continue to workspace"}</span>
          <span className="grid size-10 place-items-center rounded-lg bg-[#f4b942] text-[#17130e]">
            {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-5 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1" aria-hidden="true" />}
          </span>
        </button>
      </form>

      <div className="mt-8 flex items-start gap-3 border-t border-[#d9cebe] pt-6 text-sm leading-6 text-[#766b5d]">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#a64a18]" aria-hidden="true" />
        <p>Access is limited to authorised administrators and delivery staff.</p>
      </div>
    </motion.div>
  );
}
