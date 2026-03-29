import type { ImgHTMLAttributes, ReactNode } from "react";

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> {
  src?: string | null;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  fallback?: ReactNode;
}

export default function SmartImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  fallback = null,
  ...imgProps
}: SmartImageProps) {
  if (!src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} loading={loading} {...imgProps} />;
}
