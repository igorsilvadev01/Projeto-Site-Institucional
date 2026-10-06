import { PageHero, FAQ } from "@/components/Editorial";
import ContactForm from "@/components/ContactForm";
import { getPublicContact, interests } from "@/lib/site";
import { trainingCatalog } from "@/lib/content";

export const metadata = { title: "Contato", description: "Solicite uma proposta de privacidade, segurança, avaliação de terceiros, auditoria ou capacitação para sua organização." };

export default async function ContactPage({ searchParams }) {
  const { interesse, formato } = await searchParams;
  const training = trainingCatalog.find(item => item.id === formato);
  const initialInterest = interests.some(([value]) => value === interesse) ? interesse : "geral";
  const contact = getPublicContact();
  return <main id="conteudo"><PageHero eyebrow="Contato / Vamos conversar" title="Toda evolução começa com uma boa conversa." description="Conte o momento da sua organização, os desafios e as prioridades. Vamos entender o seu contexto para construir uma proposta com escopo claro." />
    <section className="section"><div className="shell contact-layout"><aside className="contact-aside"><p className="page-kicker">Um próximo passo com clareza</p><h2>Seu desafio orienta a conversa.</h2><p>Você pode solicitar uma proposta, combinar uma demonstração, planejar um treinamento ou tirar dúvidas sobre os serviços.</p><ol className="contact-steps"><li><strong>Conte o contexto</strong><span>Necessidade, áreas envolvidas e objetivo.</span></li><li><strong>Alinhe as prioridades</strong><span>Escopo, entregáveis e condições de trabalho.</span></li><li><strong>Defina o caminho</strong><span>Uma proposta compatível com sua organização.</span></li></ol>
      {(contact.email || contact.whatsapp || contact.linkedin) && <div className="contact-channels"><h3>Outros canais</h3>{contact.email && <a href={`mailto:${contact.email}`}><span>E-mail</span>{contact.email} ↗</a>}{contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer"><span>Atendimento</span>Conversar pelo WhatsApp ↗</a>}{contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer"><span>Rede profissional</span>Acompanhar no LinkedIn ↗</a>}</div>}
      <div className="quote-panel"><p>Solicitações sobre seus dados pessoais também podem ser enviadas pelo formulário. Selecione a opção correspondente.</p></div>
    </aside><ContactForm key={`${initialInterest}-${training?.id || ""}`} initialInterest={initialInterest} whatsappUrl={contact.whatsapp} initialMessage={training ? `Tenho interesse em ${training.title.toLowerCase()}.\n\nPúblico: \nPeríodo desejado: \nObjetivo: ` : ""} /></div></section>
    <section className="section section--tint"><div className="shell narrow"><FAQ items={[{question:"O envio do formulário já confirma uma contratação ou reunião?",answer:"Não. O envio registra seu interesse e gera um protocolo. Escopo, agenda, valores e condições são definidos em uma conversa e formalizados na proposta."},{question:"Quais informações ajudam a preparar uma proposta?",answer:"Informe o serviço de interesse, a necessidade principal e o objetivo esperado. Para capacitação, acrescente o público e o período desejado. Não é necessário enviar informações confidenciais no primeiro contato."}]} /></div></section>
  </main>;
}
