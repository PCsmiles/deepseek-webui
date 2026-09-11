#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
静默启动器（双击桌面图标时跑的就是它）
  1. 服务已经在跑 → 只打开浏览器，什么都不启动
  2. 没在跑 → 在后台把服务拉起来（无窗口），等它就绪后打开浏览器
全程不弹任何黑框。想停服务用 stop.py。
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT_FILE = ROOT / "data" / "port.txt"
DEFAULT_PORT = 8765


def alive(port: int, timeout: float = 0.6) -> bool:
    s = socket.socket()
    s.settimeout(timeout)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def known_port() -> int:
    try:
        p = int(PORT_FILE.read_text(encoding="utf-8").strip())
        return p if 1 <= p <= 65535 else DEFAULT_PORT
    except Exception:
        return DEFAULT_PORT


def pythonw() -> str:
    """找无窗口解释器 pythonw.exe（跟当前解释器同目录）"""
    cand = Path(sys.executable).with_name("pythonw.exe")
    if cand.exists():
        return str(cand)
    import shutil
    return shutil.which("pythonw") or sys.executable


def main() -> None:
    port = known_port()
    if alive(port):
        print(f"[silent] 服务已在 {port} 跑着，只开浏览器")
        webbrowser.open(f"http://127.0.0.1:{port}/")
        return

    print("[silent] 服务没在跑，后台拉起…")
    env = dict(os.environ)
    env["DSUI_SILENT"] = "1"                     # 让它把日志写文件
    DETACHED = 0x00000008
    NOWINDOW = 0x08000000
    flags = DETACHED | NOWINDOW if os.name == "nt" else 0
    subprocess.Popen(
        [pythonw(), str(ROOT / "server.py"), "--no-browser"],
        cwd=str(ROOT), env=env, close_fds=True, creationflags=flags,
    )

    # 等它就绪（最多 30 秒）
    for _ in range(60):
        time.sleep(0.5)
        if alive(known_port()) or alive(DEFAULT_PORT):
            port = known_port() if alive(known_port()) else DEFAULT_PORT
            break
    else:
        print("[silent] 等了 30 秒服务还没起来，去 data/server.log 看原因")
        webbrowser.open(f"http://127.0.0.1:{port}/")
        return

    print(f"[silent] 起来了，打开 http://127.0.0.1:{port}/")
    webbrowser.open(f"http://127.0.0.1:{port}/")


if __name__ == "__main__":
    main()
