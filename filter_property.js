const fs = require('fs');

const data = JSON.parse(fs.readFileSync('仁和.json', 'utf-8'));

// 定义房产相关关键词（用于匹配）
const propertyKeywords = [
  '房产', '不动产', '住宅', '公寓', '别墅', '室', '幢', '单元', '楼', '宅',
  '花园', '小区', '家园', '庭', '苑', '园', '居', '城', '郡', '轩', '台',
  '里', '弄', '坊', '号', '层', '建筑面积', '平方米', '㎡', '住宅房', '商住房',
  '储藏室', '车位', '车库', '地下室', '阁楼', '套房', '安置房', '回迁房',
  '商品房', '经济适用房', '宅基地', '自建房', '房',
];

// 定义非房产关键词（用于排除）
const nonPropertyKeywords = [
  '工业厂房', '机器设备', '国有工业', '土地使用权', '非住宅', '工业用', '工业房地产',
  '非住宅工业', '国有工业出让用地', '工业出让', '地上附属物', '宗地', '工业厂房内',
  '国有土地使用权', '宗地及地上', '机器设备一批', '工业厂房', '厂房', '设备', '机械',
];

function isProperty(item) {
  const text = (item.property_address || '') + (item.title || '');
  
  // 先排除明显的非房产
  for (const kw of nonPropertyKeywords) {
    if (text.includes(kw)) return false;
  }
  
  // 再判断是否是房产
  for (const kw of propertyKeywords) {
    if (text.includes(kw)) return true;
  }
  
  return false;
}

const propertyData = data.filter(isProperty);

// 统计被排除的类型
const excluded = data.filter(x => !isProperty(x));
const excludedTypes = {};
for (const item of excluded) {
  const text = (item.property_address || '') + (item.title || '');
  // 提取关键特征用于分类
  let type = '其他';
  if (text.includes('工业') || text.includes('厂房')) type = '工业厂房';
  else if (text.includes('机器') || text.includes('设备')) type = '机器设备';
  else if (text.includes('土地') || text.includes('宗地') || text.includes('土地使用权')) type = '土地/宗地';
  else if (text.includes('非住宅')) type = '非住宅';
  excludedTypes[type] = (excludedTypes[type] || 0) + 1;
}

console.log('=== 筛选结果 ===');
console.log('总条目:', data.length);
console.log('房产条目:', propertyData.length);
console.log('非房产条目:', excluded.length);
console.log('');
console.log('排除类型分布:');
for (const [type, count] of Object.entries(excludedTypes)) {
  console.log(`  ${type}: ${count}`);
}
console.log('');
console.log('排除样例（前5条）:');
excluded.slice(0, 5).forEach(x => {
  console.log(`  - ${x.title || x.property_address || '(无标题)'}`);
});

fs.writeFileSync('仁和房产.json', JSON.stringify(propertyData, null, 2));
console.log('');
console.log('已保存: 仁和房产.json');
