import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next", // lets CI/build checks run without touching a live dev server
  // The browser only talks to Next; Next proxies /api to FastAPI (no CORS, one origin).
  experimental: {
    // Next buffers proxied request bodies and silently truncates them at 10 MB by default, which turned
    // every upload over 10 MB into a 500. Match the backend's own upload limit (MAX_UPLOAD_BYTES, 2 GiB).
    middlewareClientMaxBodySize: "2gb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
};

export default nextConfig;
