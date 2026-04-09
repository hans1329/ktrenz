import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

import V3ArtistDetail from "./pages/V3ArtistDetail";
import FesEngine from "./pages/FesEngine";
import FanAgent from "./pages/FanAgent";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import KPass from "./pages/KPass";
import Settings from "./pages/Settings";
import PitchDeck from "./pages/PitchDeck";
import Deck from "./pages/Deck";
import SignalRadar from "./pages/SignalRadar";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import UserDashboard from "./pages/UserDashboard";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminEntries from "./pages/admin/AdminEntries";
import AdminV3Artists from "./pages/admin/AdminV3Artists";
import AdminRankings from "./pages/admin/AdminRankings";
import AdminPoints from "./pages/admin/AdminPoints";
import AdminDataHealth from "./pages/admin/AdminDataHealth";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminIntents from "./pages/admin/AdminIntents";
import AgencyDashboardSample from "./pages/AgencyDashboardSample";
import AdminIntentMonitor from "./pages/admin/AdminIntentMonitor";
import AdminWatchedChannels from "./pages/admin/AdminWatchedChannels";
import AdminAgencySample from "./pages/admin/AdminAgencySample";
import AdminCollectionMonitor from "./pages/admin/AdminCollectionMonitor";
import AdminFesAnalyst from "./pages/admin/AdminFesAnalyst";
import AdminDataQuality from "./pages/admin/AdminDataQuality";
import AdminPipelineGuard from "./pages/admin/AdminPipelineGuard";
import AdminSignalEvents from "./pages/admin/AdminSignalEvents";
import AdminListingRequests from "./pages/admin/AdminListingRequests";
import AdminStars from "./pages/admin/AdminStars";
import AdminTrendIntel from "./pages/admin/AdminTrendIntel";
import AdminShoppingKeywords from "./pages/admin/AdminShoppingKeywords";
import AdminUserAnalytics from "./pages/admin/AdminUserAnalytics";
import AdminKeywordMonitor from "./pages/admin/AdminKeywordMonitor";
import T2TrendMap from "./pages/T2TrendMap";
import T2MyArtists from "./pages/T2MyArtists";
import T2KeywordDetail from "./pages/T2KeywordDetail";
import T2PitchDeck from "./pages/T2PitchDeck";
import T2ArtistPage from "./pages/T2ArtistPage";
import T2BrandPage from "./pages/T2BrandPage";
import T2TrendGrades from "./pages/T2TrendGrades";
import B2BLogin from "./pages/b2b/B2BLogin";
import B2BOnboarding from "./pages/b2b/B2BOnboarding";
import B2BLayout from "./pages/b2b/B2BLayout";
import B2BDashboard from "./pages/b2b/B2BDashboard";
import B2BArtistDetail from "./pages/b2b/B2BArtistDetail";
import B2BRadar from "./pages/b2b/B2BRadar";
import B2BArtists from "./pages/b2b/B2BArtists";
import B2BBrands from "./pages/b2b/B2BBrands";
import B2BCampaigns from "./pages/b2b/B2BCampaigns";
import B2BBenchmark from "./pages/b2b/B2BBenchmark";
import B2BMarkets from "./pages/b2b/B2BMarkets";
import B2BRecommendations from "./pages/b2b/B2BRecommendations";
import B2BActivation from "./pages/b2b/B2BActivation";
import T2CategoryDetail from "./pages/T2CategoryDetail";
import About from "./pages/About";
import KeywordInfluence from "./pages/KeywordInfluence";
import P2Keywords from "./pages/P2Keywords";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import WelcomeBonusManager from "./components/WelcomeBonusManager";

const queryClient = new QueryClient({});

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <PWAUpdatePrompt />
            <WelcomeBonusManager />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<T2TrendMap />} />
                <Route path="/artist/:slug" element={<V3ArtistDetail />} />
                <Route path="/fes-engine" element={<FesEngine />} />
                <Route path="/agent" element={<FanAgent />} />
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/k-pass" element={<KPass />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/dashboard" element={<UserDashboard />} />
                <Route path="/pitchdeck" element={<PitchDeck />} />
                <Route path="/deck" element={<Deck />} />
                <Route path="/signal" element={<SignalRadar />} />
                <Route path="/t2" element={<T2TrendMap />} />
                <Route path="/t2/my" element={<T2MyArtists />} />
                <Route path="/t2/artist/:starId" element={<T2ArtistPage />} />
                <Route path="/t2/category/:categoryKey" element={<T2CategoryDetail />} />
                <Route path="/t2/brand/:brandId" element={<T2BrandPage />} />
                <Route path="/t2/:triggerId" element={<T2KeywordDetail />} />
                <Route path="/pd" element={<T2PitchDeck />} />
                <Route path="/t2/grades" element={<T2TrendGrades />} />
                <Route path="/about" element={<About />} />
                <Route path="/ag" element={<KeywordInfluence />} />
                <Route path="/key" element={<P2Keywords />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="rankings" element={<AdminRankings />} />
                  <Route path="points" element={<AdminPoints />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="entries" element={<AdminEntries />} />
                  <Route path="v3-artists" element={<AdminV3Artists />} />
                  <Route path="data-health" element={<AdminDataHealth />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="intents" element={<AdminIntents />} />
                  <Route path="intent-monitor" element={<AdminIntentMonitor />} />
                  <Route path="watched-channels" element={<AdminWatchedChannels />} />
                  <Route path="agency-sample" element={<AdminAgencySample />} />
                  <Route path="collection-monitor" element={<AdminCollectionMonitor />} />
                  <Route path="fes-analyst" element={<AdminFesAnalyst />} />
                  <Route path="data-quality" element={<AdminDataQuality />} />
                  <Route path="pipeline-guard" element={<AdminPipelineGuard />} />
                  <Route path="signal-events" element={<AdminSignalEvents />} />
                  <Route path="listing-requests" element={<AdminListingRequests />} />
                  <Route path="stars" element={<AdminStars />} />
                  <Route path="trend-intel" element={<AdminTrendIntel />} />
                  <Route path="shopping-keywords" element={<AdminShoppingKeywords />} />
                  <Route path="user-analytics" element={<AdminUserAnalytics />} />
                  <Route path="keyword-monitor" element={<AdminKeywordMonitor />} />
                </Route>
                <Route path="/agency-dashboard" element={<AgencyDashboardSample />} />
                <Route path="/b2b/login" element={<B2BLogin />} />
                <Route path="/b2b/onboarding" element={<B2BOnboarding />} />
                <Route path="/b2b" element={<B2BLayout />}>
                  <Route index element={<B2BDashboard />} />
                  <Route path="radar" element={<B2BRadar />} />
                  <Route path="artists" element={<B2BArtists />} />
                  <Route path="brands" element={<B2BBrands />} />
                  <Route path="campaigns" element={<B2BCampaigns />} />
                  <Route path="benchmark" element={<B2BBenchmark />} />
                  <Route path="markets" element={<B2BMarkets />} />
                  <Route path="rec" element={<B2BRecommendations />} />
                  <Route path="studio" element={<B2BActivation />} />
                  <Route path="artist/:id" element={<B2BArtistDetail />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
