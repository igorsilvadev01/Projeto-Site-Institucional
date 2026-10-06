import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.PORTFOLIO_CAPTURE_URL || 'http://127.0.0.1:3000';
const output = path.join(root, 'docs/images');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'home-desktop.png') });
  for (const route of ['/', '/sobre', '/contato', '/avaliacao-de-terceiros', '/login', '/newsletter']) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    if (await page.locator('body').evaluate(el => el.scrollWidth > innerWidth + 1)) throw new Error('Overflow desktop: ' + route);
    if (await page.locator('.portfolio-banner').count() !== 1) throw new Error('Banner ausente: ' + route);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/sobre', '/contato', '/avaliacao-de-terceiros', '/login', '/newsletter']) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    if (await page.locator('body').evaluate(el => el.scrollWidth > innerWidth + 1)) throw new Error('Overflow mobile: ' + route);
    if (route === '/') await page.screenshot({ path: path.join(output, 'home-mobile.png'), fullPage: true });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#172d29;color:#f5f7f2;font-family:Arial,sans-serif;padding:64px;height:630px;display:flex;flex-direction:column;justify-content:space-between}
    .top{display:flex;justify-content:space-between;align-items:center;font-size:16px;letter-spacing:3px;color:#c6ded0}.pill{border:1px solid #476356;border-radius:40px;padding:14px 20px;font-size:13px;letter-spacing:1px}
    h1{font-size:80px;line-height:1.02;letter-spacing:-5px;margin:0;font-weight:600}h1 span{color:#a2d8b7}p{font-size:23px;line-height:1.5;color:#c6ded0;max-width:780px;margin:22px 0 0}
    .bottom{display:flex;justify-content:space-between;border-top:1px solid #476356;padding-top:22px;color:#c6ded0;font-size:16px}.bottom b{color:#f5f7f2}
    </style><body><div class="top"><span>DESENVOLVIMENTO WEB / PORTFÓLIO</span><span class="pill">01 · PRIMEIRO PROJETO CONQUISTADO</span></div><div><h1>Ideias que<br/><span>ganham forma.</span></h1><p>Uma plataforma de privacidade, governança e segurança.<br/>Da necessidade real à experiência digital.</p></div><div class="bottom"><b>Next.js · React · JavaScript · SQLite</b><span>Versão pública anonimizada</span></div></body></html>`);
  await page.screenshot({ path: path.join(root, 'public/portfolio-cover.png') });
  await fs.copyFile(path.join(root, 'public/portfolio-cover.png'), path.join(output, 'linkedin-cover.png'));
  console.log('Capturas desktop e mobile, capa para LinkedIn e seis rotas verificadas em duas larguras, sem overflow ou erros JavaScript.');
} finally { await browser.close(); }
