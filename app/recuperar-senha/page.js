import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Recuperar senha", robots: { index: false, follow: false } };

export default function RecoveryPage() {
  return <AuthForm mode="recuperar" />;
}
