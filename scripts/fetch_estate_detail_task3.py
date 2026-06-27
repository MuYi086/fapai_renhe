#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
仁和房产法拍详情抓取脚本 (Task3)

功能：
1. 遍历 result\仁和房产.json，根据每条记录的 item_link 爬取淘宝司法拍卖详情页
2. 在 仁和社区总览 目录下按 社区/小区/楼幢 创建目录结构
3. 提取基础信息保存为 基础信息.json
4. 创建 附件/图片/视频 子目录并下载对应资源
5. 支持 Ctrl+C 中断后断点续传（通过 progress_task3.json 记录进度）
6. 已有完整基础信息的目录自动跳过，避免重复爬取

依赖：
    pip install requests

用法：
    python scripts/fetch_estate_detail_task3.py

需要 WebBridge 运行中（http://127.0.0.1:10086/command）用于渲染淘宝页面。
"""

import json
import os
import re
import sys
import time
import random
import signal
import subprocess
import tempfile
import hashlib
from pathlib import Path
from urllib.parse import urlparse

import requests

# Windows 控制台编码修正
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ======================== 配置 ========================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_JSON = BASE_DIR / "result" / "仁和房产.json"
COMMUNITY_DIR = BASE_DIR / "仁和社区总览"
PROGRESS_FILE = BASE_DIR / "result" / "progress_task3.json"
LOG_FILE = BASE_DIR / "result" / "fetch_task3.log"

# WebBridge 配置
WB_URL = "http://127.0.0.1:10086/command"
WB_SESSION = "estate-fetch-task3"

# 请求配置
REQUEST_TIMEOUT = 30
MIN_DELAY = 3.0       # 最小请求间隔（秒）
MAX_DELAY = 7.0       # 最大请求间隔（秒）
DOWNLOAD_DELAY_MIN = 0.8
DOWNLOAD_DELAY_MAX = 2.0
MAX_RETRY = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# ======================== 小区映射 ========================
ESTATE_MAP = {
    "仁和印象": "獐山社区", "清合嘉园东区": "獐山社区", "清合嘉园西区": "獐山社区",
    "金鼎阳光": "獐山社区", "金鼎公寓": "獐山社区", "金阳湾": "獐山社区",
    "余山花苑": "獐山社区", "仁合银庭": "獐山社区", "渔港嘉园": "獐山社区",
    "启歆府": "獐山社区", "启航城": "獐山社区",
    "云和雅园": "和庭社区", "北上星云府": "和庭社区", "尚堂九里": "和庭社区",
    "金顶华庭": "和庭社区", "花和雅居": "和庭社区", "怡然府": "和庭社区",
    "仁良花苑": "芳甸社区", "北成芳满庭": "芳甸社区",
    "和平雅苑": "和宸社区", "仁惠家园": "和宸社区", "美的兰庭": "和宸社区",
    "春色满园": "和宸社区",
}
ESTATE_ALIASES = {
    "美地兰庭": "美的兰庭",
    "尚堂久里": "尚堂九里",
    "金鼎阳光公寓": "金鼎阳光",
    "仁和金鼎公寓": "金鼎公寓",
    "仁和北成芳满庭": "北成芳满庭",
    "金鼎华庭": "金顶华庭",
}
_ALL_ESTATE_NAMES = sorted(
    list(ESTATE_MAP.keys()) + list(ESTATE_ALIASES.keys()),
    key=len, reverse=True
)

# ======================== 日志 ========================
def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

# ======================== WebBridge 通信 ========================
def wb_call(action, args):
    """调用 WebBridge 接口"""
    req = {"action": action, "args": args, "session": WB_SESSION}
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(req, f)
            tmp_path = f.name
        cmd = f'curl.exe -s -X POST {WB_URL} -H "Content-Type: application/json" --data-binary "@{tmp_path}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=60)
        try:
            return json.loads(result.stdout)
        except Exception:
            return {"ok": False, "error": "parse_failed", "raw": result.stdout[:500]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def wb_call_retry(action, args, max_retry=MAX_RETRY):
    """带重试的 WebBridge 调用"""
    for i in range(max_retry):
        resp = wb_call(action, args)
        if resp.get("ok"):
            return resp
        log(f"  WebBridge 调用失败 ({action}): {resp.get('error', 'unknown')}，重试 {i+1}/{max_retry}")
        time.sleep(2 * (i + 1))
    return resp

# ======================== 进度管理 ========================
class ProgressManager:
    """断点续传进度管理器"""
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"count": 0, "total": 0, "skipped": 0, "errors": []}
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                log(f"已加载进度: count={self.data.get('count', 0)}, "
                    f"skipped={self.data.get('skipped', 0)}")
            except Exception as e:
                log(f"进度文件加载失败: {e}，将从头开始")

    def save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            log(f"进度保存失败: {e}")

    def get_count(self):
        return self.data.get("count", 0)

    def set_count(self, v):
        self.data["count"] = v
        self.save()

    def set_total(self, v):
        self.data["total"] = v

    def inc_skipped(self):
        self.data["skipped"] = self.data.get("skipped", 0) + 1

    def add_error(self, idx, info, reason):
        self.data.setdefault("errors", []).append({
            "index": idx,
            "info": info[:80],
            "reason": str(reason)[:200],
            "time": time.strftime('%Y-%m-%d %H:%M:%S')
        })
        self.save()

# ======================== 地址解析 ========================
def extract_estate(address):
    """从 property_address 提取小区名和所属社区"""
    if not address:
        return None, None
    for alias, standard in ESTATE_ALIASES.items():
        if alias in address:
            return standard, ESTATE_MAP.get(standard)
    for name in _ALL_ESTATE_NAMES:
        if name in address:
            standard = ESTATE_ALIASES.get(name, name)
            return standard, ESTATE_MAP.get(standard)
    return None, None


def extract_building(address):
    """从 property_address 提取楼幢信息作为目录名，如 '9幢1单元302'"""
    if not address:
        return None
    patterns = [
        r'(\d+)\s*[幢栋]\s*(\d+)\s*单元\s*(\d+)\s*(?:室|号)?',
        r'(\d+)\s*[幢栋]\s*(\d+)\s*门\s*(\d+)\s*(?:室|号)?',
        r'(\d+)[幢栋](\d+)单元(\d+)(?:室|号)?',
        r'(\d+)[幢栋](\d+)[门](\d+)(?:室|号)?',
        r'(\d+)[幢栋](\d+)(?:室|号)?',
        r'(\d+)[幢栋]北(\d+)#',
    ]
    for pattern in patterns:
        m = re.search(pattern, address)
        if m:
            groups = m.groups()
            matched = address[m.start():m.end()]
            if len(groups) == 3:
                if '门' in matched:
                    return f"{groups[0]}幢{groups[1]}门{groups[2]}"
                return f"{groups[0]}幢{groups[1]}单元{groups[2]}"
            elif len(groups) == 2:
                if '北' in matched and '#' in matched:
                    return f"{groups[0]}幢北{groups[1]}#"
                return f"{groups[0]}幢{groups[1]}"
    return None


def is_local(address):
    """判断是否为杭州余杭区仁和的本地房产"""
    if not address:
        return False
    for kw in ["河北省", "唐山市", "安徽省", "亳州市", "蒙城县"]:
        if kw in address:
            return False
    return ("杭州" in address and "余杭" in address) or "仁和街道" in address or "仁和镇" in address

# ======================== 数据解析 ========================
def parse_desc_text(text):
    """从 J_desc 的纯文本中解析房产基础信息字段"""
    result = {}
    patterns = {
        "法院裁定书": r'[（(]\d{4}[）)].{1,10}执\d+号',
        "房地产性质": r'(?:权利性质|房地产性质)[：:\s]+([^\n]+)',
        "建筑面积": r'建筑面积[：:\s]+([\d.]+)',
        "套内面积": r'套内面积[：:\s]+([\d.]+)',
        "土地使用权面积": r'土地使用权面积[：:\s]+([\d.]+)',
        "分摊面积": r'分摊面积[：:\s]+([\d.]+)',
        "用途": r'(?:规划)?用途[：:\s]+([^\n]+)',
        "总楼层": r'总楼层[：:\s]+(\d+)',
        "当前楼层": r'当前楼层[：:\s]+(\d+)',
        "建筑年份": r'(?:建筑年份|建成年份)[：:\s]+(\d{4})',
        "朝向": r'朝向[：:\s]+([^\n]+)',
        "空间布局": r'(?:空间布局|内部格局|户型)[：:\s]+([^\n]+)',
        "梯户比": r'梯户比[：:\s]+([^\n]+)',
        "土地剩余使用期限": r'(?:土地剩余使用期限|土地剩余年限)[：:\s]+([^\n]+)',
        "占有情况": r'占有情况[：:\s]+([^\n]+)',
        "是否已腾空": r'(?:是否已腾空|腾空情况)[：:\s]+([^\n]+)',
        "租赁情况": r'租赁情况[：:\s]+([^\n]+)',
    }
    for key, pat in patterns.items():
        m = re.search(pat, text)
        result[key] = m.group(1).strip() if m else ""

    # 特别提醒：匹配到下一个双空行或特定关键词
    m = re.search(r'特别提醒[：:\s]*\n?([\s\S]+?)(?=\n\s*\n|竞买记录|评估价|起拍价|$)', text)
    result["特别提醒"] = m.group(1).strip() if m else ""

    # 竞买记录
    m = re.search(r'竞买记录[：:\s]+([^\n]+)', text)
    result["竞买记录"] = m.group(1).strip() if m else "无"

    return result


def is_info_complete(base_info):
    """检查基础信息是否已包含完整的详情数据（非仅 item 字段）"""
    # 如果关键字段有值，说明已经成功爬取过详情页
    key_fields = ["建筑面积", "房地产性质", "建筑年份"]
    filled = sum(1 for f in key_fields if base_info.get(f))
    return filled >= 2  # 至少2个关键字段有值视为完整

# ======================== 资源下载 ========================
def download_file(url, save_dir, cookies=None, label=""):
    """下载单个文件到指定目录，自动从 Content-Disposition 获取文件名"""
    try:
        time.sleep(random.uniform(DOWNLOAD_DELAY_MIN, DOWNLOAD_DELAY_MAX))
        resp = requests.get(url, headers=HEADERS, cookies=cookies,
                            timeout=REQUEST_TIMEOUT, stream=True, allow_redirects=True)
        resp.raise_for_status()

        # 从 Content-Disposition 获取文件名
        cd = resp.headers.get('Content-Disposition', '')
        filename = None
        if 'filename=' in cd:
            m = re.search(r"filename\*?=(?:UTF-8''|\"?)([^\";']+)", cd, re.IGNORECASE)
            if m:
                from urllib.parse import unquote
                filename = unquote(m.group(1)).strip()

        if not filename:
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            if 'attach_id=' in url:
                attach_id = url.split('attach_id=')[-1].split('&')[0]
                filename = f"{attach_id}.pdf"

        if not filename or filename in ('', '/', '\\'):
            ext_map = {"附件": ".pdf", "图片": ".jpg", "视频": ".mp4"}
            ext = ext_map.get(label, ".bin")
            filename = hashlib.md5(url.encode()).hexdigest()[:16] + ext

        save_path = save_dir / filename
        if save_path.exists() and save_path.stat().st_size > 0:
            log(f"  [{label}] 已存在: {filename}")
            return True

        save_dir.mkdir(parents=True, exist_ok=True)
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        size_kb = save_path.stat().st_size / 1024
        log(f"  [{label}] 下载成功: {filename} ({size_kb:.1f} KB)")
        return True
    except Exception as e:
        log(f"  [{label}] 下载失败: {url[:80]}... -> {e}")
        return False

# ======================== 主流程 ========================
class Task3Fetcher:
    def __init__(self):
        self.progress = ProgressManager(PROGRESS_FILE)
        self._running = True
        self._first_tab = True
        signal.signal(signal.SIGINT, self._on_interrupt)
        signal.signal(signal.SIGTERM, self._on_interrupt)

    def _on_interrupt(self, signum, frame):
        log("\n收到中断信号 (Ctrl+C)，正在保存进度...")
        self._running = False
        self.progress.save()
        # 尝试关闭浏览器会话
        try:
            wb_call("close_session", {})
        except Exception:
            pass
        log(f"进度已保存，安全退出。下次运行将从断点继续。")
        sys.exit(0)

    # ---------- WebBridge 页面操作 ----------
    def navigate_page(self, url):
        """通过 WebBridge 打开页面并等待加载完成"""
        args = {"url": url}
        if self._first_tab:
            args["newTab"] = True
            args["group_title"] = "法拍详情抓取-Task3"
            self._first_tab = False

        resp = wb_call_retry("navigate", args)
        if not resp.get("ok"):
            raise Exception(f"页面导航失败: {resp.get('error', resp)}")

        # 等待页面关键元素加载
        for attempt in range(5):
            time.sleep(4)
            check = wb_call("evaluate", {"code": "!!document.getElementById('J_desc')"})
            if check.get("ok") and check.get("data", {}).get("value") == "true":
                log(f"  页面加载完成")
                return True
            log(f"  等待页面加载... ({attempt+1}/5)")

        # 最后一次检查，即使 J_desc 不存在也继续（某些页面可能结构不同）
        log("  页面加载超时，继续尝试提取数据")
        return False

    def extract_page_data(self):
        """通过 WebBridge 执行 JS 提取页面数据"""
        js_code = """
(() => {
    // 基础信息区域
    const desc = document.getElementById('J_desc');
    let descText = desc ? desc.innerText : '';

    // 附件下载链接 (J_DownLoadFirst)
    const dlDiv = document.getElementById('J_DownLoadFirst');
    let downloadLinks = [];
    if (dlDiv) {
        downloadLinks = Array.from(dlDiv.querySelectorAll('a'))
            .map(a => a.href)
            .filter(h => h && (h.includes('download_attach') || h.includes('attach_id')));
    }
    // 备用：全局搜索附件链接
    if (downloadLinks.length === 0) {
        downloadLinks = Array.from(document.querySelectorAll('a[href*="download_attach"]'))
            .map(a => a.href);
    }

    // 评估价和起拍价 (从 family-tahoma class 提取)
    let evalPrice = '', startPrice = '';
    document.querySelectorAll('.family-tahoma').forEach(el => {
        const parent = el.parentElement;
        if (!parent || !parent.innerText) return;
        const txt = parent.innerText;
        if (txt.includes('评估价') && !txt.includes('起拍价')) {
            evalPrice = el.innerText.trim();
        }
        if (txt.includes('起拍价')) {
            startPrice = el.innerText.trim();
        }
    });

    // 图片链接 (sf-pic-slide)
    let picLinks = [];
    const picSlide = document.querySelector('.sf-pic-slide');
    if (picSlide) {
        picLinks = Array.from(picSlide.querySelectorAll('img'))
            .map(img => img.dataset.src || img.src)
            .filter(Boolean);
    }
    // 备用：搜索所有 alicdn 图片
    if (picLinks.length === 0) {
        picLinks = Array.from(document.querySelectorAll('img[src*="alicdn"], img[data-src*="alicdn"]'))
            .map(img => img.dataset.src || img.src)
            .filter(s => s && s.includes('paimai'));
    }

    // 视频链接 (player div)
    let videoUrl = '';
    const player = document.getElementById('player');
    if (player) {
        videoUrl = player.dataset.src || '';
        if (!videoUrl) {
            const video = player.querySelector('video');
            if (video) videoUrl = video.src || video.dataset.src || '';
        }
        if (!videoUrl) {
            const source = player.querySelector('source');
            if (source) videoUrl = source.src || '';
        }
    }
    // 备用：从页面源码中搜索视频 URL
    if (!videoUrl) {
        const match = document.body.innerHTML.match(/cloud\\.video\\.taobao\\.com[^"']*\\.mp4/);
        if (match) videoUrl = 'http://' + match[0];
    }

    // Cookie（用于下载附件）
    const cookie = document.cookie;

    return JSON.stringify({
        descText, downloadLinks, picLinks, videoUrl, cookie,
        evalPrice, startPrice
    });
})()
"""
        resp = wb_call_retry("evaluate", {"code": js_code})
        if not resp.get("ok"):
            raise Exception(f"页面数据提取失败: {resp.get('error', resp)}")
        try:
            return json.loads(resp["data"]["value"])
        except Exception as e:
            raise Exception(f"数据解析失败: {e}")

    # ---------- 单条记录处理 ----------
    def process_item(self, idx, item):
        """处理单条房产记录"""
        addr = item.get("property_address", "")
        if not addr:
            log("  跳过: property_address 为空")
            return "skip"

        if not is_local(addr):
            log(f"  跳过非本地房产: {addr[:50]}...")
            return "skip"

        # 解析小区名和楼幢号
        estate_name, community_name = extract_estate(addr)
        building = extract_building(addr)

        if not estate_name or not community_name:
            log(f"  无法解析小区名: {addr[:50]}...")
            return "error"
        if not building:
            log(f"  无法解析楼幢号: {addr[:50]}...")
            return "error"

        # 创建目录结构
        target_dir = COMMUNITY_DIR / community_name / estate_name / building
        target_dir.mkdir(parents=True, exist_ok=True)
        attach_dir = target_dir / "附件"
        img_dir = target_dir / "图片"
        video_dir = target_dir / "视频"
        attach_dir.mkdir(exist_ok=True)
        img_dir.mkdir(exist_ok=True)
        video_dir.mkdir(exist_ok=True)

        log(f"  目录: {community_name}/{estate_name}/{building}")

        # 检查是否已有完整数据
        info_path = target_dir / "基础信息.json"
        if info_path.exists():
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                if is_info_complete(existing):
                    log("  已有完整基础信息，跳过爬取")
                    return "skipped_complete"
                else:
                    log("  已有基础信息但不完整，重新爬取")
            except Exception:
                pass

        # 爬取详情页
        item_link = item.get("item_link", "")
        if not item_link:
            log("  无 item_link，仅保存 item 基础数据")
            self._save_basic_info(info_path, item, {})
            return "no_link"

        log(f"  爬取详情页: {item_link[:80]}...")
        self.navigate_page(item_link)
        page_data = self.extract_page_data()

        # 解析基础信息
        desc_text = page_data.get("descText", "")
        base = parse_desc_text(desc_text)

        # 合并 item 中的字段
        base["court_name"] = item.get("court_name", "")
        base["publish_date"] = item.get("publish_date", "")
        base["property_address"] = item.get("property_address", "")
        base["auction_round"] = item.get("auction_round", "")
        base["item_link"] = item.get("item_link", "")
        base["detail_url"] = item.get("detail_url", "")

        # 评估价/起拍价：优先从页面提取，其次使用 item 数据
        base["评估价"] = page_data.get("evalPrice") or item.get("assessment_price", "")
        base["起拍价"] = page_data.get("startPrice") or item.get("starting_price", "")

        # 保存基础信息
        self._save_basic_info(info_path, item, base)
        log("  已保存基础信息.json")

        # 解析 Cookie（下载附件需要）
        cookies = self._parse_cookies(page_data.get("cookie", ""))

        # 下载附件
        download_links = page_data.get("downloadLinks", [])
        log(f"  发现 {len(download_links)} 个附件")
        for url in download_links:
            download_file(url, attach_dir, cookies=cookies, label="附件")

        # 下载图片
        pic_links = page_data.get("picLinks", [])
        log(f"  发现 {len(pic_links)} 张图片")
        seen_urls = set()
        for url in pic_links:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            # 尝试获取高清原图（移除 _xxxWx.xxx 后缀的尺寸限制）
            clean_url = re.sub(r'_\d+x\d+\.\w+$', '', url)
            if not clean_url.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                clean_url = url  # 如果清理后没有扩展名，用原始 URL
            download_file(clean_url, img_dir, label="图片")

        # 下载视频
        video_url = page_data.get("videoUrl", "")
        if video_url:
            log(f"  发现 1 个视频")
            download_file(video_url, video_dir, label="视频")
        else:
            log("  未发现视频")

        return "ok"

    def _save_basic_info(self, path, item, extra):
        """保存基础信息.json"""
        info = dict(extra) if extra else {}
        # 确保所有字段存在
        defaults = {
            "court_name": item.get("court_name", ""),
            "publish_date": item.get("publish_date", ""),
            "property_address": item.get("property_address", ""),
            "auction_round": item.get("auction_round", ""),
            "item_link": item.get("item_link", ""),
            "detail_url": item.get("detail_url", ""),
            "评估价": item.get("assessment_price", ""),
            "起拍价": item.get("starting_price", ""),
            "法院裁定书": "", "房地产性质": "", "建筑面积": "", "套内面积": "",
            "土地使用权面积": "", "分摊面积": "", "用途": "",
            "总楼层": "", "当前楼层": "", "建筑年份": "",
            "朝向": "", "空间布局": "", "梯户比": "",
            "土地剩余使用期限": "", "特别提醒": "", "竞买记录": "无",
            "占有情况": "", "是否已腾空": "", "租赁情况": "",
        }
        for k, v in defaults.items():
            info.setdefault(k, v)

        with open(path, "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, indent=2)

    def _parse_cookies(self, cookie_str):
        """解析 cookie 字符串为字典"""
        cookies = {}
        if not cookie_str:
            return cookies
        for pair in cookie_str.split('; '):
            if '=' in pair:
                k, v = pair.split('=', 1)
                cookies[k] = v
        return cookies

    # ---------- 主循环 ----------
    def run(self):
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
        log(f"WebBridge: {WB_URL}")

        stats = {"ok": 0, "skip": 0, "skipped_complete": 0, "error": 0, "no_link": 0}

        for i in range(start, total):
            if not self._running:
                break

            item = items[i]
            self.progress.set_count(i)

            title = item.get("title", item.get("property_address", ""))
            log(f"\n{'='*60}")
            log(f"[{i+1}/{total}] {title[:70]}")
            log(f"{'='*60}")

            try:
                result = self.process_item(i, item)
                stats[result] = stats.get(result, 0) + 1
                if result == "skipped_complete":
                    self.progress.inc_skipped()
            except Exception as e:
                log(f"  异常: {e}")
                self.progress.add_error(i, title, str(e))
                stats["error"] = stats.get("error", 0) + 1

            # 随机延迟，防止被封禁
            if i < total - 1:
                delay = random.uniform(MIN_DELAY, MAX_DELAY)
                log(f"  等待 {delay:.1f}s...")
                time.sleep(delay)

        # 完成
        self.progress.set_count(total)

        # 关闭 WebBridge 会话
        try:
            wb_call("close_session", {})
        except Exception:
            pass

        log(f"\n{'='*60}")
        log(f"处理完毕！统计:")
        log(f"  成功爬取: {stats.get('ok', 0)}")
        log(f"  已有完整数据跳过: {stats.get('skipped_complete', 0)}")
        log(f"  跳过（非本地/无地址）: {stats.get('skip', 0)}")
        log(f"  无 item_link: {stats.get('no_link', 0)}")
        log(f"  失败: {stats.get('error', 0)}")
        log(f"{'='*60}")


# ======================== 入口 ========================
if __name__ == "__main__":
    log("=" * 60)
    log("仁和房产法拍详情抓取脚本 (Task3) 启动")
    log("=" * 60)
    fetcher = Task3Fetcher()
    fetcher.run()
