"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { interests } from "@/lib/site";

export default function ContactForm({ initialInterest = "geral", initialMessage = "", whatsappUrl = "" }) {
  const [state, setState] = useState({ busy: false, error: "", result: null });
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const successHeading = useRef(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => setSecondsRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);
  useEffect(() => {
    if (state.result) {
      successHeading.current?.focus({ preventScroll: true });
      successHeading.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    }
  }, [state.result]);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || cooldownUntil > Date.now()) return;
    submitting.current = true;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    values.consent = values.consent === "on";
    setState({ busy: true, error: "", result: null });
    try {
      const response = await fetch("/api/contato", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await response.json();
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) setCooldownUntil(Date.now() + retryAfter * 1000);
      }
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar sua solicitação. Tente novamente.");
      setState({ busy: false, error: "", result: data });
      form.reset();
    } catch (error) {
      setState({ busy: false, error: error.message || "Falha de conexão. Tente novamente.", result: null });
    } finally { submitting.current = false; }
  }
  if (state.result) {
    const whatsapp = /^https:\/\/wa\.me\/\d{10,15}$/.test(whatsappUrl)
      ? `${whatsappUrl}?text=${encodeURIComponent(`Olá! Enviei uma solicitação pelo site da Plataforma de Privacidade e gostaria de continuar a conversa. Meu protocolo é ${state.result.reference}.`)}` : "";
    return <form className="form-panel contact-success" aria-label="Solicitação de proposta" onSubmit={event => event.preventDefault()}>
      <span className="contact-success__icon" aria-hidden="true">✓</span>
      <span className="tag">Mensagem recebida</span>
      <h2 ref={successHeading} tabIndex={-1}>Obrigado por conversar com a gente!</h2>
      <div role="status">
        <p>Sua solicitação ficou registrada. Obrigado pela confiança na Plataforma de Privacidade. Nossa equipe poderá consultar os detalhes para dar continuidade ao seu atendimento.</p>
        <div className="contact-success__reference"><span>Seu protocolo de atendimento</span><strong>{state.result.reference}</strong><small>Guarde este número para acompanhar sua solicitação.</small></div>
        <p>Você poderá enviar uma nova solicitação após 5 minutos.</p>
      </div>
      {whatsapp && <><p>Prefere continuar pelo WhatsApp? É só clicar abaixo. Você poderá revisar a mensagem antes de enviá-la.</p><a className="button button--navy" href={whatsapp} target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp <span aria-hidden="true">↗</span></a></>}
      <Link className="button button--outline" href="/">Voltar à página inicial <span aria-hidden="true">↗</span></Link>
    </form>;
  }
  return <form className="form-panel" onSubmit={submit} aria-label="Solicitação de proposta">
    <div className="form-panel__heading"><span className="tag">Vamos começar</span><h2>Conte o seu desafio.</h2><p>Os campos marcados com * são obrigatórios.</p></div>
    <div className="form-grid">
      <label className="form-field">Nome completo *<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Como podemos chamar você?" /></label>
      <label className="form-field">E-mail *<input name="email" type="email" autoComplete="email" required maxLength={180} placeholder="voce@empresa.com.br" /></label>
      <label className="form-field">Empresa<input name="company" autoComplete="organization" maxLength={160} placeholder="Nome da organização" /></label>
      <label className="form-field">Telefone / WhatsApp<input name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(DDD) 99999-9999" /></label>
      <label className="form-field form-field--full">Como podemos ajudar? *<select name="interest" defaultValue={initialInterest} required>{interests.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="form-field form-field--full">Sua mensagem *<textarea name="message" required minLength={10} maxLength={5000} rows={6} defaultValue={initialMessage} placeholder="Descreva sua necessidade, os principais desafios e o que espera alcançar. Para treinamentos, informe público, formato e período desejados." /></label>
    </div>
    <div className="honeypot" aria-hidden="true"><label>Seu site<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="consent-field"><input type="checkbox" name="consent" required /><span>Autorizo o uso dos dados informados para responder à minha solicitação e declaro que li a <Link href="/politica-de-privacidade" target="_blank">Política de Privacidade</Link>. *</span></label>
    <p className="form-help">Este contato não inscreve você na newsletter. Evite incluir senhas, documentos pessoais ou informações sensíveis na mensagem.</p>
    <p className="form-help">Aguarde 5 minutos entre os envios deste formulário.</p>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="button button--navy" type="submit" disabled={state.busy || secondsRemaining > 0}>{state.busy ? "Registrando…" : secondsRemaining > 0 ? `Aguarde ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}` : "Enviar solicitação ↗"}</button>
  </form>;
}
