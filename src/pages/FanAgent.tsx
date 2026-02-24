import V3FanAgent from "@/components/v3/V3FanAgent";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2 } from "lucide-react";
import SEO from "@/components/SEO";

const FanAgent = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">Sign In Required</h2>
          <p className="text-sm text-muted-foreground">Please sign in to use Fan Agent.</p>
        </div>
        <Button
          onClick={() => navigate("/login")}
          className="h-12 px-8 rounded-full gap-2 font-medium"
        >
          <LogIn className="w-5 h-5" />
          Sign In
        </Button>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <SEO title="Fan Agent – KTrenZ AI K-Pop Assistant" description="Ask KTrenZ Fan Agent anything about K-Pop trends, artist stats, streaming strategies, and real-time rankings." path="/agent" />
      <V3FanAgent onBack={() => navigate(-1)} />
    </div>
  );
};

export default FanAgent;
