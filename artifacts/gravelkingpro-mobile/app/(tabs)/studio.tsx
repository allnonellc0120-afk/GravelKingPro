import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { API_BASE } from "@/lib/api";

type Tool = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  desc: string;
  endpoint: string;
  field: string;
  color: string;
  note: string;
};

const TOOLS: Tool[] = [
  {
    id: "stem_split",
    label: "Stem Split",
    icon: "scissors",
    desc: "GNS neural separator splits your track into bass, drums, vocals, and other stems using Demucs htdemucs.",
    endpoint: "/api/stem_split",
    field: "audio",
    color: "#10b981",
    note: "Supports MP3, WAV, FLAC · Returns ZIP of stems",
  },
  {
    id: "voice_remove",
    label: "Voice Remove",
    icon: "mic-off",
    desc: "Strip vocals and extract a clean instrumental using GNS ML separation — not just FFT cancellation.",
    endpoint: "/api/voice_remove",
    field: "audio",
    color: "#a855f7",
    note: "Supports MP3, WAV · Returns instrumental WAV",
  },
  {
    id: "master",
    label: "Mastering",
    icon: "radio",
    desc: "Apply professional loudness, EQ, and dynamics to your track. Normal preset is free; 5 presets on paid plans.",
    endpoint: "/api/master",
    field: "audio",
    color: "#38bdf8",
    note: "Supports MP3, WAV · Returns mastered WAV",
  },
  {
    id: "denoise",
    label: "Denoise",
    icon: "wind",
    desc: "Remove background noise, hiss, hum, and room artifacts from recordings using spectral gating.",
    endpoint: "/api/denoise",
    field: "audio",
    color: "#f97316",
    note: "Supports MP3, WAV · Returns clean WAV",
  },
];

type Stage = "idle" | "picking" | "uploading" | "done" | "error";

export default function StudioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [selectedTool, setSelectedTool] = useState<Tool>(TOOLS[0]);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const s = styles(colors);

  async function handlePick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage("picking");
    setErrorMsg(null);
    setResultUrl(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setStage("idle");
        return;
      }

      const asset = result.assets[0];
      setFileName(asset.name);
      setStage("uploading");

      const formData = new FormData();
      formData.append(selectedTool.field, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "audio/mpeg",
      } as any);

      const res = await fetch(`${API_BASE}${selectedTool.endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Processing failed" }));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStage("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Something went wrong");
      setStage("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function reset() {
    setStage("idle");
    setFileName(null);
    setResultUrl(null);
    setErrorMsg(null);
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        s.content,
        { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>Audio Studio</Text>
      <Text style={[s.sub, { color: colors.mutedForeground }]}>
        GNS · Demucs htdemucs · MLK v3
      </Text>

      {/* Tool selector */}
      <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>SELECT TOOL</Text>
      <View style={s.toolRow}>
        {TOOLS.map((tool) => {
          const active = selectedTool.id === tool.id;
          return (
            <Pressable
              key={tool.id}
              onPress={() => { setSelectedTool(tool); reset(); Haptics.selectionAsync(); }}
              style={({ pressed }) => [
                s.toolTab,
                {
                  backgroundColor: active ? colors.secondary : "transparent",
                  borderColor: active ? tool.color : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name={tool.icon} size={16} color={active ? tool.color : colors.mutedForeground} />
              <Text style={[s.toolTabLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tool detail card */}
      <View style={[s.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[s.detailIcon, { backgroundColor: `${selectedTool.color}18` }]}>
          <Feather name={selectedTool.icon} size={24} color={selectedTool.color} />
        </View>
        <Text style={[s.detailTitle, { color: colors.foreground }]}>{selectedTool.label}</Text>
        <Text style={[s.detailDesc, { color: colors.mutedForeground }]}>{selectedTool.desc}</Text>
        <Text style={[s.detailNote, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
          {selectedTool.note}
        </Text>
      </View>

      {/* Upload / Process */}
      {stage === "idle" || stage === "picking" ? (
        <Pressable
          onPress={handlePick}
          disabled={stage === "picking"}
          style={({ pressed }) => [
            s.uploadBtn,
            { borderColor: selectedTool.color, opacity: pressed || stage === "picking" ? 0.6 : 1 },
          ]}
        >
          <Feather name="upload" size={20} color={selectedTool.color} />
          <Text style={[s.uploadBtnText, { color: selectedTool.color }]}>
            {stage === "picking" ? "Selecting file..." : "Pick Audio File"}
          </Text>
        </Pressable>
      ) : stage === "uploading" ? (
        <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Processing…</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>
            GNS is running — this may take 30–90 seconds
          </Text>
        </View>
      ) : stage === "done" && resultUrl ? (
        <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: "#10b981" }]}>
          <Feather name="check-circle" size={32} color="#10b981" />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Done!</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>
          <Pressable
            onPress={() => Linking.openURL(resultUrl)}
            style={({ pressed }) => [s.downloadBtn, { backgroundColor: "#10b981", opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="download" size={16} color="#000" />
            <Text style={s.downloadBtnText}>Download Result</Text>
          </Pressable>
          <Pressable onPress={reset} style={s.resetLink}>
            <Text style={[s.resetLinkText, { color: colors.mutedForeground }]}>Process another file</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Error</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{errorMsg}</Text>
          <Pressable onPress={reset} style={[s.downloadBtn, { backgroundColor: colors.secondary }]}>
            <Text style={[s.downloadBtnText, { color: colors.foreground }]}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {!API_BASE && (
        <View style={[s.warningBox, { borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[s.warningText, { color: colors.mutedForeground }]}>
            API not configured. Set EXPO_PUBLIC_DOMAIN to connect to the GravelKing server.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 1, marginTop: 2, marginBottom: 24 },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 10 },
    toolRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    toolTab: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1,
    },
    toolTabLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
    detailCard: { borderWidth: 1, padding: 20, gap: 10, marginBottom: 24 },
    detailIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
    detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    detailDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
    detailNote: {
      fontSize: 10, fontFamily: "Inter_400Regular", paddingTop: 10,
      borderTopWidth: 1, color: colors.mutedForeground, letterSpacing: 0.3,
    },
    uploadBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, borderWidth: 1, borderStyle: "dashed", paddingVertical: 24, marginBottom: 24,
    },
    uploadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    stateCard: {
      borderWidth: 1, padding: 28, alignItems: "center", gap: 10, marginBottom: 24,
    },
    stateTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    stateSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
    downloadBtn: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 20, paddingVertical: 12, marginTop: 4,
    },
    downloadBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" },
    resetLink: { marginTop: 4, paddingVertical: 8 },
    resetLinkText: { fontSize: 12, fontFamily: "Inter_400Regular" },
    warningBox: {
      flexDirection: "row", gap: 8, alignItems: "flex-start",
      borderWidth: 1, padding: 12,
    },
    warningText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
  });
