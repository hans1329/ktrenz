import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, X } from 'lucide-react';

interface V2ProfileOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const V2ProfileOverlay = ({ open, onOpenChange }: V2ProfileOverlayProps) => {
  const { user, profile, signOut } = useAuth();

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="absolute bottom-20 left-4 right-4 max-w-sm mx-auto bg-card border border-border rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onOpenChange(false)} className="absolute top-3 right-3 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-14 h-14">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {profile?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-bold text-foreground">{profile?.display_name || profile?.username || 'User'}</p>
            <p className="text-sm text-muted-foreground">@{profile?.username || 'user'}</p>
          </div>
        </div>
        <Button variant="outline" className="w-full rounded-full" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
};

export default V2ProfileOverlay;
