#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把前端要用的第三方库下载到 static/vendor/，这样断网也能用。

跑一次就够了：  python install_assets.py

没跑过也能用（网页会自动去 CDN 拿），只是断网时公式和高亮会失效。
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("[x] 没装 requests。先运行:  python -m pip install requests")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "static" / "vendor"
FONTS = VENDOR / "fonts"
VENDOR.mkdir(parents=True, exist_ok=True)

JSD = "https://cdn.jsdelivr.net/npm"
KATEX_V = "0.16.11"

# 每个条目：本地文件名 -> 候选下载地址（第一个不行就试第二个）
FILES: dict[str, list[str]] = {
    "marked.min.js": [
        f"{JSD}/marked@12.0.2/marked.min.js",
        f"{JSD}/marked/marked.min.js",
    ],
    "highlight.min.js": [
        f"{JSD}/@highlightjs/cdn-assets@11.9.0/highlight.min.js",
        f"{JSD}/@highlightjs/cdn-assets/highlight.min.js",
    ],
    "github-dark.min.css": [
        f"{JSD}/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css",
        f"{JSD}/@highlightjs/cdn-assets/styles/github-dark.min.css",
    ],
    "github.min.css": [
        f"{JSD}/@highlightjs/cdn-assets@11.9.0/styles/github.min.css",
        f"{JSD}/@highlightjs/cdn-assets/styles/github.min.css",
    ],
    "katex.min.js": [
        f"{JSD}/katex@{KATEX_V}/dist/katex.min.js",
        f"{JSD}/katex/dist/katex.min.js",
    ],
    "katex.min.css": [
        f"{JSD}/katex@{KATEX_V}/dist/katex.min.css",
        f"{JSD}/katex/dist/katex.min.css",
    ],
    # UI 字体（可变字重）：西文/数字用 Inter，代码用 JetBrains Mono；中文自动走系统字体
    "inter-var.woff2": [
        f"{JSD}/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    ],
    "jetbrains-mono-var.woff2": [
        f"{JSD}/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    ],
    "auto-render.min.js": [
        f"{JSD}/katex@{KATEX_V}/dist/contrib/auto-render.min.js",
        f"{JSD}/katex/dist/contrib/auto-render.min.js",
    ],
}

# KaTeX 的字体（数学符号全靠它们，缺了公式会显示成方框）
KATEX_FONTS = [
    "KaTeX_AMS-Regular", "KaTeX_Caligraphic-Bold", "KaTeX_Caligraphic-Regular",
    "KaTeX_Fraktur-Bold", "KaTeX_Fraktur-Regular", "KaTeX_Main-Bold",
    "KaTeX_Main-BoldItalic", "KaTeX_Main-Italic", "KaTeX_Main-Regular",
    "KaTeX_Math-BoldItalic", "KaTeX_Math-Italic", "KaTeX_SansSerif-Bold",
    "KaTeX_SansSerif-Italic", "KaTeX_SansSerif-Regular", "KaTeX_Script-Regular",
    "KaTeX_Size1-Regular", "KaTeX_Size2-Regular", "KaTeX_Size3-Regular",
    "KaTeX_Size4-Regular", "KaTeX_Typewriter-Regular",
]


def fetch(urls: list[str], dest: Path) -> bool:
    for u in urls:
        try:
            r = requests.get(u, timeout=40)
            if r.status_code == 200 and r.content:
                dest.write_bytes(r.content)
                return True
        except Exception:
            continue
    return False


def human(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1048576:.1f} MB"


def main() -> None:
    print("=" * 58)
    print("  下载前端依赖到 static/vendor/")
    print("=" * 58)
    ok = fail = 0

    for name, urls in FILES.items():
        dest = VENDOR / name
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"  [跳过] {name:24s} 已经有了 ({human(dest.stat().st_size)})")
            ok += 1
            continue
        if fetch(urls, dest):
            print(f"  [OK]   {name:24s} {human(dest.stat().st_size)}")
            ok += 1
        else:
            print(f"  [失败] {name:24s} 下载不了")
            fail += 1

    print("-" * 58)
    print(f"  字体 {len(KATEX_FONTS)} 个 -> static/vendor/fonts/")
    FONTS.mkdir(parents=True, exist_ok=True)
    got = 0
    for f in KATEX_FONTS:
        dest = FONTS / f"{f}.woff2"
        if dest.exists() and dest.stat().st_size > 500:
            got += 1
            continue
        if fetch([f"{JSD}/katex@{KATEX_V}/dist/fonts/{f}.woff2",
                  f"{JSD}/katex/dist/fonts/{f}.woff2"], dest):
            got += 1
    print(f"  [{'OK' if got == len(KATEX_FONTS) else '部分失败'}] 拿到 {got}/{len(KATEX_FONTS)} 个字体")
    if got < len(KATEX_FONTS):
        fail += 1

    print("=" * 58)
    if fail == 0:
        print("  全部搞定，现在完全离线也能用（Markdown / 代码高亮 / 公式）。")
    elif ok > 0:
        print("  部分成功。缺的那部分网页会自动去 CDN 拿（需要联网）。")
        print("  想重试：删掉 static/vendor 里对应的文件再跑一次本脚本。")
    else:
        print("  全部失败：检查网络，或看看是不是需要代理。")
        print("  不影响使用：网页会自动去 CDN 拿这些库。")
    print("=" * 58)


if __name__ == "__main__":
    main()
