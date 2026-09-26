import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { BrandIntro } from "@/components/customer/BrandIntro";
import { MotionProvider } from "@/components/MotionProvider";
import { NavigationProgress } from "@/components/NavigationProgress";
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

// Tints the mobile browser bar to the page's cream background instead of plain white.
export const viewport: Viewport = {
  themeColor: "#f7f3eb"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint: a visitor who already saw the intro this session
            must not get a flash of it while the page hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('dish2door-intro-seen'))document.documentElement.classList.add('intro-seen')}catch(e){}" }} />
      </head>
      <body className={`${manrope.variable} ${spaceMono.variable}`}>
        <MotionProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <BrandIntro />
          {children}
        </MotionProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
