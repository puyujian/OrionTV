import { create } from "zustand";
import Cookies from "@react-native-cookies/cookies";
import { api } from "@/services/api";
import { useSettingsStore } from "./settingsStore";
import Toast from "react-native-toast-message";
import Logger from "@/utils/Logger";
import { Linking } from "react-native";

const logger = Logger.withTag('AuthStore');

interface AuthState {
  isLoggedIn: boolean;
  isLoginModalVisible: boolean;
  isRegisterModalVisible: boolean;
  isOAuthInProgress: boolean;
  oAuthUrl?: string;
  currentUser?: {
    username: string;
    role?: 'owner' | 'admin' | 'user';
    linuxdoId?: number;
    linuxdoUsername?: string;
  };
  showLoginModal: () => void;
  hideLoginModal: () => void;
  showRegisterModal: () => void;
  hideRegisterModal: () => void;
  checkLoginStatus: (apiBaseUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, password: string, confirmPassword?: string) => Promise<boolean>;
  startLinuxDoOAuth: () => Promise<void>;
  handleOAuthCallback: (url: string) => Promise<boolean>;
  clearOAuthUrl: () => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  isLoginModalVisible: false,
  isRegisterModalVisible: false,
  isOAuthInProgress: false,
  oAuthUrl: undefined,
  currentUser: undefined,
  showLoginModal: () => set({ isLoginModalVisible: true }),
  hideLoginModal: () => set({ isLoginModalVisible: false }),
  showRegisterModal: () => set({ isRegisterModalVisible: true }),
  hideRegisterModal: () => set({ isRegisterModalVisible: false }),
  checkLoginStatus: async (apiBaseUrl?: string) => {
    if (!apiBaseUrl) {
      logger.warn("checkLoginStatus called without apiBaseUrl");
      set({ isLoggedIn: false, isLoginModalVisible: false });
      return;
    }
    
    try {
      logger.info("Checking login status with API base URL:", apiBaseUrl);
      
      // Wait for server config to be loaded if it's currently loading
      const settingsState = useSettingsStore.getState();
      let serverConfig = settingsState.serverConfig;
      
      // If server config is loading, wait a bit for it to complete
      if (settingsState.isLoadingServerConfig) {
        logger.info("Waiting for server config to load...");
        // Wait up to 3 seconds for server config to load
        const maxWaitTime = 3000;
        const checkInterval = 100;
        let waitTime = 0;
        
        while (waitTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
          const currentState = useSettingsStore.getState();
          if (!currentState.isLoadingServerConfig) {
            serverConfig = currentState.serverConfig;
            break;
          }
        }
      }
      
      if (!serverConfig?.StorageType) {
        // Only show error if we're not loading and have tried to fetch the config
        if (!settingsState.isLoadingServerConfig) {
          logger.warn("No server config available for storage type");
          Toast.show({ type: "error", text1: "请检查网络或者服务器地址是否可用" });
        }
        return;
      }
      
      // 优化Cookie获取逻辑，增加重试机制和更好的错误处理
      let cookies = null;
      const maxRetries = 6; // 增加重试次数
      const retryDelay = 1000; // 增加重试间隔
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          cookies = await Cookies.get(apiBaseUrl);
          logger.info(`Cookie retrieval attempt ${i + 1}:`, {
            hasAuth: !!cookies?.auth,
            cookieKeys: cookies ? Object.keys(cookies) : [],
            allCookies: cookies
          });
          
          if (cookies?.auth) {
            logger.info("Successfully retrieved auth cookie");
            break; // 成功获取到auth cookie，退出重试循环
          }
          
          // 如果没有获取到auth cookie，等待一会儿再试
          if (i < maxRetries - 1) {
            logger.info(`No auth cookie found, retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        } catch (cookieError) {
          logger.warn(`获取Cookie失败 (尝试 ${i + 1}/${maxRetries}):`, cookieError);
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
      
      if (serverConfig && serverConfig.StorageType === "localstorage") {
        logger.info("Using localStorage storage type, attempting auto login");
        if (!cookies?.auth) {
          const loginResult = await api.login().catch((error) => {
            logger.error("Auto login failed:", error);
            set({ isLoggedIn: false, isLoginModalVisible: true });
          });
          if (loginResult && loginResult.ok) {
            logger.info("Auto login successful");
            set({ isLoggedIn: true });
          }
        } else {
          logger.info("Auth cookie found for localStorage, setting logged in");
          set({ isLoggedIn: true });
        }
      } else {
        const isLoggedIn = !!(cookies && cookies.auth);
        logger.info("Login status check result:", { 
          hasAuth: isLoggedIn, 
          storageType: serverConfig.StorageType,
          hasCookies: !!cookies 
        });
        
        // 更新登录状态
        const currentState = get();
        const wasLoggedIn = currentState.isLoggedIn;
        set({ isLoggedIn });
        
        // 如果之前已登录但现在未登录，显示登录模态框
        if (wasLoggedIn && !isLoggedIn) {
          logger.info("User logged out, showing login modal");
          set({ isLoginModalVisible: true });
        } else if (!isLoggedIn) {
          // 只有在明确需要登录时才显示模态框
          if (!currentState.isLoginModalVisible) {
            set({ isLoginModalVisible: true });
          }
        }
      }
    } catch (error) {
      logger.error("Failed to check login status:", error);
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set({ isLoggedIn: false, isLoginModalVisible: true });
      } else {
        set({ isLoggedIn: false });
      }
    }
  },
  logout: async () => {
    try {
      await api.logout();
      await Cookies.clearAll();
      set({ 
        isLoggedIn: false, 
        isLoginModalVisible: true, 
        currentUser: undefined 
      });
    } catch (error) {
      logger.error("Failed to logout:", error);
      // Force logout even if API call fails
      await Cookies.clearAll();
      set({ 
        isLoggedIn: false, 
        isLoginModalVisible: true, 
        currentUser: undefined 
      });
    }
  },
  
  register: async (username: string, password: string, confirmPassword?: string): Promise<boolean> => {
    try {
      const result = await api.register(username, password, confirmPassword);
      if (result.ok) {
        // 根据是否需要审核显示不同消息
        if (result.needsApproval) {
          Toast.show({ 
            type: "success", 
            text1: "注册申请已提交", 
            text2: result.message || "请等待管理员审核" 
          });
        } else {
          Toast.show({ 
            type: "success", 
            text1: "注册成功", 
            text2: result.message || "请使用新账号登录" 
          });
        }
        set({ isRegisterModalVisible: false, isLoginModalVisible: true });
        return true;
      } else {
        // 显示服务器返回的具体错误信息
        Toast.show({ 
          type: "error", 
          text1: "注册失败", 
          text2: result.error || result.message || "请检查输入信息" 
        });
        return false;
      }
    } catch (error) {
      logger.error("Registration failed:", error);
      Toast.show({ 
        type: "error", 
        text1: "注册失败", 
        text2: error instanceof Error ? error.message : "网络错误或服务器异常" 
      });
      return false;
    }
  },
  
  startLinuxDoOAuth: async () => {
    try {
      set({ isOAuthInProgress: true });
      logger.info("Starting LinuxDo OAuth process...");
      
      const authorizeUrl = api.startLinuxDoOAuth();
      logger.info("Got authorize URL from API:", authorizeUrl);
      
      // 验证授权链接格式
      if (!authorizeUrl || typeof authorizeUrl !== 'string') {
        throw new Error("获取的授权链接无效：链接为空");
      }
      
      // 验证URL格式
      try {
        new URL(authorizeUrl); // 验证URL格式
      } catch (urlError) {
        throw new Error("获取的授权链接格式不正确");
      }
      
      logger.info("Attempting to open browser with URL:", authorizeUrl);
      
      // 直接使用Linking打开系统浏览器进行授权
      try {
        const canOpen = await Linking.canOpenURL(authorizeUrl);
        logger.info("URL can be opened by Linking:", canOpen);
        
        if (canOpen) {
          await Linking.openURL(authorizeUrl);
          logger.info("System browser opened successfully for OAuth");
          
          Toast.show({ 
            type: "info", 
            text1: "授权页面已在浏览器中打开", 
            text2: "完成授权后会自动返回应用"
          });
          
          // 清理OAuth状态，等待回调
          set({ oAuthUrl: undefined });
        } else {
          // 如果无法直接打开，提供手动复制选项
          logger.warn("Cannot open URL directly, providing manual copy option");
          set({ oAuthUrl: authorizeUrl });
          
          Toast.show({ 
            type: "info", 
            text1: "请手动复制授权链接", 
            text2: "点击下方\"复制授权链接\"按钮在浏览器中打开"
          });
        }
      } catch (linkingError) {
        logger.error("Failed to open system browser:", linkingError);
        
        // 作为备选方案，保存URL供用户手动复制
        set({ oAuthUrl: authorizeUrl });
        
        Toast.show({ 
          type: "warning", 
          text1: "无法自动打开浏览器", 
          text2: "请手动复制下方链接在浏览器中打开"
        });
      }
      
    } catch (error) {
      logger.error("Failed to start LinuxDo OAuth:", error);
      
      let errorMessage = "OAuth启动失败";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      Toast.show({ 
        type: "error", 
        text1: "启动LinuxDo授权失败", 
        text2: errorMessage
      });
      
      set({ isOAuthInProgress: false, oAuthUrl: undefined });
    }
  },
  
  handleOAuthCallback: async (url: string): Promise<boolean> => {
    try {
      logger.info("Handling OAuth callback:", url);
      
      // 验证URL格式
      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch (urlError) {
        logger.error("Invalid URL format:", urlError);
        Toast.show({ 
          type: "error", 
          text1: "链接格式错误", 
          text2: "无效的链接格式" 
        });
        return false;
      }
      
      // 清理OAuth状态
      set({ isOAuthInProgress: false, oAuthUrl: undefined });
      
      // 检查错误参数
      const error = urlObj.searchParams.get('error');
      if (error) {
        const errorMessage = decodeURIComponent(error);
        logger.error("OAuth callback error:", errorMessage);
        Toast.show({ 
          type: "error", 
          text1: "授权失败", 
          text2: errorMessage || "用户取消授权或授权被拒绝" 
        });
        return false;
      }
      
      // 处理token换取cookie方案
      const success = urlObj.searchParams.get('success');
      const tokenParam = urlObj.searchParams.get('token');
      
      if (success === 'true' && tokenParam) {
        logger.info("OAuth callback successful with token, starting exchange");
        
        try {
          // 使用新的API方法交换token
          const exchangeResult = await api.exchangeOAuthToken(tokenParam);
          
          if (!exchangeResult.ok) {
            throw new Error(exchangeResult.error || "token交换失败");
          }
          
          logger.info("Token exchange successful, verifying login status");
          
          // 获取API基础URL
          const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
          if (!apiBaseUrl) {
            throw new Error("API base URL not available");
          }
          
          // 增强的登录状态验证，带重试机制
          let isLoginVerified = false;
          const maxVerifyAttempts = 8; // 增加验证尝试次数
          const verifyDelay = 750; // 增加延迟时间
          
          for (let attempt = 1; attempt <= maxVerifyAttempts; attempt++) {
            logger.info(`登录状态验证尝试 ${attempt}/${maxVerifyAttempts}`);
            
            // 等待一段时间让cookie生效
            await new Promise(resolve => setTimeout(resolve, verifyDelay));
            
            try {
              // 直接检查cookie是否存在
              const cookies = await Cookies.get(apiBaseUrl);
              logger.info(`验证尝试 ${attempt} - Cookie状态:`, {
                hasAuth: !!cookies?.auth,
                cookieKeys: cookies ? Object.keys(cookies) : [],
                authCookieValue: cookies?.auth ? 'exists' : 'missing'
              });
              
              if (cookies?.auth) {
                // 如果有auth cookie，再验证一次登录状态
                await get().checkLoginStatus(apiBaseUrl);
                const currentLoginState = get().isLoggedIn;
                
                if (currentLoginState) {
                  isLoginVerified = true;
                  logger.info(`登录状态验证成功 (第${attempt}次尝试)`);
                  break;
                } else {
                  logger.warn(`第${attempt}次尝试：有auth cookie但登录状态为false`);
                }
              } else {
                logger.warn(`第${attempt}次尝试：未找到auth cookie`);
              }
              
              // 如果是最后一次尝试，直接检查登录状态
              if (attempt === maxVerifyAttempts) {
                await get().checkLoginStatus(apiBaseUrl);
                isLoginVerified = get().isLoggedIn;
              }
              
            } catch (verifyError) {
              logger.warn(`登录状态验证失败 (第${attempt}次尝试):`, verifyError);
              
              // 最后一次尝试时仍然失败，但如果有cookie数据就认为成功
              if (attempt === maxVerifyAttempts && exchangeResult.cookieData) {
                logger.info("虽然验证失败，但有cookie数据，强制设置为已登录");
                isLoginVerified = true;
              }
            }
          }
          
          if (isLoginVerified) {
            logger.info("OAuth登录验证成功");
            set({ 
              isLoggedIn: true,
              isLoginModalVisible: false
            });
            Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
            return true;
          } else {
            // 即使验证失败，如果有cookie数据也认为成功
            if (exchangeResult.cookieData) {
              logger.warn("登录状态验证失败但有cookie数据，强制设置为已登录");
              set({ 
                isLoggedIn: true,
                isLoginModalVisible: false
              });
              Toast.show({ 
                type: "success", 
                text1: "LinuxDo 授权登录成功",
                text2: "如有问题请重启应用"
              });
              return true;
            } else {
              throw new Error("登录状态验证失败且无cookie数据");
            }
          }
          
        } catch (exchangeError) {
          logger.error("Failed to exchange token for cookie:", exchangeError);
          Toast.show({ 
            type: "error", 
            text1: "登录失败", 
            text2: exchangeError instanceof Error ? exchangeError.message : "无法获取认证信息" 
          });
          return false;
        }
      }
      
      logger.warn("OAuth callback missing required token parameter");
      Toast.show({ 
        type: "error", 
        text1: "授权参数错误", 
        text2: "授权回调缺少token参数，请重试" 
      });
      return false;
    } catch (error) {
      logger.error("Failed to handle OAuth callback:", error);
      Toast.show({ 
        type: "error", 
        text1: "授权回调处理失败", 
        text2: error instanceof Error ? error.message : "网络错误或服务器异常" 
      });
      return false;
    }
  },
  
  
  clearOAuthUrl: () => set({ oAuthUrl: undefined, isOAuthInProgress: false }),
}));

export default useAuthStore;
