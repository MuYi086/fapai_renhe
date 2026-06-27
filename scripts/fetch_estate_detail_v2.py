#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
仁和房产法拍详情抓取脚本 V2（使用 WebBridge 绕过反爬）

功能：
1. 遍历 result\仁和房产.json
2. 使用 WebBridge 打开浏览器访问详情页
3. 提取 J_desc 中的基础信息、附件、图片、视频
4. 下载所有资源到对应目录
5. 支持断点续传

用法：python scripts/fetch_estate_detail_v2.py
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

# ======================== 配置 ========================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_JSON = BASE_DIR / "result" / "仁和房产.json"
COMMUNITY_DIR = BASE_DIR / "仁和社区总览"
PROGRESS_FILE = BASE_DIR / "result" / "progress_v2.json"
LOG_FILE = BASE_DIR / "result" / "fetch_v2.log"

WB_URL = "http://127.0.0.1:10086/command"
WB_SESSION = "estate-fetch-v2"

MIN_DELAY = 3.0
MAX_DELAY = 6.0

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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
    "美地兰庭": "美的兰庭", "尚堂久里": "尚堂九里",
    "金鼎阳光公寓": "金鼎阳光", "仁和金鼎公寓": "金鼎公寓",
    "仁和北成芳满庭": "北成芳满庭", "金鼎华庭": "金顶华庭",
}
_ALL_ESTATE_NAMES = sorted(list(ESTATE_MAP.keys()) + list(ESTATE_ALIASES.keys()), key=len, reverse=True)

# ======================== 日志 ========================
def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except:
        pass

# ======================== WebBridge ========================
def wb_call(action, args):
    req = {"action": action, "args": args, "session": WB_SESSION}
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(req, f)
        tmp_path = f.name
    cmd = f'curl.exe -s -X POST {WB_URL} -H "Content-Type: application/json" --data-binary "@{tmp_path}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    os.unlink(tmp_path)
    try:
        return json.loads(result.stdout)
    except:
        return {"error": "parse_failed", "raw": result.stdout[:300]}

def wb_call_retry(action, args, max_retry=3):
    for i in range(max_retry):
        resp = wb_call(action, args)
        if resp.get("ok"):
            return resp
        log(f"  WebBridge 调用失败，重试 {i+1}/{max_retry}...")
        time.sleep(2)
    return resp

# ======================== 地址解析 ========================
def extract_estate(address):
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
                return f"{groups[0]}幢{groups[1]}门{groups[2]}" if '门' in matched else f"{groups[0]}幢{groups[1]}单元{groups[2]}"
            elif len(groups) == 2:
                if '北' in matched and '#' in matched:
                    return f"{groups[0]}幢北{groups[1]}#"
                return f"{groups[0]}幢{groups[1]}"
    return None

def is_local(address):
    if not address:
        return False
    for k in ["河北省", "唐山市", "安徽省", "亳州市", "蒙城县"]:
        if k in address:
            return False
    return ("杭州" in address and "余杭" in address) or "仁和街道" in address or "仁和镇" in address

# ======================== 数据解析 ========================
def parse_desc(text):
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
    
    # 特别提醒
    m = re.search(r'特别提醒[：:\s]*\n?([\s\S]+?)(?=\n\s*\n|竞买记录|评估价|起拍价|$)', text)
    result["特别提醒"] = m.group(1).strip() if m else ""
    
    # 竞买记录
    m = re.search(r'竞买记录[：:\s]+([^\n]+)', text)
    result["竞买记录"] = m.group(1).strip() if m else "无"
    
    return result

def parse_cookies(cookie_str):
    cookies = {}
    for pair in cookie_str.split('; '):
        if '=' in pair:
            k, v = pair.split('=', 1)
            cookies[k] = v
    return cookies

# ======================== 下载 ========================
def download(url, save_path, cookies=None, label=""):
    try:
        time.sleep(random.uniform(0.5, 1.5))
        resp = requests.get(url, headers=HEADERS, cookies=cookies, timeout=30, stream=True)
        resp.raise_for_status()
        
        cd = resp.headers.get('Content-Disposition', '')
        if 'filename=' in cd:
            m = re.search(r'filename="?([^"]+)"?', cd)
            if m:
                save_path = save_path.parent / m.group(1)
        
        if save_path.exists():
            log(f"  [{label}] 已存在: {save_path.name}")
            return True
        
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        log(f"  [{label}] 下载成功: {save_path.name}")
        return True
    except Exception as e:
        log(f"  [{label}] 下载失败: {e}")
        return False

# ======================== 进度 ========================
class Progress:
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"count": 0, "total": 0, "errors": []}
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                log(f"已加载进度: count={self.data.get('count', 0)}")
            except:
                pass
    
    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
    
    def get(self): return self.data.get("count", 0)
    def set(self, v): self.data["count"] = v; self.save()
    def err(self, idx, info, reason):
        self.data.setdefault("errors", []).append({
            "index": idx, "info": info, "reason": str(reason), "time": time.strftime('%Y-%m-%d %H:%M:%S')
        })
        self.save()

# ======================== 主类 ========================
class Fetcher:
    def __init__(self):
        self.progress = Progress(PROGRESS_FILE)
        self._running = True
        self._first = True
        signal.signal(signal.SIGINT, lambda s, f: self._stop())
        signal.signal(signal.SIGTERM, lambda s, f: self._stop())
    
    def _stop(self):
        log("\n收到中断信号，保存进度...")
        self._running = False
        self.progress.save()
        wb_call("close_session", {})
        sys.exit(0)
    
    def _navigate(self, url):
        args = {"url": url}
        if self._first:
            args["newTab"] = True
            args["group_title"] = "法拍详情抓取"
            self._first = False
        resp = wb_call_retry("navigate", args)
        if not resp.get("ok"):
            raise Exception(f"navigate failed: {resp}")
        
        # 等待页面加载，检查 J_desc
        for attempt in range(4):
            time.sleep(5)
            check = wb_call("evaluate", {"code": "!!document.getElementById('J_desc')"})
            if check.get("ok") and check.get("data", {}).get("value") == "true":
                log(f"  页面加载完成")
                return
            log(f"  页面未加载，重试 {attempt+1}/4...")
        
        raise Exception("页面加载超时")
    
    def _extract(self):
        js = """
(() => {
    const desc = document.getElementById('J_desc');
    const download = document.getElementById('J_DownLoadFirst');
    const player = document.getElementById('player');
    const pics = document.querySelector('.sf-pic-slide');
    const cookie = document.cookie;
    
    let evalPrice = '', startPrice = '';
    document.querySelectorAll('.family-tahoma').forEach(el => {
        const p = el.parentElement;
        if (p && p.innerText && p.innerText.includes('评估价')) evalPrice = el.innerText.trim();
        if (p && p.innerText && p.innerText.includes('起拍价')) startPrice = el.innerText.trim();
    });
    
    return JSON.stringify({
        descText: desc ? desc.innerText : '',
        downloadLinks: download ? Array.from(download.querySelectorAll('a')).map(a => a.href) : [],
        videoUrl: player ? (player.dataset.src || player.querySelector('video')?.src || '') : '',
        picLinks: pics ? Array.from(pics.querySelectorAll('img')).map(img => img.dataset.src || img.src).filter(Boolean) : [],
        cookie: cookie,
        evalPrice, startPrice
    });
})()
"""
        resp = wb_call_retry("evaluate", {"code": js})
        if not resp.get("ok"):
            raise Exception(f"evaluate failed: {resp}")
        return json.loads(resp["data"]["value"])
    
    def run(self):
        if not DATA_JSON.exists():
            log(f"数据文件不存在: {DATA_JSON}")
            return
        
        with open(DATA_JSON, "r", encoding="utf-8") as f:
            items = json.load(f)
        
        total = len(items)
        self.progress.data["total"] = total
        self.progress.save()
        start = self.progress.get()
        
        log(f"共 {total} 条记录，从第 {start+1} 条开始")
        
        for i in range(start, total):
            if not self._running:
                break
            
            item = items[i]
            self.progress.set(i)
            
            log(f"\n[{i+1}/{total}] {item.get('title', '')[:60]}...")
            
            try:
                self._process(item)
            except Exception as e:
                log(f"  异常: {e}")
                self.progress.err(i, item.get("title", ""), str(e))
            
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
        
        self.progress.set(total)
        wb_call("close_session", {})
        log(f"\n处理完毕")
    
    def _process(self, item):
        addr = item.get("property_address", "")
        if not addr or not is_local(addr):
            log("  跳过")
            return
        
        estate, community = extract_estate(addr)
        building = extract_building(addr)
        if not estate or not community or not building:
            log(f"  解析失败: {addr[:50]}...")
            return
        
        d = COMMUNITY_DIR / community / estate / building
        d.mkdir(parents=True, exist_ok=True)
        attach_dir = d / "附件"
        img_dir = d / "图片"
        video_dir = d / "视频"
        attach_dir.mkdir(exist_ok=True)
        img_dir.mkdir(exist_ok=True)
        video_dir.mkdir(exist_ok=True)
        
        link = item.get("item_link", "")
        if not link:
            log("  无 item_link")
            return
        
        self._navigate(link)
        data = self._extract()
        
        # 解析基础信息
        base = parse_desc(data.get("descText", ""))
        base.update({
            "court_name": item.get("court_name", ""),
            "publish_date": item.get("publish_date", ""),
            "property_address": item.get("property_address", ""),
            "auction_round": item.get("auction_round", ""),
            "item_link": item.get("item_link", ""),
            "detail_url": item.get("detail_url", ""),
            "评估价": data.get("evalPrice") or item.get("assessment_price", ""),
            "起拍价": data.get("startPrice") or item.get("starting_price", ""),
        })
        
        with open(d / "基础信息.json", "w", encoding="utf-8") as f:
            json.dump(base, f, ensure_ascii=False, indent=2)
        log("  已保存基础信息")
        
        # Cookie
        cookies = parse_cookies(data.get("cookie", ""))
        
        # 附件
        for url in data.get("downloadLinks", []):
            fname = urlparse(url).query.split('=')[-1] if 'attach_id=' in url else "attachment"
            download(url, attach_dir / (fname + ".pdf"), cookies, "附件")
        
        # 图片
        seen = set()
        for url in data.get("picLinks", []):
            if url in seen:
                continue
            seen.add(url)
            fname = os.path.basename(urlparse(url).path) or (hashlib.md5(url.encode()).hexdigest()[:16] + ".jpg")
            download(url, img_dir / fname, None, "图片")
        
        # 视频
        vurl = data.get("videoUrl", "")
        if vurl:
            fname = os.path.basename(urlparse(vurl).path) or "video.mp4"
            download(vurl, video_dir / fname, None, "视频")

if __name__ == "__main__":
    log("=" * 60)
    log("仁和房产法拍详情抓取 V2 启动")
    log("=" * 60)
    Fetcher().run()
