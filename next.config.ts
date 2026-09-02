import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // /team moved under /admin (Sept 2: Team + Settings tabs). Keep old bookmarks working.
    return [{ source: "/team", destination: "/admin/team", permanent: true }];
  },
};

export default nextConfig;
