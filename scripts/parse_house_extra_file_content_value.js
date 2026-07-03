/**
 * @fileoverview 大附件房源信息解析脚本
 * @description 遍历仁和社区总览目录，筛选附件文件大小大于 10M 的房源信息
 * - 目录遍历：按 社区/小区/门牌号/附件 层级扫描附件文件
 * - 大小判断：使用文件系统真实大小，筛选严格大于 10 * 1024 * 1024 bytes 的文件
 * - 结果输出：生成 附件大于10M房源信息.md，记录社区、小区、门牌号、文件名和大小
 * @module parse_house_extra_file_content_value
 */

const fs = require('fs');
const path = require('path');

/** 项目根目录 */
const PROJECT_ROOT_DIR = path.join(__dirname, '..');
/** 仁和社区总览根目录 */
const COMMUNITY_ROOT_DIR = path.join(PROJECT_ROOT_DIR, '仁和社区总览');
/** 输出 Markdown 文件路径 */
const OUTPUT_FILE = path.join(PROJECT_ROOT_DIR, '附件大于10M房源信息.md');
/** 单位换算：1M = 1024 * 1024 bytes */
const BYTES_PER_MEGABYTE = 1024 * 1024;
/** 大附件筛选阈值，严格大于该值才会记录 */
const LARGE_FILE_THRESHOLD_BYTES = 10 * BYTES_PER_MEGABYTE;

/**
 * @typedef {Object} LargeAttachmentRecord
 * @property {string} community - 社区名称
 * @property {string} estate - 小区名称
 * @property {string} houseNumber - 门牌号
 * @property {string} fileName - 附件文件名
 * @property {number} sizeBytes - 文件字节大小
 * @property {string} sizeMB - 文件大小，单位 M
 */

/**
 * 读取指定目录下的子目录，按中文名称排序。
 * @param {string} dirPath - 待读取目录路径
 * @returns {fs.Dirent[]} 子目录 Dirent 列表
 */
function readSortedDirectories(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

/**
 * 递归读取附件目录下的全部文件，按相对路径排序。
 * @param {string} attachmentDir - 附件目录绝对路径
 * @param {string} [relativeDir] - 当前递归层级的相对目录
 * @returns {{ filePath: string, relativePath: string }[]} 附件文件路径列表
 */
function readAttachmentFiles(attachmentDir, relativeDir = '') {
  const currentDir = path.join(attachmentDir, relativeDir);
  if (!fs.existsSync(currentDir)) return [];

  return fs
    .readdirSync(currentDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    .flatMap((entry) => {
      const entryRelativePath = path.join(relativeDir, entry.name);
      const entryFullPath = path.join(attachmentDir, entryRelativePath);

      if (entry.isDirectory()) {
        return readAttachmentFiles(attachmentDir, entryRelativePath);
      }

      if (!entry.isFile()) {
        return [];
      }

      return [
        {
          filePath: entryFullPath,
          relativePath: entryRelativePath,
        },
      ];
    });
}

/**
 * 将字节大小格式化为 M 文本。
 * @param {number} sizeBytes - 文件字节大小
 * @returns {string} 保留两位小数的 M 文本
 */
function formatSizeMB(sizeBytes) {
  return (sizeBytes / BYTES_PER_MEGABYTE).toFixed(2);
}

/**
 * 转义 Markdown 表格单元格内容。
 * @param {string} value - 原始单元格文本
 * @returns {string} 转义后的单元格文本
 */
function escapeMarkdownCell(value) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * 扫描所有社区、小区、门牌号目录，收集大于 10M 的附件记录。
 * @param {string} rootDir - 仁和社区总览根目录
 * @returns {LargeAttachmentRecord[]} 大附件记录列表
 */
function collectLargeAttachmentRecords(rootDir) {
  /** @type {LargeAttachmentRecord[]} */
  const records = [];

  for (const communityDir of readSortedDirectories(rootDir)) {
    const communityPath = path.join(rootDir, communityDir.name);

    for (const estateDir of readSortedDirectories(communityPath)) {
      const estatePath = path.join(communityPath, estateDir.name);

      for (const houseDir of readSortedDirectories(estatePath)) {
        const attachmentDir = path.join(estatePath, houseDir.name, '附件');
        const attachmentFiles = readAttachmentFiles(attachmentDir);

        for (const attachmentFile of attachmentFiles) {
          const { size } = fs.statSync(attachmentFile.filePath);
          if (size <= LARGE_FILE_THRESHOLD_BYTES) continue;

          records.push({
            community: communityDir.name,
            estate: estateDir.name,
            houseNumber: houseDir.name,
            fileName: attachmentFile.relativePath,
            sizeBytes: size,
            sizeMB: formatSizeMB(size),
          });
        }
      }
    }
  }

  return records;
}

/**
 * 生成大附件房源信息 Markdown 内容。
 * @param {LargeAttachmentRecord[]} records - 大附件记录列表
 * @returns {string} Markdown 文档内容
 */
function generateMarkdown(records) {
  const lines = [
    '# 附件大于10M房源信息',
    '',
    `筛选规则：附件文件大小严格大于 ${formatSizeMB(LARGE_FILE_THRESHOLD_BYTES)}M（${LARGE_FILE_THRESHOLD_BYTES} bytes）。`,
    '',
    `共 ${records.length} 条记录。`,
    '',
    '| 序号 | 社区 | 小区 | 门牌号 | 文件名 | 大小M |',
    '| --- | --- | --- | --- | --- | ---: |',
  ];

  if (records.length === 0) {
    lines.push('| - | - | - | - | 未发现大于 10M 的附件 | - |');
  } else {
    records.forEach((record, index) => {
      lines.push(
        [
          index + 1,
          escapeMarkdownCell(record.community),
          escapeMarkdownCell(record.estate),
          escapeMarkdownCell(record.houseNumber),
          escapeMarkdownCell(record.fileName),
          record.sizeMB,
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')
      );
    });
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 主流程：扫描附件目录并输出 Markdown 文件。
 * @returns {void}
 * @throws {Error} 仁和社区总览目录不存在时抛出错误
 */
function main() {
  if (!fs.existsSync(COMMUNITY_ROOT_DIR)) {
    throw new Error(`目录不存在: ${COMMUNITY_ROOT_DIR}`);
  }

  const records = collectLargeAttachmentRecords(COMMUNITY_ROOT_DIR);
  const markdown = generateMarkdown(records);
  fs.writeFileSync(OUTPUT_FILE, markdown, 'utf-8');

  console.log(`已扫描: ${COMMUNITY_ROOT_DIR}`);
  console.log(`大于 10M 附件记录数: ${records.length}`);
  console.log(`已输出: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  collectLargeAttachmentRecords,
  generateMarkdown,
};
