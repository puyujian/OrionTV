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
      const urlObj = new URL(url);
      
      if (url.startsWith('oriontv://oauth/callback')) {
        const success = urlObj.searchParams.get('success');
        const error = urlObj.searchParams.get('error');
        
        if (success === 'true') {
          // OAuth成功后，直接设置登录状态
          logger.info("OAuth callback via deep link successful, setting login state");
          
          set({ 
            isLoggedIn: true,
            isOAuthInProgress: false, 
            isLoginModalVisible: false,
            oAuthUrl: undefined
          });
          
          // 尝试检查登录状态获取用户信息
          const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
          try {
            await get().checkLoginStatus(apiBaseUrl);
          } catch (error) {
            logger.warn("Failed to check login status after deep link OAuth, but keeping login state:", error);
          }
          
          Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
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
        // OAuth成功后，强制设置登录状态并获取用户信息
        logger.info("OAuth callback successful, setting login state");
        
        // 先设置登录状态为true
        set({ 
          isLoggedIn: true, 
          isOAuthInProgress: false, 
          isLoginModalVisible: false,
          oAuthUrl: undefined
        });
        
        // 然后检查登录状态并获取用户信息
        const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
        try {
          await get().checkLoginStatus(apiBaseUrl);
        } catch (error) {
          logger.warn("Failed to check login status after OAuth, but keeping login state:", error);
          // 即使检查失败，也保持登录状态，因为OAuth已经成功
        }
        
        Toast.show({ type: "success", text1: "LinuxDo 授权登录成功" });
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
