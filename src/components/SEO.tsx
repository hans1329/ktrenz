import { Helmet } from "react-helmet-async";

const SITE_URL = "https://ktrenz.lovable.app";
const DEFAULT_OG_IMAGE = "https://storage.googleapis.com/gpt-engineer-file-uploads/wXvsj6eZbYaEQQgUsiT21k2YrkX2/social-images/social-1771953747573-c463701b-6f1a-48d3-9752-5dcfb19201fe.webp";

interface SEOProps {
  title: string;
  titleKo?: string;
  description: string;
  descriptionKo?: string;
  path?: string;
  ogImage?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown>;
}

export default function SEO({
  title,
  titleKo,
  description,
  descriptionKo,
  path = "/",
  ogImage = DEFAULT_OG_IMAGE,
  type = "website",
  jsonLd,
}: SEOProps) {
  const url = `${SITE_URL}${path}`;

  // Detect language from window (set by LanguageContext)
  const lang = typeof window !== "undefined" ? (window as any).__ktrenz_lang || "ko" : "ko";
  const isKo = lang === "ko";

  const displayTitle = isKo && titleKo ? titleKo : title;
  const displayDesc = isKo && descriptionKo ? descriptionKo : description;

  const defaultJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "KTrenZ",
    url: SITE_URL,
    description: "Real-time K-Pop trend rankings powered by YouTube, X, and music data",
    inLanguage: ["en", "ko", "ja"],
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/artist/{search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Helmet>
      <html lang={lang} />
      <title>{displayTitle}</title>
      <meta name="description" content={displayDesc} />
      <link rel="canonical" href={url} />

      {/* Hreflang */}
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="ko" href={url} />
      <link rel="alternate" hrefLang="ja" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={titleKo || title} />
      <meta property="og:description" content={descriptionKo || description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="KTrenZ" />
      <meta property="og:locale" content="ko_KR" />
      <meta property="og:locale:alternate" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd ?? defaultJsonLd)}
      </script>
    </Helmet>
  );
}