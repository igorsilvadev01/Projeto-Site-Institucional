import NewsletterAction from "@/components/NewsletterAction";
export const metadata = { title: "Cancelar assinatura", robots: { index: false, follow: false } };
export default function CancelPage() { return <main id="conteudo" className="section section--tint"><div className="shell narrow"><NewsletterAction action="cancelar" /></div></main>; }
