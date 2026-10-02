import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// Monorepo: one .env at the repo root for both apps, the worker and the scripts (variables already set, e.g. by
// Docker, win), and a relative DATA_DIR is relative to the root, so everything shares one data folder.
const root = path.resolve(import.meta.dirname, '../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
process.env.DATA_DIR = path.resolve(root, process.env.DATA_DIR || 'data');

// Defence in depth on top of React's escaping: no plugins, no framing, no <base> or form hijacking, nothing loaded from
// or sent to other origins. Next.js needs inline scripts and styles; development also needs eval: production only.
const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'",
  "form-action 'self' https://accounts.google.com", "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  transpilePackages: ['@autojobs/shared'],
  // CV uploads go through Server Actions: 5 MB file + multipart overhead.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  // Dev server only: also allow opening the app as http://127.0.0.1:3000 (Next 16 blocks non-localhost dev origins).
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
        ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
      ],
    }];
  },
};

export default nextConfig;
