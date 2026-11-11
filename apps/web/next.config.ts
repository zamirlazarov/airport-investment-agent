import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { fileURLToPath } from "node:url";

const eveRoot = fileURLToPath(new URL("../..", import.meta.url));

// One `.env.local` at the repo root serves both the agent and the Next app.
loadEnvConfig(eveRoot);

const nextConfig: NextConfig = {
  // `lib/` at the repo root is shared by the agent tools and this app (`@core/*`).
  experimental: { externalDir: true },
};

export default withEve(nextConfig, { eveRoot });
