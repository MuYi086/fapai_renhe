#!/usr/bin/env node
/**
 * 离线重解析脚本 - 使用改进后的正则从已保存的 _rawDescText 重新提取字段
 * 不需要重新爬取页面，只需读取 基础信息.json 中的原始文本并重新解析
 */
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');
const COMMUNITY_DIR = path.join(BASE_DIR, '仁和社区总览');

// 导入 parseDescText 函数（从主脚本中提取）
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

  result['法院裁定书'] = tryPatterns([/[（(]\d{4}[）)][^；;。]*?执\d+号/]) || '';

  result['房地产性质'] = tryPatterns([
    /(?:权利性质|房地产性质)[：:\s为]+([^；;。，,]{1,30}?)(?=\s*(?:占有情况|是否已腾空|租赁情况|权利限制|查封|登记日期|共有情况|权利状态|使用期限|权证号|评估|起拍|特别|$))/,
    /(?:权利性质|房地产性质)[：:\s为]+([^；;。，,]{1,30})/,
  ]);

  result['建筑面积'] = tryPatterns([
    /(?:房屋)?建筑(?:总)?面积[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
    /建筑总面积[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  result['套内面积'] = tryPatterns([
    /(?:套内面积|套内建筑面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  result['土地使用权面积'] = tryPatterns([
    /(?:土地使用权面积|土地总面积|土地面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  result['分摊面积'] = tryPatterns([
    /(?:分摊面积|分摊建筑面积|公摊(?:总)?面积)[：:\s为]*(?:约)?([\d.]+)\s*(?:平方米|㎡|平方)?/,
  ]);

  result['建筑年份'] = tryPatterns([
    /(?:建筑年份|建成年份|建造年份|竣工年份|竣工时间|建成时间)[：:\s]*(?:约)?(\d{4})/,
    /(\d{4})\s*(?:年)?\s*(?:建成|竣工|建造)/,
    /(?:建成|竣工|建造)(?:于)?\s*(\d{4})\s*年/,
  ]);

  result['占有情况'] = tryPatterns([
    /占有情况[：:\s]*([^；;。]{1,20}?)(?=\s*(?:是否|腾空|租赁|经营|权利|评估|$))/,
  ]);

  result['是否已腾空'] = tryPatterns([
    /(?:是否已腾空|腾空情况)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:租赁|经营|钥匙|权利|评估|$))/,
    /(?:有无租赁|是否带租)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:经营|钥匙|权利|评估|特别|$))/,
  ]);

  result['租赁情况'] = tryPatterns([
    /租赁情况[：:\s]*([^；;。]{1,20}?)(?=\s*(?:经营|钥匙|权利|评估|特别|$))/,
    /(?:有无租赁|是否带租)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:经营|钥匙|权利|评估|特别|$))/,
  ]);

  result['用途'] = tryPatterns([
    /(?:规划)?用途[：:\s为]*([^；;。]{1,50}?)(?=\s*(?:建筑结构|楼层|总楼层|建筑年份|建成年份|朝向|空间|梯户|土地|评估|起拍|特别|登记日期|权证号|建筑面积|权利|平面|查封|室内|装修|竣工|分摊|$))/,
    /(?:规划)?用途[：:\s为]*([^；;。]{1,30})/,
  ]);
  if (result['用途'] && result['用途'].length <= 1) result['用途'] = '';

  result['总楼层'] = tryPatterns([
    /总楼层[：:\s]*(?:为)?(\d+)\s*层/,
    /地上总楼层[：:\s]*(?:为)?(\d+)\s*层/,
    /总层数[：:\s]*(?:为)?(\d+)\s*层/,
    /共\s*(\d+)\s*层/,
    /(?:地上|总计?)(\d+)\s*层/,
  ]);

  result['当前楼层'] = tryPatterns([
    /当前楼层[：:\s]*(?:为)?(\d+)/,
    /拍卖对象(?:所在层?(?:为)?|为)(?:地上)?第?\s*(\d+)\s*层/,
    /所在楼层[：:\s]*(?:为)?(?:地上)?第?\s*(\d+)\s*层/,
    /(?:位于|处于?)\s*(?:地上)?第\s*(\d+)\s*层/,
    /(?:地上)?第\s*(\d+)\s*层[；;，,\s]/,
    /(?:楼层|层数)[：:\s]*(?:地上)?第?\s*(\d+)\s*层/,
  ]);

  result['朝向'] = tryPatterns([
    /朝向[：:\s]*([^；;。]{1,20}?)(?=\s*(?:空间|内部|装修|梯户|土地|评估|起拍|特别|建筑功能|建筑外观|建筑年份|平面布局|维护|所处|小区|入户门|（\d+）|装饰装修|$))/,
    /(?:房屋朝向|坐向)[：:\s]*([^；;。]{1,20}?)(?=\s*(?:空间|内部|装修|梯户|土地|评估|起拍|特别|$))/,
  ]);

  result['空间布局'] = tryPatterns([
    /(?:空间布局|内部格局)[：:\s]*(?:拍卖对象内部格局为)?([^；;。]{2,80}?)(?=\s*(?:装饰装修|装修|梯户比|土地|评估|起拍|特别|室内装修|入户门|维护状况|建筑功能|建筑外观|（\d+）|拍卖对象入户门|$))/,
    /户型[：:\s]*([^；;。]{2,60}?)(?=\s*(?:装饰装修|装修|梯户比|土地|评估|起拍|特别|$))/,
  ]);

  result['梯户比'] = tryPatterns([
    /梯户比[：:\s]*(?:所在单元)?([^；;。]{2,60}?)(?=\s*(?:土地|评估|起拍|特别|$))/,
    /(?:平面布局|梯户)[：:\s]*([一二三四五六七八九十\d]+梯[一二三四五六七八九十\d]+户)/,
    /([一二三四五六七八九十两\d]+梯[一二三四五六七八九十两\d]+户)/,
  ]);

  result['土地剩余使用期限'] = tryPatterns([
    /(?:土地剩余使用期限|土地剩余年限|剩余使用年限)[：:\s]*([^；;。]{1,30})/,
    /(?:土地使用期限|使用权期限)[：:\s]*至\s*([^；;。]{1,20})/,
    /(?:终止日期|到期日期)[：:\s]*([^；;。]{1,20})/,
  ]);

  const rm = text.match(/特别提醒[：:\s]*(.+?)(?=竞买记录|$)/);
  result['特别提醒'] = rm ? rm[1].trim().slice(0, 2000) : '';

  const jm = text.match(/竞买记录[：:\s]*([^.。]{1,50})/);
  result['竞买记录'] = jm ? jm[1].trim() : '无';

  // 评估价 - 从文本提取（作为 DOM 提取的后备）
  result['评估价'] = tryPatterns([
    /(?:标的)?评估(?:总)?价[：:\s为]*(?:约|人民币)?([\d,.]+)\s*(?:万|元)/,
    /评估(?:总)?(?:价值|价格)[：:\s为]*(?:约|人民币)?([\d,.]+)\s*(?:万|元)/,
  ]);

  // 起拍价 - 从文本提取（作为 DOM 提取的后备）
  result['起拍价'] = tryPatterns([
    /起拍价[：:\s为]*(?:约|人民币)?([\d,.]+)\s*(?:万|元)/,
    /起拍(?:总)?价[：:\s为]*(?:约|人民币)?([\d,.]+)\s*(?:万|元)/,
  ]);

  return result;
}

// 遍历所有 基础信息.json
function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name === '基础信息.json') results.push(full);
  }
  return results;
}

const fields = [
  '法院裁定书', '房地产性质', '建筑面积', '套内面积', '土地使用权面积',
  '分摊面积', '建筑年份', '用途', '总楼层', '当前楼层',
  '朝向', '空间布局', '梯户比', '土地剩余使用期限',
  '特别提醒', '竞买记录', '占有情况', '是否已腾空', '租赁情况',
  '评估价', '起拍价'
];

const infoFiles = walk(COMMUNITY_DIR);
let updatedCount = 0;
let updatedFields = {};
fields.forEach(f => updatedFields[f] = 0);

console.log(`离线重解析: ${infoFiles.length} 个文件\n`);

for (const fp of infoFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const rawText = data._rawDescText;
    if (!rawText || rawText.length < 10) continue; // 无原始文本，跳过

    const newParsed = parseDescText(rawText);
    let changed = false;

    for (const field of fields) {
      const oldVal = data[field] || '';
      const newVal = newParsed[field] || '';
      // 更新条件：
      // 1. 旧值为空，新值有值
      // 2. 旧值过长(>30字符)且新值更短更干净
      if ((!oldVal && newVal) || (oldVal.length > 30 && newVal && newVal.length < oldVal.length * 0.7)) {
        data[field] = newVal;
        changed = true;
        updatedFields[field]++;
      }
    }

    if (changed) {
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
      const rel = path.relative(COMMUNITY_DIR, path.dirname(fp));
      console.log(`  ✓ ${rel}`);
      updatedCount++;
    }
  } catch (e) {
    console.log(`  ✗ ${fp}: ${e.message}`);
  }
}

console.log(`\n========== 重解析完成 ==========`);
console.log(`更新文件数: ${updatedCount}`);
console.log(`新增字段:`);
for (const [f, c] of Object.entries(updatedFields)) {
  if (c > 0) console.log(`  ${f}: +${c}`);
}
