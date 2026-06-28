#!/usr/bin/env node
/**
 * 数据质量统计脚本
 */
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const COMMUNITY_DIR = path.join(BASE_DIR, '仁和社区总览');

const fields = [
  'court_name', 'publish_date', 'property_address', 'auction_round',
  'item_link', 'detail_url',
  '评估价', '起拍价', '法院裁定书', '房地产性质', '建筑面积',
  '套内面积', '土地使用权面积', '分摊面积', '用途', '总楼层',
  '当前楼层', '建筑年份', '朝向', '空间布局', '梯户比',
  '土地剩余使用期限', '特别提醒', '竞买记录',
  '占有情况', '是否已腾空', '租赁情况'
];

const keyFields = ['建筑面积', '房地产性质', '建筑年份', '用途', '总楼层', '评估价', '起拍价'];

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name === '基础信息.json') results.push(full);
  }
  return results;
}

function countFiles(dir, ext) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name), ext);
    else if (entry.name.toLowerCase().endsWith(ext)) count++;
  }
  return count;
}

function isValidFile(filePath, minSize = 2000) {
  try {
    return fs.statSync(filePath).size > minSize;
  } catch { return false; }
}

const infoFiles = walk(COMMUNITY_DIR);
console.log(`\n========== 数据质量统计 ==========`);
console.log(`基础信息.json 总数: ${infoFiles.length}`);

// Field stats
const stats = {};
fields.forEach(f => stats[f] = 0);

let completeCount = 0;
let keyFieldCounts = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
const incomplete = [];

for (const f of infoFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
    let filledKeyFields = 0;

    for (const field of fields) {
      if (data[field] && String(data[field]).trim()) {
        stats[field]++;
      }
    }
    for (const kf of keyFields) {
      if (data[kf] && String(data[kf]).trim()) filledKeyFields++;
    }

    if (filledKeyFields >= 4) keyFieldCounts['4+']++;
    else keyFieldCounts[filledKeyFields]++;

    if (data['建筑面积'] && (data['建筑年份'] || data['房地产性质'])) {
      completeCount++;
    } else {
      const rel = path.relative(COMMUNITY_DIR, path.dirname(f));
      incomplete.push({ path: rel, filledKeyFields, data });
    }
  } catch (e) {
    console.log(`  解析失败: ${f}: ${e.message}`);
  }
}

console.log(`\n--- 字段填充率 ---`);
for (const f of fields) {
  const pct = ((stats[f] / infoFiles.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(stats[f] / infoFiles.length * 20));
  console.log(`  ${f.padEnd(16)} ${String(stats[f]).padStart(3)}/${infoFiles.length} (${pct.padStart(5)}%) ${bar}`);
}

console.log(`\n--- 关键字段完整度 ---`);
console.log(`  完整(建筑面积+年份/性质): ${completeCount}/${infoFiles.length}`);
console.log(`  关键字段填充分布:`);
for (const [k, v] of Object.entries(keyFieldCounts)) {
  console.log(`    ${k}个关键字段: ${v}条`);
}

console.log(`\n--- 不完整项目 (${incomplete.length}条) ---`);
for (const item of incomplete) {
  console.log(`  [${item.filledKeyFields}key] ${item.path}`);
  if (item.filledKeyFields === 0) {
    console.log(`    → 所有关键字段为空`);
  }
}

// Resource counts
console.log(`\n--- 资源统计 ---`);
const attachDirs = walk(COMMUNITY_DIR).map(f => path.dirname(f));
let totalAttach = 0, totalImg = 0, totalVideo = 0;
let validAttach = 0, invalidAttach = 0;
const garbledNames = [];

for (const dir of new Set(attachDirs)) {
  // Attachments
  const aDir = path.join(dir, '附件');
  if (fs.existsSync(aDir)) {
    for (const f of fs.readdirSync(aDir)) {
      totalAttach++;
      const fp = path.join(aDir, f);
      const sz = fs.statSync(fp).size;
      if (sz > 2000) validAttach++;
      else invalidAttach++;
      // Check for garbled names (non-UTF8 high bytes)
      if (/[À-ÿ]{3,}/.test(f)) garbledNames.push({ dir: path.relative(COMMUNITY_DIR, dir), name: f, size: sz });
    }
  }
  // Images
  const iDir = path.join(dir, '图片');
  if (fs.existsSync(iDir)) totalImg += fs.readdirSync(iDir).length;
  // Videos
  const vDir = path.join(dir, '视频');
  if (fs.existsSync(vDir)) totalVideo += fs.readdirSync(vDir).length;
}

console.log(`  附件: ${totalAttach} (有效: ${validAttach}, 无效/太小: ${invalidAttach})`);
console.log(`  图片: ${totalImg}`);
console.log(`  视频: ${totalVideo}`);

if (garbledNames.length > 0) {
  console.log(`\n--- GB2312 乱码文件名 (${garbledNames.length}个) ---`);
  for (const g of garbledNames.slice(0, 10)) {
    console.log(`  ${g.dir}/附件/${g.name} (${(g.size/1024).toFixed(1)}KB)`);
  }
  if (garbledNames.length > 10) console.log(`  ... 还有 ${garbledNames.length - 10} 个`);
}

console.log(`\n========== 统计完毕 ==========\n`);
