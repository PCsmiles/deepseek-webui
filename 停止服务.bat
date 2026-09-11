@echo off
chcp 65001 >nul
title stop deepseek webui
cd /d "E:\deepseek-webui"
python stop.py
echo.
pause
