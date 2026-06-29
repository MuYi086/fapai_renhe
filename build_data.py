import json
import os
import re
from pathlib import Path

# 1. 从 仁和街道小区.md 提取 community.json
community_data = {}
with open('仁和街道小区.md', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or ':' not in line:
            continue
        # 支持中文冒号和英文冒号
        line = line.replace('：', ':')
        parts = line.split(':', 1)
        community = parts[0].strip()
        estates_str = parts[1].strip()
        # 按、或,分隔
        estates = [e.strip() for e in re.split('[、,，]', estates_str) if e.strip()]
        community_data[community] = estates

with open('web/public/community.json', 'w', encoding='utf-8') as f:
    json.dump(community_data, f, ensure_ascii=False, indent=2)

print(f"community.json 已生成，共 {len(community_data)} 个社区")

# 2. 合并所有基础信息.json -> house.json
root_dir = Path('仁和社区总览')
records = []

for community_dir in root_dir.iterdir():
    if not community_dir.is_dir():
        continue
    community_name = community_dir.name
    for estate_dir in community_dir.iterdir():
        if not estate_dir.is_dir():
            continue
        estate_name = estate_dir.name
        for room_dir in estate_dir.iterdir():
            if not room_dir.is_dir():
                continue
            room_name = room_dir.name
            info_file = room_dir / '基础信息.json'
            if not info_file.exists():
                continue
            with open(info_file, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError as e:
                    print(f"JSON解析失败: {info_file}, 错误: {e}")
                    continue
            # 增加字段
            data['社区'] = community_name
            data['小区名'] = estate_name
            data['房间号'] = room_name
            records.append(data)

# 按 publish_date 倒序排序
def parse_date(d):
    if not d:
        return ''
    # 处理 "2020.03.31" 格式
    return d.replace('.', '-')

records.sort(key=lambda x: parse_date(x.get('publish_date', '')), reverse=True)

with open('web/public/house.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"house.json 已生成，共 {len(records)} 条记录")
