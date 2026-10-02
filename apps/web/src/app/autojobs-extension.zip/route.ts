import { extensionZip } from '@/lib/extension-package';

// "Unduh ekstensi" on Koneksi Portal: the extension for "Load unpacked", set up for this server's address.
export async function GET() {
  const body = await extensionZip(process.env.APP_URL ?? 'http://localhost:3000');
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="autojobs-extension.zip"',
      'cache-control': 'no-store', // a new version is picked up right away
    },
  });
}
