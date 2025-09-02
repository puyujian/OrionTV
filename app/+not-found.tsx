import { Link, Stack } from "expo-router";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import React from "react";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "页面未找到" }} />
      <ThemedView style={styles.container}>
        <ThemedText type="title">页面不存在</ThemedText>
        <ThemedText style={styles.subtitle}>
          如果您是通过OAuth登录跳转到此页面，登录可能已成功完成
        </ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText type="link">返回主页</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  subtitle: {
    fontSize: 14,
    color: "#ccc",
    marginTop: 12,
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
