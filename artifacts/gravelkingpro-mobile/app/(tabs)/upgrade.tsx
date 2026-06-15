import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
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

type Price = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: Price[];
};

type SubscriptionStatus = {
  isPro: boolean;
  plan: string | null;
};

type UsageStatus = {
  tier: string;
  remaining: {
    voice_remove: number;
    stem_split: number;
    master: number;
  };
};

function formatPrice(p: Price): string {
  if (!p.unit_amount) return "Free";
  const amount = (p.unit_amount / 100).toFixed(2);
  const interval = p.recurring?.interval ?? "once";
  return `$${amount}/${interval}`;
}

const PLAN_FEATURES: Record<string, string[]> = {
  "GravelKing Pro": [
    "Unlimited stem splits",
    "Unlimited voice removals",
    "Unlimited mastering",
    "PDF reports",
    "WAV downloads",
    "Priority support",
  ],
  "Node Auditor": [
    "All Pro features",
    "Enterprise benchmarking",
    "1T scale analysis",
    "Morris Law V2 access",
    "Dedicated kernel support",
  ],
};

const DEFAULT_FEATURES = ["Full processing access", "All audio tools", "Unlimited runs"];

export default function UpgradeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!API_BASE) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [prodRes, statusRes, usageRes] = await Promise.all([
        apiFetch("/api/stripe/products"),
        apiFetch("/api/subscription/status"),
        apiFetch("/api/usage/status"),
      ]);
      if (prodRes.ok) {
        const d = await prodRes.json();
        setProducts(d.data ?? []);
      }
      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatus(d);
      }
      if (usageRes.ok) {
        const d = await usageRes.json();
        setUsage(d);
      }
    } catch {
      setError("Could not connect to the server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheckout(priceId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCheckingOut(priceId);
    setError(null);
    try {
      const res = await apiFetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error ?? "Checkout failed");
      await WebBrowser.openBrowserAsync(d.url, {
        toolbarColor: "#09090b",
        controlsColor: "#ffb000",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckingOut(null);
    }
  }

  async function handlePortal() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    try {
      const res = await apiFetch("/api/stripe/portal", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error ?? "Could not open billing portal");
      await WebBrowser.openBrowserAsync(d.url, {
        toolbarColor: "#09090b",
        controlsColor: "#ffb000",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open billing portal");
    }
  }

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
      <Text style={[s.heading, { color: colors.foreground }]}>Upgrade</Text>
      <Text style={[s.sub, { color: colors.mutedForeground }]}>
        Unlock the full GravelKing stack
      </Text>

      {status && (
        <View
          style={[
            s.statusCard,
            {
              backgroundColor: colors.card,
              borderColor: status.isPro ? colors.primary : colors.border,
            },
          ]}
        >
          <View style={s.statusRow}>
            <Feather
              name={status.isPro ? "check-circle" : "user"}
              size={18}
              color={status.isPro ? colors.primary : colors.mutedForeground}
            />
            <View style={s.statusText}>
              <Text style={[s.statusTitle, { color: colors.foreground }]}>
                {status.isPro ? `Active: ${status.plan ?? "Pro"}` : "Free Tier"}
              </Text>
              {usage && !status.isPro && (
                <Text style={[s.statusSub, { color: colors.mutedForeground }]}>
                  {usage.remaining.stem_split < 0
                    ? "Unlimited"
                    : `${usage.remaining.stem_split} splits`}{" "}
                  ·{" "}
                  {usage.remaining.voice_remove < 0
                    ? "Unlimited"
                    : `${usage.remaining.voice_remove} removals`}{" "}
                  remaining
                </Text>
              )}
              {status.isPro && (
                <Text style={[s.statusSub, { color: colors.mutedForeground }]}>
                  Unlimited access to all tools
                </Text>
              )}
            </View>
          </View>
          {status.isPro && (
            <Pressable
              onPress={handlePortal}
              style={({ pressed }) => [
                s.portalBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
              <Text style={[s.portalBtnText, { color: colors.mutedForeground }]}>
                Manage Billing
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {error && (
        <View style={[s.errorBanner, { backgroundColor: `${colors.destructive}18`, borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={[s.errorBannerText, { color: colors.destructive }]}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Loading plans…</Text>
        </View>
      ) : !API_BASE ? (
        <View style={[s.infoBox, { borderColor: colors.border }]}>
          <Feather name="info" size={16} color={colors.mutedForeground} />
          <Text style={[s.infoText, { color: colors.mutedForeground }]}>
            API not configured. Set EXPO_PUBLIC_DOMAIN to connect.
          </Text>
        </View>
      ) : products.length === 0 ? (
        <View style={[s.emptyBox, { borderColor: colors.border }]}>
          <Feather name="package" size={24} color={colors.mutedForeground} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>No plans available</Text>
          <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
            Run seed-products on the server to create subscription plans.
          </Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => [
              s.retryBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[s.retryText, { color: colors.foreground }]}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>PLANS</Text>
          {products.map((product) => {
            const price = product.prices[0];
            const features = PLAN_FEATURES[product.name] ?? DEFAULT_FEATURES;
            const isEnterprise = product.name?.toLowerCase().includes("auditor");
            const accentColor = isEnterprise ? "#ff8800" : colors.primary;
            const alreadySubscribed = status?.isPro;

            return (
              <View
                key={product.id}
                style={[s.planCard, { backgroundColor: colors.card, borderColor: accentColor }]}
              >
                <View style={s.planHeader}>
                  <Text style={[s.planName, { color: colors.foreground }]}>{product.name}</Text>
                  {price && (
                    <Text style={[s.planPrice, { color: accentColor }]}>
                      {formatPrice(price)}
                    </Text>
                  )}
                </View>
                {product.description ? (
                  <Text style={[s.planDesc, { color: colors.mutedForeground }]}>
                    {product.description}
                  </Text>
                ) : null}
                <View style={s.featureList}>
                  {features.map((f) => (
                    <View key={f} style={s.featureRow}>
                      <Feather name="check" size={13} color={accentColor} />
                      <Text style={[s.featureText, { color: colors.mutedForeground }]}>{f}</Text>
                    </View>
                  ))}
                </View>
                {price && !alreadySubscribed && (
                  <Pressable
                    onPress={() => handleCheckout(price.id)}
                    disabled={checkingOut !== null}
                    style={({ pressed }) => [
                      s.subscribeBtn,
                      {
                        backgroundColor: accentColor,
                        opacity: pressed || checkingOut !== null ? 0.7 : 1,
                      },
                    ]}
                  >
                    {checkingOut === price.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Feather name="zap" size={15} color="#000" />
                    )}
                    <Text style={s.subscribeBtnText}>
                      {checkingOut === price.id ? "Opening checkout…" : "Subscribe"}
                    </Text>
                  </Pressable>
                )}
                {alreadySubscribed && (
                  <View style={[s.activeBadge, { borderColor: accentColor }]}>
                    <Feather name="check" size={13} color={accentColor} />
                    <Text style={[s.activeBadgeText, { color: accentColor }]}>Active Plan</Text>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <View style={[s.freeBox, { borderColor: colors.border }]}>
        <Text style={[s.freeTier, { color: colors.foreground }]}>Starter — Free</Text>
        <Text style={[s.freeDesc, { color: colors.mutedForeground }]}>
          1 stem split · 3 voice removals · 1 master download
        </Text>
      </View>

      <Text style={[s.footer, { color: colors.mutedForeground }]}>
        Subscriptions managed by Stripe · Cancel anytime
      </Text>
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    heading: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
    sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 24 },
    statusCard: { borderWidth: 1, padding: 16, gap: 12, marginBottom: 20 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    statusText: { flex: 1, gap: 2 },
    statusTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    statusSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
    portalBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    portalBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      padding: 12,
      marginBottom: 16,
    },
    errorBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
    loadingBox: { alignItems: "center", gap: 10, paddingVertical: 40 },
    loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
      padding: 14,
      marginBottom: 16,
    },
    infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    emptyBox: { borderWidth: 1, padding: 24, alignItems: "center", gap: 10, marginBottom: 16 },
    emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
    retryBtn: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
    retryText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginBottom: 12 },
    planCard: { borderWidth: 1, padding: 18, gap: 14, marginBottom: 16 },
    planHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8,
    },
    planName: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
    planPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
    planDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    featureList: { gap: 7 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    featureText: { fontSize: 12, fontFamily: "Inter_400Regular" },
    subscribeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      marginTop: 2,
    },
    subscribeBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
    activeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignSelf: "flex-start",
    },
    activeBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    freeBox: { borderWidth: 1, padding: 14, gap: 4, marginBottom: 16 },
    freeTier: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    freeDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
    footer: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", paddingTop: 4 },
  });
