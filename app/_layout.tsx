import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useCallback } from "react";
import { Platform, View, StyleSheet, Linking } from "react-native";
import Toast from "react-native-toast-message";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSettingsStore } from "@/stores/settingsStore";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import LoginModal from "@/components/LoginModal";
import RegisterModal from "@/components/RegisterModal";
import useAuthStore from "@/stores/authStore";
import { useUpdateStore, initUpdateStore } from "@/stores/updateStore";
import { UpdateModal } from "@/components/UpdateModal";
import { UPDATE_CONFIG } from "@/constants/UpdateConfig";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('RootLayout');

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = "dark";
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const { loadSettings, remoteInputEnabled, apiBaseUrl } = useSettingsStore();
  const { startServer, stopServer } = useRemoteControlStore();
  const { checkLoginStatus } = useAuthStore();
  const { checkForUpdate, lastCheckTime } = useUpdateStore();
  const responsiveConfig = useResponsiveLayout();

  useEffect(() => {
    const initializeApp = async () => {
      await loadSettings();
    };
    initializeApp();
    initUpdateStore(); // 初始化更新存储
  }, [loadSettings]);

  useEffect(() => {
    if (apiBaseUrl) {
      checkLoginStatus(apiBaseUrl);
    }
  }, [apiBaseUrl, checkLoginStatus]);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
      if (error) {
        logger.warn(`Error in loading fonts: ${error}`);
      }
    }
  }, [loaded, error]);

  // 检查更新
  useEffect(() => {
    if (loaded && UPDATE_CONFIG.AUTO_CHECK && Platform.OS === 'android') {
      // 检查是否需要自动检查更新
      const shouldCheck = Date.now() - lastCheckTime > UPDATE_CONFIG.CHECK_INTERVAL;
      if (shouldCheck) {
        checkForUpdate(true); // 静默检查
      }
    }
  }, [loaded, lastCheckTime, checkForUpdate]);

  useEffect(() => {
    if (remoteInputEnabled && responsiveConfig.deviceType !== "mobile") {
      startServer();
    } else {
      stopServer();
    }
  }, [remoteInputEnabled, startServer, stopServer, responsiveConfig.deviceType]);

  // 处理OAuth深度链接的统一函数
  const handleOAuthDeepLink = useCallback(async (url: string, isLaunch: boolean = false) => {
    logger.info(`Processing OAuth ${isLaunch ? 'launch' : 'deep'} link:`, url);
    
    try {
      // 验证URL格式
      try {
        new URL(url);
      } catch (urlError) {
        logger.error("Invalid URL format:", urlError);
        Toast.show({ 
          type: "error", 
          text1: "链接格式错误", 
          text2: "无效的链接格式" 
        });
        return false;
      }

      const urlObj = new URL(url);
      const success = urlObj.searchParams.get('success');
      const tokenParam = urlObj.searchParams.get('token');

      // 优先处理深度链接传递的token
      if (success === 'true' && tokenParam) {
        logger.info("Received token via deep link");
        
        try {
          // 获取当前API基础URL
          const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
          if (!apiBaseUrl) {
            throw new Error("API base URL not available");
          }

          // 用token换取cookie
          const exchangeUrl = `${apiBaseUrl}/api/oauth/exchange-token?token=${encodeURIComponent(tokenParam)}`;
          logger.info("Exchanging token for cookie:", exchangeUrl);

          const response = await fetch(exchangeUrl, {
            method: "GET",
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache',
            },
            credentials: 'include'
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const result = await response.json();
          if (!result.success || !result.cookie) {
            throw new Error('返回数据格式错误');
          }

          logger.info("Token exchange successful, cookie should be set automatically");

          // 使用AuthStore的状态管理方法
          const authStore = useAuthStore.getState();
          
          // 先清理OAuth状态
          authStore.set({ 
            isOAuthInProgress: false,
            oAuthUrl: undefined
          });
          
          // 等待一小段时间确保cookie生效
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 调用checkLoginStatus验证cookie是否设置成功
          await authStore.checkLoginStatus(apiBaseUrl);
          
          // 检查登录状态并设置
          const currentLoginState = authStore.isLoggedIn;
          if (currentLoginState) {
            logger.info("OAuth login successful - user is now logged in");
            Toast.show({ 
              type: "success", 
              text1: "LinuxDo 授权登录成功" 
            });
            
            // 导航到主页
            setTimeout(() => {
              router.replace('/');
            }, 500);
            return true;
          } else {
            // 即使checkLoginStatus返回false，也认为OAuth成功，强制设置登录状态
            authStore.set({ 
              isLoggedIn: true,
              isLoginModalVisible: false
            });
            Toast.show({ 
              type: "success", 
              text1: "LinuxDo 授权登录成功" 
            });
            
            // 导航到主页
            setTimeout(() => {
              router.replace('/');
            }, 500);
            return true;
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
      } else {
        logger.warn("No token in deep link, OAuth failed");
        Toast.show({ 
          type: "error", 
          text1: "授权失败", 
          text2: "深度链接缺少token参数" 
        });
        return false;
      }
    } catch (error) {
      logger.error(`Error handling OAuth ${isLaunch ? 'launch' : 'deep'} link:`, error);
      Toast.show({ 
        type: "error", 
        text1: "链接处理失败", 
        text2: "处理OAuth链接时发生错误" 
      });
      return false;
    }
  }, [router]);

  // Handle OAuth deep links
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      logger.info("Received deep link:", url);
      
      // 检查是否是OAuth回调URL
      if (url.startsWith('oriontv://oauth/callback') || 
          url.includes('/oauth/callback') || 
          url.includes('code=') || 
          url.includes('state=') ||
          url.includes('success=') ||
          url.includes('token=')) {
        
        logger.info("Processing OAuth callback deep link");
        await handleOAuthDeepLink(url, false);
      }
    };

    // Add deep link listener
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle app launch with URL (when app was closed)
    Linking.getInitialURL().then(async (url) => {
      if (url) {
        logger.info("App launched with URL:", url);
        
        if (url.startsWith('oriontv://oauth/callback') || 
            url.includes('/oauth/callback') || 
            url.includes('code=') || 
            url.includes('state=') ||
            url.includes('success=') ||
            url.includes('token=')) {
          
          logger.info("Processing OAuth callback on app launch");
          await handleOAuthDeepLink(url, true);
        }
      }
    }).catch(error => {
      logger.error("Error getting initial URL:", error);
    });

    return () => {
      subscription?.remove();
    };
  }, [handleOAuthDeepLink, router]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <View style={styles.container}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="detail" options={{ headerShown: false }} />
            {Platform.OS !== "web" && <Stack.Screen name="play" options={{ headerShown: false }} />}
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="live" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="favorites" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </View>
        <Toast />
        <LoginModal />
        <RegisterModal />
        <UpdateModal />
      </ThemeProvider>

    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
