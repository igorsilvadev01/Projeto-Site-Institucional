import Link from "next/link";
import FirstAccessGuide from "@/components/FirstAccessGuide";
import { accountOverview } from "@/lib/account-overview";

const date = value => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dueDate = value => value ? value.split("-").reverse().join("/") : "Sem prazo definido";

export default function MemberOverview({ user, data }) {
  const client = ["cliente", "admin"].includes(user.role);
  const { nextTask, nextTaskOverdue, latest, pendingCount, overdueCount, activeServices, unreadReplies } = accountOverview(data);
  return <div className="member-overview">
    {client && unreadReplies.length > 0 && <Link className="account-attention" href="/minha-conta/atendimento"><span><strong>{unreadReplies.length} {unreadReplies.length === 1 ? "resposta aguardando leitura" : "respostas aguardando leitura"}</strong><small>A equipe respondeu. Confira as novidades no atendimento.</small></span><span aria-hidden="true">→</span></Link>}
    {!latest && <FirstAccessGuide client={client} />}
    {latest && <>
      <div className="account-summary-metrics"><article><strong>{data.assessments.length}</strong><span>Avaliações salvas</span></article><article><strong>{pendingCount}</strong><span>{client ? "Tarefas pendentes" : "Recomendações para revisar"}</span></article><article><strong>{client ? unreadReplies.length : latest.scores.overall + "/100"}</strong><span>{client ? "Respostas não lidas" : `Nota geral · ${latest.company}`}</span></article></div>
      <div className="account-overview-grid">
        <section className="account-focus-card"><p className="account-kicker">{client ? "PRÓXIMA TAREFA" : "PRÓXIMA RECOMENDAÇÃO"}</p>
          {nextTask ? <><div className="account-focus-tags"><span className="account-pill">Prioridade {nextTask.priority}</span>{client && <span className={`account-pill ${nextTaskOverdue ? "account-pill-warning" : ""}`}>{nextTaskOverdue ? "Vencida · " : ""}{dueDate(nextTask.dueDate)}</span>}</div><h2>{nextTask.title}</h2><p className="account-company">{nextTask.company}</p><p>{nextTask.recommendation}</p>{client && <p className="account-task-meta">{nextTask.status === "andamento" ? "Em andamento" : "Pendente"} · {nextTask.assignee || "Responsável não definido"}</p>}<Link className="button button--navy" href={client ? `/minha-conta/plano?avaliacao=${nextTask.assessmentId}#acao-${nextTask.assessmentId}-${nextTask.id}` : `/avaliacao-de-terceiros/relatorio/${nextTask.assessmentId}#report-plan`}>{client ? "Abrir tarefa" : "Ver recomendações no relatório"} <span aria-hidden="true">→</span></Link></> : <><h2>{client ? "Suas tarefas estão em dia" : "Revise os resultados com sua equipe"}</h2><p>{client ? "Nenhuma tarefa pendente nas suas avaliações. Faça uma nova avaliação para acompanhar a evolução." : "As avaliações não geraram recomendações para controles a melhorar. Mantenha revisões periódicas."}</p><Link href="/minha-conta/avaliacoes">Consultar avaliações →</Link></>}
          {client && <p className="account-priority-note">Ordem: tarefas vencidas, prazo mais próximo e prioridade. {overdueCount > 0 && `${overdueCount} tarefa(s) com prazo vencido.`}</p>}
        </section>
        <section className="account-recent-card"><p className="account-kicker">AVALIAÇÃO MAIS RECENTE</p><h2>{latest.company}</h2><p className="account-muted">Realizada em {date(latest.createdAt)}</p><div className="account-score"><strong>{latest.scores.overall}<small>/100</small></strong><span>Nota geral</span></div><div className="account-score-details"><span>Segurança <b>{latest.scores.security}/100</b></span><span>Privacidade <b>{latest.scores.privacy}/100</b></span></div><Link href={`/avaliacao-de-terceiros/relatorio/${latest.id}`}>Abrir relatório <span aria-hidden="true">→</span></Link><p className="account-priority-note">Resultado baseado nas respostas da avaliação.</p></section>
      </div>
    </>}
    {client && <div className="account-overview-grid account-overview-bottom">
      <section className="portal-section"><div className="account-section-heading"><h2>Serviços em andamento</h2><Link href="/minha-conta/servicos">Ver serviços →</Link></div>{activeServices.length ? <ul className="account-updates">{activeServices.slice(0, 3).map(item => <li key={item.id}><strong>{item.title}</strong><span>{item.due_date ? `Prazo: ${dueDate(item.due_date)}` : "Prazo ainda não definido"}</span><p>{item.description}</p></li>)}</ul> : <p className="portal-empty">Nenhum serviço em andamento. Os serviços planejados e concluídos estão na seção Serviços.</p>}</section>
      <section className="portal-section"><div className="account-section-heading"><h2>Respostas aguardando leitura</h2><Link href="/minha-conta/atendimento">Ver atendimento →</Link></div>{unreadReplies.length ? <ul className="account-updates">{unreadReplies.slice(0, 3).map(item => <li key={item.id}><Link href={`/minha-conta/atendimento#solicitacao-${item.id}`}>{item.subject} <span aria-hidden="true">→</span></Link><span>Atualizada em {date(item.updated_at)}</span><span className="account-pill account-pill-new">Nova resposta</span></li>)}</ul> : <p className="portal-empty">Nenhuma resposta aguardando leitura. Você pode consultar suas solicitações em Atendimento.</p>}</section>
    </div>}
    {!client && <section className="account-resource-card"><div><p className="account-kicker">MATERIAIS DE APOIO</p><h2>Prepare a avaliação com sua equipe.</h2><p>Use o checklist de segurança e privacidade para reunir as informações antes de responder.</p></div><Link href="/minha-conta/materiais">Explorar materiais →</Link></section>}
  </div>;
}
