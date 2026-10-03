import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * NATIVO DO TIKTOK, CONTEÚDO COM CARA DE USUÁRIO (03/10/2026).
 *
 * O que a pesquisa deu: o que funciona parece post orgânico, não comercial:
 * celular vertical, selfie, ambiente real, voz direta. Gancho nos primeiros 3
 * s com movimento, contradição ou texto na tela em até 2 s (guia de criação
 * do próprio TikTok: proposta nos 3 primeiros segundos, gancho até o 6º,
 * texto sobreposto para dar contexto sem som). Os formatos que mais rendem:
 * resposta a comentário (o balão branco arredondado preso no topo), tela
 * verde com print ou review atrás da pessoa, POV, antes e depois. O texto
 * nativo é a TikTok Sans (aberta no Google Fonts desde 2025) e o estilo
 * Classic, com caixa de fundo arredondada; a paleta do editor do app tem 15
 * cores (vermelho #EA403F, amarelo #F2CD46, azul #3496F0...).
 */
export const UGC: ReferenciaDeEstilo = {
  id: "ugc",
  nome: "Nativo do TikTok",
  inspiracao: "criadores de conteúdo de usuário (UGC) do TikTok e dos Reels",
  essencia:
    "Parece que a pessoa gravou no celular agora e postou. Selfie vertical com o braço esticado ou o celular apoiado, no carro, na cozinha, na loja, na obra; luz do lugar, cor do celular, voz direta, sem cenário montado. A edição quase não aparece: texto nativo da plataforma em caixa arredondada, um balão de comentário que ela responde, a pessoa recortada na frente de um print (tela verde), cortes no gesto. Nada de grafismo de agência. O que segura é a conversa de igual para igual, o gancho no primeiro segundo e a sensação de bastidor real. Humaniza a marca.",
  estrutura: {
    abre:
      "Gancho em até 2 s, com três camadas juntas: movimento (ela entra no quadro, vira o celular, mostra o objeto), a frase falada contrária ou curiosa, e o texto do gancho na caixa nativa no topo (\"ninguém te conta isso sobre consórcio\"). Ou o balão de comentário no topo e ela já respondendo.",
    avanca:
      "Uma conversa em blocos de 3 a 8 s, cortados no gesto. Prova sempre visível: tela verde com o print, o produto na mão, o antes e depois. Listas viram textos nativos numerados que trocam a cada item. Sem respiro morto, mas sem pressa artificial; erros simpáticos ficam.",
    fecha:
      "Fecha com uma frase pessoal e uma chamada nativa (\"me conta nos comentários\", \"salva para não perder\") em texto na caixa, e corta seco, de preferência num gesto que permite loop com o começo.",
  },
  ritmo: {
    cenaSeg: [2, 5],
    cortesPorMinuto: [15, 30],
    zoom:
      "Punch de 100% para 115% só na frase do gancho ou numa revelação, abrupto, como zoom de celular. Movimento real da câmera na mão vale mais que zoom digital.",
    observacoes:
      "Vídeo de 7 a 60 s. Corte no gesto: mão na lente, pulo, virada de celular, estalo de dedo. A imagem não recebe tratamento de cor de cinema; no máximo exposição corrigida.",
  },
  tipografia: {
    familias: [
      { papel: "texto nativo, gancho e lista", familia: "TikTok Sans", pesos: "600 e 700", origem: "google-fonts", alternativa: "Liberation Sans 700" },
      { papel: "legenda falada", familia: "TikTok Sans", pesos: "700", origem: "google-fonts", alternativa: "Inter 700" },
      { papel: "texto de bilhete, uso raro", familia: "Source Code Pro", pesos: "700", origem: "google-fonts", alternativa: "Courier Prime" },
    ],
    hierarquia:
      "Texto do gancho a 3,5% a 4,5% da altura, até 2 linhas; texto de lista a 3,5%; legenda a 3,5% a 4%; balão de comentário a 2,8% com o nome menor.",
    regras: [
      "Frase como se digita no celular: minúscula, sem ponto final, gíria leve permitida, português correto.",
      "Caixa de fundo arredondada (raio de 25% da altura da linha) atrás do texto nativo, branca com texto preto ou preta com texto branco.",
      "Legenda de 3 a 6 palavras por vez, sem contorno grosso, sem palavra a palavra explosiva.",
      "No máximo um texto nativo e uma legenda na tela ao mesmo tempo.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "caixa clara", hex: "#FFFFFF" },
      { papel: "texto e caixa escura", hex: "#000000" },
      { papel: "vermelho do editor", hex: "#EA403F" },
      { papel: "amarelo do editor", hex: "#F2CD46" },
      { papel: "azul do editor", hex: "#3496F0" },
    ],
    marca:
      "A cor da marca entra como uma das caixas de texto nativas (fundo da caixa com texto branco ou preto, o que ler melhor) e no número da lista. A imagem nunca é tingida e nada recebe logo: a marca aparece pelo produto, pelo uniforme, pelo lugar.",
  },
  elementos: [
    {
      id: "texto-do-gancho",
      nome: "Texto nativo do gancho",
      forma:
        "Frase curta em TikTok Sans 600 dentro de caixa arredondada branca com texto preto, centrada. Uma a duas linhas; cada linha tem a própria caixa com 12 px de folga, emendadas como no editor do app.",
      animacao: "Aparece no quadro 0 sem animação ou com escala de 90% para 100% em 120 ms. Sai seca entre 2 e 5 s.",
      duracaoSeg: [2, 5],
      posicao916: "Topo útil, 15% a 26% da altura. Centro horizontal, largura máxima de 76%.",
      posicao169: "Topo, 8% a 20% da altura.",
      quando: "Primeiros 2 s, sempre.",
    },
    {
      id: "balao-de-comentario",
      nome: "Balão de resposta a comentário",
      forma:
        "Balão branco arredondado com um ícone de pergunta em círculo, o rótulo \"Pergunta que sempre recebo\" pequeno e a dúvida em TikTok Sans 600 preto. Raio de 24 px, sombra suave de 15%; ícone num círculo da cor da marca. Sem nome nem arroba: a dúvida é a que a própria pessoa diz receber, nunca um comentário fingido de alguém.",
      animacao: "Sobe 30 px com escala de 95% para 100% em 200 ms. Fica preso o tempo do bloco de resposta.",
      duracaoSeg: [3, 12],
      posicao916: "Topo útil, 15% a 27% da altura. Alinhado à esquerda com margem de 6%.",
      posicao169: "Canto superior esquerdo.",
      quando: "Objeção, dúvida frequente, \"me perguntaram se...\".",
    },
    {
      id: "tela-verde",
      nome: "Tela verde com print",
      forma:
        "A pessoa recortada da cintura para cima na frente de uma imagem de fundo (print, foto do produto, resultado). Fundo em tela cheia, levemente escurecido 10%; a pessoa ocupa a metade de baixo.",
      animacao: "Corte seco para o fundo novo. A pessoa pode trocar de lado num corte.",
      duracaoSeg: [3, 12],
      posicao916: "Pessoa de 48% a 100% da altura. Print visível de 13% a 50%.",
      posicao169: "Pessoa no terço direito, fundo nos dois terços restantes.",
      quando: "Ela comenta algo que precisa ser visto (review, notícia, preço, antes e depois).",
    },
    {
      id: "lista-nativa",
      nome: "Lista nativa numerada",
      forma:
        "Texto nativo na caixa arredondada com o número e o item (\"2. não assina sem ler a cláusula\"). O número na caixa da cor da marca, o texto na caixa branca, emendados.",
      animacao: "Troca seca a cada item, no corte. O número pode dar um salto de 110% em 100 ms.",
      duracaoSeg: [3, 8],
      posicao916: "Topo útil, 15% a 24% da altura.",
      posicao169: "Topo, 8% a 18% da altura.",
      quando: "\"3 coisas que...\", cada item dito.",
    },
    {
      id: "legenda-nativa",
      nome: "Legenda de celular",
      forma:
        "3 a 6 palavras em TikTok Sans 700 branca com contorno fino preto de 3 px, minúscula. Sem palavra colorida ou no máximo uma na cor da marca por bloco.",
      animacao: "Bloco aparece inteiro na fala, troca seco. Sem pulo nem escala.",
      duracaoSeg: [0.8, 2],
      posicao916: "Centro inferior, 58% a 70% da altura. Nunca abaixo de 78%.",
      posicao169: "Base, 74% a 84% da altura.",
      quando: "Enquanto há fala, quando o vídeo pede leitura sem som.",
    },
    {
      id: "corte-no-gesto",
      nome: "Corte no gesto",
      forma:
        "Transição em que a mão cobre a lente ou a pessoa pula, e o plano seguinte começa com a mão saindo. Sem efeito gráfico; é edição sobre o próprio gesto.",
      animacao: "Corte no quadro em que a mão cobre 90% da imagem. O plano seguinte continua o movimento.",
      duracaoSeg: [0.2, 0.4],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Antes e depois, troca de roupa, cenário ou tempo.",
    },
    {
      id: "seta-de-print",
      nome: "Seta e círculo sobre o print",
      forma:
        "Seta simples ou círculo de traço uniforme de 8 px na cor da marca ou vermelho do editor, sobre o print. Como desenhado com o dedo na tela.",
      animacao: "Desenha-se em 250 ms. Some no corte.",
      duracaoSeg: [1, 3],
      posicao916: "Sobre o detalhe do print, entre 13% e 50% da altura.",
      posicao169: "Sobre o detalhe.",
      quando: "\"olha esse valor\", \"aqui ó\".",
    },
  ],
  insercoesGeradas: {
    quando: "Quase nunca (0 a 1 por minuto); o formato vive de gravação real. Só como fundo de tela verde quando o cliente não tem a imagem.",
    tipos: [
      "foto com cara de celular do produto ou do lugar do cliente, luz natural, enquadramento casual",
      "imagem de contexto para fundo de tela verde (vitrine, fila, rua), sem pessoas em destaque",
    ],
    nunca: "print, comentário, review, notícia, preço ou número gerados pelo modelo (prova falsa); pessoa gerada falando; estética de estúdio ou cinema.",
  },
  som: {
    trilha: "Voz direta é o centro; quando há música, é um som em alta tocado bem baixo, ou nenhuma. Nunca trilha corporativa.",
    efeitos: ["som ambiente real mantido", "estalo ou pop curto no corte no gesto", "nenhum efeito em cada palavra"],
    mixagem: "Voz a -14 LUFS com o ambiente do lugar; música a -28 dB ou ausente; nada de voz excessivamente limpa ou com reverberação de estúdio.",
  },
  nunca: [
    "Logo, vinheta, cartela de marca ou chamada de comercial.",
    "Grafismo de agência: barra animada, cartela cheia colorida, motion elaborado.",
    "Legenda palavra a palavra gigante com contorno grosso.",
    "Correção de cor cinematográfica, faixa preta, câmera lenta.",
    "Print ou comentário inventado como se fosse real de terceiro.",
    "Texto em cima do rosto ou na coluna direita.",
    "Abrir com \"oi, gente\" sem gancho.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 3 erros",
      edicao:
        "Texto nativo no topo \"3 erros que eu vejo todo dia\"; corte no gesto e a lista nativa \"1.\" com o primeiro erro; tela verde com o print que prova enquanto ela explica, seta desenhada no detalhe; volta para a selfie; na troca, corte no gesto e a caixa vira \"2.\".",
    },
    {
      quando: "O primeiro segundo",
      edicao: "Ela entra no quadro já falando a frase contrária, texto do gancho na caixa branca no topo desde o quadro 0, punch abrupto de 115% na última palavra.",
    },
    {
      quando: "Ela responde uma dúvida de cliente",
      edicao: "Balão de pergunta no topo com a dúvida, sem nome de ninguém; ela lê em voz alta e responde olhando para a câmera, legenda de celular embaixo.",
    },
    {
      quando: "Ela mostra um resultado (\"olha como ficou\")",
      edicao: "Mão cobre a lente, o plano seguinte mostra o resultado com o celular girando em volta; texto nativo \"antes\" e \"depois\" na troca.",
    },
    {
      quando: "Ela comenta um preço ou notícia",
      edicao: "Tela verde com o print real fornecido pelo cliente, círculo desenhado no valor, ela reagindo na metade de baixo.",
    },
    {
      quando: "Uma confissão ou bastidor",
      edicao: "Plano parado de 5 a 8 s, sem texto nativo, só legenda; o erro de fala fica.",
    },
    {
      quando: "O fecho",
      edicao: "Frase pessoal, texto nativo \"salva para não esquecer\", corte seco num gesto que encaixa com o começo.",
    },
  ],
  quadrosDeReferencia: [
    "Selfie vertical de celular dentro de um carro com luz natural, a pessoa falando para a câmera; no topo, uma frase curta em letra sem serifa preta dentro de uma caixa branca arredondada.",
    "A pessoa recortada da cintura para cima na metade de baixo da tela, na frente de um print de tela que ocupa a metade de cima, com um círculo vermelho desenhado num valor.",
    "Plano de cozinha ou loja, a pessoa segurando um produto perto da câmera; no topo, um balão branco arredondado de resposta a comentário com um pequeno avatar circular.",
  ],
  fontes: [
    "https://www.mbadv.agency/tiktok-ads/creative-best-practices (gancho nos 3 primeiros segundos, proposta em 3 s e gancho até 6 s, texto sobreposto para assistir sem som)",
    "https://makeinfluencers.com/tools/tiktok-comment-generator (balão branco arredondado de resposta a comentário preso no topo, o formato de UGC mais eficaz)",
    "https://www.influencers-time.com/green-screen-duet-ads-briefing-reaction-content-that-convert/ (tela verde: print, review ou foto do produto atrás da pessoa reagindo ao vivo, 15 a 45 s)",
    "https://developers.tiktok.com/blog/tiktok-sans-open-source (TikTok Sans aberta, no Google Fonts)",
    "https://www.kapwing.com/resources/what-fonts-does-tiktok-use-and-how-to-get-them/ (estilo Classic com caixa arredondada, paleta de 15 cores do editor)",  ],
};

export const TEXTO_UGC = textoParaOPrompt(UGC);
