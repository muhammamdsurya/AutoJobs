import type { MetadataRoute } from 'next';

// Rendered per request, not at build time: the Docker build has no .env, so a static file would say localhost.
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/signup`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/legal`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
