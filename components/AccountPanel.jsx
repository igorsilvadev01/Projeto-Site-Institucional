"use client";

import { useState } from "react";
import Link from "next/link";
import { accountHref, visibleAccountSections } from "@/lib/account-navigation";

export default function AccountPanel({ user, section = "visao-geral", unreadCount = 0, children }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sections = visibleAccountSections(user.role), current = sections.find(item => item.id === section);
  async function logout(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sair", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok && response.status !== 401) throw new Error("Não foi possível sair da conta. Tente novamente.");
      window.location.assign("/login");
    } catch (failure) { setError(failure.message || "Falha de conexão. Tente novamente."); setBusy(false); }
  }
  const roleLabel = user.role === "admin" ? "Administrador" : user.role === "cliente" ? "Cliente Plataforma de Privacidade" : "Usuário cadastrado";
  return <main id="conteudo" className="auth-page account-workspace-page"><div className="shell account-workspace">
    <aside className="account-sidebar"><div className="account-sidebar-brand"><span aria-hidden="true">P</span><div><strong>Minha conta</strong><small>Plataforma de Privacidade</small></div></div>
      <button className="account-menu-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="account-navigation" aria-label={open ? "Fechar navegação da conta" : "Abrir navegação da conta"}><span>{current.title}</span><span aria-hidden="true">{open ? "−" : "+"}</span></button>
      <nav id="account-navigation" className={open ? "account-nav account-nav-open" : "account-nav"} aria-label="Área da conta">
        {sections.map(item => <Link key={item.id} href={accountHref(item.id)} onClick={() => setOpen(false)} aria-current={section === item.id ? "page" : undefined}><span className="account-nav-icon" aria-hidden="true">{item.icon}</span>{item.title}{item.id === "atendimento" && unreadCount > 0 && <b aria-label={`${unreadCount} ${unreadCount === 1 ? "resposta não lida" : "respostas não lidas"}`}>{unreadCount}</b>}</Link>)}
        {user.role === "admin" && <Link href="/administracao" onClick={() => setOpen(false)}><span className="account-nav-icon" aria-hidden="true">↗</span>Administração</Link>}
      </nav>
      <div className="account-sidebar-person"><span className="portal-badge">{roleLabel}</span><strong>{user.name}</strong><small>{user.email}</small></div>
    </aside>
    <div className="account-content"><header className={`account-heading ${user.role === "admin" ? "admin-account-heading" : ""}`}><div><p className="eyebrow">{user.role === "admin" ? "PAINEL DO ADMINISTRADOR" : "MINHA CONTA"}</p><h1>{section === "visao-geral" ? `Olá, ${user.name}.` : current.title}</h1><p>{current.description}</p></div><form onSubmit={logout}><button className="auth-submit" disabled={busy}>{busy ? "Saindo…" : "Sair da conta"}</button></form></header>
      {error && <p role="alert" className="form-error">{error}</p>}
      {children}
      <p className="account-help"><Link href="/hub-educacional">Hub Educacional</Link> · <Link href={user.role === "usuario" ? "/contato" : "/minha-conta/atendimento"}>Precisa de ajuda?</Link></p>
    </div>
  </div></main>;
}
