"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { assessmentQuestions, assessmentAnswerOptions } from "@/lib/assessment";

const answerLabels = Object.fromEntries(assessmentAnswerOptions.map(item => [item.value,item.label]));
const domains = {security:"Segurança da informação",privacy:"Privacidade",other:"Outros documentos"};
const formatDate = value => new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
function download(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text.trimStart()) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export default function AssessmentReport({ id }) {
  const [token,setToken] = useState("");
  const [report,setReport] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [status,setStatus] = useState("");
  const [priority,setPriority] = useState("all");
  const [evidenceState,setEvidenceState] = useState({busy:false,error:"",message:""});
  const [deleting,setDeleting] = useState("");
  const evidenceBusy = useRef(false);
  const base = `/api/avaliacoes/${encodeURIComponent(id)}`;
  useEffect(() => {
    let controller;
    async function load() {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      setLoading(true); setError(""); setReport(null);
      let access = "";
      try { access = decodeURIComponent(window.location.hash.slice(1)); } catch {}
      setToken(access);
      try {
        const response = await fetch(base,{headers:{Authorization:`Bearer ${access}`},cache:"no-store",signal});
        const result = await response.json();
        if (!response.ok) throw new Error("Avaliação não encontrada ou acesso não autorizado. Entre na conta que criou a avaliação ou use seu link privado completo.");
        if (!signal.aborted) setReport(result);
      } catch (caught) {if (!signal.aborted) setError(caught.message === "Failed to fetch" ? "Falha de conexão. Tente novamente." : caught.message);}
      finally {if (!signal.aborted) setLoading(false);}
    }
    load(); window.addEventListener("hashchange",load);
    return () => {controller?.abort();window.removeEventListener("hashchange",load);};
  },[base]);
  async function refresh() {
    const response = await fetch(base,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
    if (!response.ok) throw new Error("Não foi possível atualizar os anexos. Recarregue a página para conferir a lista.");
    setReport(await response.json());
  }
  async function copyLink() {
    try {await navigator.clipboard.writeText(window.location.href);setStatus("Link privado copiado. Guarde-o em um local seguro.");}
    catch {setStatus("Copie o endereço completo na barra do navegador para guardar seu acesso.");}
  }
  function printReport() {
    const privateUrl = window.location.href;
    window.history.replaceState(null,"",window.location.pathname);
    try {window.print();} finally {window.history.replaceState(null,"",privateUrl);}
  }
  function exportPlan() {
    const rows = [["Empresa","Área","Controle","Prioridade","Situação declarada","Recomendação","Responsável","Prazo","Acompanhamento"],...report.actions.map(action => [report.company,domains[action.domain],action.title,action.priority,answerLabels[action.answer],action.recommendation,"","",""])];
    download(new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}),`privacy-platform-plano-${id}.csv`);
    setStatus("Plano de ação exportado em CSV.");
  }
  async function evidenceOperation(action, item, form) {
    if (evidenceBusy.current) return;
    evidenceBusy.current = true; setEvidenceState({busy:true,error:"",message:""});
    try {
      const options = {headers:{Authorization:`Bearer ${token}`},cache:"no-store"};
      let url = `${base}/evidencias`;
      if (action === "upload") {
        const data = new FormData(form), file = data.get("file");
        if (!(file instanceof File) || !file.size) throw new Error("Selecione um arquivo não vazio.");
        if (file.size > 5*1024*1024) throw new Error("O arquivo deve ter no máximo 5 MB.");
        if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error("Selecione um arquivo PDF, PNG ou JPEG.");
        options.method="POST"; options.body=data;
      } else {url+=`/${encodeURIComponent(item.id)}`;options.method=action === "delete" ? "DELETE" : "GET";}
      const response = await fetch(url,options);
      if (!response.ok) {const result=await response.json().catch(()=>({}));throw new Error(result.error||"Não foi possível processar o arquivo.");}
      if (action === "download") {download(await response.blob(),item.name);}
      else {await refresh(); if (form) form.reset(); setDeleting("");}
      setEvidenceState({busy:false,error:"",message:action === "upload" ? "Evidência anexada. O conteúdo ainda não foi verificado." : action === "delete" ? "Evidência excluída." : "Download solicitado."});
    } catch(caught) {setEvidenceState({busy:false,error:caught.message === "Failed to fetch" ? "Falha de conexão. Confira a lista antes de tentar novamente." : caught.message,message:""});}
    finally {evidenceBusy.current=false;}
  }
  if (loading) return <section className="section"><div className="shell narrow" role="status"><p className="page-kicker">Relatório privado</p><h1>Carregando sua avaliação…</h1></div></section>;
  if (!report) return <section className="section"><div className="shell narrow"><h1>Não foi possível abrir a avaliação.</h1><p className="form-error" role="alert">{error}</p><div className="report-toolbar"><button className="button button--navy" onClick={()=>window.location.reload()}>Tentar novamente</button><Link className="button button--outline" href="/avaliacao-de-terceiros">Ir para a avaliação</Link></div></div></section>;
  const applicable = domain => assessmentQuestions.filter(item=>item.domain===domain&&report.answers[item.id]!=="na").length;
  const visibleActions = report.actions.filter(item=>priority==="all"||item.priority===priority);
  return <><section className="page-hero report-hero"><div className="shell"><p className="page-kicker">Resultado da autoavaliação</p><h1>Um ponto de partida para evoluir.</h1><p>{report.company} · {formatDate(report.createdAt)}</p><div className="report-toolbar report-no-print"><button className="button button--navy" onClick={printReport}>Imprimir / salvar PDF</button><button className="button button--outline" onClick={copyLink}>Copiar link privado</button><button className="button button--outline" onClick={exportPlan}>Exportar plano CSV</button></div><p role="status" className="report-no-print">{status}</p></div></section>
    <section className="section report-body"><div className="shell">
      <div className="notice report-no-print"><strong>Guarde seu link privado.</strong> Ele permite acessar este relatório e gerenciar seus anexos. Compartilhe somente com pessoas autorizadas. O relatório não é enviado automaticamente por e-mail.</div>
      <dl className="assessment-details report-company"><div><dt>Empresa</dt><dd>{report.company}</dd></div><div><dt>Responsável</dt><dd>{report.name}</dd></div><div><dt>Setor</dt><dd>{report.sector||"Não informado"}</dd></div><div><dt>Identificação</dt><dd className="report-id">{report.id}</dd></div></dl>
      <div className="section-heading"><p className="page-kicker">Visão geral</p><h2>Indicadores de implementação declarada.</h2><p>Os percentuais refletem as respostas fornecidas. Não representam certificação nem comprovação de conformidade.</p></div>
      <div className="report-score-grid">{[["Resultado geral",report.scores.overall,"50% segurança + 50% privacidade"],["Security Score",report.scores.security,`${applicable("security")} de 6 controles aplicáveis`],["Privacy Score",report.scores.privacy,`${applicable("privacy")} de 6 controles aplicáveis`]].map(([label,value,detail]) => <article className="report-score" key={label}><h3>{label}</h3><div className="report-score-value">{value}<span>/100</span></div><div className="report-meter" aria-hidden="true"><span style={{width:`${value}%`}} /></div><p>{detail}</p></article>)}</div>
      <div className="report-methodology"><h3>Como interpretar o resultado</h3><p>Implementado = 100 pontos; parcialmente implementado = 50; não implementado = 0. “Não se aplica” fica fora do cálculo. Cada domínio usa a média simples dos controles aplicáveis, arredondada para o inteiro mais próximo. O resultado geral é a média dos dois domínios, com peso de 50% para cada um e arredondamento final.</p><p>A metodologia é orientativa. Anexar documentos não altera os resultados e não implica validação automática das práticas ou do fornecedor.</p></div>
      <section className="report-block" aria-labelledby="report-plan"><div className="section-heading"><p className="page-kicker">Próximos passos</p><h2 id="report-plan">Seu plano de ação.</h2><p>Recomendações para controles ausentes ou parcialmente implementados. A situação indicada reflete a resposta original; use a planilha para definir responsáveis e prazos e acompanhar as melhorias.</p></div>
        {report.actions.length ? <><div className="report-filters report-no-print"><label className="form-field">Filtrar por prioridade<select value={priority} onChange={event=>setPriority(event.target.value)}><option value="all">Todas</option><option value="alta">Alta</option><option value="média">Média</option></select></label><p role="status">{visibleActions.length} de {report.actions.length} ações</p></div><div className="card-grid card-grid--two">{report.actions.map(item=><article className={`service-card report-action${priority!=="all"&&item.priority!==priority?" report-filtered-out":""}`} key={item.id}><div className="report-action-top"><span className={`priority-tag priority-tag--${item.priority==="alta"?"high":"medium"}`}>Prioridade {item.priority}</span><span>{item.answer==="partial"?"Parcialmente implementado":"A iniciar"}</span></div><p className="page-kicker">{domains[item.domain]}</p><h3>{item.title}</h3><p>{item.recommendation}</p><p className="form-help">Defina um responsável, um prazo e a evidência que demonstrará a implementação.</p></article>)}</div>{!visibleActions.length&&<p className="notice report-no-print">Nenhuma ação corresponde a este filtro.</p>}</> : <div className="notice">Os controles aplicáveis foram declarados implementados. Mantenha revisões periódicas e valide sua efetividade com evidências.</div>}
      </section>
      <section className="report-block"><div className="section-heading"><p className="page-kicker">Transparência</p><h2>Respostas que compõem o resultado.</h2></div>{["security","privacy"].map(domain=><div className="report-answer-group" key={domain}><h3>{domains[domain]}</h3><ul>{assessmentQuestions.filter(item=>item.domain===domain).map(item=><li key={item.id}><div><strong>{item.title}</strong><p>{item.description}</p></div><span className={`report-answer report-answer--${report.answers[item.id]}`}>{answerLabels[report.answers[item.id]]}</span></li>)}</ul></div>)}</section>
      <section className="report-block" aria-labelledby="evidence-title"><div className="section-heading"><p className="page-kicker">Documentação de apoio</p><h2 id="evidence-title">Evidências da empresa.</h2><p>Reúna políticas, procedimentos e registros que apoiem as respostas. O conteúdo não é analisado automaticamente.</p></div><div className="form-panel report-evidence-panel"><div className="report-evidence-summary"><strong>{report.evidences.length} de 5 arquivos</strong><span>PDF, PNG ou JPEG · até 5 MB por arquivo</span></div>
        {report.evidences.length ? <ul className="report-evidence-list">{report.evidences.map(item=><li key={item.id}><div><strong>{item.name}</strong><p>{domains[item.category]} · {(item.size/1024).toFixed(1)} KB · {formatDate(item.createdAt)}</p></div><div className="report-evidence-buttons report-no-print"><button className="inline-button" type="button" disabled={evidenceState.busy} onClick={()=>evidenceOperation("download",item)}>Baixar</button>{deleting===item.id?<><span>Excluir?</span><button className="inline-button danger" type="button" disabled={evidenceState.busy} onClick={()=>evidenceOperation("delete",item)}>Confirmar exclusão</button><button className="inline-button" type="button" disabled={evidenceState.busy} onClick={()=>setDeleting("")}>Cancelar</button></>:<button className="inline-button danger" type="button" disabled={evidenceState.busy} onClick={()=>setDeleting(item.id)}>Excluir</button>}</div></li>)}</ul>:<p className="report-empty">Nenhuma evidência anexada.</p>}
        <form className="report-upload report-no-print" onSubmit={event=>{event.preventDefault();evidenceOperation("upload",null,event.currentTarget);}} aria-busy={evidenceState.busy}><label className="form-field">Arquivo de evidência<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required disabled={evidenceState.busy||report.evidences.length>=5} /></label><label className="form-field">Área relacionada<select name="category" defaultValue="security" disabled={evidenceState.busy||report.evidences.length>=5}><option value="security">Segurança da informação</option><option value="privacy">Privacidade</option><option value="other">Outros documentos</option></select></label><button className="button button--navy" disabled={evidenceState.busy||report.evidences.length>=5}>{evidenceState.busy?"Processando…":"Anexar evidência"}</button><p className="form-help">Envie somente documentos autorizados e oculte dados pessoais desnecessários. Pessoas com o link privado podem consultar, baixar e excluir os anexos.</p></form>
        {evidenceState.error&&<p className="form-error report-no-print" role="alert">{evidenceState.error}</p>}{evidenceState.message&&<p className="form-status report-no-print" role="status">{evidenceState.message}</p>}
      </div></section><div className="notice"><strong>Transforme informação em melhoria contínua.</strong><p>Priorize as ações considerando os riscos e a operação da empresa. Uma avaliação especializada pode revisar as evidências e detalhar as medidas necessárias.</p><Link className="button button--navy report-no-print" href="/contato?interesse=terceiros">Conversar com a Plataforma de Privacidade ↗</Link></div><p className="report-disclaimer">Relatório de autoavaliação baseado em informações declaradas. Não constitui auditoria, certificação ou comprovação de conformidade.</p>
    </div></section></>;
}
