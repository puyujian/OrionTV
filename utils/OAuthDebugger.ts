import Cookies from "@react-native-cookies/cookies";
import { api } from "@/services/api";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('OAuthDebugger');

/**
 * OAuth 登录状态调试工具
 * 用于诊断登录问题
 */
export class OAuthDebugger {
  
  /**
   * 完整的登录状态诊断
   */
  static async diagnose(): Promise<string> {
    const results: string[] = [];
    results.push("=== OAuth 登录状态诊断报告 ===\n");
    
    try {
      // 1. 检查 API 基础URL
      results.push(`1. API 基础URL: ${api.baseURL}`);
      
      // 2. 检查 Cookie
      const cookies = await Cookies.get(api.baseURL);
      results.push(`2. Cookie 检查:`);
      results.push(`   - 总共 ${Object.keys(cookies).length} 个 cookie`);
      results.push(`   - auth cookie: ${cookies.auth ? '✅ 存在' : '❌ 不存在'}`);
      if (cookies.auth) {
        try {
          const authData = JSON.parse(decodeURIComponent(cookies.auth));
          results.push(`   - auth 内容: ${JSON.stringify(authData, null, 2)}`);
        } catch (e) {
          results.push(`   - auth 解析失败: ${e}`);
        }
      }
      
      // 3. 测试服务器连接
      results.push(`3. 服务器连接测试:`);
      try {
        const serverConfig = await api.getServerConfig();
        results.push(`   - ✅ 服务器连接成功`);
        results.push(`   - 存储类型: ${serverConfig.StorageType}`);
        results.push(`   - LinuxDo OAuth: ${serverConfig.LinuxDoOAuth?.enabled ? '✅ 启用' : '❌ 禁用'}`);
      } catch (error) {
        results.push(`   - ❌ 服务器连接失败: ${error}`);
      }
      
      // 4. 测试登录状态检查接口
      results.push(`4. 登录状态检查:`);
      try {
        // 尝试访问需要登录的接口
        const response = await fetch(`${api.baseURL}/api/favorites`, {
          credentials: 'include',
        });
        if (response.ok) {
          results.push(`   - ✅ 登录状态: 已登录`);
        } else if (response.status === 401) {
          results.push(`   - ❌ 登录状态: 未登录 (401)`);
        } else {
          results.push(`   - ⚠️ 登录状态: 未知 (${response.status})`);
        }
      } catch (error) {
        results.push(`   - ❌ 登录检查失败: ${error}`);
      }
      
      // 5. 检查深度链接处理
      results.push(`5. 深度链接配置:`);
      results.push(`   - URL Scheme: oriontv://`);
      results.push(`   - 回调路径: oauth/callback`);
      
    } catch (error) {
      results.push(`\n❌ 诊断过程出错: ${error}`);
    }
    
    results.push("\n=== 诊断完成 ===");
    return results.join('\n');
  }

  /**
   * 清除所有登录相关数据
   */
  static async clearLoginData(): Promise<void> {
    try {
      await Cookies.clearAll();
      logger.info("已清除所有 Cookie 数据");
    } catch (error) {
      logger.error("清除 Cookie 失败:", error);
    }
  }

  /**
   * 手动测试 Cookie 读写
   */
  static async testCookieReadWrite(): Promise<string> {
    const results: string[] = [];
    results.push("=== Cookie 读写测试 ===");
    
    try {
      // 测试写入
      const testCookie = 'test_value_' + Date.now();
      await Cookies.set('http://localhost:3000', { // 使用具体的 URL
        test_cookie: {
          value: testCookie,
          path: '/',
        }
      });
      results.push(`✅ Cookie 写入成功: ${testCookie}`);
      
      // 测试读取
      const cookies = await Cookies.get('http://localhost:3000');
      if (cookies.test_cookie === testCookie) {
        results.push(`✅ Cookie 读取成功`);
      } else {
        results.push(`❌ Cookie 读取失败，期望: ${testCookie}，实际: ${cookies.test_cookie}`);
      }
      
      // 清理测试 Cookie
      await Cookies.clearByName('http://localhost:3000', 'test_cookie');
      results.push(`✅ 测试 Cookie 已清理`);
      
    } catch (error) {
      results.push(`❌ Cookie 测试失败: ${error}`);
    }
    
    return results.join('\n');
  }
}