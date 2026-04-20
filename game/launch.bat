@echo off
cd /d "%~dp0"
set "PATH=%PATH%;%APPDATA%\npm;C:\Program Files\nodejs"
node_modules\.bin\electron.cmd .
