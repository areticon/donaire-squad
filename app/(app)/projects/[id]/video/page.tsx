import { redirect } from "next/navigation";

/**
 * A tela do vídeo saiu de cena em 02/09.
 *
 * O envio, as escolhas de edição (estilo, trilha, termos), o piloto automático
 * e o acompanhamento em tempo real passaram para o Gestor de Conteúdo, que é
 * onde o resultado sempre esteve. O pedido do Bruno foi literal: "a tela do
 * vídeo é ruim, todo o processo deve acontecer na tela de gestor de conteúdo,
 * em tempo real".
 *
 * A rota continua existindo, e redireciona, porque há links guardados por aí
 * (favoritos, o botão antigo de "Abrir o Gestor", históricos de navegador) e um
 * 404 aqui seria a mesma sensação de sumiço que este trabalho existe para
 * acabar. Dois pontos importantes de não voltar atrás: o piloto automático mora
 * agora em `EsteiraDoVideo`, e ter DUAS telas rodando o piloto ao mesmo tempo
 * dispararia cada etapa duas vezes.
 */
export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/live`);
}
