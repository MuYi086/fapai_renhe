#!/usr/bin/env node
/**
 * 仁和房产法拍详情抓取脚本 (fetch_all - Node.js + Puppeteer 版)
 *
 * 合并 Task3 + Task4 修正：
 *   1. 当前楼层从 property_address 标题中提取（如 "302室" → 3）
 *   2. 土地剩余使用期限 → 房产截至日期（当前日期 + 剩余年限）
 *   3. family-tahoma: 下标1=起拍价，下标2=评估价
 *   4. 附件: class="desc-att-item" 的 href
 *   5. 图片: class="slide-bigpic" 内部 img 的 src
 *   6. 视频: id="player" 的 data-src
 *
 * 用法：node scripts/fetch_all.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const iconv = require('iconv-lite');

// 全局错误处理
process.on('uncaughtException', (e) => {
  console.error('[UNCAUGHT]', e.message, e.stack);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('[UNHANDLED]', e);
});

// ======================== 配置 ========================
const BASE_DIR = path.resolve(__dirname, '..');
const DATA_JSON = path.join(BASE_DIR, 'result', '仁和房产.json');
const COMMUNITY_DIR = path.join(BASE_DIR, '仁和社区总览');
const PROGRESS_FILE = path.join(BASE_DIR, 'result', 'progress_fetch_all.json');
const LOG_FILE = path.join(BASE_DIR, 'result', 'fetch_all.log');

const CHROME_EXE = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
].find(p => fs.existsSync(p));

const PROFILE_DIR = path.join(BASE_DIR, '.chrome_profile');

const MIN_DELAY = 3000;
const MAX_DELAY = 7000;
const DOWNLOAD_DELAY_MIN = 800;
const DOWNLOAD_DELAY_MAX = 2000;
const PAGE_LOAD_TIMEOUT = 45000;

// ======================== 小区映射 ========================
const ESTATE_MAP = {
  '仁和印象': '獐山社区', '清合嘉园东区': '獐山社区', '清合嘉园西区': '獐山社区',
  '金鼎阳光': '獐山社区', '金鼎公寓': '獐山社区', '金阳湾': '獐山社区',
  '余山花苑': '獐山社区', '仁合银庭': '獐山社区', '渔港嘉园': '獐山社区',
  '启歆府': '獐山社区', '启航城': '獐山社区',
  '云和雅园': '和庭社区', '北上星云府': '和庭社区', '尚堂九里': '和庭社区',
  '金顶华庭': '和庭社区', '花和雅居': '和庭社区', '怡然府': '和庭社区',
  '仁良花苑': '芳甸社区', '北成芳满庭': '芳甸社区',
  '和平雅苑': '和宸社区', '仁惠家园': '和宸社区', '美的兰庭': '和宸社区',
  '春色满园': '和宸社区',
};
const ESTATE_ALIASES = {
  '美地兰庭': '美的兰庭', '尚堂久里': '尚堂九里',
  '金鼎阳光公寓': '金鼎阳光', '仁和金鼎公寓': '金鼎公寓',
  '仁和北成芳满庭': '北成芳满庭', '金鼎华庭': '金顶华庭',
};
const ALL_ESTATE_NAMES = [
  ...Object.keys(ESTATE_MAP), ...Object.keys(ESTATE_ALIASES)
].sort((a, b) => b.length - a.length);

// ======================== 工具函数 ========================
function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8'); } catch {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randDelay = (min, max) => sleep(min + Math.random() * (max - min));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

// ======================== 进度管理 ========================
class Progress {
  constructor(filePath) {
    this.path = filePath;
    this.data = { count: 0, total: 0, skipped: 0, errors: [] };
    if (fs.existsSync(this.path)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.path, 'utf-8'));
        log(`已加载进度: count=${this.data.count}, skipped=${this.data.skipped || 0}`);
      } catch {}
    }
  }
  save() { try { fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8'); } catch {} }
  get count() { return this.data.count || 0; }
  set count(v) { this.data.count = v; this.save(); }
  set total(v) { this.data.total = v; }
  incSkipped() { this.data.skipped = (this.data.skipped || 0) + 1; }
  addError(idx, info, reason) {
    (this.data.errors = this.data.errors || []).push({
      index: idx, info: String(info).slice(0, 80),
      reason: String(reason).slice(0, 200), time: new Date().toISOString()
    });
    this.save();
  }
}

// ======================== 地址解析 ========================
function extractEstate(address) {
  if (!address) return [null, null];
  for (const [alias, standard] of Object.entries(ESTATE_ALIASES)) {
    if (address.includes(alias)) return [standard, ESTATE_MAP[standard] || null];
  }
  for (const name of ALL_ESTATE_NAMES) {
    if (address.includes(name)) {
      const standard = ESTATE_ALIASES[name] || name;
      return [standard, ESTATE_MAP[standard] || null];
    }
  }
  return [null, null];
}

function extractBuilding(address) {
  if (!address) return null;
  const patterns = [
    { re: /(\d+)\s*[幢栋]\s*(\d+)\s*单元\s*(\d+)\s*(?:室|号)?/, fmt: g => `${g[0]}幢${g[1]}单元${g[2]}` },
    { re: /(\d+)\s*[幢栋]\s*(\d+)\s*门\s*(\d+)\s*(?:室|号)?/, fmt: g => `${g[0]}幢${g[1]}门${g[2]}` },
    { re: /(\d+)[幢栋](\d+)单元(\d+)(?:室|号)?/, fmt: g => `${g[0]}幢${g[1]}单元${g[2]}` },
    { re: /(\d+)[幢栋](\d+)[门](\d+)(?:室|号)?/, fmt: g => `${g[0]}幢${g[1]}门${g[2]}` },
    { re: /(\d+)[幢栋](\d+)(?:室|号)?/, fmt: g => `${g[0]}幢${g[1]}` },
    { re: /(\d+)[幢栋]北(\d+)#/, fmt: g => `${g[0]}幢北${g[1]}#` },
  ];
  for (const { re, fmt } of patterns) {
    const m = address.match(re);
    if (m) return fmt(m.slice(1));
  }
  return null;
}

function isLocal(address) {
  if (!address) return false;
  for (const kw of ['河北省', '唐山市', '安徽省', '亳州市', '蒙城县']) {
    if (address.includes(kw)) return false;
  }
  return (address.includes('杭州') && address.includes('余杭')) ||
    address.includes('仁和街道') || address.includes('仁和镇');
}

// ======================== Task4 修正 #1: 从标题提取当前楼层 ========================
function extractFloorFromAddress(address) {
  if (!address) return '';
  // 匹配房间号，如 "302室", "1002室", "1801室"
  const m = address.match(/(\d+)\s*(?:室|号)/);
  if (!m) return '';
  const roomNo = m[1];
  if (roomNo.length >= 3) {
    // 302 → 3楼, 1002 → 10楼, 1801 → 18楼
    return String(parseInt(roomNo.substring(0, roomNo.length - 2), 10));
  }
  // 2位数如 "02" 或 "3" → 可能是单层
  if (roomNo.length === 2) return String(parseInt(roomNo[0], 10));
  if (roomNo.length === 1) return roomNo;
  return '';
}

// ======================== Task4 修正 #2: 房产截至日期 ========================
function calcPropertyDeadline(rawText) {
  const text = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const now = new Date();

  // 尝试提取"土地剩余使用期限"（年数）
  const remainMatch = text.match(
    /(?:土地剩余使用期限|土地剩余年限|剩余使用年限)[：:\s]*(?:约)?([\d.]+)\s*年/
  );
  if (remainMatch) {
    const years = parseFloat(remainMatch[1]);
    if (!isNaN(years) && years > 0) {
      const deadline = new Date(now);
      deadline.setFullYear(deadline.getFullYear() + Math.floor(years));
      const extraMonths = Math.round((years - Math.floor(years)) * 12);
      deadline.setMonth(deadline.getMonth() + extraMonths);
      return formatDate(deadline);
    }
  }

  // 尝试提取"使用期限"中的日期
  const periodMatch = text.match(
    /(?:使用期限|土地使用权期限|土地使用期限)[：:\s]*[^；;。]*?(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/
  );
  if (periodMatch) {
    const y = parseInt(periodMatch[1], 10);
    const m = parseInt(periodMatch[2], 10) - 1;
    const d = parseInt(periodMatch[3], 10);
    const deadline = new Date(y, m, d);
    if (!isNaN(deadline.getTime()) && deadline > now) {
      return formatDate(deadline);
    }
  }

  // 尝试 "至 XXXX年XX月XX日" 格式
  const untilMatch = text.match(
    /(?:至|到)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/
  );
  if (untilMatch) {
    const y = parseInt(untilMatch[1], 10);
    const m = parseInt(untilMatch[2], 10) - 1;
    const d = parseInt(untilMatch[3], 10);
    const deadline = new Date(y, m, d);
    if (!isNaN(deadline.getTime())) {
      return formatDate(deadline);
    }
  }

  return '无';
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}年${m}月${day}日`;
}

// ======================== 文本解析 ========================
function parseDescText(rawText) {
  const text = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const result = {};

  function tryPatterns(patterns) {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return (m[1] || m[0]).trim();
    }
    return '';
  }

  // 法院裁定书
  result['法院裁定书'] = tryPatterns([/[（(]\d{4}[）)][^；;。]*?执\d+号/]) || '';

  // 房地产性质
  result['房地产性质'] = tryPatterns([
    /(?:权利性质|房地产性质)[：:\s为]+([^；;。，,]{1,30}?)(?=\s*(?:占有情况|是否已腾空|租赁情况|权利限制|查封|登记日期|共有情况|权利状态|使用期限|权证号|评估|起拍|特别|$))/,
    /(?:权利性质|房地产性质)[：:\s为]+([^；;。，,]{1,30})/,
  ]);

  // 建筑面积
  result['建筑面积'] = tryPatterns([
    /(?:房屋)?建筑(?:总)?面积[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
    /建筑总面积[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  // 套内面积
  result['套内面积'] = tryPatterns([
    /(?:套内面积|套内建筑面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  // 土地使用权面积
  result['土地使用权面积'] = tryPatterns([
    /(?:土地使用权面积|土地总面积|土地面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  // 分摊面积
  result['分摊面积'] = tryPatterns([
    /(?:分摊面积|分摊建筑面积|公摊(?:总)?面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  // 建筑年份
  result['建筑年份'] = tryPatterns([
    /(?:建筑年份|建成年份|建造年份|竣工年份|竣工时间|建成时间)[：:\s]*(?:约)?(\d{4})/,
    /(\d{4})\s*(?:年)?\s*(?:建成|竣工|建造)/,
    /(?:建成|竣工|建造)(?:于)?\s*(\d{4})\s*年/,
  ]);

  // 占有情况
  result['占有情况'] = tryPatterns([
    /占有情况[：:\s]*([^；;。]{1,20}?)(?=\s*(?:是否|腾空|租赁|经营|权利|评估|$))/,
  ]);

  // 是否已腾空
  result['是否已腾空'] = tryPatterns([
    /(?:是否已腾空|腾空情况)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:租赁|经营|钥匙|权利|评估|$))/,
  ]);

  // 租赁情况
  result['租赁情况'] = tryPatterns([
    /租赁情况[：:\s]*([^；;。]{1,20}?)(?=\s*(?:经营|钥匙|权利|评估|特别|$))/,
    /(?:有无租赁|是否带租)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:经营|钥匙|权利|评估|特别|$))/,
  ]);

  // 用途
  result['用途'] = tryPatterns([
    /(?:规划)?用途[：:\s为]*([^；;。]{1,50}?)(?=\s*(?:建筑结构|楼层|总楼层|建筑年份|建成年份|朝向|空间|梯户|土地|评估|起拍|特别|登记日期|权证号|建筑面积|权利|平面|查封|室内|装修|竣工|分摊|$))/,
    /(?:规划)?用途[：:\s为]*([^；;。]{1,30})/,
  ]);
  if (result['用途'] && result['用途'].length <= 1) result['用途'] = '';

  // 总楼层
  result['总楼层'] = tryPatterns([
    /总楼层[：:\s]*(?:为)?(\d+)\s*层/,
    /地上总楼层[：:\s]*(?:为)?(\d+)\s*层/,
    /总层数[：:\s]*(?:为)?(\d+)\s*层/,
    /共\s*(\d+)\s*层/,
    /(?:地上|总计?)(\d+)\s*层/,
  ]);

  // 朝向
  result['朝向'] = tryPatterns([
    /朝向[：:\s]*([^；;。]{1,20}?)(?=\s*(?:空间|内部|装修|梯户|土地|评估|起拍|特别|建筑功能|建筑外观|建筑年份|平面布局|维护|所处|小区|入户门|（\d+）|装饰装修|$))/,
    /(?:房屋朝向|坐向)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:空间|内部|装修|梯户|土地|评估|起拍|特别|$))/,
  ]);

  // 空间布局/内部格局
  result['空间布局'] = tryPatterns([
    /(?:空间布局|内部格局)[：:\s]*(?:拍卖对象内部格局为)?([^；;。]{2,80}?)(?=\s*(?:装饰装修|装修|梯户比|土地|评估|起拍|特别|室内装修|入户门|维护状况|建筑功能|建筑外观|（\d+）|拍卖对象入户门|$))/,
    /户型[：:\s]*([^；;。]{2,60}?)(?=\s*(?:装饰装修|装修|梯户比|土地|评估|起拍|特别|$))/,
  ]);

  // 梯户比
  result['梯户比'] = tryPatterns([
    /梯户比[：:\s]*(?:所在单元)?([^；;。]{2,60}?)(?=\s*(?:土地|评估|起拍|特别|$))/,
    /(?:平面布局|梯户)[：:\s]*([一二三四五六七八九十\d]+梯[一二三四五六七八九十\d]+户)/,
    /([一二三四五六七八九十两\d]+梯[一二三四五六七八九十两\d]+户)/,
  ]);

  // 土地剩余使用期限（原始值，用于计算房产截至日期）
  result['土地剩余使用期限_raw'] = tryPatterns([
    /(?:土地剩余使用期限|土地剩余年限|剩余使用年限)[：:\s]*([^；;。]{1,30})/,
    /(?:土地使用期限|使用权期限)[：:\s]*至\s*([^；;。]{1,20})/,
    /(?:终止日期|到期日期)[：:\s]*([^；;。]{1,20})/,
  ]);

  // 特别提醒
  const rm = text.match(/特别提醒[：:\s]*(.+?)(?=竞买记录|$)/);
  result['特别提醒'] = rm ? rm[1].trim().slice(0, 2000) : '';

  const jm = text.match(/竞买记录[：:\s]*([^.。]{1,50})/);
  result['竞买记录'] = jm ? jm[1].trim() : '无';

  return result;
}

function isInfoComplete(info) {
  if (!info || !info['建筑面积']) return false;
  return !!(info['建筑年份'] || info['房地产性质']);
}

// ======================== 资源下载 ========================
async function downloadFile(url, saveDir, cookieHeader, label) {
  try {
    await randDelay(DOWNLOAD_DELAY_MIN, DOWNLOAD_DELAY_MAX);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://sf-item.taobao.com/',
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const resp = await fetch(url, { headers, redirect: 'follow' });
    if (!resp.ok) { log(`  [${label}] HTTP ${resp.status}`); return false; }

    let filename = null;
    const cd = resp.headers.get('content-disposition') || '';
    if (cd.includes('filename')) {
      // Try filename*=UTF-8'' first (RFC 5987)
      const mUtf8 = cd.match(/filename\*=(?:UTF-8'')([^"';'\n]+)/i);
      if (mUtf8) {
        try { filename = decodeURIComponent(mUtf8[1].trim()); } catch {}
      }
      // Try filename="..." or filename=...
      if (!filename) {
        const m = cd.match(/filename="?([^";'\n]+)"?/i);
        if (m) {
          const raw = m[1].trim();
          // Try UTF-8 decode first
          try { filename = decodeURIComponent(raw); } catch { filename = raw; }
          // If garbled GBK/GB2312 (high Latin-1 chars), re-decode using GBK
          if (filename && /[\x80-\xff]{4,}/.test(filename)) {
            const buf = Buffer.from(filename, 'latin1');
            const decoded = iconv.decode(buf, 'gbk');
            if (decoded && !/[\x80-\xff]{4,}/.test(decoded)) filename = decoded;
          }
        }
      }
    }
    if (!filename) {
      filename = path.basename(new URL(url).pathname);
      if (url.includes('attach_id=')) {
        filename = url.split('attach_id=')[1].split('&')[0] + '.pdf';
      }
    }
    if (!filename || filename === '/' || filename === '\\') {
      const extMap = { '附件': '.pdf', '图片': '.jpg', '视频': '.mp4' };
      filename = crypto.createHash('md5').update(url).digest('hex').slice(0, 16) + (extMap[label] || '.bin');
    }

    // 清理 Windows 非法字符
    filename = filename.replace(/[\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    if (!filename) filename = crypto.createHash('md5').update(url).digest('hex').slice(0, 16) + '.bin';

    const savePath = path.join(saveDir, filename);
    if (fs.existsSync(savePath) && fs.statSync(savePath).size > 0) {
      log(`  [${label}] 已存在: ${filename}`);
      return true;
    }

    ensureDir(saveDir);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(savePath, buf);
    log(`  [${label}] 下载成功: ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (e) {
    log(`  [${label}] 下载失败: ${e.message}`);
    return false;
  }
}

// ======================== 页面提取 JS（Task4 修正版）========================
const EXTRACT_JS = `(() => {
  // 基础信息文本
  const desc = document.getElementById('J_desc');
  const descText = desc ? desc.innerText : '';

  // Task4 #4: 附件 - class="desc-att-item" 的 href
  let downloadLinks = [];
  const attItems = document.querySelectorAll('.desc-att-item');
  if (attItems.length) {
    downloadLinks = Array.from(attItems).map(el => {
      const a = el.tagName === 'A' ? el : el.querySelector('a');
      return a ? (a.href || a.getAttribute('href') || '') : '';
    }).filter(h => h && (h.includes('download_attach') || h.includes('attach_id')));
  }
  // 回退：如果 desc-att-item 没找到，尝试 J_DownLoadFirst
  if (!downloadLinks.length) {
    const dlDiv = document.getElementById('J_DownLoadFirst');
    if (dlDiv) downloadLinks = Array.from(dlDiv.querySelectorAll('a')).map(a => a.href).filter(h => h && (h.includes('download_attach') || h.includes('attach_id')));
  }
  if (!downloadLinks.length) {
    downloadLinks = Array.from(document.querySelectorAll('a[href*="download_attach"]')).map(a => a.href);
  }

  // Task4 #3: family-tahoma - 下标1=起拍价，下标2=评估价
  let evalPrice = '', startPrice = '';
  const tahomaEls = document.querySelectorAll('.family-tahoma');
  if (tahomaEls.length >= 3) {
    startPrice = (tahomaEls[1] ? tahomaEls[1].innerText.trim() : '');
    evalPrice = (tahomaEls[2] ? tahomaEls[2].innerText.trim() : '');
  } else {
    // 回退：按文本内容匹配
    tahomaEls.forEach(el => {
      const p = el.parentElement;
      if (!p || !p.innerText) return;
      if (p.innerText.includes('评估价') && !p.innerText.includes('起拍价')) evalPrice = el.innerText.trim();
      if (p.innerText.includes('起拍价')) startPrice = el.innerText.trim();
    });
  }

  // Task4 #5: 图片 - 按优先级获取，只取本房源图片容器
  let picLinks = [];

  // 优先级1: class="slide-bigpic" 内部 img（每个幻灯片项都有这个class）
  const bigpics = document.querySelectorAll('.slide-bigpic img');
  if (bigpics.length) {
    picLinks = Array.from(bigpics).map(img => img.src || img.dataset.src || '').filter(Boolean);
  }

  // 优先级2: .sf-pic-slide 容器内所有 img（仅当前一个为空时使用）
  if (!picLinks.length) {
    const sfPic = document.querySelector('.sf-pic-slide');
    if (sfPic) {
      picLinks = Array.from(sfPic.querySelectorAll('img'))
        .map(img => img.dataset.src || img.src || '').filter(Boolean);
    }
  }
  // 不再做全页面搜索，避免抓入其他房源/推荐的图片

  // Task4 #6: 视频 - id="player" 的 data-src
  let videoUrl = '';
  const player = document.getElementById('player');
  if (player) {
    videoUrl = player.dataset.src || player.getAttribute('data-src') || '';
    if (!videoUrl) {
      const v = player.querySelector('video');
      if (v) videoUrl = v.src || v.dataset.src || '';
    }
    if (!videoUrl) {
      const s = player.querySelector('source');
      if (s) videoUrl = s.src || '';
    }
  }
  if (!videoUrl) {
    const m = document.body.innerHTML.match(/cloud\\.video\\.taobao\\.com[^"'\\s]*\\.mp4/);
    if (m) videoUrl = 'http://' + m[0];
  }

  return JSON.stringify({ descText, downloadLinks, picLinks, videoUrl, evalPrice, startPrice });
})()`;

// ======================== 主流程 ========================
class FetchAllFetcher {
  constructor() {
    this.progress = new Progress(PROGRESS_FILE);
    this.browser = null;
    this.page = null;
    this.running = true;
  }

  async init() {
    if (!CHROME_EXE) throw new Error('未找到 Chrome 浏览器');
    log(`Chrome: ${CHROME_EXE}`);
    log(`Profile: ${PROFILE_DIR}`);

    log('启动 Chrome（首次运行需手动登录淘宝）...');
    this.browser = await puppeteer.launch({
      executablePath: CHROME_EXE,
      userDataDir: PROFILE_DIR,
      headless: false,
      defaultViewport: null,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,900',
      ],
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();

    log('检查淘宝登录状态...');
    try {
      await this.page.goto('https://sf.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(3000);
    } catch (e) {
      log(`  导航失败: ${e.message}`);
    }

    const currentUrl = this.page.url();
    if (currentUrl.includes('login.taobao') || currentUrl.includes('login_jump')) {
      log('');
      log('========================================');
      log('  请在弹出的 Chrome 窗口中登录淘宝账号');
      log('  登录完成后脚本将自动继续');
      log('========================================');
      log('');
      await this.waitForLogin();
    } else {
      log('淘宝已登录 ✓');
    }
  }

  async waitForLogin() {
    const start = Date.now();
    const timeout = 300000;
    while (Date.now() - start < timeout) {
      await sleep(5000);
      try {
        await this.page.goto('https://sf.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
        await sleep(2000);
        const url = this.page.url();
        if (!url.includes('login') && !url.includes('login_jump')) {
          log('登录成功！');
          return;
        }
      } catch {}
      const elapsed = Math.round((Date.now() - start) / 1000);
      log(`  等待登录中... (${elapsed}s)`);
    }
    throw new Error('登录超时（5分钟）');
  }

  async navigateToPage(url) {
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT });
    } catch (e) {
      log(`  页面导航异常: ${e.message}`);
    }

    for (let i = 0; i < 8; i++) {
      await sleep(3000);
      const hasDesc = await this.page.evaluate(() => !!document.getElementById('J_desc')).catch(() => false);
      if (hasDesc) {
        // 滚动页面触发懒加载
        await this.page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight || totalHeight > 10000) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
        await sleep(2500);
        log('  页面加载完成');
        return true;
      }
      const cur = this.page.url();
      if (cur.includes('login.taobao')) {
        log('  需要重新登录，等待操作...');
        await this.waitForLogin();
        try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT }); } catch {}
        continue;
      }
      log(`  等待页面加载... (${i + 1}/8)`);
    }
    log('  页面加载超时，尝试提取');
    return false;
  }

  async extractPageData() {
    const raw = await this.page.evaluate(EXTRACT_JS);
    return JSON.parse(raw);
  }

  // 提取缩略图列表（用于获取全部图片，不仅是大图）
  async extractThumbnailLinks() {
    return this.page.evaluate(() => {
      const links = [];
      // 缩略图列表通常在 .sf-pic-slide 内的 ul/li 中
      const thumbs = document.querySelectorAll('.sf-pic-slide li img, .sf-pic-slide .thumb-item img');
      thumbs.forEach(img => {
        const src = img.dataset.src || img.src || '';
        if (src && src.includes('alicdn')) {
          // 缩略图URL通常含尺寸后缀，替换为大图
          links.push(src.replace(/_\d+x\d+\.\w+$/, ''));
        }
      });
      // 也获取 data-imgs 属性（有些页面用这个存储所有图片URL）
      const slideContainer = document.querySelector('.sf-pic-slide');
      if (slideContainer) {
        const dataImgs = slideContainer.dataset.imgs || '';
        if (dataImgs) {
          try {
            const urls = JSON.parse(dataImgs);
            if (Array.isArray(urls)) urls.forEach(u => { if (u) links.push(u); });
          } catch {}
        }
      }
      return links;
    });
  }

  async processItem(idx, item) {
    const addr = item.property_address || '';
    if (!addr) { log('  跳过: 无地址'); return 'skip'; }
    if (!isLocal(addr)) { log(`  跳过非本地: ${addr.slice(0, 40)}`); return 'skip'; }

    const [estateName, communityName] = extractEstate(addr);
    const building = extractBuilding(addr);
    if (!estateName || !communityName) { log(`  无法解析小区: ${addr.slice(0, 40)}`); return 'error'; }
    if (!building) { log(`  无法解析楼幢: ${addr.slice(0, 40)}`); return 'error'; }

    const targetDir = ensureDir(path.join(COMMUNITY_DIR, communityName, estateName, building));
    const attachDir = ensureDir(path.join(targetDir, '附件'));
    const imgDir = ensureDir(path.join(targetDir, '图片'));
    const videoDir = ensureDir(path.join(targetDir, '视频'));
    log(`  目录: ${communityName}/${estateName}/${building}`);

    const infoPath = path.join(targetDir, '基础信息.json');
    if (fs.existsSync(infoPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        if (isInfoComplete(existing)) { log('  已有完整数据，跳过'); return 'skipped_complete'; }
        log('  数据不完整，重新爬取');
      } catch {}
    }

    const itemLink = item.item_link || '';
    if (!itemLink) {
      log('  无 item_link，仅保存基础信息');
      this.saveBasicInfo(infoPath, item, {}, addr);
      return 'no_link';
    }

    log(`  爬取: ${itemLink.slice(0, 80)}`);
    await this.navigateToPage(itemLink);
    const pd = await this.extractPageData();

    const base = parseDescText(pd.descText || '');
    const rawDescText = (pd.descText || '').slice(0, 20000);

    // Task4 #1: 当前楼层从标题提取
    const floorFromAddr = extractFloorFromAddress(addr);
    if (floorFromAddr) base['当前楼层'] = floorFromAddr;

    // Task4 #2: 房产截至日期
    base['房产截至日期'] = calcPropertyDeadline(pd.descText || '');

    // 合并 item 字段
    Object.assign(base, {
      court_name: item.court_name || '', publish_date: item.publish_date || '',
      property_address: item.property_address || '', auction_round: item.auction_round || '',
      item_link: item.item_link || '', detail_url: item.detail_url || '',
    });

    // Task4 #3: 评估价、起拍价
    base['评估价'] = pd.evalPrice || item.assessment_price || '';
    base['起拍价'] = pd.startPrice || item.starting_price || '';

    // 保存原始文本
    base['_rawDescText'] = rawDescText;

    // 清理临时字段
    delete base['土地剩余使用期限_raw'];

    this.saveBasicInfo(infoPath, item, base, addr);
    log('  已保存 基础信息.json');

    // 获取浏览器完整 cookies（包括 httpOnly）用于下载附件
    const browserCookies = await this.page.cookies();
    const cookieHeader = browserCookies.map(c => `${c.name}=${c.value}`).join('; ');

    // 附件
    const dlLinks = pd.downloadLinks || [];
    log(`  附件: ${dlLinks.length} 个`);
    for (const u of dlLinks) await downloadFile(u, attachDir, cookieHeader, '附件');

    // 图片 - 直接使用 EXTRACT_JS 中提取的结果（已限定在本房源容器内）
    const picLinks = pd.picLinks || [];
    log(`  图片: ${picLinks.length} 张`);
    const seen = new Set();
    for (const u of picLinks) {
      if (seen.has(u)) continue;
      seen.add(u);
      let clean = u.replace(/_\d+x\d+\.\w+$/, '');
      if (!/\.(jpe?g|png|webp)$/i.test(clean)) clean = u;
      await downloadFile(clean, imgDir, null, '图片');
    }

    // 视频
    if (pd.videoUrl) {
      log('  视频: 1 个');
      await downloadFile(pd.videoUrl, videoDir, null, '视频');
    }

    return 'ok';
  }

  saveBasicInfo(filePath, item, extra, addr) {
    // Task4 #1: 当前楼层从标题提取
    const floorFromAddr = addr ? extractFloorFromAddress(addr) : '';

    const info = {
      court_name: item.court_name || '', publish_date: item.publish_date || '',
      property_address: item.property_address || '', auction_round: item.auction_round || '',
      item_link: item.item_link || '', detail_url: item.detail_url || '',
      '评估价': item.assessment_price || '', '起拍价': item.starting_price || '',
      '法院裁定书': '', '房地产性质': '', '建筑面积': '', '套内面积': '',
      '土地使用权面积': '', '分摊面积': '', '用途': '',
      '总楼层': '', '当前楼层': floorFromAddr || '', '建筑年份': '',
      '朝向': '', '空间布局': '', '梯户比': '',
      '房产截至日期': '', '特别提醒': '', '竞买记录': '无',
      '占有情况': '', '是否已腾空': '', '租赁情况': '',
      '_rawDescText': '',
      ...extra,
    };
    // 确保 Task4 字段覆盖
    if (extra['当前楼层']) info['当前楼层'] = extra['当前楼层'];
    else if (floorFromAddr) info['当前楼层'] = floorFromAddr;
    if (extra['房产截至日期']) info['房产截至日期'] = extra['房产截至日期'];

    fs.writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf-8');
  }

  async run() {
    if (!fs.existsSync(DATA_JSON)) { log(`数据文件不存在: ${DATA_JSON}`); return; }

    const items = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));
    const total = items.length;
    this.progress.total = total;
    const start = this.progress.count;
    log(`共 ${total} 条记录，从第 ${start + 1} 条开始`);

    await this.init();

    const stats = { ok: 0, skip: 0, skipped_complete: 0, error: 0, no_link: 0 };

    process.on('SIGINT', () => {
      log('\nCtrl+C 收到，保存进度退出...');
      this.running = false;
      this.progress.save();
    });

    for (let i = start; i < total && this.running; i++) {
      const item = items[i];
      this.progress.count = i;
      const title = item.title || item.property_address || '';
      log(`\n${'='.repeat(60)}`);
      log(`[${i + 1}/${total}] ${title.slice(0, 70)}`);
      log('='.repeat(60));

      try {
        const r = await this.processItem(i, item);
        stats[r] = (stats[r] || 0) + 1;
        if (r === 'skipped_complete') this.progress.incSkipped();
      } catch (e) {
        log(`  异常: ${e.message}`);
        this.progress.addError(i, title, e.message);
        stats.error = (stats.error || 0) + 1;
      }

      if (i < total - 1 && this.running) {
        const d = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
        log(`  等待 ${(d / 1000).toFixed(1)}s...`);
        await sleep(d);
      }
    }

    if (this.running) this.progress.count = total;

    try { await this.browser.close(); } catch {}

    log(`\n${'='.repeat(60)}`);
    log('完成！统计:');
    log(`  成功: ${stats.ok || 0}`);
    log(`  跳过(已有完整数据): ${stats.skipped_complete || 0}`);
    log(`  跳过(非本地/无地址): ${stats.skip || 0}`);
    log(`  无链接: ${stats.no_link || 0}`);
    log(`  失败: ${stats.error || 0}`);
    log('='.repeat(60));
  }
}

// ======================== 入口 ========================
(async () => {
  log('='.repeat(60));
  log('仁和房产法拍详情抓取 (fetch_all - Task3+Task4 合并版)');
  log('='.repeat(60));
  try {
    await new FetchAllFetcher().run();
  } catch (e) {
    log(`致命错误: ${e.message}`);
    console.error(e);
    process.exit(1);
  }
})();
