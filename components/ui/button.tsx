import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  default: "bg-neutral-950 text-white hover:bg-neutral-800",
  secondary: "bg-amber-300 text-neutral-950 hover:bg-amber-200",
  ghost: "bg-transparent text-neutral-900 hover:bg-neutral-900/5",
  outline: "border border-neutral-300 bg-white/70 text-neutral-900 hover:bg-white",
  destructive: "bg-red-600 text-white hover:bg-red-500"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-sm",
  md: "h-11 px-4",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10"
};

function buttonClasses(variant: ButtonVariant, size: ButtonSize) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-55",
    variants[variant],
    sizes[size]
  );
}

// globals.css sets `a { color: inherit }` outside any Tailwind layer, and unlayered rules
// beat layered utilities, so a link's text-white never applied and the primary link
// rendered black on black. The important (!) marks make the colour win for links only; a
// real <button> keeps the plain classes so a caller's own text colour can still override.
const linkText: Record<ButtonVariant, string> = {
  default: "text-white!",
  secondary: "text-neutral-950!",
  ghost: "text-neutral-900!",
  outline: "text-neutral-900!",
  destructive: "text-white!"
};

// Exported so a link (an <a>) can look exactly like a button without nesting a button in it.
export function linkButtonClasses(variant: ButtonVariant = "default", size: ButtonSize = "md") {
  return cn(buttonClasses(variant, size), linkText[variant]);
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    />
  )
);

Button.displayName = "Button";
