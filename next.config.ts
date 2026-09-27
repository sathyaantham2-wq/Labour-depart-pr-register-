import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next's default (1 MB) is too small for the Data Import screen's
      // uploaded .xlsx/.csv files, which are posted straight to a Server
      // Action. Matches the 10 MB cap enforced in
      // src/app/(app)/data-import/actions.ts.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
