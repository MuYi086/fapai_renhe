# 仓库协作说明

本文件面向在 `fapai_renhe` 中执行修改的编码代理与贡献者。用户文档见 [README.md](README.md)，数据维护流程见 [docs/数据维护.md](docs/数据维护.md)。

## 项目边界

- 这是历史法拍房数据档案与静态查询项目，不是实时房源服务，也没有后端 API（应用程序接口）。
- `仁和社区总览/` 是已归档数据：每套房源位于 `<社区>/<小区>/<门牌号>/`，其中 `基础信息.json` 是该套房源的结构化来源。
- `web/public/house.json` 和 `app/src/static/house.json` 是两个客户端各自消费的聚合数据；前者由 `build_data.py` 生成，后者需在数据变更后显式同步。
- `result/` 保存抓取中间结果、进度与日志。不要把它误当作前端直接读取的数据源。

## 修改规则

1. 不要批量重命名、格式化、移动或删除 `仁和社区总览/` 中的附件、图片、视频和历史 JSON，除非任务明确授权且已说明数据迁移方式。
2. 不要触碰其他人留下的未跟踪文件；开始和完成时检查 `git status`，只提交本任务需要的文件。
3. 扩展 `基础信息.json` 字段时，同时检查 `build_data.py`、网页端、移动端和文档是否需要同步；字段缺失必须由界面安全降级为占位值。
4. 更新 `web/public/*.json` 后，如移动端也应展示同一批数据，必须同步到 `app/src/static/` 并比较记录数与字段结构。
5. 与来源网站或 MineU 的请求会产生外部影响。除非用户明确要求且已具备授权与凭据，不运行抓取、下载、上传或批量解析脚本；绝不把 Cookie、令牌或 `MINEU_API_KEY` 写入代码、文档或提交记录。

## 常用验证

根据修改范围选择验证，不要声称未实际运行的命令。

```bash
# 数据目录与字段完整度统计
node scripts/stats_check.js

# 重新生成网页端静态数据
python3 build_data.py

# 网页端
cd web && npm run build

# uni-app H5 构建
cd app && npm run build:h5

# Node 脚本的语法检查示例
node --check scripts/stats_check.js

# Python 脚本的语法检查示例
python3 -m py_compile build_data.py
```

若运行 `build_data.py`，它只会覆盖 `web/public/community.json` 与 `web/public/house.json`。移动端静态数据的同步步骤见 [docs/数据维护.md](docs/数据维护.md)。

## 文档同步

当用户可见功能、脚本命令、数据字段、静态数据位置、构建目标、外部服务要求或数据范围变化时，同步检查：

- [README.md](README.md)：项目范围、能力、入门路径和限制。
- [docs/数据维护.md](docs/数据维护.md)：数据流、维护命令与外部影响。
- `web/README.md`：网页端局部运行与数据输入。
- 本文件：仅在代理协作约束发生变化时更新。
