// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Find the project and workspace directories
// eslint-disable-next-line no-undef
const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Enable TV-specific extensions when EXPO_TV=1
if (process.env?.EXPO_TV === '1') {
  const originalSourceExts = config.resolver.sourceExts;
  const tvSourceExts = [
    ...originalSourceExts.map((e) => `tv.${e}`),
    ...originalSourceExts,
  ];
  config.resolver.sourceExts = tvSourceExts;
}

// 确保正确的 Metro 配置用于生产构建
config.serializer = {
  ...config.serializer,
  getModulesRunBeforeMainModule: () => {
    return [];
  },
};

// 移除可能导致问题的 monorepo 配置
// 只在明确的 monorepo 环境中使用
if (process.env.EXPO_USE_METRO_WORKSPACE_ROOT === '1') {
  // This can be replaced with `find-yarn-workspace-root`
  const monorepoRoot = path.resolve(projectRoot, "../..");
  
  // 1. Watch all files within the monorepo
  config.watchFolders = [monorepoRoot];
  // 2. Let Metro know where to resolve packages and in what order
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ];
  config.resolver.disableHierarchicalLookup = true;
}

module.exports = config;
