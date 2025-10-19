import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Set the correct root to avoid workspace warnings
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
