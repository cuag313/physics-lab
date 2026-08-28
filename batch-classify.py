"""
批量图片分类脚本（Kimi Vision API）
====================================
用 Kimi 识别物理实验器材图片，自动分拣到对应分类目录
支持断点续传
"""
import os
import json
import base64
import shutil
import time
import sys
from pathlib import Path
from datetime import datetime
import requests

# ─── 配置 ──────────────────────────────────────────────
ICONS_DIR = Path(r"D:\PythonProject\physics-lab\dist\assets\icons")
OUTPUT_DIR = Path(r"D:\PythonProject\physics-lab\public\categorized")
LOG_FILE = Path(r"D:\PythonProject\physics-lab\classify_log.json")
BATCH_SIZE = 5
API_URL = "https://api.moonshot.cn/v1/chat/completions"
MODEL = "moonshot-v1-8k-vision-preview"

CATEGORIES = {
    "mechanics":        "力学",
    "electromagnetism": "电磁学",
    "optics":           "光学",
    "thermal":          "热学",
    "acoustics":        "声学",
    "modern":           "近代物理",
    "chemistry":        "化学",
    "ui-element":       "UI元素",
    "other":            "其他"
}

PROMPT = """你是物理实验器材分类专家。识别图片内容，输出JSON。

分类选项：
- mechanics：力学（弹簧、测力计、天平、滑轮、杠杆、小车、单摆、气垫导轨、斜面、木块、砝码、刻度尺等）
- electromagnetism：电磁学（电流表、电压表、电阻、电池、开关、灯泡、导线、线圈、磁铁、电路板等）
- optics：光学（透镜、棱镜、平面镜、光屏、光源、放大镜、显微镜等）
- thermal：热学（温度计、酒精灯、烧杯、试管、蒸发皿、量热器等）
- acoustics：声学（音叉、扬声器等）
- modern：近代物理（光电管、放射源、光谱仪等）
- chemistry：化学（试管架、锥形瓶、集气瓶等）
- ui-element：UI元素（按钮、图标、箭头等小图形）
- other：其他/无法识别

只输出JSON：{"category":"分类","name":"器材名"}"""

def load_log():
    if LOG_FILE.exists():
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_log(log):
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

def classify_one(api_key, fname, fpath):
    with open(fpath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = fpath.suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={
            "model": MODEL,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text", "text": PROMPT}
                ]
            }],
            "max_tokens": 80,
            "temperature": 0
        },
        timeout=30
    )

    if resp.status_code != 200:
        return {"category": "other", "name": f"API错误:{resp.status_code}"}

    text = resp.json()["choices"][0]["message"]["content"].strip()
    if "{" in text:
        try:
            json_str = text[text.index("{"):text.rindex("}") + 1]
            result = json.loads(json_str)
            cat = result.get("category", "other")
            if cat not in CATEGORIES:
                cat = "other"
            result["category"] = cat
            return result
        except:
            pass
    return {"category": "other", "name": "解析失败"}

def main():
    api_key = os.getenv("KIMI_API_KEY", "")
    if not api_key:
        print("错误：请设置 KIMI_API_KEY")
        sys.exit(1)

    for cat in CATEGORIES:
        (OUTPUT_DIR / cat).mkdir(parents=True, exist_ok=True)

    log = load_log()
    print(f"已有进度: {len(log)} 张\n")

    all_images = sorted([
        f for f in ICONS_DIR.iterdir()
        if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif", ".webp")
    ])
    pending = [f for f in all_images if f.name not in log]
    print(f"待处理: {len(pending)} / {len(all_images)}\n")

    if not pending:
        print("全部处理完毕！")
        return

    start_time = time.time()
    for i, fpath in enumerate(pending):
        fname = fpath.name
        try:
            result = classify_one(api_key, fname, fpath)
            cat = result["category"]

            dst = OUTPUT_DIR / cat / fname
            if fpath.exists():
                shutil.copy2(str(fpath), str(dst))

            log[fname] = result
            save_log(log)

            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(pending) - i - 1) / rate if rate > 0 else 0
            print(f"[{i+1}/{len(pending)}] {fname[:30]:30s} → {cat:16s} {result.get('name','')[:20]:20s} ETA:{eta/60:.0f}min")

            time.sleep(0.5)  # 限速

        except KeyboardInterrupt:
            print(f"\n中断！已保存 {len(log)} 条进度")
            break
        except Exception as e:
            print(f"[{i+1}/{len(pending)}] {fname[:30]:30s} → 错误: {str(e)[:40]}")
            log[fname] = {"category": "other", "name": str(e)[:50]}
            save_log(log)

    from collections import Counter
    cats = Counter(r.get("category", "other") for r in log.values())
    print(f"\n完成！共 {len(log)} 张")
    for cat, count in cats.most_common():
        print(f"  {CATEGORIES.get(cat, cat):16s}: {count}")

if __name__ == "__main__":
    main()
