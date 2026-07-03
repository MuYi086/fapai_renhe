#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
遍历仁和社区总览 -> 所有社区 -> 所有小区 -> 门牌号 -> 附件
使用 MineU Precision Extract API 将附件解析为 Markdown 文件，放到同一附件目录下。
"""
import os
import sys
import time
import zipfile
import io
import requests
import subprocess

# 配置
BASE_DIR = "仁和社区总览"
API_BASE = "https://mineru.net/api/v4"
SUPPORTED_EXTS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".png", ".jpg", ".jpeg", ".jp2", ".webp", ".gif", ".bmp",
}
POLL_INTERVAL = 5      # 轮询间隔（秒）
POLL_TIMEOUT = 300       # 单文件轮询超时（秒）
UPLOAD_TIMEOUT = 120   # 上传超时（秒）
DOWNLOAD_TIMEOUT = 60  # 下载超时（秒）


def get_api_key():
    """从环境变量获取 MINEU_API_KEY"""
    key = os.environ.get("MINEU_API_KEY")
    if key:
        return key
    raise ValueError("MINEU_API_KEY not found in environment. "
                     "请确保在执行前已执行: source ~/.bashrc")


API_KEY = get_api_key()
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def get_upload_url(filename):
    """申请 MineU 单文件上传 URL（使用 batch 接口但只传 1 个文件）"""
    url = f"{API_BASE}/file-urls/batch"
    data = {
        "files": [{"name": filename}],
        "model_version": "vlm",
        "language": "ch",
    }
    resp = requests.post(url, headers=HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    result = resp.json()
    if result.get("code") != 0:
        raise Exception(f"申请上传URL失败: {result.get('msg', result)}")
    return result["data"]["batch_id"], result["data"]["file_urls"][0]


def upload_file(file_path, upload_url):
    """PUT 上传文件到 OSS 签名地址"""
    with open(file_path, "rb") as f:
        resp = requests.put(upload_url, data=f, timeout=UPLOAD_TIMEOUT)
    if resp.status_code not in (200, 201):
        raise Exception(f"上传失败，HTTP {resp.status_code}")


def poll_batch_result(batch_id, timeout=POLL_TIMEOUT):
    """轮询 batch 提取结果，直到完成或失败"""
    url = f"{API_BASE}/extract-results/batch/{batch_id}"
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(url, headers={"Authorization": f"Bearer {API_KEY}"}, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        if result.get("code") != 0:
            raise Exception(f"轮询结果失败: {result.get('msg', result)}")
        item = result["data"]["extract_result"][0]
        state = item["state"]
        if state == "done":
            return item["full_zip_url"]
        if state == "failed":
            raise Exception(f"MineU 解析失败: {item.get('err_msg', 'unknown')}")
        elapsed = int(time.time() - start)
        log(f"  解析中... [{elapsed}s] state={state}")
        time.sleep(POLL_INTERVAL)
    raise Exception("轮询超时")


def download_md(zip_url, output_path):
    """从 zip 包中提取 full.md 并保存"""
    resp = requests.get(zip_url, timeout=DOWNLOAD_TIMEOUT)
    resp.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    # 优先找 full.md
    for name in z.namelist():
        if name.endswith("full.md") or name == "full.md":
            with z.open(name) as f:
                content = f.read().decode("utf-8", errors="ignore")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
    # 备选：找任何 .md
    for name in z.namelist():
        if name.endswith(".md"):
            with z.open(name) as f:
                content = f.read().decode("utf-8", errors="ignore")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
    return False


def collect_pending_files():
    """收集所有待解析的附件文件（跳过已存在同名 .md 的）"""
    pending = []
    for root, _, filenames in os.walk(BASE_DIR):
        if "附件" not in root:
            continue
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue
            md_name = os.path.splitext(filename)[0] + ".md"
            md_path = os.path.join(root, md_name)
            if os.path.exists(md_path):
                continue
            pending.append(os.path.join(root, filename))
    return pending


def main():
    log("=" * 60)
    log("MineU 附件解析脚本启动")
    log("=" * 60)

    files = collect_pending_files()
    total = len(files)
    log(f"待解析文件数量: {total}")
    if total == 0:
        log("所有附件已解析完成，无需处理。")
        return

    success_count = 0
    fail_count = 0
    skip_count = 0

    for i, file_path in enumerate(files, 1):
        filename = os.path.basename(file_path)
        md_name = os.path.splitext(filename)[0] + ".md"
        md_path = os.path.join(os.path.dirname(file_path), md_name)
        error_path = md_path + ".error"

        log(f"\n[{i}/{total}] {filename}")
        try:
            batch_id, upload_url = get_upload_url(filename)
            log(f"  batch_id: {batch_id}")
            upload_file(file_path, upload_url)
            log(f"  上传完成，等待解析...")
            zip_url = poll_batch_result(batch_id)
            log(f"  解析完成，下载 Markdown...")
            ok = download_md(zip_url, md_path)
            if ok:
                log(f"  [OK] 已保存: {md_path}")
                success_count += 1
                # 清除旧的错误标记
                if os.path.exists(error_path):
                    os.remove(error_path)
            else:
                log(f"  [FAIL] ZIP 中未找到 Markdown 文件")
                fail_count += 1
                with open(error_path, "w", encoding="utf-8") as f:
                    f.write("ZIP 中未找到 Markdown 文件")
        except Exception as e:
            log(f"  [ERR] 错误: {e}")
            fail_count += 1
            with open(error_path, "w", encoding="utf-8") as f:
                f.write(str(e))

    log("\n" + "=" * 60)
    log(f"处理完毕: 成功 {success_count}, 失败 {fail_count}, 跳过 {skip_count}")
    log("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n用户中断，已保存进度，可重新运行脚本继续。")
        sys.exit(1)
    except Exception as e:
        log(f"脚本异常退出: {e}")
        sys.exit(1)
