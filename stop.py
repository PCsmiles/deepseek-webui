#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""停掉后台的 deepseek 聊天服务（按端口找进程，只杀它，不动别的 python）"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def port() -> int:
    try:
        return int((ROOT / "data" / "port.txt").read_text(encoding="utf-8").strip())
    except Exception:
        return 8765


def pids_on(p: int) -> set[str]:
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True,
                             encoding="gbk", errors="replace").stdout
    except Exception:
        return set()
    hits = set()
    for line in out.splitlines():
        if f":{p}" in line and "LISTENING" in line.upper():
            m = re.search(r"(\d+)\s*$", line.strip())
            if m:
                hits.add(m.group(1))
    return hits


def main() -> None:
    p = port()
    found = pids_on(p)
    if not found:
        print(f"服务没在跑（{p} 端口上没人监听）")
        return
    for pid in found:
        r = subprocess.run(["taskkill", "/F", "/T", "/PID", pid],
                           capture_output=True, text=True, encoding="gbk", errors="replace")
        ok = r.returncode == 0
        print(f"{'已停止' if ok else '停不掉'}（PID {pid}）")
    print("服务已停。" if pids_on(p) == set() else "还有残留，再跑一次试试。")


if __name__ == "__main__":
    main()
