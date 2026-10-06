import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Criar conta", robots: { index: false, follow: false } };

export default function RegistrationPage() {
  return <AuthForm mode="cadastro" />;
}
