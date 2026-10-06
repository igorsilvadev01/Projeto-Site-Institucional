import test from "node:test";
import assert from "node:assert/strict";
import { accountOverview } from "../lib/account-overview.js";

const action = (id, priority = "alta") => ({ id, title: id, priority, recommendation: "Recomendação" });
const assessment = (id, company, createdAt, actions) => ({ id, company, createdAt, actions, scores: { overall: 50, security: 50, privacy: 50 } });
const empty = () => ({ assessments: [], progress: [], requests: [], services: [], documents: [] });

test("prioridades: tarefa vencida primeiro, conclusão excluída e datas civis preservadas", () => {
  const data = { ...empty(), assessments: [assessment("a", "Empresa A", 1, [action("sem-prazo"), action("vencida", "média"), action("hoje"), action("concluida")])],
    progress: [
      { assessment_id: "a", action_id: "vencida", status: "pendente", due_date: "2026-10-02", assignee: "Equipe TI" },
      { assessment_id: "a", action_id: "hoje", status: "andamento", due_date: "2026-10-03" },
      { assessment_id: "a", action_id: "concluida", status: "concluida", due_date: "2026-01-01" },
    ] };
  let view = accountOverview(data, "2026-10-03");
  assert.equal(view.nextTask.id, "vencida");
  assert.equal(view.nextTask.company, "Empresa A");
  assert.equal(view.nextTask.assignee, "Equipe TI");
  assert.equal(view.pendingCount, 3);
  assert.equal(view.overdueCount, 1);
  assert.equal(view.nextTaskOverdue, true);
  data.progress[0].status = "concluida";
  view = accountOverview(data, "2026-10-03");
  assert.equal(view.nextTask.id, "hoje");
  assert.equal(view.overdueCount, 0);
  assert.equal(view.nextTaskOverdue, false);
});

test("desempate: prioridade alta e tarefas iniciadas antes das demais", () => {
  const data = { ...empty(), assessments: [assessment("a", "Empresa A", 1, [action("media", "média"), action("pendente"), action("iniciada")])],
    progress: [{ assessment_id: "a", action_id: "iniciada", status: "andamento" }] };
  assert.equal(accountOverview(data, "2026-10-03").nextTask.id, "iniciada");
  data.progress[0].status = "concluida";
  assert.equal(accountOverview(data, "2026-10-03").nextTask.id, "pendente");
});

test("visão geral identifica a empresa recente e mostra somente serviços em andamento e respostas não lidas", () => {
  const data = { ...empty(), assessments: [assessment("antiga", "Empresa Antiga", 1, []), assessment("recente", "Empresa Recente", 2, [])],
    services: [{ id: "planejado", status: "planejado" }, { id: "ativo", status: "andamento" }, { id: "concluido", status: "concluido" }],
    requests: [{ id: "sem-resposta", unread: false }, { id: "nova", unread: true }, { id: "lida", unread: false }] };
  const view = accountOverview(data);
  assert.equal(view.latest.company, "Empresa Recente");
  assert.equal(view.nextTask, null);
  assert.deepEqual(view.activeServices.map(item => item.id), ["ativo"]);
  assert.deepEqual(view.unreadReplies.map(item => item.id), ["nova"]);
  assert.equal(accountOverview(empty()).latest, null);
});
