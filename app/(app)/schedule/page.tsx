import { redirect } from "next/navigation";

/** Rota reservada: por agora envia para a lista de projetos (agenda por projeto em breve). */
export default function SchedulePage() {
  redirect("/projects");
}
