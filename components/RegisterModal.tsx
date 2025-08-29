import React, { useState, useRef, useEffect } from "react";
import { Modal, View, TextInput, StyleSheet, ActivityIndicator, Platform } from "react-native";
import Toast from "react-native-toast-message";
import useAuthStore from "@/stores/authStore";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { StyledButton } from "./StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const RegisterModal = () => {
  const { 
    isRegisterModalVisible, 
    hideRegisterModal, 
    showLoginModal,
    register 
  } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const responsiveConfig = useResponsiveLayout();

  const isTV = Platform.isTV || responsiveConfig.deviceType === 'tv';

  // Focus management - TV优先处理
  useEffect(() => {
    if (isRegisterModalVisible) {
      // 在TV上延长焦点延迟以确保正确的焦点管理
      const focusDelay = isTV ? 300 : 100;
      const focusTimeout = setTimeout(() => {
        usernameInputRef.current?.focus();
      }, focusDelay);
      return () => clearTimeout(focusTimeout);
    }
  }, [isRegisterModalVisible, isTV]);

  const handleRegister = async () => {
    if (!username.trim()) {
      Toast.show({ type: "error", text1: "请输入用户名" });
      return;
    }
    if (!password) {
      Toast.show({ type: "error", text1: "请输入密码" });
      return;
    }
    if (password !== confirmPassword) {
      Toast.show({ type: "error", text1: "两次密码输入不一致" });
      return;
    }
    if (password.length < 6) {
      Toast.show({ type: "error", text1: "密码长度至少6位" });
      return;
    }

    setIsLoading(true);
    const success = await register(username.trim(), password, confirmPassword);
    setIsLoading(false);

    if (success) {
      setUsername("");
      setPassword("");
      setConfirmPassword("");
    }
  };

  const handleBackToLogin = () => {
    hideRegisterModal();
    showLoginModal();
  };

  const handleUsernameSubmit = () => {
    passwordInputRef.current?.focus();
  };

  const handlePasswordSubmit = () => {
    confirmPasswordInputRef.current?.focus();
  };

  return (
    <Modal
      transparent={true}
      visible={isRegisterModalVisible}
      animationType="fade"
      onRequestClose={hideRegisterModal}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.container}>
          <ThemedText style={styles.title}>注册新账号</ThemedText>
          <ThemedText style={styles.subtitle}>创建您的账号以使用完整功能</ThemedText>
          
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
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="请输入密码 (至少6位)"
            placeholderTextColor="#888"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            returnKeyType="next"
            onSubmitEditing={handlePasswordSubmit}
            blurOnSubmit={false}
          />
          
          <TextInput
            ref={confirmPasswordInputRef}
            style={styles.input}
            placeholder="请确认密码"
            placeholderTextColor="#888"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            returnKeyType="go"
            onSubmitEditing={handleRegister}
          />
          
          <StyledButton
            text={isLoading ? "" : "注册"}
            onPress={handleRegister}
            disabled={isLoading}
            style={styles.button}
            hasTVPreferredFocus={isTV}
          >
            {isLoading && <ActivityIndicator color="#fff" />}
          </StyledButton>
          
          <StyledButton
            text="返回登录"
            onPress={handleBackToLogin}
            disabled={isLoading}
            style={[styles.button, styles.backButton]}
          />
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
  backButton: {
    backgroundColor: "#666",
    marginBottom: 0,
  },
});

export default RegisterModal;