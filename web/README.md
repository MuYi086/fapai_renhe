# 网页端

这是仁和街道法拍房数据档案的静态查询界面，基于 Vue 3、Vite 和 Element Plus 构建。它在浏览器中加载同目录 `public/` 下的静态数据，不依赖后端接口。

## 运行与构建

```bash
npm ci
npm run dev
```

```bash
npm run build
npm run preview
```

## 数据输入

- `public/community.json`：社区到小区的映射，用于级联筛选。
- `public/house.json`：房源聚合数据。前端可按社区、小区、房产地址、房间号筛选，并按分页表格展示。

根目录的 `build_data.py` 会重建这两个文件。其输入是 `仁和街道小区.md` 与 `仁和社区总览/**/基础信息.json`，并按 `publish_date` 倒序输出房源记录。

完整项目说明见 [根目录 README](../README.md)，数据更新步骤见 [数据维护说明](../docs/数据维护.md)。
