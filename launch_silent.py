#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
静默启动器（双击桌面图标时跑的就是它）
  1. 服务已经在跑 → 只打开浏览器，什么都不启动
  2. 没在跑 → 在后台把服务拉起来（无窗口），等它就绪后打开浏览器
全程不弹任何黑框。想停服务用 stop.py。
"""

from __future__ import annotations

import contextlib
import json
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _find_cfg():
    """配置文件的找法跟 server.py 完全一样（打包版在程序目录的上一级）"""
    for cand in (os.environ.get("JY_CONFIG"),
                 str(ROOT.parent / "config.json"),
                 str(ROOT / "config.json")):
        if cand and Path(cand).is_file():
            with contextlib.suppress(Exception):
                d = json.loads(Path(cand).read_text(encoding="utf-8-sig"))
                if isinstance(d, dict):
                    return Path(cand), d
    return None, {}


CONFIG_PATH, CFG = _find_cfg()
DATA_DIR = Path(os.environ.get("JY_DATA_DIR")
                or str(CFG.get("data_dir") or "").strip()
                or str(ROOT / "data"))
PORT_FILE = DATA_DIR / "port.txt"
DEFAULT_PORT = int(CFG.get("port") or 80)
# 网址用 *.localhost：浏览器把它当"安全上下文"，PWA（装成 App / 离线秒开）才生效；
# 别的后缀（比如 deepseek.local）能解析但不算安全上下文（实测过）
PRETTY_HOST = str(CFG.get("pretty_host") or "deepseek.localhost").strip() or "deepseek.localhost"


def pretty_url(port: int) -> str:
    """优先用好记的域名（hosts 里配过才有效），没有就退回 IP"""
    try:
        socket.gethostbyname(PRETTY_HOST)
        host = PRETTY_HOST
    except Exception:
        host = "127.0.0.1"
    return f"http://{host}{'' if port == 80 else ':' + str(port)}/"


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
    # 干活模式的起始目录：顺手建出来（第一次跑就让它有个落脚点，不至于落到家目录乱翻）
    ws = str((CFG.get("agent") or {}).get("workspace") or "").strip()
    if ws:
        with contextlib.suppress(Exception):
            Path(ws).mkdir(parents=True, exist_ok=True)

    port = known_port()
    if alive(port):
        print(f"[silent] 服务已在 {port} 跑着，只开浏览器")
        webbrowser.open(pretty_url(port))
        return

    print("[silent] 服务没在跑，后台拉起…")
    env = dict(os.environ)
    env["DSUI_SILENT"] = "1"                     # 让它把日志写文件
    env["JY_DATA_DIR"] = str(DATA_DIR)           # 数据目录跟这里保持一致
    if CONFIG_PATH:
        env["JY_CONFIG"] = str(CONFIG_PATH)
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
        webbrowser.open(pretty_url(port))
        return

    print(f"[silent] 起来了，打开 http://127.0.0.1:{port}/")
    webbrowser.open(pretty_url(port))


if __name__ == "__main__":
    main()
