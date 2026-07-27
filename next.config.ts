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
  // re-downloaded on every page view. These files are content-stable (renamed when they
  // change) so they cache hard. /uploads is admin-managed and can be replaced under the
  // same name, so it revalidates instead of being immutable.
  async headers() {
    const IMAGE_EXT = "jpg|jpeg|png|webp|avif|gif|svg|ico";
    return [
      {
        source: `/uploads/:path*.(${IMAGE_EXT})`,
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }]
      },
      {
        source: `/:path*.(${IMAGE_EXT})`,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/:path*.(woff|woff2|ttf|otf)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  }
};

export default nextConfig;
