import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/extract-pdf": ["./node_modules/pdf-parse/dist/worker/pdf.worker.mjs"],
  },
};

export default nextConfig;
