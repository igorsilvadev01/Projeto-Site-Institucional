"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";
import { useAccountFeedback } from "./AdminAccountDeletion";

export default function AdminAccountEditor({ account, ownAccount }) {
  const dialog = useRef(null), submitting = useRef(false);
  const noteId = useId();
  const router = useRouter(), announce = useAccountFeedback();
  const [draft, setDraft] = useState(account), [original, setOriginal] = useState(account);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const identityChanged = draft.email.trim().toLowerCase() !== original.email || draft.role !== original.role;
  const changed = identityChanged || draft.name.trim() !== original.name;

  function open() {
    setDraft(account); setOriginal(account); setError(""); setConflict(false);
    dialog.current.showModal();
  }
  function update(key, value) { setDraft(previous => ({ ...previous, [key]: value })); if (!conflict) setError(""); }
  async function save(event) {
    event.preventDefault();
    if (submitting.current || !changed || conflict) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/editar-conta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, name: draft.name, email: draft.email, role: draft.role, version: original.version }),
      });
      const result = await response.json().catch(() => ({ error: "Não foi possível salvar. Tente novamente em instantes." }));
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) { setError(result.error || "Não foi possível salvar a conta."); setConflict(response.headers.get("X-Portal-Account-Conflict") === "stale"); return; }
      dialog.current.close();
      if (result.requiresLogin) { window.location.assign("/login"); return; }
      announce?.(`A conta de ${draft.name.trim()} foi atualizada com sucesso.${result.sessionsRevoked ? " Será necessário entrar novamente nessa conta." : ""}`);
      refreshSite(router);
    } catch { setError("Falha de conexão. Verifique sua conexão e tente novamente."); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <>
    <button type="button" className="admin-button admin-button-light" onClick={open}>Editar conta</button>
    <dialog ref={dialog} className="admin-delete-dialog admin-edit-dialog" aria-label="Editar conta" aria-describedby={noteId} onCancel={event => { if (submitting.current) event.preventDefault(); }}>
      <form onSubmit={save} aria-busy={busy}>
        <p className="admin-edit-kicker">DADOS DA CONTA</p><h2>Editar conta</h2>
        <p className="admin-muted">{original.name} · {original.email}</p>
        <fieldset className="auth-fields" disabled={busy}>
          <label className="form-field">Nome completo<input value={draft.name} onChange={event => update("name", event.target.value)} required minLength={2} maxLength={120} autoComplete="off" /></label>
          <label className="form-field">Email da conta<input type="email" value={draft.email} onChange={event => update("email", event.target.value)} required maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
          <label className="form-field">Perfil de acesso<select value={draft.role} onChange={event => update("role", event.target.value)} disabled={original.role === "admin"}>{original.role === "admin" ? <option value="admin">Administrador</option> : <><option value="usuario">Usuário cadastrado</option><option value="cliente">Cliente Plataforma de Privacidade</option></>}</select></label>
          {original.role === "admin" && <p className="admin-muted">O perfil Admin é mantido nesta edição.</p>}
        </fieldset>
        <p id={noteId} className="admin-edit-note">Alterar email ou perfil encerra as sessões desta conta e exige novo login. Um email alterado ficará sem confirmação registrada.{ownAccount && " Se alterar seu próprio email, você será direcionado ao login."}</p>
        {error && <p className="admin-delete-error" role="alert">{error}</p>}
        <div className="admin-delete-actions"><button type="button" className="admin-button admin-button-light" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button>{conflict ? <button type="button" className="admin-button" onClick={() => { dialog.current.close(); refreshSite(router); }}>Recarregar dados</button> : <button type="submit" className="admin-button" disabled={!changed || busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>}</div>
      </form>
    </dialog>
  </>;
}
