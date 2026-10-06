"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function NewsletterAction({ action }) {
  const [token, setToken] = useState(null);
  const readToken = useRef(false);
  const [state, setState] = useState({ busy: false, done: false, error: "" });
  useEffect(() => {
    if (readToken.current) return;
    readToken.current = true;
    const url = new URL(window.location.href);
    setToken(url.searchParams.get("token") || "");
    // Remove o token da barra após leitura para reduzir compartilhamentos acidentais.
    window.history.replaceState(null, "", url.pathname);
  }, []);
  const cancel = action === "cancelar";
  async function submit() {
    setState({ busy: true, done: false, error: "" });
    try {
      const response = await fetch(`/api/newsletter/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir esta solicitação.");
      setState({ busy: false, done: true, error: "" });
    } catch (error) { setState({ busy: false, done: false, error: error.message || "Falha de conexão. Tente novamente." }); }
  }
  return <div className="form-panel action-panel">
    {state.done ? <div role="status"><span className="tag">Tudo certo</span><h2>{cancel ? "Assinatura cancelada." : "Assinatura confirmada."}</h2><p>{cancel ? "Você não receberá novas edições desta newsletter. Se mudar de ideia, pode se inscrever novamente." : "Sua assinatura está ativa. As novas edições poderão chegar ao e-mail que você informou."}</p></div> : <>
      <h2>{cancel ? "Deseja cancelar sua assinatura?" : "Falta só a sua confirmação."}</h2><p>{cancel ? "Confirme abaixo para deixar de receber a newsletter da Plataforma de Privacidade." : "Clique no botão para autorizar o recebimento da newsletter da Plataforma de Privacidade. Apenas abrir esta página não ativa a assinatura."}</p>
      {token === "" && <p className="form-error" role="alert">Este link está incompleto. Abra o link recebido no e-mail ou solicite uma nova assinatura.</p>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button--navy" disabled={!token || state.busy} onClick={submit}>{state.busy ? "Processando…" : cancel ? "Confirmar cancelamento" : "Confirmar minha assinatura"}</button>
    </>}
    <Link className="text-link" href="/newsletter">Voltar à newsletter</Link>
  </div>;
}
