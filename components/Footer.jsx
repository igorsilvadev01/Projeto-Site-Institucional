import Link from "next/link";
import Brand from "@/components/Brand";
import { getPublicContact, navigation } from "@/lib/site";

export default function Footer() {
  const contact = getPublicContact();
  return <footer className="site-footer"><div className="shell footer-grid">
    <div className="footer-brand"><Brand inverse /><p>Governança de dados, privacidade e segurança da informação como parte da estratégia.</p><span className="footer-signature">Conhecimento. Método. Confiança.</span></div>
    <div><h2>Explore a Plataforma de Privacidade</h2><nav aria-label="Navegação do rodapé">{navigation.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav></div>
    <div><h2>Vamos conversar</h2><p>Conte o momento da sua organização. Juntos, definimos o próximo passo.</p><Link className="footer-contact" href="/contato">Solicitar uma proposta ↗</Link>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>}{contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}</div>
  </div><div className="shell footer-bottom"><span>© {new Date().getFullYear()} · Projeto de portfólio.</span><div><Link href="/politica-de-privacidade">Política de Privacidade</Link><Link href="/termos-de-uso">Termos de Uso</Link></div><a href="#conteudo">Voltar ao início ↑</a></div></footer>;
}
