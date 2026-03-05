import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/i18n/translations";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface LanguagePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LanguagePickerDrawer = ({ open, onOpenChange }: LanguagePickerDrawerProps) => {
  const { language, setLanguage } = useLanguage();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background border-border mx-auto md:max-w-md">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center text-base font-semibold">Language</DrawerTitle>
        </DrawerHeader>
        <div className="px-5 pb-6 space-y-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code); onOpenChange(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                language === lang.code
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-sm font-medium flex-1">{lang.label}</span>
              {language === lang.code && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default LanguagePickerDrawer;
