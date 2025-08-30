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
- ⚠️ **配置缓存**: 暂时禁用（React Native 兼容性问题）

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
- ⚠️ **配置缓存**: 因 React Native 外部进程调用而禁用

### 已知限制

**Gradle 配置缓存问题**:
React Native 和 Expo 在构建过程中会调用外部 Node.js 进程，这与 Gradle 8.8+ 的配置缓存功能不兼容。因此我们暂时禁用了配置缓存功能，但保留了其他所有优化。

相关错误：
```
Starting an external process 'node --print require.resolve(...)' during configuration time is unsupported.
```

### 预期性能提升

| 优化项目 | 预期提升 | 说明 |
|---------|---------|------|
| 依赖缓存 | 2-5分钟 | 跳过重复下载 |
| Gradle 缓存 | 3-6分钟 | 重用编译产物 |
| Prebuild 缓存 | 1-3分钟 | 跳过项目生成 |
| 并行构建 | 30-40% | 多核心利用 |
| **总计** | **30-50%** | **整体构建时间** |

### 本地开发优化

推荐的快速构建命令：

```bash
# 快速构建（跳过清理）
yarn build-fast          # 生产版本
yarn build-debug-fast    # 调试版本

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

1. **配置缓存错误**: 
   ```bash
   # 已在 workflow 中自动禁用，无需手动处理
   ```

2. **其他构建错误**:
   ```bash
   yarn clean              # 清理缓存
   yarn clean-modules      # 重新安装依赖
   ```

3. **Gradle 版本问题**:
   - 检查 `android/gradle/wrapper/gradle-wrapper.properties`
   - 确保使用兼容的 Gradle 版本

### 未来改进计划

1. **等待 React Native 支持**: 配置缓存功能将在 React Native 解决外部进程调用问题后重新启用
2. **更多缓存策略**: 研究其他可缓存的构建步骤
3. **构建优化**: 持续优化 Gradle 配置和构建脚本

---

这些优化在保持兼容性的同时显著提升了构建速度，特别是重复构建的效果更明显。