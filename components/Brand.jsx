import Link from "next/link";
export default function Brand({ href = "/", inverse = false, compact = false }) {
  return <Link href={href} className={`brand-lockup ${inverse ? "brand-lockup--inverse" : ""} ${compact ? "brand-lockup--compact" : ""}`} aria-label="Plataforma de Privacidade — início">
    <span className="portfolio-wordmark">privacidade<span>plataforma demonstrativa</span></span>
  </Link>;
}
