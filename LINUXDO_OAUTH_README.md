# LINUXDO OAuth 配置说明

## 概述

本功能为 OrionTV 添加了完整的 LinuxDo OAuth2 登录支持，允许用户使用 LinuxDo 账号直接登录，无需单独注册。

## 主要功能

### 1. API服务 (services/api.ts)
- ✅ `LinuxDoOAuthConfig` 接口定义
- ✅ `startLinuxDoOAuth()` - 启动OAuth授权流程
- ✅ `handleOAuthCallback()` - 处理OAuth回调
- ✅ `register()` - 用户注册功能
- ✅ `logout()` - 注销功能

### 2. 状态管理 (stores/authStore.ts)
- ✅ 扩展认证状态支持OAuth和注册
- ✅ `startLinuxDoOAuth()` - 启动授权并打开浏览器
- ✅ `handleOAuthCallback()` - 处理深度链接回调
- ✅ `register()` - 注册新用户
- ✅ 用户状态管理 (username, role, linuxdoId等)

### 3. UI组件
- ✅ **LoginModal** - 集成LinuxDo登录按钮和注册入口
- ✅ **RegisterModal** - 全新注册界面，支持TV焦点管理
- ✅ TV遥控器优化的焦点管理
- ✅ 响应式设计支持多平台

### 4. 深度链接集成 (app/_layout.tsx)
- ✅ 监听OAuth回调URL
- ✅ 自动处理授权完成后的跳转
- ✅ 支持应用冷启动时的URL处理

## 配置要求

### 服务器端配置
服务器需要在 `ServerConfig` 中添加 `LinuxDoOAuth` 配置：

```typescript
{
  \"SiteName\": \"OrionTV\",
  \"StorageType\": \"redis\", // 或其他非localstorage类型
  \"LinuxDoOAuth\": {
    \"enabled\": true,
    \"clientId\": \"your_client_id\",
    \"clientSecret\": \"your_client_secret\",
    \"authorizeUrl\": \"https://connect.linux.do/oauth/authorize\",
    \"tokenUrl\": \"https://connect.linux.do/oauth/token\",
    \"userInfoUrl\": \"https://connect.linux.do/api/user\",
    \"redirectUri\": \"https://your-domain.com/api/oauth/callback\", // 可选
    \"minTrustLevel\": 1, // 最小信任等级要求
    \"autoRegister\": true, // 是否自动注册新用户
    \"defaultRole\": \"user\" // 新用户默认角色
  }
}
```

### 深度链接配置
应用已配置深度链接scheme: `oriontv://`
- OAuth回调URL格式: `oriontv://oauth/callback?code=xxx&state=yyy`

## 使用流程

### LinuxDo登录流程
1. 用户点击「使用 LinuxDo 登录」按钮
2. 应用调用 `/api/oauth/authorize` 获取授权URL
3. 打开系统浏览器进行LinuxDo授权
4. 授权完成后浏览器跳转回应用
5. 应用处理回调，完成登录

### 用户注册流程
1. 用户点击「注册新账号」按钮
2. 填写用户名、密码和确认密码
3. 调用 `/api/register` 完成注册
4. 注册成功后自动切换到登录界面

## TV适配特性

### 焦点管理
- ✅ TV遥控器导航支持
- ✅ 正确的焦点顺序和高亮显示
- ✅ 按钮状态管理 (focused/pressed)
- ✅ 延长TV焦点延迟以确保稳定性

### 响应式设计
- ✅ 支持Apple TV、Android TV、平板和手机
- ✅ 自适应布局和字体大小
- ✅ 设备类型检测和优化

## 安全特性

### OAuth2安全
- ✅ State参数防CSRF攻击
- ✅ 授权码验证
- ✅ 信任等级检查
- ✅ 用户状态验证 (active, silenced等)

### 用户管理
- ✅ 密码长度验证 (最少6位)
- ✅ 用户名唯一性检查
- ✅ 自动生成唯一用户名 (避免冲突)

## 错误处理

### 网络错误
- ✅ API调用失败的友好提示
- ✅ 网络超时处理
- ✅ 自动重试机制

### 用户体验
- ✅ 加载状态指示器
- ✅ 详细的错误消息
- ✅ Toast通知反馈

## 测试建议

### 功能测试
1. **LinuxDo登录**：测试完整的OAuth流程
2. **用户注册**：测试各种输入验证场景
3. **深度链接**：测试从浏览器返回应用
4. **错误处理**：测试网络异常和无效输入

### 平台测试
1. **Apple TV**：遥控器导航和焦点管理
2. **Android TV**：遥控器导航和焦点管理
3. **移动设备**：触摸交互和响应式布局
4. **平板设备**：中等尺寸屏幕适配

### 边界情况测试
1. 授权被拒绝或取消
2. 网络连接中断
3. 用户名重复
4. 密码格式错误
5. 服务器配置缺失

## 注意事项

1. **服务器兼容性**：需要配套的LunaTV服务器支持
2. **深度链接**：确保app.json中的scheme配置正确
3. **权限配置**：Android平台需要网络权限
4. **生产环境**：记得配置正确的redirectUri
5. **安全性**：clientSecret需要服务器端保护