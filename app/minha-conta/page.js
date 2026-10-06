import AccountWorkspace from "@/components/AccountWorkspace";

export const runtime = "nodejs";
export const metadata = { title: "Minha conta", robots: { index: false, follow: false } };

export default function AccountPage() {
  return <AccountWorkspace />;
}
