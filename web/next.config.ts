import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared workspace ships TypeScript source, not a build.
  transpilePackages: ['@archive/shared'],
  // LinkedIn CDN photos are hotlinked, not stored. Optimising them through
  // next/image would proxy every avatar; plain <img> is the honest choice here.
  images: { unoptimized: true },
};

export default config;
