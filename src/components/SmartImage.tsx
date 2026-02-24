interface SmartImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export default function SmartImage({ src, alt = '', className, loading = 'lazy' }: SmartImageProps) {
  if (!src) return null;
  return <img src={src} alt={alt} className={className} loading={loading} />;
}
