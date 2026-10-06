"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { assessmentQuestions, assessmentAnswerOptions } from "@/lib/assessment";

const steps = ["Sua empresa", "Segurança", "Privacidade", "Revisão"];
const labels = Object.fromEntries(assessmentAnswerOptions.map(option => [option.value, option.label]));

export default function AssessmentForm() {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({ company: "", name: "", email: "", sector: "", website: "" });
  const [answers, setAnswers] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = useRef(null);
  const submitting = useRef(false);
  const questions = assessmentQuestions.filter(item => item.domain === (step === 1 ? "security" : "privacy"));
  function goTo(value) {
    setStep(value); setError("");
    requestAnimationFrame(() => { title.current?.focus({ preventScroll: true }); title.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); });
  }
  function changeDetail(event) { setDetails(current => ({ ...current, [event.target.name]: event.target.value })); }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if ((step === 1 || step === 2) && questions.every(item => answers[item.id] === "na")) { setError("É necessário ao menos um controle aplicável nesta área. Revise as respostas ‘Não se aplica’."); return; }
    if (step < 3) { goTo(step + 1); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/avaliacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, answers, consent }) });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error || "Não foi possível gerar o relatório.");
      window.location.assign(`/avaliacao-de-terceiros/relatorio/${encodeURIComponent(result.id)}${result.token ? `#${encodeURIComponent(result.token)}` : ""}`);
    } catch (caught) { setError(caught.message === "Failed to fetch" ? "Falha de conexão. Suas respostas continuam nesta página; tente novamente." : caught.message); setBusy(false); submitting.current = false; }
  }
  return <section className="section section--tint" id="avaliacao"><div className="shell">
    <div className="section-heading"><p className="page-kicker">Diagnóstico inicial / 12 controles</p><h2>Conheça as práticas do fornecedor.</h2><p>A empresa terceira é indicada por um contratante para avaliação. Ela responde com informações sobre o ambiente e envia as evidências. Ao concluir, contratante e terceira recebem o relatório completo, o plano de ação e a área de evidências.</p></div>
    <div className="assessment-panel"><ol className="assessment-steps" aria-label="Etapas da avaliação">{steps.map((label, index) => <li key={label} className={index === step ? "is-current" : index < step ? "is-complete" : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? "✓" : index + 1}</span>{label}</li>)}</ol>
      <form onSubmit={submit} aria-busy={busy}><p className="page-kicker">Etapa {step + 1} de 4</p><h3 className="assessment-step-title" tabIndex={-1} ref={title}>{["Vamos conhecer a empresa avaliada", "Segurança da informação", "Privacidade e proteção de dados", "Revise e gere seu relatório"][step]}</h3>
        <div className="honeypot" aria-hidden="true"><label>Website<input name="website" value={details.website} onChange={changeDetail} tabIndex={-1} autoComplete="off" /></label></div>
        {step === 0 && <><div className="form-grid">{[
          {name:"company",label:"Empresa avaliada",autoComplete:"organization",maxLength:160},
          {name:"name",label:"Responsável pelas respostas",autoComplete:"name",maxLength:120},
          {name:"email",label:"E-mail do responsável",type:"email",autoComplete:"email",maxLength:254},
        ].map(({label,...field}) => <label className="form-field" key={field.name}>{label} *<input {...field} value={details[field.name]} onChange={changeDetail} required minLength={2} /></label>)}<label className="form-field">Setor de atuação *<select name="sector" value={details.sector} onChange={changeDetail} required><option value="">Selecione</option>{["Tecnologia","Serviços","Comércio","Indústria","Saúde","Educação","Financeiro","Logística","Setor público","Terceiro setor","Outro"].map(sector => <option key={sector}>{sector}</option>)}</select></label></div><p className="form-help">* Campos obrigatórios. As respostas não são publicadas. Não inclua informações sensíveis ou confidenciais desnecessárias.</p></>}
        {(step === 1 || step === 2) && <div className="assessment-questions"><p>Considere o que está em operação e pode ser demonstrado. “Não se aplica” é excluído do cálculo e deve refletir o contexto real da empresa.</p>{questions.map((question, index) => <fieldset className="assessment-question" key={question.id}><legend><span>{String(index + 1).padStart(2,"0")}</span> {question.title}</legend><p>{question.description}</p><div className="assessment-choices">{assessmentAnswerOptions.map(option => <label key={option.value} className={answers[question.id] === option.value ? "is-selected" : ""}><input type="radio" name={question.id} required value={option.value} checked={answers[question.id] === option.value} onChange={() => {setAnswers(current => ({...current,[question.id]:option.value}));setError("");}} /><span>{option.label}</span></label>)}</div></fieldset>)}</div>}
        {step === 3 && <div className="assessment-review"><div className="assessment-review-title"><h4>Identificação</h4><button type="button" className="inline-button" onClick={() => goTo(0)} disabled={busy}>Editar dados</button></div><dl className="assessment-details"><div><dt>Empresa</dt><dd>{details.company}</dd></div><div><dt>Responsável</dt><dd>{details.name}</dd></div><div><dt>E-mail</dt><dd>{details.email}</dd></div><div><dt>Setor</dt><dd>{details.sector}</dd></div></dl>{["security","privacy"].map((domain,index) => <div className="assessment-review-group" key={domain}><div className="assessment-review-title"><h4>{domain === "security" ? "Segurança da informação" : "Privacidade"}</h4><button className="inline-button" type="button" onClick={() => goTo(index + 1)} disabled={busy}>Editar respostas</button></div><ul>{assessmentQuestions.filter(item=>item.domain===domain).map(item => <li key={item.id}><span>{item.title}</span><strong>{labels[answers[item.id]]}</strong></li>)}</ul></div>)}
          <div className="notice"><strong>Uma orientação para os próximos passos.</strong> O resultado se baseia nas suas respostas. Não é auditoria, certificação ou comprovação de conformidade. As evidências anexadas não serão verificadas automaticamente.</div>
          <label className="consent-field"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} /><span>Autorizo o armazenamento dos dados para gerar e disponibilizar esta avaliação, confirmo que tenho autorização para fornecer as informações da empresa e que li a <Link href="/politica-de-privacidade" target="_blank">Política de Privacidade</Link>. *</span></label></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="assessment-form-footer">{step > 0 ? <button className="button button--outline" type="button" onClick={() => goTo(step - 1)} disabled={busy}>Voltar</button> : <span className="form-help">Responda de acordo com a realidade atual.</span>}<button className="button button--navy" type="submit" disabled={busy}>{busy ? "Gerando relatório…" : step === 3 ? "Gerar meu relatório ↗" : "Continuar →"}</button></div>
      </form>
    </div>
  </div></section>;
}
