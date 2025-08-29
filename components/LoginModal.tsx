import React, { useState, useRef, useEffect } from "react";
import { Modal, View, TextInput, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { usePathname } from "expo-router";
import Toast from "react-native-toast-message";
import useAuthStore from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import useHomeStore from "@/stores/homeStore";
import { api } from "@/services/api";
import { LoginCredentialsManager } from "@/services/storage";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { StyledButton } from "./StyledButton";

const LoginModal = () => {
  const { 
    isLoginModalVisible, 
    hideLoginModal, 
    checkLoginStatus,
    showRegisterModal,
    startLinuxDoOAuth,
    isOAuthInProgress 
  } = useAuthStore();
  const { serverConfig, apiBaseUrl } = useSettingsStore();
  const { refreshPlayRecords } = useHomeStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const pathname = usePathname();
  const isSettingsPage = pathname.includes("settings");
  
  // Check if LinuxDo OAuth is enabled
  const isLinuxDoOAuthEnabled = serverConfig?.LinuxDoOAuth?.enabled || false;

  // Load saved credentials when modal opens
  useEffect(() => {
    if (isLoginModalVisible && !isSettingsPage) {
      const loadCredentials = async () => {
        const savedCredentials = await LoginCredentialsManager.get();
        if (savedCredentials) {
          setUsername(savedCredentials.username);
          setPassword(savedCredentials.password);
        }
      };
      loadCredentials();
    }
  }, [isLoginModalVisible, isSettingsPage]);

  // Focus management with better TV remote handling
  useEffect(() => {
    if (isLoginModalVisible && !isSettingsPage) {
      const isUsernameVisible = serverConfig?.StorageType !== "localstorage";

      // Use a small delay to ensure the modal is fully rendered
      const focusTimeout = setTimeout(() => {
        if (isUsernameVisible) {
          usernameInputRef.current?.focus();
        } else {
          passwordInputRef.current?.focus();
        }
      }, 100);

      return () => clearTimeout(focusTimeout);
    }
  }, [isLoginModalVisible, serverConfig, isSettingsPage]);

  const handleLinuxDoLogin = async () => {
    if (isOAuthInProgress) return;
    await startLinuxDoOAuth();
  };

  const handleRegisterClick = () => {
    hideLoginModal();
    showRegisterModal();
  };

  const handleLogin = async () => {
    const isLocalStorage = serverConfig?.StorageType === "localstorage";
    if (!password || (!isLocalStorage && !username)) {
      Toast.show({ type: "error", text1: "请输入用户名和密码" });
      return;
    }
    setIsLoading(true);
    try {
      await api.login(isLocalStorage ? undefined : username, password);
      await checkLoginStatus(apiBaseUrl);
      await refreshPlayRecords();
      
      // Save credentials on successful login
      await LoginCredentialsManager.save({ username, password });
      
      Toast.show({ type: "success", text1: "登录成功" });
      hideLoginModal();

      // Show disclaimer alert after successful login
      Alert.alert(
        "免责声明",
        "本应用仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。",
        [{ text: "确定" }]
      );
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "登录失败",
        text2: error instanceof Error ? error.message : "用户名或密码错误",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation between inputs using returnKeyType
  const handleUsernameSubmit = () => {
    passwordInputRef.current?.focus();
  };

  return (
    <Modal
      transparent={true}
      visible={isLoginModalVisible && !isSettingsPage}
      animationType="fade"
      onRequestClose={hideLoginModal}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.container}>
          <ThemedText style={styles.title}>需要登录</ThemedText>
          <ThemedText style={styles.subtitle}>服务器需要验证您的身份</ThemedText>
          {serverConfig?.StorageType !== "localstorage" && (
            <TextInput
              ref={usernameInputRef}
              style={styles.input}
              placeholder="请输入用户名"
              placeholderTextColor="#888"
              value={username}
              onChangeText={setUsername}
              returnKeyType="next"
              onSubmitEditing={handleUsernameSubmit}
              blurOnSubmit={false}
            />
          )}
          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="请输入密码"
            placeholderTextColor="#888"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <StyledButton
            text={isLoading ? "" : "登录"}
            onPress={handleLogin}
            disabled={isLoading}
            style={styles.button}
            hasTVPreferredFocus={!serverConfig || serverConfig.StorageType === "localstorage"}
          >
            {isLoading && <ActivityIndicator color="#fff" />}
          </StyledButton>
          
          {/* LinuxDo OAuth Login Button */}
          {isLinuxDoOAuthEnabled && (
            <StyledButton
              text={isOAuthInProgress ? "授权中..." : "使用 LinuxDo 登录"}
              onPress={handleLinuxDoLogin}
              disabled={isOAuthInProgress || isLoading}
              style={[styles.button, styles.oauthButton]}
            >
              {isOAuthInProgress && <ActivityIndicator color="#fff" />}
            </StyledButton>
          )}
          
          {/* Register Button */}
          {serverConfig?.StorageType !== "localstorage" && (
            <StyledButton
              text="注册新账号"
              onPress={handleRegisterClick}
              disabled={isLoading || isOAuthInProgress}
              style={[styles.button, styles.registerButton]}
            />
          )}
        </ThemedView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "80%",
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#ccc",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 16,
    color: "#fff",
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#555",
  },
  button: {
    width: "100%",
    height: 50,
    marginBottom: 12,
  },
  oauthButton: {
    backgroundColor: "#4a90e2",
  },
  registerButton: {
    backgroundColor: "#666",
    marginBottom: 0,
  },
});

export default LoginModal;
