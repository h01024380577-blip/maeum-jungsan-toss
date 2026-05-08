import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const isCSR = process.env.NEXT_BUILD_CSR === '1';
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: isCSR ? 'dist/web' : 'dist',
  ...(isCSR ? { output: 'export' } : {}),
  turbopack: {
    root: repoRoot,
  },
  images: {
    ...(isCSR ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
};

export default nextConfig;
