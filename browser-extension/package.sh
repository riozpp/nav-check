#!/bin/bash

# Browser Extension Package Script
# Creates distribution packages for Chrome and Firefox

set -e

if ! command -v zip >/dev/null 2>&1; then
  echo "❌ 未找到 zip 命令，请先安装： sudo apt install zip"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📦 开始打包浏览器扩展..."

# Clean previous builds
rm -rf dist
mkdir -p dist

# Package for Chrome/Edge/Brave (Chromium-based)
echo ""
echo "🌐 打包 Chrome/Edge/Brave 版本..."
mkdir -p dist/chromium
cp manifest.json dist/chromium/
cp popup.html popup.js dist/chromium/
cp options.html options.js dist/chromium/
cp background.js dist/chromium/
cp styles.css dist/chromium/
cp -r icons dist/chromium/
cd dist/chromium
zip -r ../bookmark-manager-chromium.zip . -q
cd ../..
echo "✅ Chromium 版本打包完成: dist/bookmark-manager-chromium.zip"

# Package for Firefox
echo ""
echo "🦊 打包 Firefox 版本..."
mkdir -p dist/firefox
cp manifest.firefox.json dist/firefox/manifest.json
cp popup.html popup.js dist/firefox/
cp options.html options.js dist/firefox/
cp background.firefox.js dist/firefox/background.js
cp styles.css dist/firefox/
cp -r icons dist/firefox/
cd dist/firefox
zip -r ../bookmark-manager-firefox.zip . -q
cd ../..
echo "✅ Firefox 版本打包完成: dist/bookmark-manager-firefox.zip"

echo ""
echo "🎉 打包完成！输出目录: dist/"
echo ""
echo "📦 生成的文件："
ls -lh dist/*.zip
echo ""
echo "安装说明："
echo "  - Chrome/Edge/Brave: 使用 bookmark-manager-chromium.zip"
echo "  - Firefox: 使用 bookmark-manager-firefox.zip"
echo ""
echo "详细安装步骤请查看项目 README.md 中的浏览器扩展部分"
