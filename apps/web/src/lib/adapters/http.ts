import * as cheerio from 'cheerio';

// Same approach as the reference scrapers: plain HTTPS GET of public pages with a browser user agent.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html,application/json', 'accept-language': 'id-ID,id;q=0.9,en;q=0.8', ...headers },
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      if (attempt < 2) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`Gagal menghubungi ${new URL(url).host}: ${e instanceof Error ? e.message : e}`);
    }
    if (res.ok) return res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(8000 * (attempt + 1)); continue; }
    throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`);
  }
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('br').replaceWith('\n');
  $('p, li, div, h1, h2, h3, h4, h5, tr').each((_, el) => { $(el).append('\n'); });
  return $.root().text().replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// indexOf only, no regex: linear on any page (pages can come from a user's browser, and a page repeating the opening
// tag made a regex here take seconds).
export function nextData(html: string): any {
  const at = html.indexOf('<script id="__NEXT_DATA__" type="application/json"');
  const start = at < 0 ? -1 : html.indexOf('>', at) + 1;
  const end = start > 0 ? html.indexOf('</script>', start) : -1;
  if (end < 0) throw new Error('__NEXT_DATA__ tidak ditemukan (struktur halaman berubah?)');
  return JSON.parse(html.slice(start, end));
}

export const isAllIndonesia = (location: string) => !location.trim() || /^indonesia$/i.test(location.trim());

// CAPTCHA / "are you human" walls (Cloudflare and similar). Nothing in AutoJobs solves these: the user does, in their browser.
export const CHALLENGE_TITLE = /tunggu sebentar|just a moment|attention required/.source;
export const CHALLENGE_TEXT = /solve the captcha|confirm you are human|verifikasi bahwa anda (adalah )?manusia|not a robot|bukan robot|unusual traffic|lalu lintas yang tidak biasa/.source;
