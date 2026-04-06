import { redirect } from "next/navigation";

/** Configurações de redes ficam em cada projeto: /projects/[id]/settings */
export default function SettingsRedirectPage() {
  redirect("/projects");
}
