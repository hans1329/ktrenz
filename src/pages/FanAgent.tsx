import V3FanAgent from "@/components/v3/V3FanAgent";
import { useNavigate } from "react-router-dom";

const FanAgent = () => {
  const navigate = useNavigate();

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <V3FanAgent onBack={() => navigate(-1)} />
    </div>
  );
};

export default FanAgent;
