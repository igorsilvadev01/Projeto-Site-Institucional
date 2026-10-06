import EmailConfirmation from "@/components/EmailConfirmation";

export const metadata = { title: "Confirmar cadastro", robots: { index: false, follow: false } };

export default function ConfirmationPage() {
  return <EmailConfirmation />;
}
