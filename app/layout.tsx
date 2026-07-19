import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { BrandIntro } from "@/components/customer/BrandIntro";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/Manrope-Variable.ttf",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800"
});

const spaceMono = localFont({
  src: [
    { path: "./fonts/SpaceMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/SpaceMono-Bold.ttf", weight: "700", style: "normal" }
  ],
  variable: "--font-space-mono",
  display: "swap"
});
export const metadata: Metadata = {
  title: "Dish2Door",
  description: "Campus food ordering built around dependable quality, clear updates, and careful delivery."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceMono.variable}`}>
        <BrandIntro />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
