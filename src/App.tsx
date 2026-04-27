import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Skeleton } from "@/components/ui/skeleton";

import Battle from "./pages/Battle";

const V3ArtistDetail = lazy(() => import("./pages/V3ArtistDetail"));
const FesEngine = lazy(() => import("./pages/FesEngine"));
const FanAgent = lazy(() => import("./pages/FanAgent"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const KPass = lazy(() => import("./pages/KPass"));
const Settings = lazy(() => import("./pages/Settings"));
const PitchDeck = lazy(() => import("./pages/PitchDeck"));
const PitchDeck3 = lazy(() => import("./pages/PitchDeck3"));
const Deck = lazy(() => import("./pages/Deck"));
const SignalRadar = lazy(() => import("./pages/SignalRadar"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotFound = lazy(() => import("./pages/NotFound"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const TrendDiscovery = lazy(() => import("./pages/TrendDiscovery"));
const About = lazy(() => import("./pages/About"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const KeywordInfluence = lazy(() => import("./pages/KeywordInfluence"));
const ContentSearch = lazy(() => import("./pages/ContentSearch"));
const SpotifyRedeem = lazy(() => import("./pages/SpotifyRedeem"));
const AgencyDashboardSample = lazy(() => import("./pages/AgencyDashboardSample"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminEntries = lazy(() => import("./pages/admin/AdminEntries"));
const AdminV3Artists = lazy(() => import("./pages/admin/AdminV3Artists"));
const AdminRankings = lazy(() => import("./pages/admin/AdminRankings"));
const AdminPoints = lazy(() => import("./pages/admin/AdminPoints"));
const AdminDataHealth = lazy(() => import("./pages/admin/AdminDataHealth"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminIntents = lazy(() => import("./pages/admin/AdminIntents"));
const AdminIntentMonitor = lazy(() => import("./pages/admin/AdminIntentMonitor"));
const AdminWatchedChannels = lazy(() => import("./pages/admin/AdminWatchedChannels"));
const AdminAgencySample = lazy(() => import("./pages/admin/AdminAgencySample"));
const AdminCollectionMonitor = lazy(() => import("./pages/admin/AdminCollectionMonitor"));
const AdminFesAnalyst = lazy(() => import("./pages/admin/AdminFesAnalyst"));
const AdminDataQuality = lazy(() => import("./pages/admin/AdminDataQuality"));
const AdminPipelineGuard = lazy(() => import("./pages/admin/AdminPipelineGuard"));
const AdminSignalEvents = lazy(() => import("./pages/admin/AdminSignalEvents"));
const AdminListingRequests = lazy(() => import("./pages/admin/AdminListingRequests"));
const AdminStars = lazy(() => import("./pages/admin/AdminStars"));
const AdminTrendIntel = lazy(() => import("./pages/admin/AdminTrendIntel"));
const AdminShoppingKeywords = lazy(() => import("./pages/admin/AdminShoppingKeywords"));
const AdminUserAnalytics = lazy(() => import("./pages/admin/AdminUserAnalytics"));
const AdminKeywordMonitor = lazy(() => import("./pages/admin/AdminKeywordMonitor"));
const AdminAutoReport = lazy(() => import("./pages/admin/AdminAutoReport"));

const B2BLogin = lazy(() => import("./pages/b2b/B2BLogin"));
const B2BOnboarding = lazy(() => import("./pages/b2b/B2BOnboarding"));
const B2BLayout = lazy(() => import("./pages/b2b/B2BLayout"));
const B2BDashboard = lazy(() => import("./pages/b2b/B2BDashboard"));
const B2BArtistDetail = lazy(() => import("./pages/b2b/B2BArtistDetail"));
const B2BRadar = lazy(() => import("./pages/b2b/B2BRadar"));
const B2BArtists = lazy(() => import("./pages/b2b/B2BArtists"));
const B2BBrands = lazy(() => import("./pages/b2b/B2BBrands"));
const B2BCampaigns = lazy(() => import("./pages/b2b/B2BCampaigns"));
const B2BBenchmark = lazy(() => import("./pages/b2b/B2BBenchmark"));
const B2BMarkets = lazy(() => import("./pages/b2b/B2BMarkets"));
const B2BRecommendations = lazy(() => import("./pages/b2b/B2BRecommendations"));
const B2BActivation = lazy(() => import("./pages/b2b/B2BActivation"));

import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import WelcomeBonusManager from "./components/WelcomeBonusManager";

const queryClient = new QueryClient({});

const RouteFallback = () => (
  <div className="min-h-screen bg-background p-4 space-y-4">
    <Skeleton className="h-14 w-full" />
    <div className="max-w-4xl mx-auto space-y-3 pt-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WelcomeBonusManager />
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <PWAUpdatePrompt />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Battle />} />
                  <Route path="/discover" element={<TrendDiscovery />} />
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
                  <Route path="/pd" element={<PitchDeck />} />
                  <Route path="/pd3" element={<PitchDeck3 />} />
                  <Route path="/deck" element={<Deck />} />
                  <Route path="/signal" element={<SignalRadar />} />

                  <Route path="/about" element={<About />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/ag" element={<KeywordInfluence />} />
                  <Route path="/key" element={<ContentSearch />} />
                  <Route path="/redeem/spotify" element={<SpotifyRedeem />} />
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
                    <Route path="auto-report" element={<AdminAutoReport />} />
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
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
