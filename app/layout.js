import "./globals.css";
import "./auth.css";
import "./admin.css";
import "./account.css";
import "./motion.css";
import PageTransition from "@/components/PageTransition";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionUser } from "@/lib/server/auth";

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://127.0.0.1:3000"),
  title: {
    default: "Plataforma de Privacidade — Governança, Privacidade e Segurança",
    template: "%s | Plataforma de Privacidade",
  },
  description:
    "Soluções em governança de dados, privacidade, segurança da informação e capacitação contínua.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "Nosso primeiro projeto — Plataforma de Privacidade",
    description: "Versão anonimizada para portfólio: design, código e experiência com Next.js, React e SQLite.",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/portfolio-cover.png", width: 1200, height: 630, alt: "Ideias que ganham forma — primeiro projeto conquistado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nosso primeiro projeto — Plataforma de Privacidade",
    images: ["/portfolio-cover.png"],
  },
  robots: {
    index: process.env.ALLOW_INDEXING === "true",
    follow: process.env.ALLOW_INDEXING === "true",
  },
};

export default async function RootLayout({ children }) {
  const signedIn = Boolean(sessionUser((await cookies()).get(SESSION_COOKIE)?.value));
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body><div className="portfolio-banner"><div className="shell"><span>PORTFÓLIO / PRIMEIRO PROJETO</span><p>Versão demonstrativa anonimizada. Use apenas dados fictícios nos formulários.</p></div></div><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Header signedIn={signedIn} /><PageTransition>{children}</PageTransition><Footer /></body>
    </html>
  );
}
