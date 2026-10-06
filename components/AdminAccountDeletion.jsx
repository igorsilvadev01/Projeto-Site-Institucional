"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshSite } from "@/lib/refresh-site";

const DeletionFeedback = createContext(null);

export function useAccountFeedback() { return useContext(DeletionFeedback); }

export default function AdminAccountDeletion({ children }) {
  const [message, setMessage] = useState("");
  return <DeletionFeedback.Provider value={setMessage}>
    {message && <p className="admin-deletion-success" role="status">{message}</p>}
    {children}
  </DeletionFeedback.Provider>;
}

export function DeleteAccountButton({ account, ownAccount, children }) {
  const router = useRouter();
  const announce = useContext(DeletionFeedback);
  const dialog = useRef(null), submitting = useRef(false);
  const titleId = useId(), descriptionId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");
  const confirmed = confirmation.trim().toLowerCase() === account.email.toLowerCase();

  function open() {
    setConfirmation(""); setError("");
    dialog.current.showModal();
  }

  async function remove(event) {
    event.preventDefault();
    if (!confirmed || submitting.current || ownAccount || deleted) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/excluir-conta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, confirmationEmail: confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Não foi possível excluir a conta.");
      setDeleted(true);
      dialog.current.close();
      announce?.(`A conta de ${account.name} foi excluída com sucesso.`);
      refreshSite(router);
    } catch (failure) {
      setError(failure.message || "Não foi possível excluir a conta. Tente novamente.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className="admin-user-delete">
    {children}
    <button type="button" className="admin-button admin-button-danger-outline" disabled={ownAccount || deleted} onClick={open}>Excluir conta</button>
    {ownAccount && <span>Você não pode excluir a própria conta.</span>}
    {!ownAccount && <dialog ref={dialog} className="admin-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { if (submitting.current) event.preventDefault(); }}>
      <form onSubmit={remove} aria-busy={busy}>
        <p className="admin-delete-kicker">EXCLUSÃO DE CONTA</p>
        <h2 id={titleId}>Excluir esta conta?</h2>
        <div className="admin-delete-identity"><strong>{account.name}</strong><span>{account.email}</span>{account.role === "admin" && <span className="admin-badge admin">Administrador</span>}</div>
        <p id={descriptionId}>Esta ação é permanente. Serão removidos o acesso, as avaliações, os documentos, as tarefas, os serviços e as solicitações desta conta.</p>
        <label className="form-field">Digite o email da conta para confirmar<input type="email" required maxLength={254} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} /></label>
        {error && <p className="admin-delete-error" role="alert">{error}</p>}
        <div className="admin-delete-actions"><button type="button" className="admin-button admin-button-light" disabled={busy} onClick={() => dialog.current.close()}>Cancelar</button><button type="submit" className="admin-button admin-button-danger" disabled={!confirmed || busy}>{busy ? "Excluindo…" : "Excluir definitivamente"}</button></div>
      </form>
    </dialog>}
  </div>;
}
