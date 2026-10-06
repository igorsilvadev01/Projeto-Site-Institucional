"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function EmailConfirmation() {
  const [pending, setPending] = useState(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/cadastro-pendente", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível consultar o cadastro. Recarregue a página.");
      const result = await response.json(); setPending(result); setMessage(result.message || "");
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const wait = Math.max(0, Math.ceil(((pending?.resendAt || 0) - now) / 1000));
  async function send(event, resend = false) {
    event.preventDefault();
    if (busy) return;
    const payload = resend ? {} : { code: new FormData(event.currentTarget).get("code") };
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/auth/${resend ? "reenviar-codigo" : "confirmar-cadastro"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível confirmar o cadastro.");
      if (!resend) { window.location.assign("/minha-conta"); return; }
      setPending(current => ({ ...current, resendAt: result.resendAt })); setMessage(result.message);
    } catch (failure) { setError(failure.message || "Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main id="conteudo" className="auth-page"><section className="shell auth-card" style={{ maxWidth: 520, background: "white", borderRadius: 24 }}>
    <p className="eyebrow">FALTA SÓ CONFIRMAR</p><h1>Confirme seu e-mail</h1>
    {loading ? <p role="status">Consultando cadastro…</p> : pending?.pending ? <>
      <p className="auth-description">Digite o código de 6 números enviado para <strong>{pending.email}</strong>. Ele vale por 10 minutos. Sua conta será criada após a confirmação.</p>
      <form onSubmit={send} aria-label="Confirmar cadastro"><fieldset className="auth-fields" disabled={busy}>
        <label className="form-field">Código de confirmação<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
        <button className="auth-submit" type="submit">{busy ? "Aguarde…" : "Confirmar e criar conta"}</button>
      </fieldset></form>
      <p className="form-help">Não recebeu? Confira o spam ou solicite um novo código. Apenas o código mais recente funciona.</p>
      <button className="auth-submit" type="button" disabled={busy || wait > 0} onClick={event => send(event, true)}>{wait ? `Reenviar em ${wait}s` : "Reenviar código"}</button>
    </> : !error && <p className="auth-notice">Não há cadastro pendente ou o código expirou. Inicie um novo cadastro.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status" className="auth-notice">{message}</p>}
    <p className="auth-switch"><Link href="/cadastro">Corrigir e-mail ou iniciar novo cadastro</Link></p><p className="auth-switch"><Link href="/login">Já tenho conta — entrar</Link></p>
  </section></main>;
}
