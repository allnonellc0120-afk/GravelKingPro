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

import { MicRecorder, type RecordedFile } from "@/components/MicRecorder";
import { useColors } from "@/hooks/useColors";
import { apiFetch, API_BASE } from "@/lib/api";

type Tool = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  desc: string;
  color: string;
  note: string;
  resultLabel: string;
};

const TOOLS: Tool[] = [
  {
    id: "stem_split",
    label: "Stem Split",
    icon: "scissors",
    desc: "Neural separator splits your track into bass, drums, vocals, and other stems using the GravelKing MLK v3 kernel.",
    color: "#10b981",
    note: "Supports MP3, WAV, FLAC · Returns ZIP of stems",
    resultLabel: "stems.zip",
  },
  {
    id: "voice_remove",
    label: "Voice Remove",
    icon: "mic-off",
    desc: "Strip vocals and extract a clean instrumental using GNS ML separation — Morris Law center-channel carving.",
    color: "#a855f7",
    note: "Supports MP3, WAV · Returns instrumental WAV",
    resultLabel: "instrumental.wav",
  },
  {
    id: "master",
    label: "Mastering",
    icon: "radio",
    desc: "Apply professional loudness, EQ, and dynamics to your track with the GravelKing mastering engine.",
    color: "#38bdf8",
    note: "Supports MP3, WAV · Returns mastered WAV",
    resultLabel: "mastered.wav",
  },
  {
    id: "standard",
    label: "Kernel Process",
    icon: "cpu",
    desc: "Run the raw MLK v3 standard kernel process — full signal carving and parity analysis.",
    color: "#f59e0b",
    note: "Supports MP3, WAV · Returns processed WAV",
    resultLabel: "processed.wav",
  },
];

type Stage = "idle" | "picking" | "uploading" | "done" | "error";

function buildFormData(
  tool: Tool,
  asset: { uri: string; name: string; mimeType?: string },
): FormData {
  const fd = new FormData();
  fd.append("audio", {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? "audio/mpeg",
  } as unknown as Blob);
  if (tool.id !== "master") {
    fd.append("mode", tool.id);
  }
  return fd;
}

function endpointForTool(id: string): string {
  if (id === "master") return "/api/kernel/master";
  return "/api/kernel/process-audio";
}

export default function StudioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [selectedTool, setSelectedTool] = useState<Tool>(TOOLS[0]);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const s = styles(colors);

  // Shared upload + response pipeline used by both the mic recorder and the
  // (secondary) file picker. `asset` is whatever produced the audio.
  async function processAsset(asset: {
    uri: string;
    name: string;
    mimeType?: string;
  }) {
    setErrorMsg(null);
    setResultUrl(null);
    setUpgradeNeeded(false);
    setFileName(asset.name);
    setStage("uploading");

    try {
      const formData = buildFormData(selectedTool, asset);
      const endpoint = endpointForTool(selectedTool.id);

      const res = await apiFetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (res.status === 402) {
        const err = await res.json().catch(() => ({ error: "Upgrade required" }));
        setErrorMsg(err.error ?? "You've reached the free tier limit.");
        setUpgradeNeeded(true);
        setStage("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Processing failed" }));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setStage("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setStage("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleRecorded(file: RecordedFile) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await processAsset(file);
  }

  async function handlePick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage("picking");
    setErrorMsg(null);
    setResultUrl(null);
    setUpgradeNeeded(false);

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
      await processAsset({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setStage("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function reset() {
    setStage("idle");
    setFileName(null);
    setResultUrl(null);
    setErrorMsg(null);
    setUpgradeNeeded(false);
    setIsRecording(false);
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
        GNS · MLK v3 · Morris Law Kernel
      </Text>

      <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>SELECT TOOL</Text>
      <View style={s.toolRow}>
        {TOOLS.map((tool) => {
          const active = selectedTool.id === tool.id;
          return (
            <Pressable
              key={tool.id}
              onPress={() => {
                setSelectedTool(tool);
                reset();
                Haptics.selectionAsync();
              }}
              style={({ pressed }) => [
                s.toolTab,
                {
                  backgroundColor: active ? colors.secondary : "transparent",
                  borderColor: active ? tool.color : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather
                name={tool.icon}
                size={16}
                color={active ? tool.color : colors.mutedForeground}
              />
              <Text
                style={[
                  s.toolTabLabel,
                  { color: active ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[s.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[s.detailIcon, { backgroundColor: `${selectedTool.color}18` }]}>
          <Feather name={selectedTool.icon} size={24} color={selectedTool.color} />
        </View>
        <Text style={[s.detailTitle, { color: colors.foreground }]}>{selectedTool.label}</Text>
        <Text style={[s.detailDesc, { color: colors.mutedForeground }]}>
          {selectedTool.desc}
        </Text>
        <Text
          style={[s.detailNote, { color: colors.mutedForeground, borderTopColor: colors.border }]}
        >
          {selectedTool.note}
        </Text>
      </View>

      <MicRecorder
        key={selectedTool.id}
        accentColor={selectedTool.color}
        disabled={stage === "uploading" || stage === "picking"}
        onRecordingChange={setIsRecording}
        onRecorded={(file) => {
          void handleRecorded(file);
        }}
      />

      {stage === "uploading" ? (
        <View
          style={[s.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Processing…</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>
            GNS kernel running — this may take 30–90 seconds
          </Text>
        </View>
      ) : stage === "done" && resultUrl ? (
        <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: "#10b981" }]}>
          <Feather name="check-circle" size={32} color="#10b981" />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Done!</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>
          <Pressable
            onPress={() => Linking.openURL(resultUrl)}
            style={({ pressed }) => [
              s.downloadBtn,
              { backgroundColor: "#10b981", opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Feather name="download" size={16} color="#000" />
            <Text style={s.downloadBtnText}>
              Download {selectedTool.resultLabel}
            </Text>
          </Pressable>
          <Pressable onPress={reset} style={s.resetLink}>
            <Text style={[s.resetLinkText, { color: colors.mutedForeground }]}>
              Process another file
            </Text>
          </Pressable>
        </View>
      ) : stage === "error" ? (
        <View
          style={[
            s.stateCard,
            { backgroundColor: colors.card, borderColor: colors.destructive },
          ]}
        >
          <Feather
            name={upgradeNeeded ? "lock" : "alert-circle"}
            size={32}
            color={upgradeNeeded ? colors.primary : colors.destructive}
          />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>
            {upgradeNeeded ? "Upgrade Required" : "Error"}
          </Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{errorMsg}</Text>
          {upgradeNeeded ? (
            <Text style={[s.upgradeHint, { color: colors.mutedForeground }]}>
              Go to the Upgrade tab to subscribe and get unlimited access.
            </Text>
          ) : null}
          <Pressable
            onPress={reset}
            style={[s.downloadBtn, { backgroundColor: colors.secondary }]}
          >
            <Text style={[s.downloadBtnText, { color: colors.foreground }]}>Try Again</Text>
          </Pressable>
        </View>
      ) : !isRecording ? (
        <Pressable
          onPress={handlePick}
          disabled={stage === "picking"}
          style={({ pressed }) => [
            s.pickLink,
            { opacity: pressed || stage === "picking" ? 0.6 : 1 },
          ]}
        >
          <Feather name="folder" size={15} color={colors.mutedForeground} />
          <Text style={[s.pickLinkText, { color: colors.mutedForeground }]}>
            {stage === "picking" ? "Selecting file…" : "Or pick an audio file"}
          </Text>
        </Pressable>
      ) : null}

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
    sub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      letterSpacing: 1,
      marginTop: 2,
      marginBottom: 24,
    },
    sectionLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 2,
      marginBottom: 10,
    },
    toolRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    toolTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
    },
    toolTabLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
    detailCard: { borderWidth: 1, padding: 20, gap: 10, marginBottom: 24 },
    detailIcon: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
    },
    detailTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    detailDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
    detailNote: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      paddingTop: 10,
      borderTopWidth: 1,
      letterSpacing: 0.3,
    },
    pickLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      marginBottom: 24,
    },
    pickLinkText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    stateCard: {
      borderWidth: 1,
      padding: 28,
      alignItems: "center",
      gap: 10,
      marginBottom: 24,
    },
    stateTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    stateSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
    upgradeHint: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 16,
    },
    downloadBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginTop: 4,
    },
    downloadBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" },
    resetLink: { marginTop: 4, paddingVertical: 8 },
    resetLinkText: { fontSize: 12, fontFamily: "Inter_400Regular" },
    warningBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "flex-start",
      borderWidth: 1,
      padding: 12,
    },
    warningText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
  });
