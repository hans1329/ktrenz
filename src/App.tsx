import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import V3Home from "./pages/V3Home";
import V3ArtistDetail from "./pages/V3ArtistDetail";
import FesEngine from "./pages/FesEngine";
import FanAgent from "./pages/FanAgent";
import Login from "./pages/Login";
import KPass from "./pages/KPass";
import PitchDeck from "./pages/PitchDeck";
import NotFound from "./pages/NotFound";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { LanguageProvider } from "./contexts/LanguageContext";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAUpdatePrompt />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<V3Home />} />
            <Route path="/artist/:slug" element={<V3ArtistDetail />} />
            <Route path="/fes-engine" element={<FesEngine />} />
            <Route path="/agent" element={<FanAgent />} />
            <Route path="/login" element={<Login />} />
            <Route path="/k-pass" element={<KPass />} />
            <Route path="/pitchdeck" element={<PitchDeck />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
