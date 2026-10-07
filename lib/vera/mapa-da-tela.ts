/**
 * ONDE FICA CADA COISA NA TELA (04/10/2026), para a Vera responder "como eu
 * faço" com o caminho certo e o link, quando a pessoa só quer saber.
 *
 * Conferido contra as telas de hoje (components/ui/project-nav.tsx,
 * components/projects/configuracao-do-projeto.tsx, components/editorial/
 * regras-do-projeto.tsx). Quem mudar uma dessas telas muda aqui também: a Vera
 * mandando a pessoa para um botão que não existe é pior que ela não saber.
 */
export function mapaDaTela(projectId: string): string {
  const p = `/projects/${projectId}`;
  return [
    `- Regras do projeto: menu Treinamento, seção "Regras do projeto" (${p}/training#regras-do-projeto). Cada regra tem os botões Editar (vira "Salvar e aprovar"), Aprovar, Recusar, Desligar e Religar; "Escrever uma regra minha" cria uma nova, que já nasce valendo. As propostas do Roberto nascem do estudo das referências, em Linha editorial. Só o dono da conta mexe nas regras.`,
    `- Nicho e público: Configurações, aba "Marca e voz", bloco "Sobre o que você fala" (${p}/settings?aba=marca), botão Salvar.`,
    `- Tom de voz: Configurações, aba "Marca e voz", bloco "Como você soa" (${p}/settings?aba=marca).`,
    `- Cores da marca: Configurações, aba "Marca e voz", bloco "Suas cores" (${p}/settings?aba=marca).`,
    `- Estilo dos posts (o chat para escrever como quer as artes, a biblioteca de estilos e o book de modelos): Configurações, aba "Estilo dos posts" (${p}/settings?aba=modelos).`,
    `- Estilo de edição dos cortes, capa do vídeo, trilha e a semana padrão (o que sai em cada dia): Configurações, aba "Vídeo e semana" (${p}/settings?aba=video). As redes de cada dia se escolhem na Nova campanha.`,
    `- Links do cliente (site, loja, WhatsApp, agenda): Configurações, aba "Seus links" (${p}/settings?aba=links).`,
    `- Linha editorial (os pilares) e o setup inteiro: menu "Editar setup" (${p}/setup). Perfis de referência e o estudo deles: menu "Linha editorial" (${p}/linha-editorial).`,
    `- Peças da semana (aprovar, editar, agendar, publicar, refazer): menu Gestor (${p}/live). Clicar no card abre o chat da peça, onde dá para pedir ajuste de texto ou de arte; a lista de posts fica em Posts (${p}/posts).`,
    `- Começar campanha nova ou mandar vídeo: menu Criar (${p}/criar).`,
    `- Resultados dos posts: menu Resultados (${p}/analytics).`,
    `- Conversar com o squad: o escritório fica no Gestor; anda até a mesa de um agente e clica.`,
    `- A memória do projeto (tudo o que foi pedido, aprovado, recusado e decidido, em notas ligadas): menu "Segundo cérebro" (${p}/cerebro). Clicar numa nota abre o texto, com Corrigir e Apagar (só o dono).`,
  ].join("\n");
}
