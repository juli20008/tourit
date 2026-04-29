declare const process: any;
declare const require: any;

const TARGET_URL = 'https://www.realtor.ca/real-estate/29423687/1357-peakside-place-squamish';
const { writeFileSync } = require('node:fs');
const OUTPUT_FILE = 'raw_page.html';

async function main() {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutMs = 5000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(TARGET_URL, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const html = await response.text();
    const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const elapsedMs = Math.round(performance.now() - startedAt);
    writeFileSync(OUTPUT_FILE, html, 'utf8');

    console.log('STATUS:', response.status);
    console.log('ELAPSED_MS:', elapsedMs);
    console.log('OG_IMAGE_URL:', match?.[1] ?? null);
    console.log('RAW_HTML_SAVED_TO:', OUTPUT_FILE);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('SCRAPE_FAILED:', message);
  process.exitCode = 1;
});
