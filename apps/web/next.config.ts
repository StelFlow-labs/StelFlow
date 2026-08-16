import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The generated contract bindings ship as TypeScript source rather than a
  // built package, so Next has to compile them alongside the app.
  transpilePackages: ["stelflow-sdk"],
};

export default nextConfig;
