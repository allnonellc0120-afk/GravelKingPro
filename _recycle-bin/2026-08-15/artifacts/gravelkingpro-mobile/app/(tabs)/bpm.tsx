import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Vibration,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TEMPOS = [
  { label: "Larghissimo", range: "< 24" },
  { label: "Grave", range: "24–45" },
  { label: "Largo", range: "45–60" },
  { label: "Adagio", range: "60–72" },
  { label: "Andante", range: "72–76" },
  { label: "Moderato", range: "76–108" },
  { label: "Allegro", range: "108–132" },
  { label: "Vivace", range: "132–168" },
  { label: "Presto", range: "168–200" },
  { label: "Prestissimo", range: "> 200" },
];

function getTempoLabel(bpm: number) {
  if (bpm < 24) return "Larghissimo";
  if (bpm < 45) return "Grave";
  if (bpm < 60) return "Largo";
  if (bpm < 72) return "Adagio";
  if (bpm < 76) return "Andante";
  if (bpm < 108) return "Moderato";
  if (bpm < 132) return "Allegro";
  if (bpm < 168) return "Vivace";
  if (bpm < 200) return "Presto";
  return "Prestissimo";
}

export default function BPMScreen() {
  const insets = useSafeAreaInsets();
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapping, setTapping] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    Vibration.vibrate(30);
    const now = Date.now();
    taps.current.push(now);

    // Reset if > 3s gap
    if (taps.current.length > 1) {
      const gap = now - taps.current[taps.current.length - 2];
      if (gap > 3000) {
        taps.current = [now];
        setBpm(null);
        setTapping(false);
        return;
      }
    }

    // Keep last 8 taps
    if (taps.current.length > 8) taps.current = taps.current.slice(-8);

    if (taps.current.length >= 2) {
      setTapping(true);
      const intervals = taps.current
        .slice(1)
        .map((t, i) => t - taps.current[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.round(60000 / avg));
    }

    // Auto-reset after 3s of no taps
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      taps.current = [];
      setTapping(false);
    }, 3000);
  }, []);

  const reset = () => {
    taps.current = [];
    setBpm(null);
    setTapping(false);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>BPM Tap Tempo</Text>
      <Text style={styles.sub}>Works offline — tap the beat</Text>

      <Pressable onPress={handleTap} style={({ pressed }) => [styles.tapBtn, pressed && styles.tapPressed]}>
        <Text style={styles.tapLabel}>{tapping ? "TAP" : "TAP TO START"}</Text>
        {bpm !== null && (
          <>
            <Text style={styles.bpmNumber}>{bpm}</Text>
            <Text style={styles.bpmUnit}>BPM · {getTempoLabel(bpm)}</Text>
          </>
        )}
      </Pressable>

      <TouchableOpacity onPress={reset} style={styles.resetBtn}>
        <Text style={styles.resetLabel}>Reset</Text>
      </TouchableOpacity>

      <ScrollView style={styles.tempoList} showsVerticalScrollIndicator={false}>
        <Text style={styles.tempoHeader}>Tempo Reference</Text>
        {TEMPOS.map((t) => (
          <View key={t.label} style={styles.tempoRow}>
            <Text style={styles.tempoName}>{t.label}</Text>
            <Text style={styles.tempoRange}>{t.range} BPM</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b", alignItems: "center", paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: "700", color: "#fafafa", marginTop: 24, marginBottom: 4 },
  sub: { fontSize: 13, color: "#71717a", marginBottom: 32 },
  tapBtn: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: "#18181b", borderWidth: 2, borderColor: "#f59e0b",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  tapPressed: { backgroundColor: "#292524", transform: [{ scale: 0.96 }] },
  tapLabel: { fontSize: 16, fontWeight: "700", color: "#f59e0b", letterSpacing: 2 },
  bpmNumber: { fontSize: 56, fontWeight: "800", color: "#fafafa", lineHeight: 64 },
  bpmUnit: { fontSize: 13, color: "#a1a1aa" },
  resetBtn: { paddingVertical: 10, paddingHorizontal: 32, borderRadius: 8, backgroundColor: "#27272a", marginBottom: 32 },
  resetLabel: { color: "#a1a1aa", fontSize: 14, fontWeight: "600" },
  tempoList: { width: "100%" },
  tempoHeader: { fontSize: 13, fontWeight: "700", color: "#71717a", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  tempoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#18181b" },
  tempoName: { color: "#d4d4d8", fontSize: 15 },
  tempoRange: { color: "#71717a", fontSize: 14 },
});
