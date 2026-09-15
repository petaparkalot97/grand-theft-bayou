#!/usr/bin/env bash
set -e

echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "🎬 Checking for ffmpeg..."
if ! command -v ffmpeg &> /dev/null && [ ! -f ./ffmpeg ]; then
    echo "Downloading static ffmpeg binary..."
    curl -sSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -xJ --strip-components=1 -C . "ffmpeg-*-amd64-static/ffmpeg"
    chmod +x ffmpeg
fi

echo "✅ Build completed successfully!"
