import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { DragDropContentView, type DropAsset } from "expo-drag-drop-content-view";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
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
    note: "Pro required · MP3, WAV, FLAC · Returns individual stem tracks",
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

const STEM_META: Record<string, { label: string; color: string; desc: string }> = {
  "bass.wav":         { label: "Bass",         color: "#f97316", desc: "Bass guitar & sub-bass" },
  "midrange.wav":     { label: "Midrange",      color: "#38bdf8", desc: "Synths, guitars & everything else" },
  "highs.wav":        { label: "Highs",         color: "#a78bfa", desc: "Air, cymbals & high-freq detail" },
  "instrumental.wav": { label: "Instrumental",  color: "#e879f9", desc: "Full mix with vocals removed" },
  "GKP_vocals.wav":   { label: "Vocals",        color: "#f472b6", desc: "Isolated lead & backing vocals" },
  "GKP_drums.wav":    { label: "Drums",         color: "#fbbf24", desc: "Kick, snare, hats & percussion" },
  "GKP_bass.wav":     { label: "Bass",          color: "#f97316", desc: "Bass guitar & sub-bass" },
  "GKP_other.wav":    { label: "Other",         color: "#38bdf8", desc: "Synths, guitars & everything else" },
  "GKP_instrumental.wav": { label: "Instrumental", color: "#e879f9", desc: "Full mix with vocals removed" },
};

type StemItem = { name: string; label: string; color: string; desc: string; url: string };

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
  if (tool.id === "stem_split") {
    fd.append("source", "studio");
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

  useEffect(() => {
    AsyncStorage.getItem("studio_last_tool").then((id) => {
      if (!id) return;
      const found = TOOLS.find((t) => t.id === id);
      if (found) setSelectedTool(found);
    }).catch(() => {});
  }, []);

  const [stage, setStage] = useState<Stage>("idle");
  const [uploadStatus, setUploadStatus] = useState<string>("Uploading…");
  const [fileName, setFileName] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stemItems, setStemItems] = useState<StemItem[]>([]);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [mutedStems, setMutedStems] = useState<Set<string>>(new Set());
  const [soloedStem, setSoloedStem] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const audioRef = useRef<any>(null);
  const mixAudiosRef = useRef<any[]>([]);
  /** Last successfully uploaded asset — survives tool switches for session pre-fill. */
  const lastAssetRef = useRef<{ uri: string; name: string; mimeType?: string } | null>(null);

  const s = styles(colors);

  function stopCurrentStem() {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current = null;
    }
    for (const a of mixAudiosRef.current) { try { a.pause(); } catch { /* ok */ } }
    mixAudiosRef.current = [];
    setPlayingStem(null);
    setIsPlayingMix(false);
  }

  function playMix() {
    if (!isWeb) return; // native: controls are visual-only; play individually
    if (isPlayingMix) { stopCurrentStem(); return; }
    stopCurrentStem();
    const activeStemNames = soloedStem !== null
      ? [soloedStem]
      : stemItems.filter(s => !mutedStems.has(s.name)).map(s => s.name);
    const active = stemItems.filter(s => activeStemNames.includes(s.name));
    if (active.length === 0) return;
    const audios: any[] = [];
    for (const stem of active) {
      try {
        const a = new (window as any).Audio(stem.url);
        a.play().catch(() => {});
        audios.push(a);
      } catch { /* skip */ }
    }
    mixAudiosRef.current = audios;
    setIsPlayingMix(true);
    if (audios[0]) {
      audios[0].onended = () => {
        mixAudiosRef.current = [];
        setIsPlayingMix(false);
      };
    }
  }

  function playStem(name: string, url: string) {
    if (Platform.OS !== "web") {
      Linking.openURL(url);
      return;
    }
    if (playingStem === name) {
      stopCurrentStem();
      return;
    }
    stopCurrentStem();
    try {
      const audio = new (window as any).Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingStem(null);
      setPlayingStem(name);
    } catch {
      Linking.openURL(url);
    }
  }

  async function processAsset(asset: {
    uri: string;
    name: string;
    mimeType?: string;
  }) {
    setErrorMsg(null);
    setResultUrl(null);
    setStemItems([]);
    setUpgradeNeeded(false);
    setMutedStems(new Set());
    setSoloedStem(null);
    setIsPlayingMix(false);
    stopCurrentStem();
    setFileName(asset.name);
    setUploadStatus("Uploading…");
    setStage("uploading");

    try {
      const formData = buildFormData(selectedTool, asset);
      const endpoint = endpointForTool(selectedTool.id);

      const uploadDoneTimer = setTimeout(() => {
        setUploadStatus("Processing with MLK v3…");
      }, 4000);

      let res: Response;
      try {
        res = await apiFetch(endpoint, {
          method: "POST",
          body: formData,
        });
      } finally {
        clearTimeout(uploadDoneTimer);
      }

      if (res.status === 402) {
        const err = await res.json().catch(() => ({ error: "Upgrade required" }));
        const isUpgradeRequired = err.code === "UPGRADE_REQUIRED";
        setErrorMsg(
          isUpgradeRequired
            ? "Stem Splitting in Studio requires a GravelKing Studio (monthly) subscription."
            : (err.error ?? "You've reached the free tier limit.")
        );
        setUpgradeNeeded(true);
        setStage("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Processing failed" }));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (selectedTool.id === "stem_split" && contentType.includes("zip")) {
        const blob = await res.blob();
        const { unzip } = await import("fflate");
        const arrayBuf = await blob.arrayBuffer();

        await new Promise<void>((resolve, reject) => {
          unzip(new Uint8Array(arrayBuf), (err, files) => {
            if (err) { reject(err); return; }
            const items: StemItem[] = Object.entries(files).map(([name, data]) => {
              const stemBlob = new Blob([data as BlobPart], { type: "audio/wav" });
              const url = URL.createObjectURL(stemBlob);
              const meta = STEM_META[name] ?? { label: name, color: "#94a3b8", desc: "" };
              return { name, url, ...meta };
            });
            setStemItems(items);
            resolve();
          });
        });

        lastAssetRef.current = asset;
        setStage("done");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      lastAssetRef.current = asset;
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

  async function handlePickFromFiles() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage("picking");
    setErrorMsg(null);
    setResultUrl(null);
    setStemItems([]);
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

  async function handlePickFromPhotos() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStage("picking");
    setErrorMsg(null);
    setResultUrl(null);
    setStemItems([]);
    setUpgradeNeeded(false);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg("Photo Library access denied. Allow it in device settings.");
        setStage("error");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "videos",
        allowsEditing: false,
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets?.length) {
        setStage("idle");
        return;
      }

      const picked = result.assets[0];
      const uri = picked.uri;
      const ext = uri.split(".").pop()?.toLowerCase() ?? "mp4";
      const name = `recording-${Date.now()}.${ext}`;
      const mimeType = ext === "mov" ? "video/quicktime" : ext === "mp4" ? "video/mp4" : "video/mp4";

      await processAsset({ uri, name, mimeType });
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setStage("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleDroppedAssets(assets: DropAsset[]) {
    const first = assets.find(
      (a) => a.type?.startsWith("audio/") || a.type?.startsWith("video/"),
    ) ?? assets[0];
    if (!first) return;

    setIsDragOver(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ext = first.type ? first.type.split("/")[1] ?? "mp3" : "mp3";
    const name = first.fileName ?? `audio-${Date.now()}.${ext}`;
    const uri = first.uri ?? first.base64 ?? "";
    if (!uri) return;

    await processAsset({ uri, name, mimeType: first.type ?? "audio/mpeg" });
  }

  function reset() {
    stopCurrentStem();
    setStage("idle");
    setFileName(null);
    setResultUrl(null);
    setStemItems([]);
    setMutedStems(new Set());
    setSoloedStem(null);
    setIsPlayingMix(false);
    setErrorMsg(null);
    setUpgradeNeeded(false);
    setIsRecording(false);
    setUploadStatus("Uploading…");
  }

  const isBusy = stage === "uploading" || stage === "picking";
  const isStemDone = stage === "done" && selectedTool.id === "stem_split" && stemItems.length > 0;

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
                AsyncStorage.setItem("studio_last_tool", tool.id).catch(() => {});
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
        disabled={isBusy}
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
          <Text style={[s.stateTitle, { color: colors.foreground }]}>{uploadStatus}</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>
            GNS kernel running — this may take 30–90 seconds
          </Text>
        </View>
      ) : isStemDone ? (
        <View style={[s.stateCard, { backgroundColor: colors.card, borderColor: "#10b981" }]}>
          <Feather name="check-circle" size={32} color="#10b981" />
          <Text style={[s.stateTitle, { color: colors.foreground }]}>Session Tracks</Text>
          <Text style={[s.stateSub, { color: colors.mutedForeground }]}>{fileName}</Text>

          {/* Play Mix header (web only) */}
          {isWeb && (
            <Pressable
              onPress={playMix}
              style={({ pressed }) => [
                s.playMixBtn,
                {
                  backgroundColor: isPlayingMix ? "#10b981" : `${colors.card}`,
                  borderColor: "#10b981",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Feather
                name={isPlayingMix ? "square" : "play"}
                size={13}
                color={isPlayingMix ? "#000" : "#10b981"}
              />
              <Text style={[s.playMixBtnText, { color: isPlayingMix ? "#000" : "#10b981" }]}>
                {isPlayingMix ? "Stop Mix" : "Play Mix"}
              </Text>
            </Pressable>
          )}

          <View style={s.stemList}>
            {stemItems.map((stem) => {
              const isPlaying = playingStem === stem.name;
              const isMuted = mutedStems.has(stem.name);
              const isSoloed = soloedStem === stem.name;
              const dimmed = soloedStem !== null && !isSoloed;
              return (
                <View
                  key={stem.name}
                  style={[
                    s.stemRow,
                    {
                      backgroundColor: `${stem.color}10`,
                      borderColor: isPlaying ? stem.color : `${stem.color}40`,
                      opacity: dimmed ? 0.35 : 1,
                    },
                  ]}
                >
                  <View style={[s.stemColorDot, { backgroundColor: stem.color }]} />
                  <View style={s.stemInfo}>
                    <Text style={[s.stemLabel, { color: stem.color }]}>{stem.label}</Text>
                    <Text style={[s.stemDesc, { color: colors.mutedForeground }]}>{stem.desc}</Text>
                  </View>
                  {/* Solo */}
                  <Pressable
                    onPress={() => {
                      stopCurrentStem();
                      setSoloedStem(prev => prev === stem.name ? null : stem.name);
                    }}
                    style={({ pressed }) => [
                      s.smBtn,
                      {
                        backgroundColor: isSoloed ? "#facc15" : "transparent",
                        borderColor: isSoloed ? "#facc15" : `${stem.color}60`,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={[s.smBtnText, { color: isSoloed ? "#000" : colors.mutedForeground }]}>S</Text>
                  </Pressable>
                  {/* Mute */}
                  <Pressable
                    onPress={() => {
                      stopCurrentStem();
                      setMutedStems(prev => {
                        const next = new Set(prev);
                        if (next.has(stem.name)) next.delete(stem.name); else next.add(stem.name);
                        return next;
                      });
                    }}
                    style={({ pressed }) => [
                      s.smBtn,
                      {
                        backgroundColor: isMuted ? "#52525b" : "transparent",
                        borderColor: isMuted ? "#71717a" : `${stem.color}60`,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={[s.smBtnText, { color: isMuted ? "#fff" : colors.mutedForeground }]}>M</Text>
                  </Pressable>
                  {/* Play individual stem */}
                  <Pressable
                    onPress={() => playStem(stem.name, stem.url)}
                    style={({ pressed }) => [
                      s.stemIconBtn,
                      {
                        backgroundColor: isPlaying ? stem.color : `${stem.color}20`,
                        borderColor: stem.color,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={isPlaying ? "square" : "play"}
                      size={13}
                      color={isPlaying ? "#000" : stem.color}
                    />
                  </Pressable>
                  {/* Download */}
                  <Pressable
                    onPress={() => Linking.openURL(stem.url)}
                    style={({ pressed }) => [
                      s.stemIconBtn,
                      {
                        backgroundColor: `${stem.color}15`,
                        borderColor: `${stem.color}50`,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather name="download" size={13} color={stem.color} />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <Pressable onPress={reset} style={s.resetLink}>
            <Text style={[s.resetLinkText, { color: colors.mutedForeground }]}>
              Process another file
            </Text>
          </Pressable>
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
              {selectedTool.id === "stem_split"
                ? "Stem Splitting in Studio requires a Studio (monthly) subscription. Go to the Upgrade tab to subscribe."
                : "Go to the Upgrade tab to subscribe and get unlimited access."}
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
        <View>
          {/* Session pre-fill: offer to reuse the last uploaded track */}
          {selectedTool.id === "stem_split" && lastAssetRef.current && (
            <Pressable
              onPress={() => {
                if (lastAssetRef.current) void processAsset(lastAssetRef.current);
              }}
              style={({ pressed }) => [
                s.sessionPrefill,
                {
                  backgroundColor: `#10b98115`,
                  borderColor: "#10b981",
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Feather name="refresh-cw" size={14} color="#10b981" />
              <Text style={[s.sessionPrefillText, { color: "#10b981" }]} numberOfLines={1}>
                Re-split session track: {lastAssetRef.current.name}
              </Text>
            </Pressable>
          )}
          <DragDropContentView
            onDrop={({ assets }) => { void handleDroppedAssets(assets); }}
            onEnter={() => setIsDragOver(true)}
            onExit={() => setIsDragOver(false)}
            style={[
              s.dropZone,
              {
                borderColor: isDragOver
                  ? selectedTool.color
                  : isBusy ? colors.primary : colors.border,
                backgroundColor: isDragOver
                  ? `${selectedTool.color}18`
                  : undefined,
              },
            ]}
          >
          {isDragOver ? (
            <>
              <Feather name="download-cloud" size={36} color={selectedTool.color} />
              <Text style={[s.dropZoneTitle, { color: selectedTool.color }]}>
                Drop to upload
              </Text>
              <Text style={[s.dropZoneSub, { color: selectedTool.color, opacity: 0.7 }]}>
                Release to start processing
              </Text>
            </>
          ) : (
            <>
              <Feather name="upload-cloud" size={32} color={colors.mutedForeground} />
              <Text style={[s.dropZoneTitle, { color: colors.foreground }]}>
                Upload Audio File
              </Text>
              <Text style={[s.dropZoneSub, { color: colors.mutedForeground }]}>
                MP3 · WAV · FLAC · M4A
              </Text>
              <Text style={[s.dropHint, { color: colors.mutedForeground }]}>
                or drag a file here from Files
              </Text>

              <View style={s.dropZoneBtns}>
                <Pressable
                  onPress={handlePickFromFiles}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    s.dropBtn,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                      opacity: isBusy || pressed ? 0.6 : 1,
                      flex: 1,
                    },
                  ]}
                >
                  <Feather name="folder" size={15} color={colors.foreground} />
                  <Text style={[s.dropBtnText, { color: colors.foreground }]}>
                    {stage === "picking" ? "Selecting…" : "Files App"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handlePickFromPhotos}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    s.dropBtn,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                      opacity: isBusy || pressed ? 0.6 : 1,
                      flex: 1,
                    },
                  ]}
                >
                  <Feather name="image" size={15} color={colors.foreground} />
                  <Text style={[s.dropBtnText, { color: colors.foreground }]}>
                    Photos / Videos
                  </Text>
                </Pressable>
              </View>
            </>
          )}
          </DragDropContentView>
        </View>
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
    dropZone: {
      borderWidth: 1,
      borderStyle: "dashed",
      padding: 28,
      alignItems: "center",
      gap: 8,
      marginBottom: 24,
      minHeight: 160,
      justifyContent: "center",
    },
    dropZoneTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      marginTop: 4,
    },
    dropZoneSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    dropHint: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      opacity: 0.5,
      marginBottom: 4,
    },
    dropZoneBtns: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
      marginTop: 4,
    },
    dropBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 12,
      borderWidth: 1,
    },
    dropBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
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
    stemList: { width: "100%", gap: 8 },
    stemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderRadius: 8,
    },
    stemColorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    stemInfo: { flex: 1 },
    stemLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    stemDesc: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
    stemIconBtn: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 6,
    },
    smBtn: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 5,
    },
    smBtnText: { fontSize: 10, fontFamily: "Inter_700Bold" },
    playMixBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderWidth: 1,
      borderRadius: 6,
      alignSelf: "center",
    },
    playMixBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    sessionPrefill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderWidth: 1,
      borderRadius: 6,
      marginBottom: 10,
    },
    sessionPrefillText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
  });
