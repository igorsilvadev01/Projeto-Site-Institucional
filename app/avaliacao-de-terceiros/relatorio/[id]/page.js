import AssessmentReport from "@/components/AssessmentReport";
import "../../assessment.css";
export const metadata = { title:"Relatório da avaliação", robots:{index:false,follow:false}, referrer:"no-referrer" };
export default async function ReportPage({params}) {
  const {id} = await params;
  return <main id="conteudo" className="assessment-report-page"><AssessmentReport id={id} /></main>;
}
