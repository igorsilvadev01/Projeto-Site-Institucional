import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { SESSION_COOKIE, sessionUser, adminAccessAllowed, adminMfaRequired } from "@/lib/server/auth";
import { portalData, adminSummary } from "@/lib/server/portal";
import { accountSections } from "@/lib/account-navigation";
import AccountPanel from "@/components/AccountPanel";
import AccountSettings from "@/components/AccountSettings";
import MemberDashboard from "@/components/MemberDashboard";
import AdminOverview from "@/components/AdminOverview";
import MemberOverview from "@/components/MemberOverview";

export default async function AccountWorkspace({ section = "visao-geral", selectedAssessment = "" }) {
  const user = sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  if (process.env.NODE_ENV === "production" && !user.emailVerified && section !== "configuracoes") redirect("/minha-conta/configuracoes?seguranca=email");
  if (user.role === "admin" && !adminAccessAllowed(user) && section !== "configuracoes") redirect("/minha-conta/configuracoes?seguranca=2fa");
  const current = accountSections.find(item => item.id === section);
  if (!current) notFound();
  if (current.client && !["cliente", "admin"].includes(user.role)) redirect("/minha-conta");
  const data = portalData(user);
  return <AccountPanel user={{ ...user }} section={section} unreadCount={data.requests.filter(item => item.unread).length}>
    {section === "configuracoes" ? <AccountSettings user={{ ...user, adminMfaRequired: adminMfaRequired() }} />
      : section === "visao-geral" && user.role === "admin" ? <><AdminOverview summary={adminSummary(user)} compact />{(data.assessments.length > 0 || data.requests.some(item => item.unread) || data.services.some(item => item.status === "andamento")) && <section className="account-admin-priorities" aria-label="Suas prioridades"><h2>Suas avaliações e prioridades</h2><MemberOverview user={user} data={data} /></section>}</>
      : <MemberDashboard user={user} data={data} section={section} selectedAssessment={selectedAssessment} />}
  </AccountPanel>;
}
