import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { apiFetch, API_BASE } from "@/lib/api";

type RoutingInfo = {
  mode: string;
  remoteUrl: string | null;
  remoteStatus: "online" | "offline" | "not_configured";
  localKernel: string;
  authConfigured: boolean;
};

type UsageStatus = {
  tier: string;
  remaining: {
    voice_remove: number;
    stem_split: number;
    master: number;
  };
};

type TelemetryEvent = {
  routing: string;
  parity: string;
  efficiency: string;
  decayRate: string;
  sampleCount: string;
  timestamp: string;
  stack?: string;
};

function MetricBox({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  const colors = useColors();
  return (
    <View style={[mStyles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[mStyles.value, { color: accent ?? colors.primary }]}>{value}</Text>
      {unit ? (
        <Text style={[mStyles.unit, { color: colors.mutedForeground }]}>{unit}</Text>
      ) : null}
      <Text style={[mStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const mStyles = StyleSheet.create({
  box: { flex: 1, borderWidth: 1, padding: 12, alignItems: "center", gap: 2 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  unit: { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.5 },
  label: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textAlign: "center" },
});

export default function TelemetryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [routing, setRouting] = useState<RoutingInfo | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    if (!API_BASE) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [routingRes, usageRes] = await Promise.all([
        apiFetch("/api/kernel/routing"),
        apiFetch("/api/usage/status"),
      ]);
      if (routingRes.ok) setRouting(await routingRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch {
      setError("Could not reach the kernel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!API_BASE) return;
    const sseUrl = `${API_BASE}/api/kernel/telemetry`;
    try {
      const es = new EventSource(sseUrl);
      esRef.current = es;
      es.onopen = () => setSseConnected(true);
      es.onerror = () => setSseConnected(false);
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as TelemetryEvent;
          setEvents((prev) => [ev, ...prev].slice(0, 12));
        } catch {}
      };
    } catch {
      // EventSource unavailable in this env — polling-only mode
    }
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const tierColor = (tier: string) => {
    if (tier === "free") return colors.mutedForeground;
    if (tier === "node_auditor") return "#ff8800";
    return colors.primary;
  };

  const remoteStatusColor = (status: RoutingInfo["remoteStatus"]) => {
    if (status === "online") return "#10b981";
    if (status === "offline") return colors.destructive;
    return colors.mutedForeground;
  };

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
      <View style={s.headerRow}>
        <View>
          <Text style={[s.heading, { color: colors.foreground }]}>Telemetry</Text>
          <Text style={[s.sub, { color: colors.mutedForeground }]}>
            GNS · MLK v3 · Morris Law Kernel
          </Text>
        </View>
        <Pressable
          onPress={load}
          style={({ pressed }) => [s.refreshBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {!API_BASE ? (
        <View style={[s.infoBox, { borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[s.infoText, { color: colors.mutedForeground }]}>
            API not configured. Set EXPO_PUBLIC_DOMAIN to connect to the GravelKing server.
          </Text>
        </View>
      ) : loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.loadingText, { color: colors.mutedForeground }]}>
            Connecting to kernel…
          </Text>
        </View>
      ) : error ? (
        <View style={[s.errorBox, { borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={24} color={colors.destructive} />
          <Text style={[s.errorTitle, { color: colors.foreground }]}>Kernel offline</Text>
          <Text style={[s.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => [
              s.retryBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[s.retryText, { color: colors.foreground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {routing && (
            <>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
                KERNEL ROUTING
              </Text>
              <View
                style={[
                  s.routingCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={s.routingRow}>
                  <View style={[s.statusDot, { backgroundColor: "#10b981" }]} />
                  <Text style={[s.routingName, { color: colors.foreground }]}>Local Kernel</Text>
                  <Text style={[s.routingVal, { color: "#10b981" }]}>
                    {routing.localKernel.toUpperCase()}
                  </Text>
                </View>

                <View style={[s.divider, { backgroundColor: colors.border }]} />

                <View style={s.routingRow}>
                  <View
                    style={[
                      s.statusDot,
                      { backgroundColor: remoteStatusColor(routing.remoteStatus) },
                    ]}
                  />
                  <Text style={[s.routingName, { color: colors.foreground }]}>Remote GNS</Text>
                  <Text
                    style={[
                      s.routingVal,
                      { color: remoteStatusColor(routing.remoteStatus) },
                    ]}
                  >
                    {routing.remoteStatus.replace(/_/g, " ").toUpperCase()}
                  </Text>
                </View>

                <View style={[s.divider, { backgroundColor: colors.border }]} />

                <Text style={[s.routingMeta, { color: colors.mutedForeground }]}>
                  Mode: {routing.mode.replace(/_/g, " ")} · Auth:{" "}
                  {routing.authConfigured ? "configured" : "none"}
                </Text>
              </View>
            </>
          )}

          {usage && (
            <>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>USAGE</Text>
              <View style={[s.tierRow, { backgroundColor: colors.secondary }]}>
                <Text style={[s.tierLabel, { color: tierColor(usage.tier) }]}>
                  {usage.tier.replace(/_/g, " ").toUpperCase()} PLAN
                </Text>
              </View>

              {usage.tier === "free" ? (
                <View style={s.metricsRow}>
                  <MetricBox
                    label="SPLITS"
                    value={
                      usage.remaining.stem_split < 0
                        ? "∞"
                        : String(usage.remaining.stem_split)
                    }
                    unit="left"
                    accent={colors.primary}
                  />
                  <MetricBox
                    label="REMOVALS"
                    value={
                      usage.remaining.voice_remove < 0
                        ? "∞"
                        : String(usage.remaining.voice_remove)
                    }
                    unit="left"
                    accent="#a855f7"
                  />
                  <MetricBox
                    label="MASTERS"
                    value={
                      usage.remaining.master < 0 ? "∞" : String(usage.remaining.master)
                    }
                    unit="left"
                    accent="#38bdf8"
                  />
                </View>
              ) : (
                <View
                  style={[
                    s.unlimitedCard,
                    { backgroundColor: colors.card, borderColor: colors.primary },
                  ]}
                >
                  <Feather name="zap" size={16} color={colors.primary} />
                  <Text style={[s.unlimitedText, { color: colors.primary }]}>
                    Unlimited access — all tools
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={s.liveRow}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
              LIVE EVENTS
            </Text>
            <View style={s.ssePill}>
              <View
                style={[
                  s.sseDot,
                  {
                    backgroundColor: sseConnected ? "#10b981" : colors.mutedForeground,
                  },
                ]}
              />
              <Text style={[s.sseLabel, { color: colors.mutedForeground }]}>
                {sseConnected ? "streaming" : "idle"}
              </Text>
            </View>
          </View>

          <View style={s.liveSection}>
            {events.length === 0 ? (
              <View
                style={[
                  s.noEvents,
                  { borderColor: colors.border },
                ]}
              >
                <Feather name="activity" size={28} color={colors.mutedForeground} />
                <Text style={[s.noEventsText, { color: colors.mutedForeground }]}>
                  Process audio in the Studio tab to see live kernel events here
                </Text>
              </View>
            ) : (
              events.map((ev, i) => (
                <View
                  key={i}
                  style={[
                    s.eventCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={s.eventTop}>
                    <View
                      style={[
                        s.eventDot,
                        {
                          backgroundColor:
                            ev.routing === "remote" ? "#38bdf8" : "#10b981",
                        },
                      ]}
                    />
                    <Text style={[s.eventRouting, { color: colors.foreground }]}>
                      {ev.routing}
                    </Text>
                    <Text style={[s.eventTime, { color: colors.mutedForeground }]}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <View style={s.eventMetrics}>
                    <Text style={[s.eventMetric, { color: colors.mutedForeground }]}>
                      parity {ev.parity}
                    </Text>
                    <Text style={[s.eventMetric, { color: colors.mutedForeground }]}>
                      eff {ev.efficiency}
                    </Text>
                    <Text style={[s.eventMetric, { color: colors.mutedForeground }]}>
                      decay {ev.decayRate}
                    </Text>
                    <Text style={[s.eventMetric, { color: colors.mutedForeground }]}>
                      {parseInt(ev.sampleCount).toLocaleString()} samp
                    </Text>
                  </View>
                  {ev.stack && (
                    <Text style={[s.eventStack, { color: colors.mutedForeground }]}>
                      {ev.stack}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      letterSpacing: 1,
      marginTop: 2,
      marginBottom: 24,
    },
    refreshBtn: { padding: 8 },
    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
      padding: 14,
      marginBottom: 16,
    },
    infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    loadingBox: { alignItems: "center", gap: 12, paddingVertical: 48 },
    loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
    errorBox: {
      borderWidth: 1,
      padding: 28,
      alignItems: "center",
      gap: 10,
      marginBottom: 24,
    },
    errorTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    errorSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
    retryBtn: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
    retryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
    sectionLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 2,
      marginBottom: 10,
    },
    routingCard: { borderWidth: 1, padding: 14, gap: 10, marginBottom: 28 },
    routingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    routingName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
    routingVal: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
    divider: { height: 1 },
    routingMeta: { fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
    tierRow: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 14,
    },
    tierLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
    metricsRow: { flexDirection: "row", gap: 8, marginBottom: 28 },
    unlimitedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      padding: 14,
      marginBottom: 28,
    },
    unlimitedText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    liveRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    ssePill: { flexDirection: "row", alignItems: "center", gap: 5 },
    sseDot: { width: 6, height: 6, borderRadius: 3 },
    sseLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
    liveSection: { marginBottom: 28 },
    noEvents: {
      borderWidth: 1,
      borderStyle: "dashed",
      padding: 28,
      alignItems: "center",
      gap: 12,
    },
    noEventsText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 18,
    },
    eventCard: { borderWidth: 1, padding: 12, gap: 6, marginBottom: 8 },
    eventTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    eventDot: { width: 6, height: 6, borderRadius: 3 },
    eventRouting: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    eventTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
    eventMetrics: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    eventMetric: { fontSize: 10, fontFamily: "Inter_400Regular" },
    eventStack: { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  });
