import type { MetadataRoute } from 'next';

// Rendered per request, not at build time: the Docker build has no .env, so a static file would say localhost.
export const dynamic = 'force-dynamic';

// Only the public pages are worth indexing; the app itself sits behind a login.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/campaigns', '/report', '/profile', '/connections', '/token', '/guide', '/autojobs-extension.zip',
        '/verify-email', '/reset-password', '/forgot-password',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
