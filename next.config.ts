import type { NextConfig } from "next";
import { deploymentDemoEnabled } from "./lib/runtime-mode";

const config: NextConfig = {
  poweredByHeader: false,
  images: { qualities: [75, 90] },
  async rewrites() {
    if (deploymentDemoEnabled(process.env)) return [];
    // Express must win over the demo handler for normal local/hosted operation.
    return { beforeFiles: [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/:path*` }] };
  },
};
export default config;
