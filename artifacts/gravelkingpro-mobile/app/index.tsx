import { useRef, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import { WebView as NativeWebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WEB_APP_URL = "https://gravelkingpro.it.com";

// react-native-webview has no web implementation; it renders a red "unsupported"
// message that looks like a crash. Use an iframe for Expo web preview only.
function WebViewWebFallback({ uri, style, onLoad }: { uri: string; style: any; onLoad: () => void }) {
  // @ts-ignore - iframe is valid in the web bundle only
  return <iframe src={uri} style={[style, { border: "none" }]} onLoad={onLoad} allow="microphone; camera; fullscreen" />;
}

export default function App() {
  const webViewRef = useRef<NativeWebView>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
      {isWeb ? (
        <WebViewWebFallback
          uri={WEB_APP_URL}
          style={styles.webview}
          onLoad={() => setLoading(false)}
        />
      ) : (
        <NativeWebView
          ref={webViewRef}
          source={{ uri: WEB_APP_URL }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          scalesPageToFit={false}
          mixedContentMode="always"
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={() => true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  webview: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#09090b",
    zIndex: 10,
  },
});
