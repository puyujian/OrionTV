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
      
      const authorizeUrl = await api.startLinuxDoOAuth();
      logger.info("Got authorize URL:", authorizeUrl);
      
      // 验证授权链接的有效性
      if (!authorizeUrl || typeof authorizeUrl !== 'string') {
        throw new Error("获取的授权链接无效：链接为空");
      }
      
      // 验证是否是有效的LinuxDo授权链接
      if (!authorizeUrl.includes('linux.do')) {
        throw new Error(`获取的授权链接无效：${authorizeUrl}`);
      }
      
      logger.info("Using authorization URL:", authorizeUrl);
      
      logger.info("Attempting to open browser with URL:", authorizeUrl);
      
      // 尝试打开浏览器
      try {
        // 检查URL是否支持
        const supported = await Linking.canOpenURL(authorizeUrl);
        logger.info("URL supported by Linking:", supported);
        
        if (supported) {
          const opened = await Linking.openURL(authorizeUrl);
          logger.info("Browser opening result:", opened);
          
          Toast.show({ 
            type: "info", 
            text1: "请在浏览器中完成授权", 
            text2: "完成后返回应用"
          });
        } else {
          // 如果不支持直接打开，提供手动复制选项
          logger.warn("Cannot open URL directly, providing manual copy option");
          set({ oAuthUrl: authorizeUrl });
          
          Toast.show({ 
            type: "info", 
            text1: "请手动打开浏览器", 
            text2: "点击下方\"复制授权链接\"按钮"
          });
        }
      } catch (linkingError) {
        logger.error("Failed to open browser:", linkingError);
        
        // 浏览器打开失败，提供手动复制选项
        set({ oAuthUrl: authorizeUrl });
        
        Toast.show({ 
          type: "warning", 
          text1: "无法自动打开浏览器", 
          text2: "请点击\"复制授权链接\"手动打开"
        });
      }
      
    } catch (error) {
      logger.error("Failed to start LinuxDo OAuth:", error);
      
      let errorMessage = "请检查网络连接和服务器地址";
      
      if (error instanceof Error) {
        // 提供更具体的错误信息
        if (error.message.includes('网络连接失败')) {
          errorMessage = "网络连接失败，请检查网络设置";
        } else if (error.message.includes('LinuxDo OAuth 功能未启用')) {
          errorMessage = "服务器未启用 LinuxDo OAuth 功能";
        } else if (error.message.includes('OAuth 配置不完整')) {
          errorMessage = "服务器 OAuth 配置不完整，请联系管理员";
        } else if (error.message.includes('授权链接无效')) {
          errorMessage = error.message;
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
      logger.info("Handling OAuth callback:", url);
      const urlObj = new URL(url);
      
      if (url.startsWith('oriontv://oauth/callback')) {
        const success = urlObj.searchParams.get('success');
        const error = urlObj.searchParams.get('error');
        
        if (success === 'true') {
          const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
          await get().checkLoginStatus(apiBaseUrl);
          
          Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
          set({ 
            isOAuthInProgress: false, 
            isLoginModalVisible: false,
            oAuthUrl: undefined
          });
          return true;
        }
        
        if (error) {
          Toast.show({ type: "error", text1: "授权失败", text2: decodeURIComponent(error) });
          set({ isOAuthInProgress: false });
          return false;
        }
      }
      
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
        const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
        await get().checkLoginStatus(apiBaseUrl);
        
        Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
        set({ 
          isOAuthInProgress: false, 
          isLoginModalVisible: false,
          oAuthUrl: undefined
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
  
  clearOAuthUrl: () => set({ oAuthUrl: undefined, isOAuthInProgress: false }),
}));

export default useAuthStore;
