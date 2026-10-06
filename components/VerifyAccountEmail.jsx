"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";
export default function VerifyAccountEmail({ email }) {
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/${sent ? "confirmar-email" : "enviar-confirmacao-email"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message);
      if (sent) refreshSite(router); else setSent(true);
    } catch (failure) { setError(failure.message || "Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="auth-card mfa-settings" aria-label="Confirmar email da conta"><h2>Confirme seu email</h2><p>Seu endereço atual é {email}. Confirme-o para manter o acesso aos recursos da conta em produção.</p><form onSubmit={submit} aria-label="Confirmar email"><fieldset className="auth-fields" disabled={busy}>{sent && <label className="form-field">Código recebido por email<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" /></label>}<button className="auth-submit">{busy ? "Aguarde…" : sent ? "Confirmar email" : "Enviar código de confirmação"}</button>{sent && <button type="button" className="admin-clear" onClick={() => setSent(false)}>Pedir outro código</button>}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-status" role="status">{message}</p>}</form></section>;
}
