"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";
import MfaSettings from "./MfaSettings";
import VerifyAccountEmail from "./VerifyAccountEmail";

export default function AccountSettings({ user }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const router = useRouter();
  async function submit(event, action) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    if (action === "senha" && form.get("password") !== form.get("confirmation")) { setError("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error(result.error);
      if (action === "senha") { window.location.assign("/login"); return; }
      setMessage(result.message); refreshSite(router);
    } catch (failure) { setError(failure.message || "Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <div className="account-settings">
    {error && <p role="alert" className="form-error">{error}</p>}
    <div role="status">{message && <p className="form-status">{message}</p>}</div>
    <div id="perfil" className="account-grid">
      <section className="auth-card"><h2>Seus dados</h2><p className="auth-description">Conta criada em {new Date(user.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>
        <form onSubmit={event => submit(event, "perfil")} aria-label="Atualizar perfil"><fieldset className="auth-fields" disabled={busy}>
          <label className="form-field">Nome completo<input name="name" defaultValue={user.name} required minLength={2} maxLength={120} autoComplete="name" /></label>
          <label className="form-field">E-mail<input type="email" value={user.email} readOnly /></label>
          <button className="auth-submit">Salvar nome</button>
        </fieldset></form>
      </section>
      <section className="auth-card"><h2>Alterar senha</h2><p className="auth-description">Ao alterar a senha, todas as sessões serão encerradas. Use de 12 a 128 caracteres.</p>
        <form onSubmit={event => submit(event, "senha")} aria-label="Alterar senha"><fieldset className="auth-fields" disabled={busy}>
          <label className="form-field">Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
          <label className="form-field">Nova senha<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
          <label className="form-field">Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
          <button className="auth-submit">Alterar senha</button>
        </fieldset></form>
      </section>
    </div>
    {!user.emailVerified && <VerifyAccountEmail email={user.email} />}
    {(user.role === "admin" || user.mfaEnabled) && <MfaSettings user={user} />}
  </div>;
}
