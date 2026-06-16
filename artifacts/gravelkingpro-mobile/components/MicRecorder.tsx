import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const SEGMENTS = 12;
const MIN_RECORDING_MS = 500;

function dbfsToLevel(dbfs: number): number {
  return Math.min(1, Math.max(0, (dbfs + 60) / 60));
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function extToMime(ext: string): string {
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "caf":
      return "audio/x-caf";
    case "mp3":
      return "audio/mpeg";
    case "webm":
      return "audio/webm";
    case "ogg":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    case "mp4":
    case "m4a":
    default:
      return "audio/m4a";
  }
}

export interface RecordedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface Props {
  accentColor?: string;
  disabled?: boolean;
  onRecorded: (file: RecordedFile) => void;
  onRecordingChange?: (recording: boolean) => void;
}

export function MicRecorder({
  accentColor = "#10b981",
  disabled = false,
  onRecorded,
  onRecordingChange,
}: Props) {
  const colors = useColors();
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [tooShort, setTooShort] = useState(false);

  // Holds the active recording so stop/teardown can always reach it even if an
  // async start races against a quick stop or unmount.
  const recordingRef = useRef<Audio.Recording | null>(null);
  // Bumped to cancel an in-flight start; the async body captures the value at
  // call time and aborts if it changed after an await.
  const generationRef = useRef(0);
  // Mirror of elapsedMs readable inside the async stop closure without staleness.
  const elapsedRef = useRef(0);
  // True while a start is in flight (before `recording` flips), so rapid taps
  // can't launch a second concurrent recorder.
  const startingRef = useRef(false);

  const notifyRecording = useCallback(
    (v: boolean) => {
      onRecordingChange?.(v);
    },
    [onRecordingChange],
  );

  // Stop + discard the recording without emitting it (unmount / tool switch).
  const teardown = useCallback(async () => {
    generationRef.current += 1;
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* already unloaded — ignore */
      }
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      /* non-fatal */
    }
  }, []);

  const startRecording = useCallback(async () => {
    // Guard against concurrent starts: rapid taps before createAsync resolves
    // (while `recording` is still false) would otherwise launch a 2nd recorder.
    if (startingRef.current || recordingRef.current) return;
    startingRef.current = true;

    setPermissionDenied(false);
    setTooShort(false);

    // Capture the cancellation token before any await so a stop during the
    // permission prompt (or any async gap) is detected correctly.
    const myGeneration = generationRef.current;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (generationRef.current !== myGeneration) return;
      if (status !== "granted") {
        setPermissionDenied(true);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (generationRef.current !== myGeneration) {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        return;
      }

      const { recording: rec } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (st) => {
          if (st.isRecording) {
            if (st.metering !== undefined) {
              const next = dbfsToLevel(st.metering);
              setLevel((prev) => (next > prev ? next : prev * 0.82 + next * 0.18));
            }
            if (typeof st.durationMillis === "number") {
              elapsedRef.current = st.durationMillis;
              setElapsedMs(st.durationMillis);
            }
          }
        },
        50,
      );

      // If a stop/unmount happened while createAsync was running, generation was
      // bumped — tear down immediately rather than attaching an orphan recording.
      if (generationRef.current !== myGeneration) {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        return;
      }

      recordingRef.current = rec;
      elapsedRef.current = 0;
      setElapsedMs(0);
      setLevel(0);
      setRecording(true);
      notifyRecording(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Device busy, OS-level denial, or other error — reset and restore mode.
      setRecording(false);
      setLevel(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    } finally {
      startingRef.current = false;
    }
  }, [notifyRecording]);

  const stopRecording = useCallback(async () => {
    const rec = recordingRef.current;
    generationRef.current += 1;
    recordingRef.current = null;
    setRecording(false);
    notifyRecording(false);
    setLevel(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const durationMs = elapsedRef.current;
    let uri: string | null = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        uri = rec.getURI();
      } catch {
        /* ignore */
      }
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

    if (!uri) return;
    if (durationMs > 0 && durationMs < MIN_RECORDING_MS) {
      setTooShort(true);
      return;
    }

    const cleaned = uri.split("?")[0];
    const maybeExt = cleaned.includes(".")
      ? (cleaned.split(".").pop() ?? "").toLowerCase()
      : "";
    const known = ["m4a", "mp4", "wav", "caf", "mp3", "webm", "ogg", "aac"];
    // Web records to blob: URLs with no usable extension — fall back to webm
    // there and m4a on native (expo-av HIGH_QUALITY default).
    const ext = known.includes(maybeExt)
      ? maybeExt
      : Platform.OS === "web"
        ? "webm"
        : "m4a";
    onRecorded({
      uri,
      name: `mic-recording-${Date.now()}.${ext}`,
      mimeType: extToMime(ext),
    });
  }, [notifyRecording, onRecorded]);

  // Release the mic if the component unmounts mid-recording (e.g. tool switch
  // or navigating away). teardown discards rather than emits.
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  const s = styles(colors);
  const litSegments = Math.round(level * SEGMENTS);

  return (
    <View
      style={[
        s.container,
        { borderColor: recording ? accentColor + "60" : colors.border },
      ]}
    >
      <View style={s.header}>
        <View style={s.labelRow}>
          <Feather
            name="mic"
            size={14}
            color={recording ? accentColor : colors.mutedForeground}
          />
          <Text
            style={[
              s.label,
              { color: recording ? colors.foreground : colors.mutedForeground },
            ]}
          >
            {recording ? "Recording…" : "Record from Mic"}
          </Text>
        </View>
        {recording && (
          <Text style={[s.timer, { color: accentColor }]}>
            {formatElapsed(elapsedMs)}
          </Text>
        )}
      </View>

      <View style={s.meterRow} aria-label="Input level meter">
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = recording && i < litSegments;
          const segColor =
            i >= SEGMENTS - 2
              ? "#ef4444"
              : i >= SEGMENTS - 5
                ? "#facc15"
                : accentColor;
          return (
            <View
              key={i}
              style={[
                s.segment,
                { backgroundColor: lit ? segColor : colors.border + "80" },
              ]}
            />
          );
        })}
      </View>

      <Pressable
        onPress={recording ? stopRecording : startRecording}
        disabled={disabled}
        style={({ pressed }) => [
          s.recordBtn,
          {
            backgroundColor: recording ? accentColor : "transparent",
            borderColor: accentColor,
            opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Feather
          name={recording ? "square" : "mic"}
          size={18}
          color={recording ? "#000" : accentColor}
        />
        <Text
          style={[s.recordBtnText, { color: recording ? "#000" : accentColor }]}
        >
          {recording ? "Stop & Process" : "Record"}
        </Text>
      </Pressable>

      {permissionDenied ? (
        <Text style={[s.hint, { color: "#ef4444" }]}>
          Microphone access denied. Allow it in device settings.
        </Text>
      ) : tooShort ? (
        <Text style={[s.hint, { color: "#facc15" }]}>
          Recording too short — hold a moment longer.
        </Text>
      ) : (
        <Text style={[s.hint, { color: colors.mutedForeground }]}>
          {recording
            ? "Tap stop to send your take straight to the kernel."
            : "Capture audio directly — no file needed."}
        </Text>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      padding: 14,
      gap: 12,
      marginBottom: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    label: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.3,
    },
    timer: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      fontVariant: ["tabular-nums"],
    },
    meterRow: {
      flexDirection: "row",
      gap: 2,
      height: 10,
    },
    segment: {
      flex: 1,
      borderRadius: 1,
    },
    recordBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      paddingVertical: 12,
    },
    recordBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.3,
    },
    hint: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      lineHeight: 14,
    },
  });
