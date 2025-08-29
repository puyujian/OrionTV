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
      set({ isLoggedIn: false, isLoginModalVisible: false });
      return;
    }
    try {
      // Wait for server config to be loaded if it's currently loading
      const settingsState = useSettingsStore.getState();
      let serverConfig = settingsState.serverConfig;
      
      // If server config is loading, wait a bit for it to complete
      if (settingsState.isLoadingServerConfig) {
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
          Toast.show({ type: "error", text1: "请检查网络或者服务器地址是否可用" });
        }
        return;
      }
      const cookies = await Cookies.get(api.baseURL);
      if (serverConfig && serverConfig.StorageType === "localstorage" && !cookies.auth) {
        const loginResult = await api.login().catch(() => {
          set({ isLoggedIn: false, isLoginModalVisible: true });
        });
        if (loginResult && loginResult.ok) {
          set({ isLoggedIn: true });
        }
      } else {
        const isLoggedIn = cookies && !!cookies.auth;
        set({ isLoggedIn });
        if (!isLoggedIn) {
          set({ isLoginModalVisible: true });
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
        Toast.show({ type: "success", text1: "注册成功", text2: "请使用新账号登录" });
        set({ isRegisterModalVisible: false, isLoginModalVisible: true });
        return true;
      } else {
        Toast.show({ type: "error", text1: "注册失败", text2: result.error || "请检查输入信息" });
        return false;
      }
    } catch (error) {
      logger.error("Registration failed:", error);
      Toast.show({ type: "error", text1: "注册失败", text2: "网络错误或服务器异常" });
      return false;
    }
  },
  
  startLinuxDoOAuth: async () => {
    try {
      set({ isOAuthInProgress: true });
      logger.info("Starting LinuxDo OAuth process...");
      
      const authorizeUrl = await api.startLinuxDoOAuth();
      logger.info("Got authorize URL:", authorizeUrl);
      
      // 验证授权链接的有效性
      if (!authorizeUrl || !authorizeUrl.includes('connect.linux.do')) {
        throw new Error("获取的授权链接无效");
      }
      
      // 多种方式尝试打开浏览器
      let browserOpened = false;
      
      try {
        // 方式1: 直接打开授权URL
        logger.info("Attempting to open browser with URL:", authorizeUrl);
        const supported = await Linking.canOpenURL(authorizeUrl);
        logger.info("URL supported:", supported);
        
        if (supported) {
          await Linking.openURL(authorizeUrl);
          browserOpened = true;
          logger.info("Successfully opened browser via direct URL");
        }
      } catch (directError) {
        logger.warn("Direct URL opening failed:", directError);
      }
      
      // 方式2: 如果直接打开失败，尝试先打开浏览器再打开链接
      if (!browserOpened) {
        try {
          logger.info("Attempting to open browser first, then navigate to URL");
          
          // 尝试打开默认浏览器
          const browserSupported = await Linking.canOpenURL('https://www.baidu.com');
          if (browserSupported) {
            await Linking.openURL('https://www.baidu.com');
            // 给浏览器一点时间启动
            setTimeout(async () => {
              try {
                await Linking.openURL(authorizeUrl);
                logger.info("Successfully opened browser via two-step approach");
              } catch (delayedError) {
                logger.error("Delayed URL opening failed:", delayedError);
              }
            }, 2000);
            browserOpened = true;
          }
        } catch (browserError) {
          logger.warn("Browser-first approach failed:", browserError);
        }
      }
      
      // 方式3: 如果还是失败，尝试使用不同的URL格式
      if (!browserOpened) {
        try {
          logger.info("Attempting to open with http protocol");
          const httpUrl = authorizeUrl.replace('https://', 'http://');
          await Linking.openURL(httpUrl);
          browserOpened = true;
          logger.info("Successfully opened browser with http protocol");
        } catch (httpError) {
          logger.warn("HTTP protocol attempt failed:", httpError);
        }
      }
      
      if (browserOpened) {
        Toast.show({ 
          type: "info", 
          text1: "请在浏览器中完成授权", 
          text2: "完成后返回应用" 
        });
      } else {
        // 如果所有方式都失败，保存链接供用户手动复制
        logger.error("All browser opening attempts failed");
        set({ oAuthUrl: authorizeUrl });
        Toast.show({ 
          type: "info", 
          text1: "请手动打开浏览器", 
          text2: "点击下方\"复制授权链接\"按钮" 
        });
        
        // 不要设置 isOAuthInProgress 为 false，因为用户可能会手动打开
        return;
      }
    } catch (error) {
      logger.error("Failed to start LinuxDo OAuth:", error);
      let errorMessage = "请检查网络连接";
      
      if (error instanceof Error) {
        if (error.message.includes("获取授权链接失败")) {
          errorMessage = error.message;
        } else if (error.message.includes("获取的授权链接无效")) {
          errorMessage = "服务器返回的授权链接无效";
        } else {
          errorMessage = error.message;
        }
      }
      
      Toast.show({ 
        type: "error", 
        text1: "启动授权失败", 
        text2: errorMessage 
      });
      set({ isOAuthInProgress: false });
    }
  },
  
  handleOAuthCallback: async (url: string): Promise<boolean> => {
    try {
      const urlObj = new URL(url);
      
      // 处理深度链接格式 oriontv://oauth/callback?success=true 或 error=xxx
      if (url.startsWith('oriontv://oauth/callback')) {
        const success = urlObj.searchParams.get('success');
        const error = urlObj.searchParams.get('error');
        
        if (success === 'true') {
          // OAuth成功，重新检查登录状态
          const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
          await get().checkLoginStatus(apiBaseUrl);
          
          Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
          set({ 
            isOAuthInProgress: false, 
            isLoginModalVisible: false 
          });
          return true;
        }
        
        if (error) {
          Toast.show({ type: "error", text1: "授权失败", text2: decodeURIComponent(error) });
          set({ isOAuthInProgress: false });
          return false;
        }
      }
      
      // 处理传统web回调格式
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const error = urlObj.searchParams.get('error');
      
      if (error) {
        Toast.show({ type: "error", text1: "授权失败", text2: "用户取消授权或授权被拒绝" });
        set({ isOAuthInProgress: false });
        return false;
      }
      
      if (!code || !state) {
        Toast.show({ type: "error", text1: "授权参数错误", text2: "授权回调参数缺失" });
        set({ isOAuthInProgress: false });
        return false;
      }
      
      const result = await api.handleOAuthCallback(code, state);
      if (result.ok) {
        // 重新检查登录状态
        const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
        await get().checkLoginStatus(apiBaseUrl);
        
        Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
        set({ 
          isOAuthInProgress: false, 
          isLoginModalVisible: false 
        });
        return true;
      } else {
        Toast.show({ 
          type: "error", 
          text1: "授权处理失败", 
          text2: result.error || "服务器处理授权信息时出错" 
        });
        set({ isOAuthInProgress: false });
        return false;
      }
    } catch (error) {
      logger.error("Failed to handle OAuth callback:", error);
      Toast.show({ type: "error", text1: "授权回调处理失败", text2: "网络错误或服务器异常" });
      set({ isOAuthInProgress: false });
      return false;
    }
  },
  
  clearOAuthUrl: () => set({ oAuthUrl: undefined }),
}));

export default useAuthStore;
