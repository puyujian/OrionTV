#!/bin/bash

# OrionTV 构建脚本
# 用于确保正确的 bundle 生成和 APK 构建

set -e

echo "🚀 开始构建 OrionTV..."

# 设置环境变量
export EXPO_TV=1
export NODE_ENV=production

# 检查构建类型
BUILD_TYPE=${1:-release}
echo "📦 构建类型: $BUILD_TYPE"

# 清理之前的构建产物（可选）
if [ "$2" = "clean" ]; then
    echo "🧹 清理构建缓存..."
    rm -rf android/app/build
    rm -rf android/build
    rm -rf .expo
fi

# Step 1: 确保依赖已安装
echo "📚 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    yarn install --frozen-lockfile
fi

# Step 2: Prebuild (如果需要)
if [ ! -d "android" ] || [ ! -f "android/settings.gradle" ]; then
    echo "🏗️ 运行 prebuild..."
    expo prebuild --clean --platform android
    yarn copy-config
else
    echo "📋 使用现有 prebuild，更新配置..."
    yarn copy-config
fi

# Step 3: 生成 JavaScript bundle
echo "📦 生成 JavaScript bundle..."
expo export:embed --platform android --dev false --minify true

# Step 4: 验证 bundle 文件
BUNDLE_PATH="android/app/src/main/assets/index.android.bundle"
if [ ! -f "$BUNDLE_PATH" ]; then
    echo "❌ 错误: Bundle 文件未生成: $BUNDLE_PATH"
    echo "尝试手动生成..."
    
    # 确保目录存在
    mkdir -p android/app/src/main/assets
    
    # 使用 react-native bundle 命令作为备选
    npx react-native bundle \
        --platform android \
        --dev false \
        --entry-file index.js \
        --bundle-output android/app/src/main/assets/index.android.bundle \
        --assets-dest android/app/src/main/res/
else
    echo "✅ Bundle 文件已生成: $BUNDLE_PATH"
    ls -la "$BUNDLE_PATH"
fi

# Step 5: 构建 APK
echo "🔨 构建 APK..."
cd android

if [ "$BUILD_TYPE" = "debug" ]; then
    ./gradlew assembleDebug --parallel --build-cache
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
else
    ./gradlew assembleRelease --parallel --build-cache
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
fi

cd ..

# Step 6: 验证 APK
if [ -f "android/$APK_PATH" ]; then
    echo "✅ APK 构建成功: android/$APK_PATH"
    ls -la "android/$APK_PATH"
    
    # 检查 APK 内容
    echo "📋 检查 APK 内容..."
    unzip -l "android/$APK_PATH" | grep -E "(index\.android\.bundle|assets)" || echo "⚠️ 警告: 可能缺少 bundle 文件"
else
    echo "❌ 错误: APK 文件未找到: android/$APK_PATH"
    exit 1
fi

echo "🎉 构建完成!"
echo "APK 位置: android/$APK_PATH"