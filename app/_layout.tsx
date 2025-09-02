import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform, View, StyleSheet } from "react-native";
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
import { Linking } from 'react-native';
import Cookies from "@react-native-cookies/cookies";

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
  const { checkLoginStatus, handleOAuthCallback } = useAuthStore();
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

  // Handle OAuth deep links
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      logger.info("Received deep link:", url);
      
      try {
        // 检查是否是OAuth回调URL
        if (url.startsWith('oriontv://oauth/callback') || 
            url.includes('/oauth/callback') || 
            url.includes('code=') || 
            url.includes('state=')) {
          
          logger.info("Processing OAuth callback deep link");
          
          // 验证URL格式
          try {
            new URL(url); // 验证URL格式
          } catch (urlError) {
            logger.error("Invalid deep link URL format:", urlError);
            Toast.show({ 
              type: "error", 
              text1: "链接格式错误", 
              text2: "无效的深度链接格式" 
            });
            return;
          }

          // 解析深度链接URL
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

              logger.info("Token exchange successful, setting cookie");

              // 设置cookie
              await Cookies.set(apiBaseUrl, 'auth', result.cookie);
              
              // 设置登录状态
              const { set } = useAuthStore.getState();
              set({ 
                isLoggedIn: true, 
                isLoginModalVisible: false,
                isOAuthInProgress: false,
                oAuthUrl: undefined
              });
              
              Toast.show({ 
                type: "success", 
                text1: "LinuxDo 授权登录成功" 
              });
              
              // 导航到主页
              setTimeout(() => {
                router.replace('/');
              }, 500);
            } catch (exchangeError) {
              logger.error("Failed to exchange token for cookie:", exchangeError);
              Toast.show({ 
                type: "error", 
                text1: "登录失败", 
                text2: exchangeError instanceof Error ? exchangeError.message : "无法获取认证信息" 
              });
            }
          } else {
            // 回退到原有Cookie同步逻辑
            logger.info("No cookie in deep link, falling back to callback handling");
            const success = await handleOAuthCallback(url);
            if (success) {
              logger.info("OAuth callback successful, navigating to home");
              setTimeout(() => {
                router.replace('/');
              }, 500);
            } else {
              logger.warn("OAuth callback failed, staying on current page");
            }
          }
        }
      } catch (error) {
        logger.error("Error handling deep link:", error);
        Toast.show({ 
          type: "error", 
          text1: "链接处理失败", 
          text2: "处理深度链接时发生错误" 
        });
      }
    };

    // Add deep link listener
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle app launch with URL (when app was closed)
    Linking.getInitialURL().then(async (url) => {
      if (url) {
        logger.info("App launched with URL:", url);
        
        try {
          if (url.startsWith('oriontv://oauth/callback') || 
              url.includes('/oauth/callback') || 
              url.includes('code=') || 
              url.includes('state=')) {
            
            logger.info("Processing OAuth callback on app launch");
            
            // 验证URL格式
            try {
              new URL(url); // 验证URL格式
            } catch (urlError) {
              logger.error("Invalid launch URL format:", urlError);
              Toast.show({ 
                type: "error", 
                text1: "链接格式错误", 
                text2: "无效的启动链接格式" 
              });
              return;
            }

            // 解析深度链接URL
            const urlObj = new URL(url);
            const success = urlObj.searchParams.get('success');
            const tokenParam = urlObj.searchParams.get('token');

            // 优先处理深度链接传递的token
            if (success === 'true' && tokenParam) {
              logger.info("Received token via launch deep link");
              
              try {
                // 获取当前API基础URL
                const apiBaseUrl = useSettingsStore.getState().apiBaseUrl;
                if (!apiBaseUrl) {
                  throw new Error("API base URL not available");
                }

                // 用token换取cookie
                const exchangeUrl = `${apiBaseUrl}/api/oauth/exchange-token?token=${encodeURIComponent(tokenParam)}`;
                logger.info("Exchanging token for cookie on launch:", exchangeUrl);

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

                logger.info("Token exchange successful on launch, setting cookie");

                // 设置cookie
                await Cookies.set(apiBaseUrl, 'auth', result.cookie);
                
                // 设置登录状态
                const { set } = useAuthStore.getState();
                set({ 
                  isLoggedIn: true, 
                  isLoginModalVisible: false,
                  isOAuthInProgress: false,
                  oAuthUrl: undefined
                });
                
                Toast.show({ 
                  type: "success", 
                  text1: "LinuxDo 授权登录成功" 
                });
                
                // 导航到主页
                setTimeout(() => {
                  router.replace('/');
                }, 500);
              } catch (exchangeError) {
                logger.error("Failed to exchange token for cookie on launch:", exchangeError);
                Toast.show({ 
                  type: "error", 
                  text1: "登录失败", 
                  text2: exchangeError instanceof Error ? exchangeError.message : "无法获取认证信息" 
                });
              }
            } else {
              // 回退到原有Cookie同步逻辑
              logger.info("No cookie in launch deep link, falling back to callback handling");
              const success = await handleOAuthCallback(url);
              if (success) {
                logger.info("OAuth callback on launch successful, navigating to home");
                setTimeout(() => {
                  router.replace('/');
                }, 500);
              } else {
                logger.warn("OAuth callback on launch failed, staying on current page");
              }
            }
          }
        } catch (error) {
          logger.error("Error handling launch URL:", error);
          Toast.show({ 
            type: "error", 
            text1: "链接处理失败", 
            text2: "处理启动链接时发生错误" 
          });
        }
      }
    }).catch(error => {
      logger.error("Error getting initial URL:", error);
    });

    return () => {
      subscription?.remove();
    };
  }, [handleOAuthCallback, router]);

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
