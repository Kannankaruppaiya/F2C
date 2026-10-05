import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: false,
  serverExternalPackages: ["bcryptjs"],
  experimental: {
    // Middleware buffers request bodies; keep its cap aligned with MAX_UPLOAD_MB (+ multipart overhead).
    middlewareClientMaxBodySize: `${Number(process.env.MAX_UPLOAD_MB ?? 25) + 1}mb`,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
