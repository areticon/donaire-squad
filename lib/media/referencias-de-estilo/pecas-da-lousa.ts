import type { ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * AS PEÇAS DA LOUSA (04/10/2026): os 14 quadros reais do Dan Martell que o
 * dono mandou como treino (docs/overlays/referencias/dan-martell/bruno-0410,
 * dm-01 a dm-14) viraram peças do editor sob medida (pecas.ts e
 * worker/remotion/src/sob-medida/pecas/lousa.tsx). Valem em dois estilos, com
 * a mesma composição e o mesmo movimento e acabamentos diferentes:
 *   - lousa (Dan Martell): tecnológico, azul vivo, vidro claro, brilho neon;
 *   - consorcio (autoridade high ticket): luxo, preto e marinho, dourado
 *     metálico com reflexo, toque de vermelho, serifa elegante no título.
 *
 * O `id` de cada elemento é o nome da peça no catálogo: o editor lê o
 * elemento e escreve a peça.
 */

type Elemento = ReferenciaDeEstilo["elementos"][number];
type Momento = ReferenciaDeEstilo["momentos"][number];

/** Os quadros reais, o que cada um mostra e a peça que o reproduz (o juiz vê as imagens). */
export const QUADROS_DA_LOUSA: Array<{ arquivo: string; peca: string; descricao: string }> = [
  { arquivo: "dan-martell/bruno-0410/dm-01.png", peca: "palavra-gigante", descricao: "palavra gigante branca em grotesca pesada (\"tudo\") com a menor por cima (\"estraga\"), sobre a gravação escurecida e desfocada" },
  { arquivo: "dan-martell/bruno-0410/dm-02.png", peca: "busca", descricao: "barra de busca de vidro claro com brilho branco, a pergunta sendo digitada com o cursor e a seta do mouse na lupa, no fundo azul profundo com brilho subindo de baixo" },
  { arquivo: "dan-martell/bruno-0410/dm-03.png", peca: "busca", descricao: "a pílula \"Thinking...\" com a esfera de partículas, no mesmo fundo azul com brilho embaixo" },
  { arquivo: "dan-martell/bruno-0410/dm-04.png", peca: "legenda-destaque", descricao: "legenda grande em negrito branco embaixo, com UMA palavra-chave sublinhada pela barra ciano" },
  { arquivo: "dan-martell/bruno-0410/dm-05.png", peca: "grade-azul", descricao: "B-roll de cinema escuro com grade de cor azul (mãos no teclado)" },
  { arquivo: "dan-martell/bruno-0410/dm-06.png", peca: "pilha-passos", descricao: "título com brilho no topo e a pilha isométrica de losangos numerados, apagados, num feixe de luz azul esverdeado" },
  { arquivo: "dan-martell/bruno-0410/dm-07.png", peca: "pilha-passos", descricao: "a mesma pilha com os passos acesos em brilho azul e a linha de chamada com o nome do passo ativo ao lado" },
  { arquivo: "dan-martell/bruno-0410/dm-08.png", peca: "marca-brilho", descricao: "ícone de marca em traço branco com brilho e o nome grande embaixo, no espaço vazio ao lado da pessoa" },
  { arquivo: "dan-martell/bruno-0410/dm-09.png", peca: "notebook", descricao: "notebook em mockup 3D inclinado mostrando uma tela de formulário, com o cursor brilhante preenchendo um campo" },
  { arquivo: "dan-martell/bruno-0410/dm-10.png", peca: "ilustracao-traco", descricao: "cérebro em traço apagado ao fundo e a frase sendo digitada por cima, em fundo azul escuro com luz azul no canto de baixo" },
  { arquivo: "dan-martell/bruno-0410/dm-11.png", peca: "chat", descricao: "caixa de chat de IA escura, de borda clara, sobre a pessoa na parte de baixo, com o pedido digitando e a barra de botões" },
  { arquivo: "dan-martell/bruno-0410/dm-12.png", peca: "material", descricao: "capa de material preta com título condensado gigante e ícone 3D com brilho azul, folhas do documento abertas em leque atrás, fundo marinho com grade sutil" },
  { arquivo: "dan-martell/bruno-0410/dm-13.png", peca: "seguir", descricao: "celular em mockup inclinado com o perfil do dono do canal e, ao lado, a pílula de vidro com o ícone da rede e a chamada para seguir" },
  { arquivo: "dan-martell/bruno-0410/dm-14.png", peca: "ferramentas", descricao: "três ícones de ferramentas em placas quadradas brancas com moldura cromada, no escuro com um feixe de luz azul" },
];

const acab = (luxo: boolean, tec: string, lux: string) => (luxo ? lux : tec);

/** Os elementos das peças da lousa, no acabamento do estilo. */
export function elementosDaLousa(luxo: boolean): Elemento[] {
  return [
    {
      id: "palavra-gigante",
      nome: "Palavra gigante do impacto",
      forma: acab(luxo, "A palavra mais forte em branco, grotesca pesada, ocupando 75% da largura, com a menor por cima dela, sobre a gravação escurecida e desfocada.", "A palavra mais forte em serifa elegante em dourado metálico com reflexo, com a menor em caixa alta espaçada por cima, sobre a gravação escurecida em marinho e desfocada."),
      animacao: "A gravação escurece e desfoca em 300 ms e a palavra chega de 122% a 100% com mola; a menor entra deslizando da esquerda. A câmera empurra devagar.",
      duracaoSeg: [1.2, 3],
      posicao916: "Centro, a palavra de borda a borda (92% da largura).",
      posicao169: "Centro, 75% da largura.",
      quando: "O impacto: a palavra dita com ênfase (\"estraga TUDO\"), uma a cada 30 a 60 s.",
    },
    {
      id: "busca",
      nome: "Barra de busca digitando",
      forma: acab(luxo, "Barra de vidro claro com brilho branco no fundo azul profundo com luz subindo de baixo; a pergunta em negrito escuro, o cursor e a seta do mouse na lupa.", "Barra de vidro fumê com fio dourado no fundo preto e marinho com luz dourada embaixo; a pergunta em marfim, cursor e lupa dourados."),
      animacao: "A barra estoura com mola, a pergunta é digitada letra a letra e a seta chega na lupa; no evento a barra vira a pílula \"Pensando...\" com a esfera de partículas.",
      duracaoSeg: [2.5, 6],
      posicao916: "Centro, 88% da largura.",
      posicao169: "Centro, 60% da largura.",
      quando: "A fala pergunta, pesquisa ou cita uma ferramenta de IA.",
    },
    {
      id: "chat",
      nome: "Caixa de chat de IA",
      forma: acab(luxo, "Caixa escura de borda clara embaixo, sobre a pessoa, com o pedido digitando e a barra (mais, pílula, nome do assistente, microfone, botão de voz no acento).", "Caixa de vidro fumê com fio dourado embaixo, sobre a pessoa, com o pedido digitando e o botão de voz em dourado metálico."),
      animacao: "Sobe com mola e o texto digita até o fim da frase; o botão de voz pulsa.",
      duracaoSeg: [3, 7],
      posicao916: "Faixa de 56% a 75% da altura, 90% da largura.",
      posicao169: "Faixa de 64% a 92% da altura, 86% da largura.",
      quando: "A fala dita um pedido para uma IA ou mostra um prompt.",
    },
    {
      id: "pilha-passos",
      nome: "Pilha 3D de passos",
      forma: acab(luxo, "Título com brilho branco no topo e losangos numerados em pilha isométrica com borda cromada; o passo dito acende em brilho azul e ganha a linha com o nome ao lado.", "Título em serifa marfim com brilho dourado e losangos de aro dourado com número em serifa dourada sobre marinho; o passo dito acende em brilho dourado suave com a linha e o nome em sem serifa fina."),
      animacao: "Os losangos caem em cascata com mola; cada passo acende na palavra dele e a linha de chamada corre até o nome.",
      duracaoSeg: [3.5, 9],
      posicao916: "Título de 10% a 18%, pilha à esquerda de 30% a 84%, nomes à direita.",
      posicao169: "Título de 7% a 15%, pilha no centro de 25% a 97%, nome à direita do passo.",
      quando: "A fala enumera passos, camadas, pilares.",
    },
    {
      id: "marca-brilho",
      nome: "Marca com brilho ao lado da pessoa",
      forma: acab(luxo, "O ícone da marca citada em branco com brilho e o nome grande embaixo, no espaço vazio do quadro.", "O ícone da marca em dourado com brilho suave e o nome em serifa dourada metálica, no espaço vazio do quadro."),
      animacao: "O ícone cresce com mola e o brilho pulsa uma vez; o nome sobe.",
      duracaoSeg: [2, 4.5],
      posicao916: "Peito, de 50% a 70% da altura.",
      posicao169: "Metade vazia ao lado da pessoa, de 17% a 65% da altura.",
      quando: "A fala cita uma marca, produto, ferramenta ou método (ícone oficial da marca; a do cliente com a logo dele).",
    },
    {
      id: "notebook",
      nome: "Notebook com a tela do processo",
      forma: acab(luxo, "Notebook em 3D inclinado, tela clara com um formulário; o cursor com brilho do acento vai a cada campo e o valor é digitado.", "Notebook em 3D com borda dourada no fundo preto e marinho; o cursor com brilho dourado preenche os campos."),
      animacao: "Sobe girando de leve; a cada evento o cursor desliza ao campo e digita.",
      duracaoSeg: [3, 8],
      posicao916: "Centro, 94% da largura, de 22% a 60% da altura.",
      posicao169: "Centro, 74% da largura.",
      quando: "A fala explica um processo ou um sistema.",
    },
    {
      id: "ilustracao-traco",
      nome: "Ilustração de traço com a frase",
      forma: acab(luxo, "Desenho grande de traço apagado (cérebro, lâmpada) no fundo azul escuro com luz azul no canto, e a frase digitada em branco por cima.", "Desenho grande de traço dourado apagado no preto e marinho com luz dourada no canto, e a frase em serifa marfim digitando."),
      animacao: "O traço se desenha em 1,8 s e a frase digita com o cursor.",
      duracaoSeg: [2.5, 5],
      posicao916: "Desenho de borda a borda, frase no centro.",
      posicao169: "Desenho no centro, 60% da largura; frase no centro.",
      quando: "A fala é sobre ideia, mente, decisão interior.",
    },
    {
      id: "material",
      nome: "Capa do material com as folhas em leque",
      forma: acab(luxo, "Capa preta com o título condensado gigante e o ícone de neon no acento, folhas do material abrindo em leque atrás, fundo marinho com grade fina.", "Capa preta em metal escovado com fio dourado, título em serifa dourada metálica, fita vermelha de marcador, ícone dourado e folhas marfim em leque atrás."),
      animacao: "A capa sobe com mola, as folhas abrem em leque e o ícone acende.",
      duracaoSeg: [2.5, 6],
      posicao916: "Centro, capa com 62% da largura.",
      posicao169: "Centro, capa com 29% da largura e folhas dos lados.",
      quando: "A fala oferece um material, e-book, guia ou a oferta.",
    },
    {
      id: "seguir",
      nome: "Celular com o perfil e a chamada",
      forma: acab(luxo, "Celular inclinado com o perfil do PRÓPRIO cliente (o @, a foto ou logo dele) e, ao lado, a pílula de vidro com o ícone da rede e a chamada.", "Celular de aro dourado com o perfil do PRÓPRIO cliente e a pílula de vidro fumê com fio dourado e a chamada em marfim."),
      animacao: "O celular entra da esquerda com mola e a pílula se abre da esquerda para a direita.",
      duracaoSeg: [3, 6],
      posicao916: "Celular de 8% a 58% da altura, pílula embaixo.",
      posicao169: "Celular no terço esquerdo, pílula à direita.",
      quando: "A chamada para seguir no fechamento; só com o @ do cliente.",
    },
    {
      id: "ferramentas",
      nome: "Ferramentas em placas",
      forma: acab(luxo, "Os ícones oficiais das ferramentas citadas em placas brancas com moldura cromada, no escuro com o feixe de luz azul.", "Os ícones oficiais em placas marfim com moldura dourada, no preto com o feixe de luz dourada."),
      animacao: "Cada placa entra com mola e um leve giro na palavra que cita a ferramenta.",
      duracaoSeg: [2.5, 7],
      posicao916: "Coluna no centro (2x2 com quatro).",
      posicao169: "Linha no centro.",
      quando: "A fala cita 2 a 4 ferramentas ou apps.",
    },
    {
      id: "legenda-destaque",
      nome: "Legenda com a palavra sublinhada (automática)",
      forma: acab(luxo, "A frase em negrito branco embaixo e UMA palavra sublinhada pela barra do acento.", "A frase em negrito branco embaixo e UMA palavra sublinhada pela barra dourada metálica."),
      animacao: "A frase aparece inteira e a barra corre sob a palavra quando ela é dita.",
      duracaoSeg: [0.5, 4],
      posicao916: "Faixa de 66% a 74% da altura.",
      posicao169: "Faixa de 73% a 84% da altura.",
      quando: "Toda a fala sem tela cheia (o código põe; o editor não escreve).",
    },
  ];
}

/** Os momentos da fala que pedem cada peça. */
export function momentosDaLousa(luxo: boolean): Momento[] {
  return [
    { quando: "A pessoa diz a palavra do impacto (\"isso estraga TUDO\")", edicao: "palavra-gigante com \"tudo\" e \"estraga\" por cima; a gravação escurece e desfoca; volta seca para a pessoa." },
    { quando: "Ela pergunta ou cita uma pesquisa ou uma IA", edicao: "busca com a pergunta digitando; se a IA responde, o evento vira \"Pensando...\"; volta para a pessoa." },
    { quando: "Ela dita o que pediria para uma IA", edicao: "chat embaixo, sobre a pessoa, com o pedido digitando no ritmo da fala." },
    { quando: "Ela enumera 4 passos", edicao: "pilha-passos com o título e os 4 losangos; cada um acende na palavra dele com o nome ao lado." },
    { quando: "Ela cita uma ferramenta ou empresa (Claude, Notion, Google Drive)", edicao: "marca-brilho com o ícone oficial ao lado dela; se cita 2 a 4, ferramentas em placas." },
    { quando: "Ela explica o processo ou o sistema da empresa", edicao: "notebook com o formulário do processo preenchendo campo a campo." },
    { quando: "Ela fala da mente, de uma ideia, da decisão", edicao: "ilustracao-traco com o cérebro (ou a lâmpada) e a frase digitando." },
    { quando: "Ela oferece o material ou a oferta", edicao: luxo ? "material com a capa em metal escovado, título dourado e folhas em leque." : "material com a capa preta, título gigante e folhas em leque." },
    { quando: "O fechamento com a chamada para seguir", edicao: "seguir com o perfil do próprio cliente e a chamada dita." },
  ];
}
