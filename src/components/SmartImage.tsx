import type { ImgHTMLAttributes, ReactNode } from "react";

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "loading"> {
  src?: string | null;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  fallback?: ReactNode;
  fallbackSrc?: string | null;
  fallbackClassName?: string;
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
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
        if (target.nextElementSibling) target.nextElementSibling.removeAttribute("hidden");
      }}
      {...imgProps}
    />
  );
}
