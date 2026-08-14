import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/context";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Pricing from "@/pages/pricing";
import Report from "@/pages/report";
import Studio from "@/pages/mix-studio";
import Mastering from "@/pages/mastering";
import KernelDashboard from "@/pages/kernel";
import Contact from "@/pages/contact";
import DownloadPage from "@/pages/download";
import Account from "@/pages/account";
import AdminAnalytics from "@/pages/admin-analytics";
import AdminWaitlist from "@/pages/admin-waitlist";
import AdminTracks from "@/pages/admin-tracks";
import Optimizer from "@/pages/optimizer";
import LabelPage from "@/pages/label";
import LabelArtistPage from "@/pages/label-artist";
import LibraryPage from "@/pages/library";
import SubmitTrackPage from "@/pages/submit-track";
import ConvertPage from "@/pages/convert";
import SongwritingStudio from "@/pages/songwriting";
import ProtectedLyrics from "@/pages/protected-lyrics";
import VocalBooth from "@/pages/vocal-booth";
import AdminLabel from "@/pages/admin-label";
import AdminOps from "@/pages/admin-ops";
import AdminOrders from "@/pages/admin-orders";
import AdminEmails from "@/pages/admin-emails";
import AdminIntegrationDemo from "@/pages/admin-integration-demo";
import PitchPage from "@/pages/pitch";
import VerifyPage from "@/pages/verify";
import WhitepaperPage from "@/pages/whitepaper";
import PrivacyPolicy from "@/pages/privacy";
import DataDeletionPage from "@/pages/data-deletion";
import WeekendSpecial from "@/pages/weekend-special";
import { PageTracker } from "@/lib/useAnalytics";
import { RouteSeo } from "@/lib/seo";
import DemoLogin from "@/pages/demo-login";
import HelpPage from "@/pages/help";
import AdminPublishChecklist from "@/pages/admin-publish-checklist";
import PromotersPage from "@/pages/promoters";
import AdminPromoters from "@/pages/admin-promoters";
import AdminDecks from "@/pages/admin-decks";

/**
 * Referral link capture: if the URL carries ?ref=CODE, report it to the server
 * once so it can set the httpOnly attribution cookie (survives the Stripe
 * checkout redirect). Best-effort; never blocks rendering.
 */
function RefCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) return;
    void fetch("/api/referral/click", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, []);
  return null;
}

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#f59e0b",
    colorForeground: "#fafafa",
    colorMutedForeground: "#a1a1aa",
    colorDanger: "#fb7185",
    colorBackground: "#18181b",
    colorInput: "#27272a",
    colorInputForeground: "#fafafa",
    colorNeutral: "#3f3f46",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-zinc-900 rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-zinc-50",
    headerSubtitle: "text-zinc-400",
    socialButtonsBlockButtonText: "text-zinc-100",
    formFieldLabel: "text-zinc-300",
    footerActionLink: "text-amber-400 hover:text-amber-300",
    footerActionText: "text-zinc-400",
    dividerText: "text-zinc-400",
    identityPreviewEditButton: "text-amber-400",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-rose-300",
    logoBox: "rounded-xl overflow-hidden",
    logoImage: "rounded-xl",
    socialButtonsBlockButton: "border-zinc-700 bg-zinc-800 hover:bg-zinc-700",
    formButtonPrimary: "bg-amber-500 text-zinc-950 hover:bg-amber-400",
    formFieldInput: "bg-zinc-800 border-zinc-700 text-zinc-50",
    footerAction: "text-zinc-400",
    dividerLine: "bg-zinc-700",
    alert: "bg-rose-950/40 border-rose-800",
    otpCodeFieldInput: "bg-zinc-800 border-zinc-700 text-zinc-50",
    formFieldRow: "text-zinc-300",
    main: "bg-transparent",
  },
};

function SignInPage() {
  // After sign-in, send the user to the pricing page with Studio pre-selected
  // so they land on the offer rather than the homepage. The pricing page's
  // auto-resume logic picks up ?plan=monthly and opens Stripe checkout
  // automatically — plan-specific redirects set by handleCheckout take priority.
  const afterUrl = `${basePath}/pricing?plan=monthly`;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={afterUrl} signUpFallbackRedirectUrl={afterUrl} />
    </div>
  );
}

function SignUpPage() {
  // Same intent: new users land on the pricing page, not the homepage.
  const afterUrl = `${basePath}/pricing?plan=monthly`;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={afterUrl} signInFallbackRedirectUrl={afterUrl} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/studio" component={Studio} />
      <Route path="/mix" component={Studio} />
      <Route path="/mastering" component={Mastering} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/report" component={Report} />
      <Route path="/kernel" component={KernelDashboard} />
      <Route path="/contact" component={Contact} />
      <Route path="/download" component={DownloadPage} />
      <Route path="/account" component={Account} />
      <Route path="/admin" component={AdminAnalytics} />
      <Route path="/admin/waitlist" component={AdminWaitlist} />
      <Route path="/admin/tracks" component={AdminTracks} />
      <Route path="/admin/label" component={AdminLabel} />
      <Route path="/admin/ops" component={AdminOps} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/emails" component={AdminEmails} />
      <Route path="/admin/integration-demo" component={AdminIntegrationDemo} />
      <Route path="/optimizer" component={Optimizer} />
      <Route path="/label" component={LabelPage} />
      <Route path="/label/:artist" component={LabelArtistPage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/submit" component={SubmitTrackPage} />
      <Route path="/convert" component={ConvertPage} />
      <Route path="/songwriting" component={SongwritingStudio} />
      <Route path="/protected-lyrics" component={ProtectedLyrics} />
      <Route path="/vocal-booth" component={VocalBooth} />
      <Route path="/pitch" component={PitchPage} />
      <Route path="/verify" component={VerifyPage} />
      <Route path="/whitepaper" component={WhitepaperPage} />
      <Route path="/privacy" component={PrivacyPolicy} />
      {/* Public by design: users and store reviewers must not need an account to request deletion. */}
      <Route path="/data-deletion" component={DataDeletionPage} />
      <Route path="/weekend-special" component={WeekendSpecial} />
      <Route path="/demo" component={VerifyPage} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/login" component={SignInPage} />
      <Route path="/demo-login" component={DemoLogin} />
      <Route path="/help/:slug" component={HelpPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/admin/publish-checklist" component={AdminPublishChecklist} />
      <Route path="/promoters" component={PromotersPage} />
      <Route path="/admin/promoters" component={AdminPromoters} />
      <Route path="/admin/decks" component={AdminDecks} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to GravelKing Pro" } },
        signUp: { start: { title: "Create your account", subtitle: "Start building with GravelKing Pro" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppProvider>
            <RouteSeo />
            <PageTracker />
            <RefCapture />
            <Router />
            <Toaster />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
