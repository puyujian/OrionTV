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
      // 立即导航到主页避免显示错误页面
      router.replace('/');
      
      // 委托给authStore处理OAuth回调
      const authStore = useAuthStore.getState();
      const success = await authStore.handleOAuthCallback(url);
      
      if (success) {
        logger.info("OAuth处理成功，已导航到主页");
        Toast.show({ 
          type: "success", 
          text1: "登录成功", 
          text2: "LinuxDo OAuth授权完成" 
        });
      } else {
        logger.warn("OAuth处理失败");
        Toast.show({ 
          type: "error", 
          text1: "登录失败", 
          text2: "OAuth授权处理失败，请重试" 
        });
      }
      
      return success;
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
    // 更精确的OAuth回调URL检测函数
    const isOAuthCallback = (url: string): boolean => {
      try {
        const urlObj = new URL(url);
        // 检查是否是OrionTV scheme的OAuth回调
        if (url.startsWith('oriontv://oauth/callback')) {
          return true;
        }
        // 检查是否包含OAuth相关参数
        const hasOAuthParams = urlObj.searchParams.has('code') || 
                              urlObj.searchParams.has('state') ||
                              urlObj.searchParams.has('success') ||
                              urlObj.searchParams.has('token') ||
                              urlObj.searchParams.has('error');
        
        // 检查路径是否包含oauth/callback
        const hasOAuthPath = urlObj.pathname.includes('/oauth/callback');
        
        return hasOAuthParams || hasOAuthPath;
      } catch (error) {
        logger.warn("Failed to parse URL for OAuth detection:", error);
        // 作为备选方案，使用简单的字符串匹配
        return url.includes('oauth') && 
               (url.includes('callback') || 
                url.includes('code=') || 
                url.includes('success=') || 
                url.includes('token=') ||
                url.includes('error='));
      }
    };

    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      logger.info("Received deep link:", url);
      
      // 检查是否是OAuth回调URL
      if (isOAuthCallback(url)) {
        logger.info("Detected OAuth callback deep link");
        await handleOAuthDeepLink(url, false);
      } else {
        logger.info("Non-OAuth deep link received, ignoring");
      }
    };

    // Add deep link listener
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle app launch with URL (when app was closed)
    Linking.getInitialURL().then(async (url) => {
      if (url) {
        logger.info("App launched with URL:", url);
        
        if (isOAuthCallback(url)) {
          logger.info("Detected OAuth callback on app launch");
          // 给应用一些时间完成初始化
          setTimeout(async () => {
            await handleOAuthDeepLink(url, true);
          }, 1000);
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
