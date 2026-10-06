import AccountWorkspace from "@/components/AccountWorkspace";

export const runtime = "nodejs";
export const metadata = { title: "Minha conta", robots: { index: false, follow: false } };

export default async function AccountSectionPage({ params, searchParams }) {
  const { section } = await params;
  const query = await searchParams;
  return <AccountWorkspace section={section} selectedAssessment={typeof query.avaliacao === "string" ? query.avaliacao.slice(0, 36) : ""} />;
}
