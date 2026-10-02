import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// Same root .env and data folder as the app (see apps/web/next.config.ts).
const root = path.resolve(import.meta.dirname, '../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.DATA_DIR = path.resolve(root, process.env.DATA_DIR || 'data');

const nextConfig: NextConfig = {
  transpilePackages: ['@autojobs/shared'],
  // QRIS image uploads go through Server Actions: 5 MB file + multipart overhead.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
        // As in the app (apps/web/next.config.ts): production only, Next.js needs inline scripts and styles.
        ...(process.env.NODE_ENV === 'production' ? [{
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
            "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
        }] : []),
      ],
    }];
  },
};

export default nextConfig;
