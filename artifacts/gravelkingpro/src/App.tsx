import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
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
import PitchPage from "@/pages/pitch";
import VerifyPage from "@/pages/verify";
import WhitepaperPage from "@/pages/whitepaper";
import { PageTracker } from "@/lib/useAnalytics";
import { RouteSeo } from "@/lib/seo";

const queryClient = new QueryClient();

function SignInRedirect() {
  useEffect(() => {
    window.location.href = "/api/login";
  }, []);
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
      <Route path="/demo" component={VerifyPage} />
      <Route path="/sign-in" component={SignInRedirect} />
      <Route path="/login" component={SignInRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <RouteSeo />
            <PageTracker />
            <Router />
          </WouterRouter>
          <Toaster />
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
