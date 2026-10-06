"use client";

import { useId, useState } from "react";
import Link from "next/link";

export default function NewsletterForm() {
  const id = useId();
  const [status, setStatus] = useState({ busy: false, message: "", error: "" });
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.consent = data.consent === "on";
    setStatus({ busy: true, message: "", error: "" });
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível solicitar sua assinatura.");
      setStatus({ busy: false, message: result.message || "Confira sua caixa de entrada para confirmar a assinatura.", error: "" });
      form.reset();
    } catch (error) { setStatus({ busy: false, message: "", error: error.message || "Falha de conexão. Tente novamente." }); }
  }
  return <form className="form-panel newsletter-form" onSubmit={submit} aria-label="Assinar newsletter">
    <h3>Receba novas perspectivas.</h3><p>Assinatura gratuita. Você pode cancelar quando quiser.</p>
    <label className="form-field" htmlFor={`${id}-name`}>Seu nome<input id={`${id}-name`} name="name" autoComplete="given-name" maxLength={120} placeholder="Como podemos chamar você?" /></label>
    <label className="form-field" htmlFor={`${id}-email`}>Seu e-mail *<input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={180} placeholder="voce@empresa.com.br" /></label>
    <div className="honeypot" aria-hidden="true"><label>Seu site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="consent-field"><input name="consent" type="checkbox" required /><span>Quero receber a newsletter e concordo com o uso do meu e-mail para essa finalidade, conforme a <Link href="/politica-de-privacidade" target="_blank">Política de Privacidade</Link>. *</span></label>
    {status.error && <p className="form-error" role="alert">{status.error}</p>}
    {status.message && <p className="form-status" role="status">{status.message}</p>}
    <button className="button button--navy" disabled={status.busy} type="submit">{status.busy ? "Enviando…" : "Quero receber a newsletter ↗"}</button>
    <p className="form-help">Confirme pelo link enviado ao seu e-mail. Sem confirmação, a assinatura permanece inativa.</p>
  </form>;
}
