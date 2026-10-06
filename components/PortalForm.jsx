"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";

export default function PortalForm({ action, label, children, reset = false, submitLabel }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const router = useRouter();
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, input = Object.fromEntries(new FormData(form));
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/portal/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error(result.error);
      if (reset) form.reset();
      setMessage(result.message); refreshSite(router);
    } catch (failure) { setError(failure.message || "Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} aria-label={label} className="portal-form">
    <fieldset className="auth-fields" disabled={busy}>{children}<button className="auth-submit" type="submit">{busy ? "Salvando…" : submitLabel || label}</button></fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status" className="form-status">{message}</p>}
  </form>;
}
