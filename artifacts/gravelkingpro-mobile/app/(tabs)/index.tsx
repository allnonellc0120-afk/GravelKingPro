import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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

type Beat = {
  id: number;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  isFeatured: boolean;
  downloadCount: number;
};

const TOOLS = [
  { id: "stem_split", label: "Stem Split", icon: "scissors" as const, desc: "Isolate drums, bass, vocals & more" },
  { id: "voice_remove", label: "Voice Remove", icon: "mic-off" as const, desc: "Strip vocals, keep instrumentals" },
  { id: "mastering", label: "Mastering", icon: "radio" as const, desc: "AI-powered track mastering" },
  { id: "denoise", label: "Denoise", icon: "wind" as const, desc: "Remove noise & artifacts" },
];

const TIERS = [
  { label: "Free", price: "$0", color: "#a1a1a6" },
  { label: "Splits", price: "$9.99", color: "#ffb000" },
  { label: "Pro", price: "$39.99", color: "#ffb000" },
  { label: "Node\nAuditor", price: "$499", color: "#ff8800" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [featured, setFeatured] = useState<Beat | null>(null);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (!API_BASE) return;
    fetch(`${API_BASE}/api/beats`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const f = d.beats.find((b: Beat) => b.isFeatured) ?? d.beats[0] ?? null;
          setFeatured(f);
        }
      })
      .catch(() => {});
  }, []);

  const s = styles(colors);

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        s.content,
        { paddingTop: isWeb ? 67 + insets.top : insets.top + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Logo / Brand */}
      <View style={s.brand}>
        <View style={s.logoBox}>
          <Text style={[s.logoText, { color: colors.primaryForeground }]}>GK</Text>
        </View>
        <View>
          <Text style={[s.brandName, { color: colors.foreground }]}>GRAVELKING</Text>
          <Text style={[s.brandSub, { color: colors.primary }]}>PRODUCTIONS</Text>
        </View>
      </View>

      <Text style={[s.tagline, { color: colors.mutedForeground }]}>
        Professional Audio Tools · All N One LLC
      </Text>

      {/* Tool Grid */}
      <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>STUDIO TOOLS</Text>
      <View style={s.grid}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.id}
            style={({ pressed }) => [
              s.toolCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
            onPress={() => router.push({ pathname: "/(tabs)/studio", params: { tool: tool.id } })}
          >
            <View style={[s.toolIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={tool.icon} size={22} color={colors.primary} />
            </View>
            <Text style={[s.toolLabel, { color: colors.foreground }]}>{tool.label}</Text>
            <Text style={[s.toolDesc, { color: colors.mutedForeground }]}>{tool.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Beat of the Month */}
      {featured && (
        <>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>BEAT OF THE MONTH</Text>
          <Pressable
            style={({ pressed }) => [
              s.featuredCard,
              { backgroundColor: colors.card, borderColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => router.push("/(tabs)/beats")}
          >
            <View style={s.featuredBadge}>
              <Feather name="star" size={10} color={colors.primaryForeground} />
              <Text style={[s.featuredBadgeText, { color: colors.primaryForeground }]}>FEATURED</Text>
            </View>
            <Text style={[s.featuredTitle, { color: colors.foreground }]}>{featured.title}</Text>
            <View style={s.featuredMeta}>
              {featured.bpm > 0 && (
                <Text style={[s.metaChip, { color: colors.mutedForeground, borderColor: colors.border }]}>
                  {featured.bpm} BPM
                </Text>
              )}
              {featured.key && (
                <Text style={[s.metaChip, { color: colors.mutedForeground, borderColor: colors.border }]}>
                  {featured.key}
                </Text>
              )}
              <Text style={[s.metaChip, { color: colors.mutedForeground, borderColor: colors.border }]}>
                {featured.genre}
              </Text>
            </View>
            <Text style={[s.featuredDownloads, { color: colors.mutedForeground }]}>
              {featured.downloadCount.toLocaleString()} downloads · Tap to explore all beats
            </Text>
          </Pressable>
        </>
      )}

      {/* Pricing Row */}
      <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>SUBSCRIPTION TIERS</Text>
      <View style={s.tiersRow}>
        {TIERS.map((t) => (
          <View key={t.label} style={[s.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.tierPrice, { color: t.color }]}>{t.price}</Text>
            <Text style={[s.tierLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[s.footer, { color: colors.mutedForeground }]}>
        © 2026 GravelKing Productions · All N One LLC
      </Text>
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
    logoBox: {
      width: 48, height: 48,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
    },
    logoText: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 1 },
    brandName: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 3 },
    brandSub: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 4 },
    tagline: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 28, letterSpacing: 0.5 },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
    toolCard: {
      width: "48%", borderWidth: 1, padding: 14, gap: 8,
    },
    toolIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    toolLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    toolDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
    featuredCard: {
      borderWidth: 1, padding: 16, gap: 10, marginBottom: 28,
    },
    featuredBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: colors.primary, alignSelf: "flex-start",
      paddingHorizontal: 8, paddingVertical: 3,
    },
    featuredBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
    featuredTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    featuredMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    metaChip: {
      fontSize: 10, fontFamily: "Inter_500Medium",
      borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2,
    },
    featuredDownloads: { fontSize: 11, fontFamily: "Inter_400Regular" },
    tiersRow: { flexDirection: "row", gap: 8, marginBottom: 32 },
    tierCard: {
      flex: 1, borderWidth: 1, padding: 10, alignItems: "center", gap: 4,
    },
    tierPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
    tierLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center", letterSpacing: 0.5 },
    footer: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingBottom: 8 },
  });
