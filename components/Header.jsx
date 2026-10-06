"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/Brand";
import { navigation } from "@/lib/site";

export default function Header({ variant = "light", signedIn = false }) {
  const [phpSignedIn, setPhpSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const inverse = variant === "dark";
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_HOSTGATOR !== "true") return;
    const controller = new AbortController();
    fetch("/api/auth/sessao", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null).then(data => setPhpSignedIn(Boolean(data?.user))).catch(() => {});
    return () => controller.abort();
  }, [pathname]);
  signedIn = process.env.NEXT_PUBLIC_HOSTGATOR === "true" ? phpSignedIn : signedIn;

  const closeMenu = () => setOpen(false);

  return (
    <header className={`site-header site-header--${variant}`}>
      <div className="site-header__inner shell">
        <Brand inverse={inverse} />

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="main-navigation"
          className={`main-nav ${open ? "main-nav--open" : ""}`}
          aria-label="Navegação principal"
        >
          {navigation.map(({ href, label }) => <Link key={href} href={href} onClick={closeMenu} aria-current={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "page" : undefined}>{label}</Link>)}
          <Link className="mobile-login" href={signedIn ? "/minha-conta" : "/login"} onClick={closeMenu}>{signedIn ? "Minha conta ↗" : "Entrar na minha conta ↗"}</Link>
          <Link className="mobile-cta" href="/contato?interesse=demonstracao" onClick={closeMenu}>Agendar demonstração ↗</Link>
        </nav>

        <div className="header-actions">
          <Link className="client-area" href={signedIn ? "/minha-conta" : "/login"}>{signedIn ? "Minha conta" : "Entrar"}</Link>
          <Link className="header-cta" href="/contato?interesse=demonstracao">Vamos conversar ↗</Link>
        </div>
      </div>
    </header>
  );
}
