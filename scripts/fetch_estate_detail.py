#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
仁和房产法拍详情抓取脚本

功能：
1. 遍历 result\仁和房产.json 的每条记录
2. 根据 property_address 解析小区名，定位到对应社区/小区目录
3. 在小区目录下创建楼幢目录（如 9幢1单元302）
4. 使用 item_link 爬取详情页，提取基础信息保存为 基础信息.json
5. 创建 附件、图片、视频 子目录并下载对应资源
6. 支持断点续传（Ctrl+C 中断后下次从上次位置继续）

安装依赖（如尚未安装）：
    pip install requests beautifulsoup4 lxml

用法：
    python scripts/fetch_estate_detail.py
"""

import json
import os
import re
import sys
import time

# Windows 控制台默认编码为 gbk，强制改为 utf-8 避免打印中文报错
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import random
import signal
import shutil
import hashlib
from pathlib import Path
from urllib.parse import urlparse, urljoin

import requests
from bs4 import BeautifulSoup

# ======================== 配置区 ========================
BASE_DIR = Path(__file__).resolve().parent.parent  # 项目根目录
DATA_JSON = BASE_DIR / "result" / "仁和房产.json"
COMMUNITY_DIR = BASE_DIR / "仁和社区总览"
PROGRESS_FILE = BASE_DIR / "result" / "progress.json"
LOG_FILE = BASE_DIR / "result" / "fetch_estate_detail.log"

# 请求配置（防止被封禁/限流）
REQUEST_TIMEOUT = 30
MIN_DELAY = 1.5   # 最短请求间隔（秒）
MAX_DELAY = 4.0   # 最长请求间隔（秒）
MAX_RETRY = 3     # 单条记录最大重试次数

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# ======================== 小区名映射 ========================
# 标准小区名 -> 所属社区名
# 同时支持别名映射（别名 -> 标准名）
ESTATE_MAP = {
    "仁和印象": "獐山社区",
    "清合嘉园东区": "獐山社区",
    "清合嘉园西区": "獐山社区",
    "金鼎阳光": "獐山社区",
    "金鼎公寓": "獐山社区",
    "金阳湾": "獐山社区",
    "余山花苑": "獐山社区",
    "仁合银庭": "獐山社区",
    "渔港嘉园": "獐山社区",
    "启歆府": "獐山社区",
    "启航城": "獐山社区",
    "云和雅园": "和庭社区",
    "北上星云府": "和庭社区",
    "尚堂九里": "和庭社区",
    "金顶华庭": "和庭社区",
    "花和雅居": "和庭社区",
    "怡然府": "和庭社区",
    "仁良花苑": "芳甸社区",
    "北成芳满庭": "芳甸社区",
    "和平雅苑": "和宸社区",
    "仁惠家园": "和宸社区",
    "美的兰庭": "和宸社区",
    "春色满园": "和宸社区",
}

# 别名 -> 标准名（用于地址中存在的非标准写法）
ESTATE_ALIASES = {
    "美地兰庭": "美的兰庭",      # 数据中出现的非标准写法
    "尚堂久里": "尚堂九里",      # 数据中出现的非标准写法
    "金鼎阳光公寓": "金鼎阳光",   # 金鼎阳光 的完整写法
    "仁和金鼎公寓": "金鼎公寓",   # 金鼎公寓 的变体
    "仁和北成芳满庭": "北成芳满庭",  # 缺少街道前缀的变体
    "金鼎华庭": "金顶华庭",       # 数据中实际写法与标准名差异
}

# 所有用于匹配的小区名列表（按长度降序，优先匹配长名）
_ALL_ESTATE_NAMES = sorted(
    list(ESTATE_MAP.keys()) + list(ESTATE_ALIASES.keys()),
    key=len,
    reverse=True
)

# ======================== 日志 ========================
def log(msg):
    """打印并写入日志"""
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ======================== 进度管理 ========================
class ProgressManager:
    """断点续传管理器"""
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"count": 0, "total": 0, "errors": []}
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                log(f"已加载进度文件: {self.path}，上次执行到 count={self.data.get('count', 0)}")
            except Exception as e:
                log(f"进度文件加载失败: {e}，将从头开始")
                self.data = {"count": 0, "total": 0, "errors": []}

    def save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            log(f"进度保存失败: {e}")

    def get_count(self):
        return self.data.get("count", 0)

    def set_count(self, count):
        self.data["count"] = count
        self.save()

    def set_total(self, total):
        self.data["total"] = total
        self.save()

    def add_error(self, idx, item_info, reason):
        self.data.setdefault("errors", []).append({
            "index": idx,
            "info": item_info,
            "reason": str(reason),
            "time": time.strftime('%Y-%m-%d %H:%M:%S')
        })
        self.save()


# ======================== 地址解析 ========================
def extract_estate(address):
    """
    从 property_address 中提取小区名
    返回: (标准小区名, 所属社区名) 或 (None, None)
    """
    if not address:
        return None, None

    # 先检查别名（别名直接映射到标准名）
    for alias, standard in ESTATE_ALIASES.items():
        if alias in address:
            community = ESTATE_MAP.get(standard)
            return standard, community

    # 再检查标准名
    for name in _ALL_ESTATE_NAMES:
        if name in address:
            # 如果是别名，映射到标准名
            standard = ESTATE_ALIASES.get(name, name)
            community = ESTATE_MAP.get(standard)
            return standard, community

    return None, None


def extract_building(address):
    """
    从 property_address 中提取楼幢信息作为目录名
    返回: 如 '9幢1单元302' 或 None

    支持的格式：
        - 9幢1单元302室
        - 32幢3单元1002室
        - 101栋1门402室
        - 2幢2605号
        - 4幢3单元502（无室/号后缀）
        - 33幢北18#（特殊格式）
    """
    if not address:
        return None

    patterns = [
        # 带空格格式：20 幢 3 单元 1102 室
        r'(\d+)\s*[幢栋]\s*(\d+)\s*单元\s*(\d+)\s*(?:室|号)?',
        # 带空格，门格式：20 幢 3 门 1102 室
        r'(\d+)\s*[幢栋]\s*(\d+)\s*门\s*(\d+)\s*(?:室|号)?',
        # 标准格式：9幢1单元302室
        r'(\d+)[幢栋](\d+)单元(\d+)(?:室|号)?',
        # 门格式：101栋1门402室
        r'(\d+)[幢栋](\d+)[门](\d+)(?:室|号)?',
        # 无单元格式：2幢2605号
        r'(\d+)[幢栋](\d+)(?:室|号)?',
        # 特殊格式：33幢北18#（车位/储藏室编号）
        r'(\d+)[幢栋]北(\d+)#',
    ]

    for pattern in patterns:
        m = re.search(pattern, address)
        if m:
            groups = m.groups()
            if len(groups) == 3:
                matched_text = address[m.start():m.end()]
                if '门' in matched_text:
                    return f"{groups[0]}幢{groups[1]}门{groups[2]}"
                return f"{groups[0]}幢{groups[1]}单元{groups[2]}"
            elif len(groups) == 2:
                # 检查是否为特殊格式：33幢北18#
                if '北' in address[m.start():m.end()] and '#' in address[m.start():m.end()]:
                    return f"{groups[0]}幢北{groups[1]}#"
                return f"{groups[0]}幢{groups[1]}"

    return None


# ======================== 请求封装 ========================
class Requester:
    """带重试、延时、日志的请求封装"""
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def get(self, url, **kwargs):
        """带重试的 GET 请求"""
        for attempt in range(1, MAX_RETRY + 1):
            try:
                # 随机延时，防止请求过快被封
                delay = random.uniform(MIN_DELAY, MAX_DELAY)
                time.sleep(delay)

                resp = self.session.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
                resp.raise_for_status()
                return resp
            except requests.exceptions.RequestException as e:
                log(f"  请求失败 [{attempt}/{MAX_RETRY}] URL={url[:80]}... 错误: {e}")
                if attempt < MAX_RETRY:
                    time.sleep(delay * 2)
                else:
                    raise
        return None

    def download(self, url, save_path, **kwargs):
        """下载文件到指定路径"""
        for attempt in range(1, MAX_RETRY + 1):
            try:
                delay = random.uniform(MIN_DELAY, MAX_DELAY)
                time.sleep(delay)

                resp = self.session.get(url, timeout=REQUEST_TIMEOUT, stream=True, **kwargs)
                resp.raise_for_status()

                save_path = Path(save_path)
                save_path.parent.mkdir(parents=True, exist_ok=True)
                with open(save_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                return True
            except Exception as e:
                log(f"  下载失败 [{attempt}/{MAX_RETRY}] URL={url[:80]}... 路径={save_path} 错误: {e}")
                if attempt < MAX_RETRY:
                    time.sleep(delay * 2)
        return False


# ======================== 详情页解析 ========================
def parse_detail_page(html, item):
    """
    解析淘宝司法拍卖详情页 HTML，提取基础信息和资源链接

    返回: {
        "基础信息": {...},   # 字段根据 task3.md 要求
        "附件链接": [...],   # 附件下载 URL 列表
        "图片链接": [...],   # 图片下载 URL 列表
        "视频链接": [...],   # 视频下载 URL 列表
    }
    """
    soup = BeautifulSoup(html, "lxml")
    result = {
        "基础信息": {},
        "附件链接": [],
        "图片链接": [],
        "视频链接": [],
    }

    # 基础信息字段初始化（先从 item 中提取已有字段）
    base = {
        "court_name": item.get("court_name", ""),
        "publish_date": item.get("publish_date", ""),
        "property_address": item.get("property_address", ""),
        "auction_round": item.get("auction_round", ""),
        "item_link": item.get("item_link", ""),
        "detail_url": item.get("detail_url", ""),
        "评估价": item.get("assessment_price", ""),
        "起拍价": item.get("starting_price", ""),
    }

    # ----- 尝试从页面中提取更多信息 -----
    # 淘宝司法拍卖页面结构多变，以下提取逻辑基于常见模式

    # 1. 法院裁定书（执行案号）
    # 通常在 "执行依据" 或 "执行案号" 附近
    case_no_patterns = [
        r'（\d{4}）.{1,10}执\d+号',
        r'\(\d{4}\).{1,10}执\d+号',
    ]
    for pattern in case_no_patterns:
        m = re.search(pattern, html)
        if m:
            base["法院裁定书"] = m.group(0)
            break
    else:
        base["法院裁定书"] = ""

    # 2. 房地产性质、建筑面积、套内面积、土地使用权面积等
    # 尝试从页面文本中提取键值对
    extract_map = {
        "房地产性质": ["房地产性质", "房屋性质", "房产性质"],
        "建筑面积": ["建筑面积", "建筑面积："],
        "套内面积": ["套内面积", "套内建筑面积"],
        "土地使用权面积": ["土地使用权面积", "土地面积"],
        "分摊面积": ["分摊面积", "分摊建筑面积"],
        "用途": ["用途", "规划用途", "设计用途"],
        "总楼层": ["总楼层", "总层数", "所在建筑总层数"],
        "当前楼层": ["当前楼层", "所在楼层", "楼层"],
        "建筑年份": ["建筑年份", "建成年份", "竣工日期", "建成时间"],
        "朝向": ["朝向", "房屋朝向"],
        "空间布局": ["空间布局", "户型", "室内格局"],
        "梯户比": ["梯户比", "梯户"],
        "土地剩余使用期限": ["土地剩余使用期限", "土地剩余年限", "剩余使用年限"],
        "评估价": ["评估价", "评估价格"],
        "起拍价": ["起拍价", "起拍价格"],
        "特别提醒": ["特别提醒", "特别提示"],
        "竞买记录": ["竞买记录", "竞价记录"],
        "占有情况": ["占有情况", "占用情况"],
        "是否已腾空": ["是否已腾空", "腾空情况"],
        "租赁情况": ["租赁情况", "租赁", "是否带租"],
    }

    # 从页面纯文本中尝试提取
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for field_key, keywords in extract_map.items():
        for kw in keywords:
            for line in lines:
                if kw in line and len(line) < 200:
                    # 提取值（尝试从冒号/空格后取值）
                    val = ""
                    if "：" in line:
                        val = line.split("：", 1)[-1].strip()
                    elif ":" in line:
                        val = line.split(":", 1)[-1].strip()
                    elif line.startswith(kw):
                        val = line[len(kw):].strip()
                    if val and val not in ("", "--", "-", "无"):
                        base[field_key] = val
                        break
            if field_key in base:
                break
        if field_key not in base:
            base[field_key] = ""

    # 竞买记录：若未提取到，默认"无"
    if "竞买记录" not in base or not base["竞买记录"]:
        base["竞买记录"] = "无"

    result["基础信息"] = base

    # ----- 提取附件链接 -----
    # 附件通常在 a 标签中，href 包含 download_attach
    for a in soup.find_all("a", href=re.compile(r'download_attach')):
        href = a.get("href", "")
        if href:
            if href.startswith("http"):
                result["附件链接"].append(href)
            else:
                result["附件链接"].append(urljoin(item.get("item_link", ""), href))

    # ----- 提取图片链接 -----
    # 图片通常包含 img.alicdn.com 或类似 CDN
    img_domains = ["img.alicdn.com", "img.taobaocdn.com", "imgextra.taobao.com"]
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("original")
        if src:
            for domain in img_domains:
                if domain in src:
                    result["图片链接"].append(src)
                    break

    # ----- 提取视频链接 -----
    # 视频通常包含 cloud.video.taobao.com 或 video 标签
    for video in soup.find_all(["video", "source"]):
        src = video.get("src") or video.get("data-src")
        if src and ("video" in src or "mp4" in src):
            result["视频链接"].append(src)

    # 从 script 或 json 数据中再提取一次视频
    video_pattern = re.compile(r'(https?://[^\s"\'<>]+\.(?:mp4|m3u8|flv))')
    for match in video_pattern.finditer(html):
        url = match.group(1)
        if url not in result["视频链接"]:
            result["视频链接"].append(url)

    # 去重
    result["附件链接"] = list(dict.fromkeys(result["附件链接"]))
    result["图片链接"] = list(dict.fromkeys(result["图片链接"]))
    result["视频链接"] = list(dict.fromkeys(result["视频链接"]))

    return result


# ======================== 主流程 ========================
class EstateFetcher:
    def __init__(self):
        self.progress = ProgressManager(PROGRESS_FILE)
        self.requester = Requester()
        self._running = True
        self._setup_signal()

    def _setup_signal(self):
        def handler(signum, frame):
            log("\n收到中断信号 (Ctrl+C)，正在保存进度...")
            self._running = False
            self.progress.save()
            log(f"进度已保存到 count={self.progress.get_count()}，安全退出。")
            sys.exit(0)
        signal.signal(signal.SIGINT, handler)
        signal.signal(signal.SIGTERM, handler)

    def run(self):
        # 1. 读取数据
        if not DATA_JSON.exists():
            log(f"数据文件不存在: {DATA_JSON}")
            return

        with open(DATA_JSON, "r", encoding="utf-8") as f:
            items = json.load(f)

        if not isinstance(items, list):
            log("数据格式错误：应为 JSON 数组")
            return

        total = len(items)
        self.progress.set_total(total)
        start = self.progress.get_count()

        log(f"共 {total} 条记录，从第 {start + 1} 条开始处理")

        for i in range(start, total):
            if not self._running:
                break

            item = items[i]
            self.progress.set_count(i)

            log(f"\n[{i+1}/{total}] 开始处理: {item.get('title', '')[:60]}...")

            try:
                self._process_item(i, item)
            except Exception as e:
                log(f"  处理异常: {e}")
                self.progress.add_error(i, item.get("title", ""), str(e))

        # 全部完成
        self.progress.set_count(total)
        log(f"\n所有 {total} 条记录处理完毕。")

    def _process_item(self, idx, item):
        """处理单条记录"""
        address = item.get("property_address", "")
        if not address:
            log("  跳过: property_address 为空")
            return

        # 跳过非杭州余杭区的房产（如河北、安徽等）
        if not self._is_hangzhou_yuhang(address):
            log(f"  跳过非本地房产: {address[:50]}...")
            return

        # 解析小区名和楼幢号
        estate_name, community_name = extract_estate(address)
        building = extract_building(address)

        if not estate_name or not community_name:
            log(f"  无法解析小区名: {address[:50]}...")
            self.progress.add_error(idx, item.get("title", ""), f"无法解析小区名: {address}")
            return

        if not building:
            log(f"  无法解析楼幢号: {address[:50]}...")
            self.progress.add_error(idx, item.get("title", ""), f"无法解析楼幢号: {address}")
            return

        # 构建目标目录
        target_dir = COMMUNITY_DIR / community_name / estate_name / building
        target_dir.mkdir(parents=True, exist_ok=True)
        log(f"  目标目录: {target_dir}")

        # 创建子目录
        attach_dir = target_dir / "附件"
        img_dir = target_dir / "图片"
        video_dir = target_dir / "视频"
        attach_dir.mkdir(exist_ok=True)
        img_dir.mkdir(exist_ok=True)
        video_dir.mkdir(exist_ok=True)

        # 爬取详情页
        item_link = item.get("item_link", "")
        detail_data = None
        if item_link:
            log(f"  正在获取详情页: {item_link[:80]}...")
            try:
                resp = self.requester.get(item_link)
                detail_data = parse_detail_page(resp.text, item)
                log(f"  详情页解析完成: 附件={len(detail_data['附件链接'])} 图片={len(detail_data['图片链接'])} 视频={len(detail_data['视频链接'])}")
            except Exception as e:
                log(f"  详情页获取失败: {e}")
                # 使用 item 已有数据构建基础信息
                detail_data = {
                    "基础信息": {
                        "court_name": item.get("court_name", ""),
                        "publish_date": item.get("publish_date", ""),
                        "property_address": item.get("property_address", ""),
                        "评估价": item.get("assessment_price", ""),
                        "起拍价": item.get("starting_price", ""),
                        "auction_round": item.get("auction_round", ""),
                        "item_link": item.get("item_link", ""),
                        "detail_url": item.get("detail_url", ""),
                        "法院裁定书": "",
                        "房地产性质": "",
                        "建筑面积": "",
                        "套内面积": "",
                        "土地使用权面积": "",
                        "分摊面积": "",
                        "用途": "",
                        "总楼层": "",
                        "当前楼层": "",
                        "建筑年份": "",
                        "朝向": "",
                        "空间布局": "",
                        "梯户比": "",
                        "土地剩余使用期限": "",
                        "特别提醒": "",
                        "竞买记录": "无",
                        "占有情况": "",
                        "是否已腾空": "",
                        "租赁情况": "",
                    },
                    "附件链接": [],
                    "图片链接": [],
                    "视频链接": [],
                }
        else:
            log("  无 item_link，跳过详情爬取")
            detail_data = None

        # 保存基础信息
        if detail_data:
            base_info_path = target_dir / "基础信息.json"
            with open(base_info_path, "w", encoding="utf-8") as f:
                json.dump(detail_data["基础信息"], f, ensure_ascii=False, indent=2)
            log(f"  已保存基础信息: {base_info_path}")

            # 下载附件
            for url in detail_data["附件链接"]:
                self._download_resource(url, attach_dir, "附件")

            # 下载图片
            for url in detail_data["图片链接"]:
                self._download_resource(url, img_dir, "图片")

            # 下载视频
            for url in detail_data["视频链接"]:
                self._download_resource(url, video_dir, "视频")

    def _is_hangzhou_yuhang(self, address):
        """判断是否为杭州余杭区仁和街道/镇的房产"""
        # 包含这些外地关键字则跳过
        exclude_keywords = ["河北省", "唐山市", "安徽省", "亳州市", "蒙城县"]
        for kw in exclude_keywords:
            if kw in address:
                return False
        # 必须包含杭州余杭区，或明确包含仁和街道/镇
        # 避免仅包含"仁和"二字（如西湖区金顶苑仁和阁）被误匹配
        return ("杭州" in address and "余杭" in address) or "仁和街道" in address or "仁和镇" in address

    def _download_resource(self, url, save_dir, label):
        """下载单个资源"""
        try:
            # 生成文件名
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            if not filename or filename == "":
                # 使用 URL hash 作为文件名
                ext = ".bin"
                if label == "图片":
                    ext = ".jpg"
                elif label == "视频":
                    ext = ".mp4"
                elif label == "附件":
                    ext = ".pdf"
                filename = hashlib.md5(url.encode()).hexdigest()[:16] + ext

            save_path = save_dir / filename
            if save_path.exists():
                log(f"  [{label}] 已存在，跳过: {filename}")
                return

            log(f"  [{label}] 下载: {url[:80]}...")
            ok = self.requester.download(url, save_path)
            if ok:
                log(f"  [{label}] 下载成功: {save_path}")
            else:
                log(f"  [{label}] 下载失败: {url[:80]}...")
        except Exception as e:
            log(f"  [{label}] 下载异常: {e}")


# ======================== 入口 ========================
if __name__ == "__main__":
    log("=" * 60)
    log("仁和房产法拍详情抓取脚本启动")
    log("=" * 60)
    fetcher = EstateFetcher()
    fetcher.run()
