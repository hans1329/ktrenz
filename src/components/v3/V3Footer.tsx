import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const V3Footer = () => {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="pb-6 pt-8 px-4">
      <div className="max-w-md mx-auto border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <a href="/report" className="hover:text-foreground transition-colors">
            {t("footer.report")}
          </a>
          <Link to="/about" className="hover:text-foreground transition-colors">
            {t("footer.about")}
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            {t("footer.terms")}
          </Link>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-3">
          © {year} KTrenZ
        </p>
      </div>
    </footer>
  );
};

export default V3Footer;
