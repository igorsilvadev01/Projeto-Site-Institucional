export const assessmentQuestions = [
  { id: "security-1", domain: "security", title: "Inventário de ativos e responsáveis", description: "A organização mantém inventário atualizado de sistemas, dispositivos, serviços em nuvem e responsáveis?", recommendation: "Inventarie os ativos, identifique seus responsáveis e revise as informações periodicamente, incluindo serviços contratados.", priority: "alta" },
  { id: "security-2", domain: "security", title: "Controle de acesso e autenticação", description: "As contas têm permissões mínimas, autenticação multifator e revisão periódica, incluindo desligamentos?", recommendation: "Ative autenticação multifator, remova contas sem uso e formalize concessão, revisão e revogação de acessos.", priority: "alta" },
  { id: "security-3", domain: "security", title: "Atualizações e vulnerabilidades", description: "Existe processo para identificar, priorizar e corrigir vulnerabilidades e manter os sistemas atualizados?", recommendation: "Defina responsáveis, prazos por criticidade e evidências de correção para atualizações e vulnerabilidades.", priority: "alta" },
  { id: "security-4", domain: "security", title: "Backup e recuperação", description: "Os dados críticos possuem cópias protegidas e testes documentados de restauração?", recommendation: "Mantenha cópias isoladas, defina objetivos de recuperação e execute testes de restauração com registro dos resultados.", priority: "alta" },
  { id: "security-5", domain: "security", title: "Detecção e resposta a incidentes", description: "A organização monitora eventos relevantes e possui plano de resposta com contatos, papéis e simulações?", recommendation: "Estruture registros de eventos, fluxo de triagem e plano de resposta a incidentes; teste o plano com a equipe.", priority: "alta" },
  { id: "security-6", domain: "security", title: "Conscientização e governança", description: "Há políticas aprovadas, treinamentos periódicos e acompanhamento dos riscos de segurança pela gestão?", recommendation: "Formalize políticas, capacite as equipes e acompanhe um registro de riscos com responsáveis e revisões periódicas.", priority: "média" },
  { id: "privacy-1", domain: "privacy", title: "Mapeamento do tratamento de dados", description: "Os fluxos de dados pessoais estão documentados, com finalidades, categorias, compartilhamentos e responsáveis?", recommendation: "Mapeie as atividades de tratamento e mantenha um registro atualizado das finalidades, categorias e destinatários dos dados.", priority: "alta" },
  { id: "privacy-2", domain: "privacy", title: "Finalidade e hipótese legal", description: "Cada atividade possui finalidade definida, hipótese legal avaliada e coleta limitada aos dados necessários?", recommendation: "Revise a necessidade dos dados e documente a avaliação da hipótese legal aplicável a cada finalidade de tratamento.", priority: "alta" },
  { id: "privacy-3", domain: "privacy", title: "Transparência e direitos dos titulares", description: "Existem avisos claros e canal com processo documentado para receber e tratar solicitações dos titulares?", recommendation: "Revise os avisos de privacidade e implemente um fluxo de atendimento aos titulares, com verificação de identidade e registro das respostas.", priority: "alta" },
  { id: "privacy-4", domain: "privacy", title: "Retenção e descarte", description: "Os prazos de retenção e os procedimentos de exclusão ou anonimização estão definidos e são aplicados?", recommendation: "Defina critérios de retenção por categoria de dado, registre exceções justificadas e execute descarte seguro de forma verificável.", priority: "média" },
  { id: "privacy-5", domain: "privacy", title: "Fornecedores e compartilhamentos", description: "Os fornecedores e compartilhamentos são avaliados, com responsabilidades contratuais e transferências documentadas?", recommendation: "Revise contratos e práticas de fornecedores, documente compartilhamentos e avalie requisitos aplicáveis às transferências de dados.", priority: "alta" },
  { id: "privacy-6", domain: "privacy", title: "Governança de privacidade e incidentes", description: "Há responsáveis definidos, avaliação de riscos à privacidade e processo para incidentes envolvendo dados pessoais?", recommendation: "Defina responsabilidades, avalie riscos à privacidade e documente a análise e o tratamento de incidentes envolvendo dados pessoais.", priority: "alta" },
];

export const assessmentAnswerOptions = [
  { value: "no", label: "Não implementado" }, { value: "partial", label: "Parcialmente implementado" },
  { value: "yes", label: "Implementado" }, { value: "na", label: "Não se aplica" },
];

export function calculateAssessment(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Informe as respostas da avaliação.");
  const points = { no: 0, partial: 0.5, yes: 1 }, scores = {}, actions = [];
  for (const domain of ["security", "privacy"]) {
    let total = 0, applicable = 0;
    for (const question of assessmentQuestions.filter(item => item.domain === domain)) {
      const answer = answers[question.id];
      if (!["no", "partial", "yes", "na"].includes(answer)) throw new Error("Responda todas as perguntas da avaliação.");
      if (answer === "na") continue;
      total += points[answer]; applicable++;
      if (answer !== "yes") actions.push({ id: question.id, domain, title: question.title, recommendation: question.recommendation, priority: question.priority, answer });
    }
    if (!applicable) throw new Error("Selecione ao menos um controle aplicável em cada domínio.");
    scores[domain] = Math.round(100 * total / applicable);
  }
  scores.overall = Math.round((scores.security + scores.privacy) / 2);
  actions.sort((a, b) => (a.priority === "alta" ? 0 : 1) - (b.priority === "alta" ? 0 : 1) || (a.answer === "no" ? 0 : 1) - (b.answer === "no" ? 0 : 1));
  return { scores, actions };
}
