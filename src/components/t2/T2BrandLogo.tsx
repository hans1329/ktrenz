import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface T2BrandLogoProps {
  brandName: string;
  domain: string | null;
  logoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}

function normalizeDomain(domain: string | null): string | null {
  if (!domain) return null;
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase() || null;
}

function buildLogoCandidates(domain: string | null, logoUrl?: string | null): string[] {
  const normalizedDomain = normalizeDomain(domain);
  const candidates: string[] = [];

  if (logoUrl && !logoUrl.includes("logo.clearbit.com")) {
    candidates.push(logoUrl);
  }

  if (normalizedDomain) {
    candidates.push(`https://api.companyenrich.com/logo/${normalizedDomain}`);
    candidates.push(`https://cdn.tickerlogos.com/${normalizedDomain}`);
  }

  if (logoUrl) {
    candidates.push(logoUrl);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

export default function T2BrandLogo({
  brandName,
  domain,
  logoUrl,
  className,
  fallbackClassName,
  alt,
}: T2BrandLogoProps) {
  const sources = useMemo(() => buildLogoCandidates(domain, logoUrl), [domain, logoUrl]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const currentSrc = sources[sourceIndex] ?? null;

  if (!currentSrc) {
    return (
      <span className={cn("font-bold text-muted-foreground", fallbackClassName)}>
        {brandName.charAt(0)}
      </span>
    );
  }

  return (
    <>
      <img
        src={currentSrc}
        alt={alt ?? brandName}
        className={className}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSourceIndex((prev) => prev + 1)}
      />
      {sourceIndex >= sources.length - 1 && (
        <span className={cn("hidden font-bold text-muted-foreground", fallbackClassName)}>
          {brandName.charAt(0)}
        </span>
      )}
    </>
  );
}
