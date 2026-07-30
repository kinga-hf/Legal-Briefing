import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/extract-pdf": [
      "./public/pdf.worker.mjs",
      "./node_modules/pdf-parse/dist/worker/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
