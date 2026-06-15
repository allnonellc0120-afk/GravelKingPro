import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const SEGMENTS = 12;

function dbfsToLevel(dbfs: number): number {
  return Math.min(1, Math.max(0, (dbfs + 60) / 60));
}

interface Props {
  accentColor?: string;
}

export function MicLevelMeter({ accentColor = "#10b981" }: Props) {
  const colors = useColors();
  const [armed, setArmed] = useState(false);
  const [level, setLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Holds the active recording so stopMonitor can always reach it, even if
  // the async start races against a quick disarm.
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Incremented each time we want to cancel an in-flight start. The async
  // startMonitor body captures the generation at call time; if it differs
  // after createAsync resolves we know a disarm happened mid-flight and we
  // immediately tear down the recording.
  const generationRef = useRef(0);

  const stopMonitor = useCallback(async () => {
    // Bump generation so any concurrent startMonitor call aborts itself.
    generationRef.current += 1;

    const rec = recordingRef.current;
    recordingRef.current = null;
    setLevel(0);

    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* already unloaded — ignore */
      }
    }

    // Restore audio mode so the rest of the app is not left in recording mode.
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      /* non-fatal */
    }
  }, []);

  const startMonitor = useCallback(async () => {
    setPermissionDenied(false);

    // Capture the cancellation token BEFORE any await so that a disarm during
    // the permission prompt (or any other async gap) is detected correctly.
    const myGeneration = generationRef.current;

    const { status } = await Audio.requestPermissionsAsync();

    // Check after permission gap — user may have disarmed while the dialog showed.
    if (generationRef.current !== myGeneration) return;

    if (status !== "granted") {
      setPermissionDenied(true);
      setArmed(false);
      return;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true });

      // Check again after setAudioMode gap.
      if (generationRef.current !== myGeneration) {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        return;
      }

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (recordingStatus) => {
          if (
            recordingStatus.isRecording &&
            recordingStatus.metering !== undefined
          ) {
            const next = dbfsToLevel(recordingStatus.metering);
            setLevel((prev) =>
              next > prev ? next : prev * 0.82 + next * 0.18,
            );
          }
        },
        50,
      );

      // If the user disarmed while createAsync was running, generation will
      // have been bumped by stopMonitor — tear down immediately rather than
      // attaching a recording that will never be stopped.
      if (generationRef.current !== myGeneration) {
        try {
          await recording.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
        return;
      }

      recordingRef.current = recording;
    } catch {
      // Permission denied at OS level, device busy, or other error — disarm
      // silently and restore audio mode.
      setArmed(false);
      setLevel(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  }, []);

  // The arm toggle IS the picker lifecycle: armed=true → open/start,
  // armed=false → close/stop. Monitoring begins the moment the user arms and
  // is guaranteed to be released when they disarm or the component unmounts.
  useEffect(() => {
    if (armed) {
      void startMonitor();
    } else {
      void stopMonitor();
    }
  }, [armed, startMonitor, stopMonitor]);

  // Release the stream when the screen navigates away or the component unmounts.
  useEffect(() => {
    return () => {
      void stopMonitor();
    };
  }, [stopMonitor]);

  const s = styles(colors);
  const litSegments = Math.round(level * SEGMENTS);

  return (
    <View
      style={[
        s.container,
        { borderColor: armed ? accentColor + "60" : colors.border },
      ]}
    >
      <View style={s.header}>
        <View style={s.labelRow}>
          <Feather
            name="mic"
            size={14}
            color={armed ? accentColor : colors.mutedForeground}
          />
          <Text
            style={[
              s.label,
              { color: armed ? colors.foreground : colors.mutedForeground },
            ]}
          >
            Mic Monitor
          </Text>
        </View>

        <Pressable
          onPress={() => setArmed((v) => !v)}
          style={({ pressed }) => [
            s.armBtn,
            {
              backgroundColor: armed ? accentColor + "22" : "transparent",
              borderColor: armed ? accentColor : colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={[
              s.armBtnText,
              { color: armed ? accentColor : colors.mutedForeground },
            ]}
          >
            {armed ? "Armed" : "Arm"}
          </Text>
          <View
            style={[
              s.dot,
              {
                backgroundColor: armed
                  ? accentColor
                  : colors.mutedForeground,
                opacity: armed ? 1 : 0.4,
              },
            ]}
          />
        </Pressable>
      </View>

      {permissionDenied && (
        <Text style={[s.hint, { color: "#ef4444" }]}>
          Microphone access denied. Allow it in device settings.
        </Text>
      )}

      <View style={s.meterRow} aria-label="Input level meter">
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const lit = i < litSegments;
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

      <View style={s.footer}>
        <Text style={[s.hint, { color: colors.mutedForeground }]}>
          {armed
            ? "Speak or play to confirm the right mic is active."
            : "Arm to monitor your microphone level before recording."}
        </Text>
        {armed && (
          <Text style={[s.pct, { color: colors.mutedForeground }]}>
            {Math.round(level * 100)}%
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      borderWidth: 1,
      padding: 14,
      gap: 10,
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
    armBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
    },
    armBtnText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
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
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    hint: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      flex: 1,
      lineHeight: 14,
    },
    pct: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      textAlign: "right",
      minWidth: 28,
    },
  });
