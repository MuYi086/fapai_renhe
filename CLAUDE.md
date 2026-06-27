# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

人民法院诉讼资产网（rmfysszc.gov.cn）仁和街道房产拍卖信息爬虫，纯 Node.js 原生模块实现，无第三方依赖。

## 目录结构

```
├── scripts/           # 爬虫脚本
│   ├── fetch_list.js
│   ├── fetch_detail.js
│   └── filter_property.js
├── result/            # 数据输出
│   ├── list_results.json
│   ├── 仁和.json
│   └── 仁和房产.json
├── task1.md           # 原始请求记录
└── CLAUDE.md
```

## 数据流水线

1. `scripts/fetch_list.js` → 搜索列表分页，输出 `result/list_results.json`
2. `scripts/fetch_detail.js` → 逐条抓取详情页，输出 `result/仁和.json`（支持断点续爬）
3. `scripts/filter_property.js` → 按关键词筛选纯房产，输出 `result/仁和房产.json`

## 运行

```bash
node scripts/fetch_list.js       # 抓取列表，间隔 1.5s
node scripts/fetch_detail.js     # 抓取详情，间隔 800ms，每 10 条保存进度
node scripts/filter_property.js  # 筛选房产，输出统计
```

## 反爬要点

- 目标站有创宇盾 WAF，DevTools 打开时 403
- 列表接口 POST `Handler.aspx`，需伪造完整浏览器 Headers（sec-ch-ua、X-Requested-With）
- 详情页解析需处理多种 HTML 标签混排格式
- `task1.md` 记录了完整的 curl 原始请求和 Cookie 格式

## JSON 结构

`仁和.json` 每条记录包含：`court_name`, `publish_date`, `property_address`, `assessment_price`, `starting_price`, `auction_round`, `detail_url`, `title`

## 注意

- 无 package.json，依赖 Node.js 原生模块（https、fs）
- JSON 文件含中文路径，Windows 下注意编码
