// Usa apenas os dados já autorizados para a conta. Datas de tarefas são datas
// civis de Brasília, sem conversão para a meia-noite UTC.
export function accountOverview(data, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) {
  const actions = data.assessments.flatMap(assessment => assessment.actions.map(action => {
    const saved = data.progress.find(item => item.assessment_id === assessment.id && item.action_id === action.id);
    return { ...action, assessmentId: assessment.id, company: assessment.company, createdAt: assessment.createdAt,
      status: saved?.status || "pendente", dueDate: saved?.due_date || "", assignee: saved?.assignee || "" };
  }));
  const pending = actions.filter(action => action.status !== "concluida");
  const deadlineRank = action => !action.dueDate ? 3 : action.dueDate < today ? 0 : action.dueDate === today ? 1 : 2;
  pending.sort((a, b) => deadlineRank(a) - deadlineRank(b)
    || a.dueDate.localeCompare(b.dueDate)
    || Number(b.priority === "alta") - Number(a.priority === "alta")
    || Number(b.status === "andamento") - Number(a.status === "andamento")
    || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return {
    nextTask: pending[0] || null, pendingCount: pending.length,
    nextTaskOverdue: !!pending[0]?.dueDate && pending[0].dueDate < today,
    overdueCount: pending.filter(action => action.dueDate && action.dueDate < today).length,
    latest: [...data.assessments].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))[0] || null,
    activeServices: data.services.filter(service => service.status === "andamento"),
    unreadReplies: data.requests.filter(request => request.unread),
  };
}
