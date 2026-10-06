import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Redefinir senha", robots: { index: false, follow: false } };

export default function ResetPage() {
  return <AuthForm mode="redefinir" />;
}
