import Link from "next/link";

export const requestLabels = { aberta: "Aberta", andamento: "Em andamento", concluida: "Concluída" };
export function adminDate(value) {
  return value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
}

export default function AdminOverview({ summary, compact = false }) {
  const metrics = [
    ["Usuários cadastrados", summary.users, "Consultar contas e perfis", "/administracao?tab=usuarios"],
    ["Clientes ativos", summary.clients, `${summary.activeServices} serviços em acompanhamento`, "/administracao?tab=usuarios&role=cliente"],
    ["Solicitações em aberto", summary.openRequests, "Abertas e em andamento", "/administracao?tab=solicitacoes&status=ativas"],
    ["Falhas de email · 24 h", summary.failedEmails, `${summary.acceptedEmails} envios aceitos pelo SMTP`, "/administracao?tab=emails&status=failed&period=1"],
  ];
  return <div className="admin-overview">
    {compact && <div className="admin-welcome"><div><span className="admin-tag">ADMINISTRADOR</span><h2>O controle da operação, em um só lugar.</h2><p>Acompanhe contas, atendimento e a saúde dos envios de email.</p></div><Link className="admin-button" href="/administracao">Abrir administração →</Link></div>}
    <div className="admin-metrics">{metrics.map(([label, value, description, href], index) => <Link className={`admin-metric ${index === 3 && value ? "admin-metric-warning" : ""}`} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>{description} <span aria-hidden="true">↗</span></small></Link>)}</div>
    {!compact && <div className="admin-overview-grid">
      <section className="admin-card"><div className="admin-section-heading"><div><p className="admin-kicker">ATENDIMENTO</p><h2>Próximas solicitações</h2></div><Link href="/administracao?tab=solicitacoes&status=ativas">Ver todas →</Link></div><p className="admin-muted">As solicitações mais antigas aparecem primeiro.</p>
        {summary.recentRequests.length ? <ul className="admin-activity">{summary.recentRequests.map(item => <li key={item.id}><div><Link href={`/administracao?tab=solicitacoes&q=${encodeURIComponent(item.subject)}`}>{item.subject}</Link><small>{item.name} · Atualizada em {adminDate(item.updated_at)}</small></div><span className={`admin-badge ${item.status}`}>{requestLabels[item.status]}</span></li>)}</ul> : <div className="admin-empty"><strong>Atendimento em dia</strong><p>Nenhuma solicitação aberta ou em andamento.</p></div>}
      </section>
      <section className="admin-card"><p className="admin-kicker">EMAILS</p><h2>Monitoramento de envios</h2><p className="admin-muted">Últimas 24 horas</p><div className="admin-mail-summary"><span><strong>{summary.acceptedEmails}</strong>Aceitos pelo SMTP</span><span className={summary.failedEmails ? "admin-text-warning" : ""}><strong>{summary.failedEmails}</strong>Falhas registradas</span></div><p>Consulte destinatário, assunto e diagnóstico para investigar códigos de cadastro e outros envios.</p><Link className="admin-button admin-button-light" href="/administracao?tab=emails">Consultar histórico →</Link></section>
    </div>}
  </div>;
}
