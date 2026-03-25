import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface T2BrandLogoProps {
  brandId?: string;
  brandName: string;
  domain: string | null;
  logoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}

function isPlaceholderLogo(url: string | null | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.includes("logo.clearbit.com") || lower.includes("google.com/s2/favicons") || lower.includes("favicon");
}

function buildProxyUrl(brandId: string | undefined, brandName: string, domain: string | null, logoUrl?: string | null) {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  if (brandName) params.set("brandName", brandName);
  if (domain) params.set("domain", domain);
  if (logoUrl && !isPlaceholderLogo(logoUrl)) params.set("logoUrl", logoUrl);
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ktrenz-brand-logo?${params.toString()}`;
}

export default function T2BrandLogo({
  brandId,
  brandName,
  domain,
  logoUrl,
  className,
  fallbackClassName,
  alt,
}: T2BrandLogoProps) {
  const sources = useMemo(() => {
    const items: string[] = [];
    if (logoUrl && !isPlaceholderLogo(logoUrl)) items.push(logoUrl);
    if (domain || brandId) items.push(buildProxyUrl(brandId, brandName, domain, logoUrl));
    return items;
  }, [brandId, brandName, domain, logoUrl]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [sources]);

  const currentSrc = sources[sourceIndex];

  if (!currentSrc || failed) {
    return <span className={cn("font-bold text-muted-foreground", fallbackClassName)}>{brandName.charAt(0)}</span>;
  }

  return (
    <img
      src={currentSrc}
      alt={alt ?? brandName}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex((prev) => prev + 1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
