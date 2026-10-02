import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import '@autojobs/shared/globals.css';

// Self-hosted by Next at build time: no request to Google from the user's browser.
// Bricolage Grotesque for headlines, Geist for text, Geist Mono for numbers.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'AutoJobs: lamar kerja otomatis', template: '%s | AutoJobs' },
  description: 'Cari loker dan lamar kerja otomatis di JobStreet, Glints, dan LinkedIn dari satu profil. Hanya lowongan yang cocok, formulir terisi sendiri.',
  applicationName: 'AutoJobs',
  openGraph: {
    siteName: 'AutoJobs',
    title: 'AutoJobs: Lamar Kerja Otomatis di JobStreet, Glints & LinkedIn',
    description: 'Cari loker di tiga portal sekaligus. AutoJobs memilih lowongan yang pas dan mengisi formulir lamarannya. Coba 3x gratis.',
    // 1200x630 and small: link previews (WhatsApp skips large images) and search results.
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Dashboard AutoJobs: lamaran otomatis di JobStreet, Glints, dan LinkedIn' }],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og.jpg'] },
};

export const viewport: Viewport = { themeColor: '#0b0f17', colorScheme: 'dark', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
