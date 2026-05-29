import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,

  // Prevent @huggingface/transformers from being bundled server-side.
  // It uses browser APIs (WebGPU, OffscreenCanvas, ONNX Runtime Web) that
  // don't exist in Node.js. The dynamic import in lib/depth-estimator.ts
  // only runs in the browser, but Next.js still tries to analyse the import
  // at build time — this tells it to skip the package on the server.
  serverExternalPackages: ["@huggingface/transformers"],

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
