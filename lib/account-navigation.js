export const accountSections = [
  { id: "visao-geral", title: "Visão geral", icon: "◈", description: "Suas prioridades e novidades, em um só lugar." },
  { id: "avaliacoes", title: "Avaliações", icon: "◎", description: "Consulte resultados e acompanhe a evolução das empresas avaliadas." },
  { id: "materiais", title: "Materiais", icon: "▤", description: "Recursos para preparar a avaliação com sua equipe." },
  { id: "plano", title: "Plano de ação", icon: "✓", client: true, description: "Organize recomendações, responsáveis e prazos." },
  { id: "documentos", title: "Documentos", icon: "▧", client: true, description: "Consulte os documentos e evidências das suas avaliações." },
  { id: "servicos", title: "Serviços", icon: "◇", client: true, description: "Acompanhe o andamento e os prazos dos serviços contratados." },
  { id: "atendimento", title: "Atendimento", icon: "✉", client: true, description: "Envie solicitações e acompanhe as respostas da equipe." },
  { id: "configuracoes", title: "Configurações", icon: "⚙", description: "Atualize seus dados e cuide da segurança da sua conta." },
];
export const accountHref = section => section === "visao-geral" ? "/minha-conta" : `/minha-conta/${section}`;
export const visibleAccountSections = role => accountSections.filter(section => !section.client || ["cliente", "admin"].includes(role));
