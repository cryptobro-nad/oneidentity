import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. A stray lockfile in the user's home directory
  // otherwise makes Turbopack infer C:\Users\youna as the root.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  // The Envio HyperSync client is a native (napi) module used only in
  // server-side asset discovery. Keep it external so the bundler never tries
  // to inline its .node binary, and it is only ever loaded in the Node runtime.
  serverExternalPackages: ["@envio-dev/hypersync-client"],
};

export default nextConfig;
