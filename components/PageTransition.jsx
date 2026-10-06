"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

function pageKind(pathname = "") {
  if (pathname === "/administracao" || pathname === "/minha-conta" || pathname.startsWith("/minha-conta/")) return "workspace";
  if (pathname.startsWith("/avaliacao-de-terceiros/relatorio/")) return "report";
  if (pathname === "/hub-educacional") return "learning";
  if (["/politica-de-privacidade", "/termos-de-uso"].includes(pathname)) return "reading";
  if (["/login", "/cadastro", "/confirmar-cadastro", "/recuperar-senha", "/redefinir-senha", "/contato"].includes(pathname) || pathname.startsWith("/newsletter/")) return "form";
  return "marketing";
}

export default function PageTransition({ children }) {
  const kind = pageKind(usePathname() || "");
  // A fronteira permanece montada: anima as trocas sem reiniciar formulários
  // durante atualizações da mesma página (como salvar uma resposta no painel).
  return <ViewTransition name="site-page" default="none" update={`motion-${kind}`}>
    <div className="page-motion" data-page-kind={kind}>{children}</div>
  </ViewTransition>;
}
