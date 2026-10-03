// Opens the single-file build in headless Chromium (software WebGL) with the
// control bar hidden and the construction clock stopped, ready to be driven
// through the page's own hook (window.__mosaic). The page itself is unchanged.
// Set PLAYWRIGHT to the path of playwright's index.mjs if it is not installed
// where Node can resolve it.

import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const PAGE = new URL('../dist/solve-mosaic.html', import.meta.url);

export async function openMosaic(width = 1280, height = 720) {
  if (!fs.existsSync(PAGE)) throw new Error('dist/solve-mosaic.html is missing: run npm run build');
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(PAGE.href);
  await page.waitForFunction(() => window.__mosaic, null, { timeout: 180000 });
  await page.addStyleTag({ content: '#bar{display:none!important} #loading{display:none!important}' });
  await page.evaluate(() => {
    window.__mosaic.setSpeed(0);
    window.dispatchEvent(new Event('resize'));
  });
  return { browser, page };
}
