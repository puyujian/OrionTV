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
  register: (username: string, password: string) => Promise<boolean>;
  startLinuxDoOAuth: () => Promise<void>;
  handleOAuthCallback: (url: string) => Promise<boolean>;
}

const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  isLoginModalVisible: false,
  isRegisterModalVisible: false,
  isOAuthInProgress: false,
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
  
  register: async (username: string, password: string): Promise<boolean> => {
    try {
      const result = await api.register(username, password);
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
      const authorizeUrl = await api.startLinuxDoOAuth();
      
      // 使用系统浏览器打开授权页面
      const supported = await Linking.canOpenURL(authorizeUrl);
      if (supported) {
        await Linking.openURL(authorizeUrl);
        Toast.show({ 
          type: "info", 
          text1: "请在浏览器中完成授权", 
          text2: "完成后返回应用" 
        });
      } else {
        throw new Error("无法打开浏览器");
      }
    } catch (error) {
      logger.error("Failed to start LinuxDo OAuth:", error);
      Toast.show({ type: "error", text1: "启动授权失败", text2: "请检查网络连接" });
      set({ isOAuthInProgress: false });
    }
  },
  
  handleOAuthCallback: async (url: string): Promise<boolean> => {
    try {
      const urlObj = new URL(url);
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
}));

export default useAuthStore;
