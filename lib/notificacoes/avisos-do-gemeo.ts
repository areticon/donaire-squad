import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { emailDoGemeo } from "@/lib/email/avisos";
import { MOTIVO_SEM_VAGA, avatarSemVaga, motivoDoAvatar, type CadastroDoGemeo } from "@/lib/media/gemeo";
import { hojeDoLembrete, linkVencido, prazoFalado } from "@/lib/media/gemeo-situacao";
import { enderecoDaPlataforma, notificar } from "@/lib/notificacoes";

/**
 * OS AVISOS DO GÊMEO DIGITAL (03/10/2026).
 *
 * A queixa do Bruno, depois de gravar o treino: "Onde entro para aprovar o
 * gêmeo? Não recebi notificação." O gêmeo treinado na HeyGen para no estado
 * "consentimento" até a própria pessoa confirmar pela câmera num link de
 * 24 h, e nada avisava.
 *
 * Como os avisos do vídeo, este nasce do ESTADO gravado, e não do caminho: o
 * passo do cron chama `avisarGemeo` depois de cuidar do avatar, a cada passada,
 * e a chave de cada fato garante um aviso só (lib/notificacoes):
 *
 *   gemeo-consentimento:<projeto>:<grupo>   o primeiro pedido de confirmação;
 *   gemeo-lembrete:<projeto>:<grupo>        faltam 3 h e ninguém confirmou (uma vez);
 *   gemeo-pronto:<projeto>:<origem>         o gêmeo treinado ficou pronto;
 *   gemeo-falhou:<projeto>:<origem>         o gerador recusou o treino.
 *
 * O LINK RENOVADO NÃO AVISA DE NOVO. O passo renova o link vencido sozinho, a
 * cada 23 h; avisar a cada renovação viraria um e-mail por dia para quem
 * decidiu não confirmar. O aviso leva à tela do gêmeo, que sempre mostra o
 * link que vale agora (ou o "Pedir um link novo").
 *
 * PRONTO E FALHOU SÓ NA HORA: o passo também olha cadastros antigos (voz a
 * apagar, por exemplo), e um gêmeo pronto há semanas não é notícia. Só avisa
 * o que mudou nos últimos 30 minutos.
 *
 * Nunca lança (notificar já não lança; a leitura do projeto vai no try).
 */

const RECENTE_MS = 30 * 60_000;

export async function avisarGemeo(projectId: string, c: CadastroDoGemeo | null, agora: Date = new Date()): Promise<void> {
  const a = c?.avatar;
  if (!a || a.gerador !== "heygen") return;
  try {
    const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, userId: true } });
    if (!projeto) return;
    // Quem gravou o treino é quem confirma (o rosto é dele); sem registro, o dono.
    const userId = c?.treino?.userId ?? projeto.userId;
    const caminho = `/projects/${projectId}/gemeo`;
    const link = `${enderecoDaPlataforma()}${caminho}`;
    // A confirmação cai direto no "Último passo" da tela.
    const ultimo = `${caminho}#ultimo-passo`;
    const recente = agora.getTime() - new Date(a.desde).getTime() < RECENTE_MS;

    if (a.estado === "consentimento" && a.grupoId && !linkVencido(a, agora.getTime())) {
      const prazo = a.consentimentoAte ? prazoFalado(a.consentimentoAte, agora) : null;
      const primeiro = await notificar({
        userId,
        projectId,
        tipo: "gemeo",
        titulo: "Falta um passo: confirme o seu gêmeo",
        texto: `${projeto.name}: o gerador de vídeo pede que você confirme, pela câmera, que autoriza o seu gêmeo. Leva 30 segundos${prazo ? `, e o link vale até ${prazo}` : ""}.`,
        link: ultimo,
        chave: `gemeo-consentimento:${projectId}:${a.grupoId}`,
        email: (dono) => emailDoGemeo({ momento: "consentimento", nome: dono.nome, projeto: projeto.name, link: `${enderecoDaPlataforma()}${ultimo}`, prazo }),
      });
      // O lembrete não sai na mesma passada do primeiro aviso (link que já
      // nasceu perto de vencer): seriam dois e-mails iguais no mesmo minuto.
      if (!primeiro.nova && hojeDoLembrete(a, agora.getTime())) {
        await notificar({
          userId,
          projectId,
          tipo: "gemeo",
          titulo: "O link do seu gêmeo vence em poucas horas",
          texto: `${projeto.name}: ainda falta confirmar pela câmera. O link vale até ${prazo}.`,
          link: ultimo,
          chave: `gemeo-lembrete:${projectId}:${a.grupoId}`,
          email: (dono) => emailDoGemeo({ momento: "lembrete", nome: dono.nome, projeto: projeto.name, link: `${enderecoDaPlataforma()}${ultimo}`, prazo }),
        });
      }
      return;
    }

    if (a.estado === "pronto" && recente) {
      await notificar({
        userId,
        projectId,
        tipo: "gemeo-aviso",
        titulo: "Seu gêmeo digital está pronto",
        texto: `${projeto.name}: o gêmeo treinado com os seus gestos está pronto, e os próximos vídeos saem por ele.`,
        link: caminho,
        chave: `gemeo-pronto:${projectId}:${a.origem}`.slice(0, 300),
        email: (dono) => emailDoGemeo({ momento: "pronto", nome: dono.nome, projeto: projeto.name, link }),
      });
      return;
    }

    // SEM VAGA (05/10): não é o vídeo da pessoa; é a conta da Demandou na
    // HeyGen sem vaga de gêmeo. Só o sino, sem e-mail: o e-mail de "falhou"
    // manda gravar de novo, e aqui não há nada para ela refazer.
    if (a.estado === "falhou" && recente && avatarSemVaga(a)) {
      await notificar({
        userId,
        projectId,
        tipo: "gemeo-aviso",
        titulo: "O seu gêmeo treinado espera uma vaga",
        texto: `${projeto.name}: ${MOTIVO_SEM_VAGA} Enquanto isso, os vídeos saem pela imagem do vídeo de treino.`,
        link: caminho,
        chave: `gemeo-sem-vaga:${projectId}:${a.origem}`.slice(0, 300),
      });
      return;
    }

    if (a.estado === "falhou" && recente) {
      const motivo = motivoDoAvatar(a);
      await notificar({
        userId,
        projectId,
        tipo: "gemeo-aviso",
        titulo: "O gerador não treinou o seu gêmeo",
        texto: `${projeto.name}: ${motivo ?? "o vídeo de treino foi recusado."} Os vídeos continuam saindo pela imagem do vídeo de treino.`,
        link: caminho,
        chave: `gemeo-falhou:${projectId}:${a.origem}`.slice(0, 300),
        email: (dono) => emailDoGemeo({ momento: "falhou", nome: dono.nome, projeto: projeto.name, link, motivo }),
      });
    }
  } catch (e) {
    console.error(`[gemeo][${projectId}] aviso:`, e);
  }
}

/**
 * O AVISO À EQUIPE quando a HeyGen recusa criar um gêmeo por falta de vaga
 * (05/10/2026, "resource_limit_reached"). A pessoa lê só que a equipe foi
 * avisada; aqui vai o erro técnico, o projeto e a conta, para quem administra
 * a HeyGen liberar (apagar um gêmeo sem uso) ou comprar vaga. O passo chama
 * uma vez por vídeo de treino (`equipeAvisadaEm` no cadastro). Nunca lança.
 */
export async function avisarEquipeSemVaga(projectId: string, erroTecnico: string): Promise<void> {
  try {
    const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, user: { select: { email: true } } } });
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    console.error(`[gemeo][${projectId}] SEM VAGA na HeyGen (equipe avisada): ${erroTecnico}`);
    for (const a of admins) {
      if (!a.email) continue;
      await enviarEmail({
        para: a.email,
        assunto: `Gêmeo sem vaga na HeyGen: ${projeto?.name ?? projectId}`,
        texto: [
          "A HeyGen recusou criar um gêmeo treinado por limite de recursos da conta (resource_limit_reached).",
          "",
          `Projeto: ${projeto?.name ?? "(sem nome)"} (${enderecoDaPlataforma()}/projects/${projectId}/gemeo)`,
          `Conta: ${projeto?.user?.email ?? "(sem e-mail)"}`,
          `Erro técnico: ${erroTecnico.slice(0, 600)}`,
          "",
          "O cliente vê: \"" + MOTIVO_SEM_VAGA + "\"",
          "Os vídeos dele seguem pela imagem do vídeo de treino. O passo tenta criar o gêmeo de novo a cada 6 horas, e a tela do gêmeo tem o botão \"Tentar de novo\".",
          "Para liberar: apagar na HeyGen um gêmeo sem uso (GET /v3/avatars lista os da conta) ou subir o plano.",
        ].join("\n"),
      }).catch(() => false);
    }
  } catch (e) {
    console.error(`[gemeo][${projectId}] aviso de falta de vaga à equipe:`, e);
  }
}
