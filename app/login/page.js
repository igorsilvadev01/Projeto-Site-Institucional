import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
