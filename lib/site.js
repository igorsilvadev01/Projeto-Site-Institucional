export const navigation = [
  { href: "/", label: "Início" },
  { href: "/consultoria-em-privacidade", label: "Privacidade" },
  { href: "/avaliacao-de-terceiros", label: "Terceiros" },
  { href: "/hub-educacional", label: "Hub Educacional" },
  { href: "/auditorias-e-avaliacoes", label: "Auditorias" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

export const interests = [
  ["geral", "Quero conhecer as soluções"],
  ["dpo", "DPO as a Service"],
  ["privacidade", "Adequação à LGPD"],
  ["terceiros", "Avaliação de Terceiros"],
  ["treinamento", "Palestras e treinamentos"],
  ["auditoria", "Auditorias e Avaliações"],
  ["demonstracao", "Agendar uma demonstração"],
  ["dados-pessoais", "Solicitação sobre meus dados pessoais"],
];

// Preencha apenas com edições realmente publicadas e seus respectivos links.
export const newsletterEditions = [];

function safeExternalUrl(value) {
  if (!value) return "";
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}

export function getPublicContact() {
  const phone = (process.env.NEXT_PUBLIC_WHATSAPP || "").replace(/\D/g, "");
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    whatsapp: phone.length >= 10 && phone.length <= 15 ? `https://wa.me/${phone}` : "",
    linkedin: safeExternalUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL),
    founder: process.env.NEXT_PUBLIC_FOUNDER_NAME || "",
  };
}
