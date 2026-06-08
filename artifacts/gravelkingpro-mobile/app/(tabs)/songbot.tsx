import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const GENRES = [
  { id: "hip-hop",   label: "Hip-Hop",   emoji: "🎤", accent: "#f59e0b" },
  { id: "rnb",       label: "R&B",       emoji: "🎵", accent: "#f43f5e" },
  { id: "pop",       label: "Pop",       emoji: "🌟", accent: "#a855f7" },
  { id: "trap",      label: "Trap",      emoji: "🔥", accent: "#ef4444" },
  { id: "reggae",    label: "Reggae",    emoji: "🌿", accent: "#22c55e" },
  { id: "soul",      label: "Soul",      emoji: "💿", accent: "#f97316" },
  { id: "rock",      label: "Rock",      emoji: "🎸", accent: "#94a3b8" },
  { id: "afrobeats", label: "Afrobeats", emoji: "🥁", accent: "#06b6d4" },
];

const MOODS = [
  { id: "hype",        label: "Hype",        emoji: "⚡", accent: "#ef4444" },
  { id: "chill",       label: "Chill",       emoji: "🌊", accent: "#06b6d4" },
  { id: "emotional",   label: "Emotional",   emoji: "💕", accent: "#f43f5e" },
  { id: "dark",        label: "Dark",        emoji: "🌑", accent: "#a855f7" },
  { id: "motivational",label: "Motivational",emoji: "🏆", accent: "#22c55e" },
  { id: "romantic",    label: "Romantic",    emoji: "🌹", accent: "#f97316" },
];

const STRUCTURES: Record<string, string[]> = {
  "hip-hop": ["Intro", "Verse 1", "Hook", "Verse 2", "Hook", "Bridge", "Outro"],
  rnb: ["Intro", "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Pre-Chorus", "Chorus", "Bridge", "Chorus", "Outro"],
  pop: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Outro"],
  trap: ["Intro", "Verse 1", "Hook", "Verse 2", "Hook", "Verse 3", "Hook", "Outro"],
  reggae: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Dub Break", "Chorus", "Outro"],
  soul: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Vamp / Ad-lib", "Outro"],
  rock: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Solo", "Bridge", "Chorus", "Outro"],
  afrobeats: ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Interlude", "Chorus", "Outro"],
};

const THEME_PROMPTS: Record<string, string[]> = {
  hype: ["run it up", "top of the world", "no days off"],
  chill: ["late nights", "easy rider", "ocean breeze"],
  emotional: ["broken bridges", "letters unsent", "healing season"],
  dark: ["shadows follow", "hollow crown", "the abyss"],
  motivational: ["against all odds", "rise up", "earned not given"],
  romantic: ["forever you", "slow burn", "midnight love"],
};

type SongSection = { section: string; bars: number; notes: string };

function generateSong(
  title: string,
  artist: string,
  genre: string,
  mood: string,
  theme: string,
): SongSection[] {
  const structure = STRUCTURES[genre] ?? STRUCTURES["hip-hop"];
  const moodNote: Record<string, string> = {
    hype: "high energy, punchy delivery",
    chill: "laid-back flow, smooth melody",
    emotional: "vulnerable, raw lyricism",
    dark: "gritty, introspective bars",
    motivational: "powerful, uplifting message",
    romantic: "heartfelt, melodic delivery",
  };
  const note = moodNote[mood] ?? "expressive delivery";
  const themeHint = theme || (THEME_PROMPTS[mood]?.[0] ?? "your story");

  return structure.map((section) => {
    const isChoruxHook = section.toLowerCase().includes("chorus") || section.toLowerCase().includes("hook");
    const isIntroOutro = section.toLowerCase().includes("intro") || section.toLowerCase().includes("outro");
    const isBridge = section.toLowerCase().includes("bridge") || section.toLowerCase().includes("break") || section.toLowerCase().includes("solo") || section.toLowerCase().includes("vamp");

    const bars = isChoruxHook ? 8 : isIntroOutro ? 4 : isBridge ? 4 : 16;
    const sectionNote = isChoruxHook
      ? `Catchy, repeatable hook about "${themeHint}" — ${note}`
      : isIntroOutro
      ? `Set the scene / close the story around "${themeHint}"`
      : isBridge
      ? `Shift perspective or build emotional tension`
      : `Lyrically dense — explore theme: "${themeHint}" with ${note}`;

    return { section, bars, notes: sectionNote };
  });
}

export default function SongBotScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("hip-hop");
  const [mood, setMood] = useState("hype");
  const [theme, setTheme] = useState("");
  const [result, setResult] = useState<SongSection[] | null>(null);

  const s = styles(colors);

  function generate() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sections = generateSong(title, artist, genre, mood, theme);
    setResult(sections);
  }

  function reset() {
    setResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  if (result) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[s.content, { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.resultHeader}>
          <View style={s.resultHeaderLeft}>
            <Text style={[s.resultTitle, { color: colors.foreground }]}>
              {title || "Untitled"}
            </Text>
            {artist ? <Text style={[s.resultArtist, { color: colors.mutedForeground }]}>by {artist}</Text> : null}
            <View style={s.resultTags}>
              <Text style={[s.tag, { color: colors.primary, borderColor: colors.primary }]}>{genre}</Text>
              <Text style={[s.tag, { color: colors.mutedForeground, borderColor: colors.border }]}>{mood}</Text>
            </View>
          </View>
          <Pressable onPress={reset} style={s.resetBtn}>
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>SONG STRUCTURE</Text>

        {result.map((sec, i) => (
          <View key={i} style={[s.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.sectionTop}>
              <Text style={[s.sectionName, { color: colors.foreground }]}>{sec.section}</Text>
              <View style={[s.barsBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[s.barsBadgeText, { color: colors.mutedForeground }]}>{sec.bars} bars</Text>
              </View>
            </View>
            <Text style={[s.sectionNote, { color: colors.mutedForeground }]}>{sec.notes}</Text>
          </View>
        ))}

        <Text style={[s.footerNote, { color: colors.mutedForeground }]}>
          GravelKing SongBot · Structure based on {genre} conventions
        </Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <Text style={[s.heading, { color: colors.foreground }]}>SongBot</Text>
      <Text style={[s.sub, { color: colors.mutedForeground }]}>Generate a song structure instantly</Text>

      {/* Title */}
      <Text style={[s.label, { color: colors.mutedForeground }]}>SONG TITLE</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        placeholder="e.g. Gravel Road"
        placeholderTextColor={colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
      />

      {/* Artist */}
      <Text style={[s.label, { color: colors.mutedForeground }]}>ARTIST NAME</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        placeholder="Your artist name"
        placeholderTextColor={colors.mutedForeground}
        value={artist}
        onChangeText={setArtist}
      />

      {/* Theme */}
      <Text style={[s.label, { color: colors.mutedForeground }]}>THEME / CONCEPT (optional)</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        placeholder={`e.g. "${THEME_PROMPTS[mood]?.[0] ?? "your story"}"`}
        placeholderTextColor={colors.mutedForeground}
        value={theme}
        onChangeText={setTheme}
      />

      {/* Genre */}
      <Text style={[s.label, { color: colors.mutedForeground }]}>GENRE</Text>
      <View style={s.optionGrid}>
        {GENRES.map((g) => {
          const sel = genre === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => { setGenre(g.id); Haptics.selectionAsync(); }}
              style={({ pressed }) => [
                s.optionChip,
                {
                  backgroundColor: sel ? `${g.accent}22` : colors.card,
                  borderColor: sel ? g.accent : `${g.accent}44`,
                  borderWidth: sel ? 2 : 1.5,
                  opacity: pressed ? 0.75 : 1,
                  shadowColor: sel ? g.accent : "transparent",
                  shadowOpacity: sel ? 0.35 : 0,
                  shadowRadius: 8,
                  elevation: sel ? 4 : 0,
                },
              ]}
            >
              <Text style={s.optionChipEmoji}>{g.emoji}</Text>
              <Text style={[s.optionChipText, { color: sel ? g.accent : colors.mutedForeground, fontFamily: sel ? "Inter_700Bold" : "Inter_500Medium" }]}>
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Mood */}
      <Text style={[s.label, { color: colors.mutedForeground }]}>MOOD</Text>
      <View style={s.optionGrid}>
        {MOODS.map((m) => {
          const sel = mood === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => { setMood(m.id); Haptics.selectionAsync(); }}
              style={({ pressed }) => [
                s.optionChip,
                {
                  backgroundColor: sel ? `${m.accent}22` : colors.card,
                  borderColor: sel ? m.accent : `${m.accent}44`,
                  borderWidth: sel ? 2 : 1.5,
                  opacity: pressed ? 0.75 : 1,
                  shadowColor: sel ? m.accent : "transparent",
                  shadowOpacity: sel ? 0.35 : 0,
                  shadowRadius: 8,
                  elevation: sel ? 4 : 0,
                },
              ]}
            >
              <Text style={s.optionChipEmoji}>{m.emoji}</Text>
              <Text style={[s.optionChipText, { color: sel ? m.accent : colors.mutedForeground, fontFamily: sel ? "Inter_700Bold" : "Inter_500Medium" }]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={generate}
        style={({ pressed }) => [s.generateBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Feather name="zap" size={18} color={colors.primaryForeground} />
        <Text style={[s.generateBtnText, { color: colors.primaryForeground }]}>Generate Structure</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 24 },
    label: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 8 },
    input: {
      borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20,
    },
    optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    optionChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
    optionChipEmoji: { fontSize: 14, lineHeight: 18 },
    optionChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    generateBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, paddingVertical: 16, marginTop: 4,
    },
    generateBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
    resultHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 24 },
    resultHeaderLeft: { flex: 1, gap: 4 },
    resultTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    resultArtist: { fontSize: 13, fontFamily: "Inter_400Regular" },
    resultTags: { flexDirection: "row", gap: 6, marginTop: 4 },
    tag: { fontSize: 10, fontFamily: "Inter_500Medium", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
    resetBtn: { padding: 8 },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 12 },
    sectionCard: { borderWidth: 1, padding: 14, gap: 8, marginBottom: 10 },
    sectionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    barsBadge: { paddingHorizontal: 8, paddingVertical: 3 },
    barsBadgeText: { fontSize: 10, fontFamily: "Inter_400Regular" },
    sectionNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    footerNote: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 12 },
  });
