# GitHub Workflows 构建优化说明

## 🚀 构建速度优化功能

### 新增的构建选项

现在在 GitHub Actions 中运行 workflow 时，你可以选择：

1. **构建类型**:
   - `release` - 生产版本（默认）
   - `debug` - 开发版本（包含调试信息）

2. **调试工具**:
   - 可选启用 OAuth 调试工具在生产版本中

### 主要优化措施

#### 1. 缓存优化
- ✅ **Node.js 依赖缓存**: 自动缓存 yarn.lock
- ✅ **Gradle 构建缓存**: 缓存 Gradle 依赖和构建产物
- ✅ **Expo Prebuild 缓存**: 缓存预构建的 Android/iOS 项目
- ✅ **配置缓存**: 使用 Gradle 配置缓存加速构建

#### 2. 并行构建
- ✅ **Gradle 并行任务**: `--parallel` 参数
- ✅ **多核构建**: 利用 CI 机器的多核心
- ✅ **并行测试**: Jest 使用 4 个工作进程

#### 3. 版本优化
- ✅ **Node.js 20**: 使用最新 LTS 版本
- ✅ **Java 17**: 使用 Temurin 发行版
- ✅ **最新 Actions**: 使用 v4 版本的 GitHub Actions

#### 4. 构建策略优化
- ✅ **智能 Prebuild**: 检查缓存避免重复 prebuild
- ✅ **Gradle Daemon**: 保持 Gradle 进程运行
- ✅ **增量构建**: TypeScript 增量编译

### 预期性能提升

| 优化项目 | 预期提升 | 说明 |
|---------|---------|------|
| 依赖缓存 | 2-5分钟 | 跳过重复下载 |
| Gradle 缓存 | 3-8分钟 | 重用编译产物 |
| Prebuild 缓存 | 1-3分钟 | 跳过项目生成 |
| 并行构建 | 30-50% | 多核心利用 |
| **总计** | **40-60%** | **整体构建时间** |

### 本地开发优化

新增的快速构建命令：

```bash
# 快速构建（跳过清理）
yarn build-fast
yarn build-debug-fast

# 快速 prebuild（不清理）
yarn prebuild-fast

# 增量类型检查
yarn typecheck-fast

# 并行测试
yarn test-ci
```

### 使用建议

1. **首次构建**: 使用标准命令建立缓存
2. **日常开发**: 使用 `-fast` 命令加速构建  
3. **发布前**: 使用完整构建确保质量
4. **调试问题**: 启用调试工具选项

### 故障排除

如果构建失败：
1. 先尝试清理缓存: `yarn clean`
2. 重新安装依赖: `yarn clean-modules`
3. 使用标准构建命令而非快速版本
4. 检查 Android Gradle 版本兼容性

---

这些优化应该能显著减少构建时间，特别是重复构建时的效果更明显。