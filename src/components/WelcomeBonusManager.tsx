import { useAuth } from "@/hooks/useAuth";
import WelcomeBonusDrawer from "@/components/WelcomeBonusDrawer";

const WelcomeBonusManager = () => {
  const { showWelcomeBonus, setShowWelcomeBonus } = useAuth();
  return <WelcomeBonusDrawer open={showWelcomeBonus} onOpenChange={setShowWelcomeBonus} />;
};

export default WelcomeBonusManager;
