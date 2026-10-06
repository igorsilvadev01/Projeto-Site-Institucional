import Link from "next/link";
import Standards from "@/components/Standards";
import { SectionHeading, ServiceCard, Steps, CtaBand, FAQ } from "@/components/Editorial";
import NewsletterForm from "@/components/NewsletterForm";
import ServicesCarousel from "@/components/ServicesCarousel";

export const metadata = {
  title: "Plataforma de Privacidade — Governança, Privacidade e Segurança",
  description:
    "Governança, privacidade e segurança como parte da estratégia. Explore uma demonstração de governança, privacidade e segurança.",
};

export default function HomePage() {
  return (
    <main className="model model-three" id="conteudo">

      <section className="m3-hero" aria-labelledby="hero-title">
        <div className="shell m3-layout">
          <div className="m3-side-index" aria-hidden="true">
            <span>01</span>
            <i />
            <small>PORTFÓLIO<br />DIGITAL</small>
          </div>

          <div className="m3-main">
            <p className="eyebrow"><i /> Governança para um ambiente digital confiável</p>
            <h1 id="hero-title">
              Privacidade e segurança<br />como parte da <span>estratégia.</span>
            </h1>
            <p className="hero-lead">
              Estruture conformidade, acompanhe riscos de terceiros e desenvolva uma
              cultura de segurança com uma abordagem contínua e mensurável.
            </p>
            <div className="hero-actions">
              <Link className="button button--navy" href="/contato?interesse=demonstracao">Agendar demonstração</Link>
              <a className="text-link" href="#produtos">Conhecer soluções <span aria-hidden="true">↗</span></a>
            </div>
          </div>

          <aside className="m3-aside" aria-label="Soluções em destaque">
            <div className="m3-aside__brand">
              <div className="portfolio-hero-art" aria-hidden="true"><span className="portfolio-hero-art__index">01 / PRIMEIRO PROJETO</span><strong>Ideias que<br />ganham forma.</strong><span className="portfolio-hero-art__caption">DESIGN · CÓDIGO · EXPERIÊNCIA</span></div>
              <p>Governança · Privacidade · Segurança</p>
            </div>

            <div className="hero-services">
              <p className="hero-services__eyebrow">Soluções para o seu negócio</p>
              <ServicesCarousel compact label="Serviços em destaque">
                <article className="hero-service"><span>01 / Privacidade</span><h2>Proteção de dados na prática.</h2><p>Consultoria em privacidade e DPO as a Service para organizar processos e apoiar a adequação à LGPD.</p><Link href="/consultoria-em-privacidade">Conhecer a consultoria <span aria-hidden="true">↗</span></Link></article>
                <article className="hero-service"><span>02 / Terceiros</span><h2>Conheça os riscos dos seus fornecedores.</h2><p>Avalie segurança e privacidade com questionários, evidências e um plano de ação priorizado.</p><Link href="/avaliacao-de-terceiros">Avaliar um fornecedor <span aria-hidden="true">↗</span></Link></article>
                <article className="hero-service"><span>03 / Educação</span><h2>Pessoas preparadas fazem a diferença.</h2><p>Treinamentos, palestras e simulações de incidentes para transformar conhecimento em prática.</p><Link href="/hub-educacional">Explorar o Hub Educacional <span aria-hidden="true">↗</span></Link></article>
                <article className="hero-service"><span>04 / Auditorias</span><h2>Clareza para evoluir seus controles.</h2><p>Auditorias e avaliações para identificar lacunas, organizar evidências e orientar melhorias.</p><Link href="/auditorias-e-avaliacoes">Conhecer as avaliações <span aria-hidden="true">↗</span></Link></article>
              </ServicesCarousel>
            </div>
          </aside>
        </div>
      </section>

      <Standards />

      <section className="section" id="produtos"><div className="shell">
        <SectionHeading eyebrow="02 / Nossas soluções" title="Da intenção à prática. Da conformidade à confiança." description="Frentes complementares para organizar processos, entender riscos e preparar pessoas. Comece pela necessidade da sua organização e evolua com um plano claro." />
        <ServicesCarousel>
          <ServiceCard number="01" title="Consultoria em Privacidade" description="DPO as a Service e adequação à LGPD, conectando a proteção de dados à rotina do negócio."><ul className="feature-list"><li>Diagnóstico e plano de ação</li><li>Mapeamento de dados, ROPA e LIA</li><li>Políticas e apoio ao encarregado</li></ul><Link className="card-link" href="/consultoria-em-privacidade">Estruturar a privacidade <span>↗</span></Link></ServiceCard>
          <ServiceCard number="02" title="Avaliação de Terceiros" description="Uma visão organizada de segurança e privacidade para orientar a gestão de riscos na cadeia de fornecedores."><ul className="feature-list"><li>Security Score e Privacy Score orientativos</li><li>Questionário e envio de evidências</li><li>Relatório e plano de ação priorizado</li></ul><Link className="card-link" href="/avaliacao-de-terceiros">Avaliar um fornecedor <span>↗</span></Link></ServiceCard>
          <ServiceCard number="03" title="Hub Educacional" description="Conhecimento que chega à operação. Experiências de aprendizagem adaptadas à realidade das equipes."><ul className="feature-list"><li>Palestras, minicursos e treinamentos</li><li>Tabletop de incidentes de segurança</li><li>Tabletop de continuidade de negócios</li></ul><Link className="card-link" href="/hub-educacional">Desenvolver sua equipe <span>↗</span></Link></ServiceCard>
          <ServiceCard number="04" title="Auditorias e Avaliações" description="Diagnósticos estruturados para identificar lacunas, reunir evidências e orientar a evolução dos controles."><ul className="feature-list"><li>Implementação e auditoria interna — ISO 27001, ISO 27701 e ISO 42001</li><li>ITGC, Cibersegurança, CIS Controls e NIST CSF</li><li>Preparação e implementação para PCI DSS</li></ul><Link className="card-link" href="/auditorias-e-avaliacoes">Conhecer os escopos <span>↗</span></Link></ServiceCard>
        </ServicesCarousel>
      </div></section>
      <section className="section section--navy"><div className="shell split-layout"><div><p className="page-kicker">03 / Nosso olhar</p><h2>Proteção de dados é uma construção contínua.</h2><p>Documentos importam. A forma como as pessoas tomam decisões, cuidam das informações e respondem a riscos também. Nosso trabalho conecta esses pontos.</p><Link className="button button--light" href="/sobre">Conheça a Plataforma de Privacidade ↗</Link></div><div className="principle-list"><article><span>01</span><div><h3>Contexto antes de receita</h3><p>Escopo definido a partir dos processos, riscos e prioridades da organização.</p></div></article><article><span>02</span><div><h3>Evidências que orientam</h3><p>Diagnóstico documentado e plano de ação com responsáveis e próximos passos.</p></div></article><article><span>03</span><div><h3>Pessoas no centro</h3><p>Linguagem acessível e capacitação para incorporar os cuidados à rotina.</p></div></article></div></div></section>
      <section className="section"><div className="shell"><SectionHeading eyebrow="04 / Como trabalhamos" title="Clareza em cada etapa." description="Um caminho que respeita seu ponto de partida e transforma necessidades em prioridades de trabalho." /><Steps items={[
        {title:"Entender",description:"Conversamos sobre sua operação, seus objetivos e os desafios que precisam de atenção."},
        {title:"Diagnosticar",description:"Avaliamos processos, práticas e evidências para reconhecer riscos e oportunidades de melhoria."},
        {title:"Estruturar",description:"Definimos escopo, entregáveis e um plano de ação alinhado à sua realidade."},
        {title:"Evoluir",description:"Acompanhamos a execução e apoiamos pessoas para sustentar as melhorias ao longo do tempo."},
      ]} /></div></section>
      <section className="section section--tint"><div className="shell split-layout"><div><p className="page-kicker">05 / Newsletter</p><h2>Uma pausa para pensar o próximo passo.</h2><p>Inscreva-se para acompanhar novas edições sobre governança, privacidade e segurança da informação. A assinatura só é ativada após sua confirmação por e-mail.</p><Link className="text-link" href="/newsletter">Conhecer a newsletter ↗</Link></div><NewsletterForm /></div></section>
      <section className="section"><div className="shell narrow"><SectionHeading eyebrow="Perguntas frequentes" title="Vamos tornar o começo mais simples." /><FAQ items={[
        {question:"Por onde minha empresa deve começar?",answer:"Se o ponto de partida ainda não está claro, uma conversa inicial ajuda a definir um diagnóstico e priorizar as frentes de privacidade, segurança, terceiros ou capacitação. Não é necessário contratar todas as soluções de uma vez."},
        {question:"Os serviços são adaptados ao meu negócio?",answer:"O escopo deve considerar porte, setor, processos, tipos de dados tratados e maturidade dos controles. A proposta descreve atividades, entregáveis, responsabilidades e condições de acompanhamento."},
        {question:"Uma avaliação equivale a uma certificação?",answer:"Não. Diagnósticos, scores orientativos e auditorias internas apoiam a identificação de melhorias. Não representam certificação, garantia de conformidade integral ou avaliação formal de um organismo certificador."},
      ]} /></div></section>
      <CtaBand title="Qual é o próximo passo da sua organização?" description="Conte o seu desafio e construa um caminho de governança, privacidade e segurança com a Plataforma de Privacidade." href="/contato" label="Solicitar uma proposta ↗" />
    </main>
  );
}
