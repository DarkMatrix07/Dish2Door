import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      {
        protocol: "https",
        hostname: "images.pexels.com"
      }
    ]
  },
  // Next serves /public with `Cache-Control: public, max-age=0`, so shared imagery was
  // re-downloaded on every page view. Caching these hard is safe because every image
  // URL is content-stable: bundled art is renamed when it changes, and menu uploads are
  // written as `<timestamp>-<uuid>.webp`, so replacing an item's photo yields a NEW url
  // rather than mutating an existing one.
  async headers() {
    const IMAGE_EXT = "jpg|jpeg|png|webp|avif|gif|svg|ico";
    return [
      {
        source: `/:path*.(${IMAGE_EXT})`,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/:path*.(woff|woff2|ttf|otf)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy-Report-Only", value: "frame-ancestors 'none'; object-src 'none'" },
          // Production only: browsers ignore HSTS over plain http, and sending it from a
          // local or staging build over https would pin that host to https for a year.
          // No includeSubDomains and no preload on purpose, so this stays reversible.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : [])
        ]
      }
    ];
  }
};

export default nextConfig;
