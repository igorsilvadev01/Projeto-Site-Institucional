"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";
import QRCode from "qrcode";

export default function MfaSettings({ user }) {
  const [setup, setSetup] = useState(null), [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(`/api/auth/${setup ? "ativar-2fa" : "configurar-2fa"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message);
      if (result.recoveryCodes) { setCodes(result.recoveryCodes); setSetup(null); refreshSite(router); }
      else setSetup({ ...result, qr: result.qr || await QRCode.toDataURL(result.otpauth, { width: 240, margin: 2 }) });
    } catch (failure) { setError(failure.message || "Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); }
  }
  function downloadCodes() {
    const blob = new Blob([`Plataforma de Privacidade — códigos de recuperação\nConta: ${user.email}\nCada código funciona uma única vez. Não compartilhe.\n\n${codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "portfolio-codigos-recuperacao.txt"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="auth-card mfa-settings" aria-label="Autenticação em duas etapas">
    <h2>Autenticação em duas etapas</h2>
    <p className="auth-description">Proteja o acesso com um aplicativo autenticador. Depois da senha, será necessário informar um código do aplicativo.</p>
    {user.adminMfaRequired && !user.mfaEnabled && <p className="auth-notice">Ative a proteção para acessar a administração.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status" className="form-status">{message}</p>}
    {codes.length > 0 && <div className="mfa-recovery"><h3>Guarde seus códigos de recuperação</h3><p>Esta é a única exibição dos códigos. Cada um pode ser usado uma vez caso você perca o aplicativo.</p><ul>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul><button type="button" className="admin-button" onClick={downloadCodes}>Baixar códigos de recuperação</button></div>}
    {user.mfaEnabled ? <p className="form-status">Proteção ativa. Se perder o aplicativo, entre com um dos códigos de recuperação.</p> : <form onSubmit={submit} aria-label={setup ? "Confirmar ativação de duas etapas" : "Configurar duas etapas"}><fieldset className="auth-fields" disabled={busy}>
      {setup ? <><img src={setup.qr} width="240" height="240" alt="QR code para adicionar a conta ao aplicativo autenticador" /><p>Escaneie o QR code no aplicativo. Você também pode adicionar a chave manualmente:</p><code className="mfa-secret">{setup.secret}</code><label className="form-field">Código do aplicativo<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code" /></label></> : <label className="form-field">Confirme sua senha<input name="password" type="password" required maxLength={128} autoComplete="current-password" /></label>}
      <button className="auth-submit">{busy ? "Aguarde…" : setup ? "Ativar proteção" : "Configurar aplicativo"}</button>
    </fieldset></form>}
  </section>;
}
