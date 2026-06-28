#!/usr/bin/env node
/**
 * 补下载缺失附件 - 针对北成芳满庭/15幢1单元501 的评估报告
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const iconv = require('iconv-lite');

const BASE_DIR = path.resolve(__dirname, '..');
const CHROME_EXE = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find(p => fs.existsSync(p));
const PROFILE_DIR = path.join(BASE_DIR, '.chrome_profile');

async function run() {
  const itemLink = 'https://sf.taobao.com/spc_item.htm?id=72EA695D96CF476DE3EDA8206E42C30D';
  const attachDir = path.join(BASE_DIR, '仁和社区总览', '芳甸社区', '北成芳满庭', '15幢1单元501', '附件');

  console.log('启动浏览器...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_EXE,
    userDataDir: PROFILE_DIR,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('导航到页面...');
  await page.goto(itemLink, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for download section
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const hasDl = await page.evaluate(() => !!document.getElementById('J_DownLoadFirst')).catch(() => false);
    if (hasDl) { console.log('页面加载完成'); break; }
    console.log(`等待... ${i + 1}/6`);
  }

  // Extract download links
  const links = await page.evaluate(() => {
    const dl = document.getElementById('J_DownLoadFirst');
    if (!dl) return [];
    return Array.from(dl.querySelectorAll('a')).map(a => a.href).filter(h => h);
  });
  console.log('附件链接:', links.length, '个');

  // Get cookies
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Download each attachment
  for (const url of links) {
    console.log('下载:', url.slice(0, 80));
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://sf-item.taobao.com/',
        'Cookie': cookieHeader,
      };
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (!resp.ok) { console.log('  HTTP', resp.status); continue; }

      // Get filename from Content-Disposition
      const cd = resp.headers.get('content-disposition') || '';
      let filename = null;
      if (cd.includes('filename')) {
        const m = cd.match(/filename="?([^";'\n]+)"?/i);
        if (m) {
          const raw = m[1].trim();
          try { filename = decodeURIComponent(raw); } catch { filename = raw; }
          // GB2312 fallback
          if (filename) {
            const buf = Buffer.from(filename, 'latin1');
            const decoded = iconv.decode(buf, 'gb2312');
            if (decoded && !/[\ufffd]{2,}/.test(decoded)) filename = decoded;
          }
        }
      }
      if (!filename) {
        filename = path.basename(new URL(url).pathname);
        if (url.includes('attach_id=')) filename = url.split('attach_id=')[1].split('&')[0] + '.pdf';
      }
      if (!filename || filename === '/') filename = crypto.createHash('md5').update(url).digest('hex').slice(0, 16) + '.pdf';

      // Sanitize Windows illegal characters
      filename = filename.replace(/[\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

      const savePath = path.join(attachDir, filename);
      if (fs.existsSync(savePath) && fs.statSync(savePath).size > 2000) {
        console.log('  已存在:', filename);
        continue;
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(savePath, buf);
      console.log('  下载成功:', filename, `(${(buf.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.log('  下载失败:', e.message);
    }
  }

  await browser.close();
  console.log('完成');
}

run().catch(e => { console.error(e); process.exit(1); });
