import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const KEYS = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];

const CIRCLE = [
  { key: "C",  major: "C Major",  minor: "A minor",  sharps: 0 },
  { key: "G",  major: "G Major",  minor: "E minor",  sharps: 1 },
  { key: "D",  major: "D Major",  minor: "B minor",  sharps: 2 },
  { key: "A",  major: "A Major",  minor: "F# minor", sharps: 3 },
  { key: "E",  major: "E Major",  minor: "C# minor", sharps: 4 },
  { key: "B",  major: "B Major",  minor: "G# minor", sharps: 5 },
  { key: "F#", major: "F# Major", minor: "D# minor", sharps: 6 },
  { key: "Db", major: "Db Major", minor: "Bb minor", sharps: -5 },
  { key: "Ab", major: "Ab Major", minor: "F minor",  sharps: -4 },
  { key: "Eb", major: "Eb Major", minor: "C minor",  sharps: -3 },
  { key: "Bb", major: "Bb Major", minor: "G minor",  sharps: -2 },
  { key: "F",  major: "F Major",  minor: "D minor",  sharps: -1 },
];

const CHORDS: Record<string, { major: string[]; minor: string[] }> = {
  C:  { major: ["C","Dm","Em","F","G","Am","Bdim"], minor: ["Am","Bdim","C","Dm","Em","F","G"] },
  G:  { major: ["G","Am","Bm","C","D","Em","F#dim"], minor: ["Em","F#dim","G","Am","Bm","C","D"] },
  D:  { major: ["D","Em","F#m","G","A","Bm","C#dim"], minor: ["Bm","C#dim","D","Em","F#m","G","A"] },
  A:  { major: ["A","Bm","C#m","D","E","F#m","G#dim"], minor: ["F#m","G#dim","A","Bm","C#m","D","E"] },
  E:  { major: ["E","F#m","G#m","A","B","C#m","D#dim"], minor: ["C#m","D#dim","E","F#m","G#m","A","B"] },
  F:  { major: ["F","Gm","Am","Bb","C","Dm","Edim"], minor: ["Dm","Edim","F","Gm","Am","Bb","C"] },
  Bb: { major: ["Bb","Cm","Dm","Eb","F","Gm","Adim"], minor: ["Gm","Adim","Bb","Cm","Dm","Eb","F"] },
};

const DEGREES = ["I","II","III","IV","V","VI","VII"];

export default function TunerScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  const info = selected ? CIRCLE.find(c => c.key === selected) : null;
  const chords = selected && CHORDS[selected] ? CHORDS[selected] : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Key Reference</Text>
      <Text style={styles.sub}>Works offline — tap a key</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.keyRow} contentContainerStyle={styles.keyRowContent}>
        {KEYS.map(k => {
          const short = k.split("/")[0];
          const active = selected === short || selected === k.split("/")[1];
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setSelected(short)}
              style={[styles.keyBtn, active && styles.keyBtnActive]}
            >
              <Text style={[styles.keyLabel, active && styles.keyLabelActive]}>{k}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {info && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{info.major}</Text>
            <Text style={styles.cardSub}>Relative minor: {info.minor}</Text>
            <Text style={styles.cardSub}>
              {info.sharps === 0 ? "No sharps or flats"
                : info.sharps > 0 ? `${info.sharps} sharp${info.sharps > 1 ? "s" : ""}`
                : `${Math.abs(info.sharps)} flat${Math.abs(info.sharps) > 1 ? "s" : ""}`}
            </Text>
          </View>

          {chords && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Diatonic Chords — {info.major}</Text>
              {chords.major.map((chord, i) => (
                <View key={chord} style={styles.chordRow}>
                  <Text style={styles.degree}>{DEGREES[i]}</Text>
                  <Text style={styles.chord}>{chord}</Text>
                  <Text style={styles.chordType}>{i === 0 || i === 3 || i === 4 ? "Major" : i === 6 ? "Dim" : "Minor"}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Standard Guitar Tuning</Text>
            {["E2 (6th)", "A2 (5th)", "D3 (4th)", "G3 (3rd)", "B3 (2nd)", "E4 (1st)"].map(s => (
              <Text key={s} style={styles.tuningRow}>{s}</Text>
            ))}
          </View>
        </ScrollView>
      )}

      {!selected && (
        <Text style={styles.placeholder}>Select a key above to see chords and key info</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090b" },
  title: { fontSize: 22, fontWeight: "700", color: "#fafafa", marginTop: 24, marginBottom: 4, paddingHorizontal: 24 },
  sub: { fontSize: 13, color: "#71717a", marginBottom: 16, paddingHorizontal: 24 },
  keyRow: { flexGrow: 0, marginBottom: 16 },
  keyRowContent: { paddingHorizontal: 20, gap: 8 },
  keyBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: "#18181b", borderWidth: 1, borderColor: "#27272a" },
  keyBtnActive: { backgroundColor: "#f59e0b22", borderColor: "#f59e0b" },
  keyLabel: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  keyLabelActive: { color: "#f59e0b" },
  content: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: "#18181b", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { color: "#fafafa", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardSub: { color: "#71717a", fontSize: 13, marginTop: 2 },
  chordRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#27272a" },
  degree: { color: "#f59e0b", fontSize: 12, fontWeight: "700", width: 32 },
  chord: { color: "#fafafa", fontSize: 15, fontWeight: "600", flex: 1 },
  chordType: { color: "#71717a", fontSize: 12 },
  tuningRow: { color: "#d4d4d8", fontSize: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#27272a" },
  placeholder: { color: "#52525b", textAlign: "center", marginTop: 60, fontSize: 15, paddingHorizontal: 40 },
});
