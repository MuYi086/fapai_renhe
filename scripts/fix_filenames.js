#!/usr/bin/env node
/**
 * 修复 GB2312 乱码文件名
 * 
 * Content-Disposition 头使用 GB2312 编码的文件名被当作 Latin-1 解码，
 * 导致中文显示为乱码。此脚本将乱码还原为 GB2312 字节后重新解码为 UTF-8。
 */
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const BASE_DIR = path.resolve(__dirname, '..');
const COMMUNITY_DIR = path.join(BASE_DIR, '仁和社区总览');

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else results.push(full);
  }
  return results;
}

function isGarbled(name) {
  // GB2312 garbled text typically has sequences of high Latin-1 chars (À-ÿ)
  // Also detect mixed encoding where high bytes are interspersed with ASCII digits/dashes
  if (/[À-ÿ]{3,}/.test(name)) return true;
  // Count total high-byte characters
  const highCount = [...name].filter(c => { const code = c.charCodeAt(0); return code >= 0xc0 && code <= 0xff; }).length;
  return highCount >= 5;
}

function fixName(garbledName) {
  // The garbled name was created by interpreting GB2312 bytes as Latin-1
  // Reverse: convert the Latin-1 string back to a Buffer, then decode as GB2312
  const buf = Buffer.from(garbledName, 'latin1');
  const decoded = iconv.decode(buf, 'gb2312');
  return decoded;
}

let fixedCount = 0;
let errorCount = 0;

// Walk through all 附件 directories
const allFiles = walk(COMMUNITY_DIR);
const attachFiles = allFiles.filter(f => f.includes(path.sep + '附件' + path.sep));

console.log(`找到 ${attachFiles.length} 个附件文件`);

for (const filePath of attachFiles) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  
  if (!isGarbled(name)) {
    continue; // Name is fine
  }
  
  try {
    const fixedName = fixName(name);
    // Sanitize: remove any problematic characters
    const safeName = fixedName.replace(/[<>:"/\\|?*]/g, '_').trim();
    
    if (!safeName || safeName === name) {
      console.log(`  跳过 (无法修复): ${name}`);
      continue;
    }
    
    const newPath = path.join(dir, safeName);
    
    // Handle duplicates
    let finalPath = newPath;
    if (fs.existsSync(finalPath) && finalPath !== filePath) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        finalPath = path.join(dir, `${base}_${counter}${ext}`);
        counter++;
      }
    }
    
    fs.renameSync(filePath, finalPath);
    const relDir = path.relative(COMMUNITY_DIR, dir);
    console.log(`  ✓ ${relDir}: ${name.substring(0, 30)}... → ${path.basename(finalPath)}`);
    fixedCount++;
  } catch (e) {
    console.log(`  ✗ 修复失败: ${name} → ${e.message}`);
    errorCount++;
  }
}

console.log(`\n修复完成: ${fixedCount} 个文件已重命名, ${errorCount} 个失败`);
