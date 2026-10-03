import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * ALTA RETENÇÃO, LINGUAGEM DE MRBEAST (03/10/2026).
 *
 * Base: a bíblia lib/media/biblias/mrbeast.ts (tela clara e saturada, algo novo
 * a cada 1,5 a 3 s, efeito sonoro em cada corte) e a pesquisa: o manual interno
 * vazado da produção (o primeiro minuto decide, nenhum momento morto, o que
 * está em jogo sempre visível), a medição de 38 cortes por minuto em 2023
 * caindo para 23 em 2024 (ele mesmo desacelerou e deixou a história respirar)
 * e as fichas de legenda (caixa alta pesada, contorno preto de 6 a 10 px,
 * entrada 70% a 110% a 100% em 4 a 6 quadros). A letra de quadrinho
 * inclinada do criador fica de fora por decisão de 02/10: aqui a tipografia é
 * limpa e pesada.
 */
export const MRBEAST: ReferenciaDeEstilo = {
  id: "mrbeast",
  nome: "Alta retenção",
  inspiracao: "MrBeast",
  essencia:
    "Entretenimento de alta retenção em tela CLARA e SATURADA: a promessa e o que está em jogo aparecem no primeiro segundo e meio e nunca saem de vista (um contador, um placar, um valor). A cada 1,5 a 3 s algo muda: corte com troca de enquadramento, punch, número enorme, objeto estourando ao lado da pessoa. A cor da marca chapada é o fundo das cartelas; nada de clima escuro. Tudo grande, legível num celular a um braço de distância, mas com pouco texto: a imagem conta, a palavra só marca a promessa, o número e a virada. Ritmo rápido sem histeria: a história respira entre as viradas.",
  estrutura: {
    abre:
      "O trailer: as melhores frases do próprio vídeo, inteiras e curtas, do mais forte para o menos forte, com a promessa ou o número primeiro e a cartela da promessa na cor da marca. Até 16 s. Termina mostrando o que está em jogo (o contador zerado, o valor em disputa) e entra direto no primeiro desafio.",
    avanca:
      "Por viradas a cada 20 a 30 s: novo desafio, novo número, nova revelação, cada um anunciado em palavra gigante. O placar ou contador volta a cada virada para lembrar quanto falta. Entre viradas, a pessoa cheia com punch nas palavras fortes e objetos estourando ao lado.",
    fecha:
      "O resultado final em número enorme com flash, a reação da pessoa em plano fechado e a chamada direta em palavra gigante na cor da marca com seta. Sem fade: termina em alta.",
  },
  ritmo: {
    cenaSeg: [1.5, 3.2],
    cortesPorMinuto: [23, 40],
    zoom:
      "Punch de 110% a 125% na palavra forte, alternando enquadramento a cada corte (corte em salto com zoom), em 60% a 80% das cenas. Zoom lento quase nunca.",
    observacoes:
      "Silêncios e respiros cortados. Nenhuma janela de 3 s sem mudança. B-roll e cartela de 1,5 a 2,5 s. Texto só 2 a 4 vezes por minuto. A cada 20 a 30 s, um estímulo novo (som, virada, corte para fora).",
  },
  tipografia: {
    familias: [
      { papel: "palavra gigante, título e legenda", familia: "Archivo Black", pesos: "400 (já pesada), caixa alta", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "número, contador, placar", familia: "Anton", pesos: "400, caixa alta", origem: "google-fonts e local", alternativa: "Archivo Black" },
    ],
    hierarquia:
      "Palavra gigante a 14% a 20% da altura, até 3 palavras. Número a 20% a 30%. Legenda a 6% a 7%, 1 a 2 palavras por vez. Rótulo do número a 3,5%.",
    regras: [
      "Branca com contorno preto de 6 a 10 px e sombra macia de 12 px; a palavra-chave na cor da marca.",
      "Entrada de toda palavra: 70% para 110% para 100% em 4 a 6 quadros.",
      "Nada de serifa, letra fina ou letra torta; no máximo 3 palavras por texto.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo de cartela (destaque)", hex: "#18A0FB" },
      { papel: "segundo fundo", hex: "#FFD400" },
      { papel: "positivo, check", hex: "#2BD45A" },
      { papel: "negativo, x", hex: "#FF3B30" },
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "contorno", hex: "#000000" },
      { papel: "respiro claro", hex: "#F7F7F7" },
    ],
    marca:
      "A cor mais viva da marca vira o fundo chapado das cartelas e do narrador recortado; a segunda cor da marca é o segundo fundo. Se a marca for escura, saturar e clarear até ficar alegre; o escuro só em contorno e no máximo em 1 fundo de cada 4. Verde e vermelho só para certo e errado.",
  },
  elementos: [
    {
      id: "palavra-gigante",
      nome: "Palavra da promessa",
      forma:
        "Uma a três palavras em caixa alta enorme, brancas com contorno preto e a última na cor da marca. Sombra macia; sem rotação.",
      animacao: "Estoura de 70% a 110% e assenta em 100% em 150 ms, com pop. Sai por corte.",
      duracaoSeg: [1, 2],
      posicao916: "Faixa de 20% a 40% da altura, acima do rosto. Largura de 6% a 88%.",
      posicao169: "Centro ou lado livre, 15% a 45% da altura.",
      quando: "A promessa, o desafio, a virada (\"7 DIAS\", \"ÚLTIMA CHANCE\").",
    },
    {
      id: "contador-placar",
      nome: "Contador de jogo",
      forma:
        "Cartão arredondado branco com contorno preto grosso, rótulo pequeno em cima e o valor grande em Anton (tempo, dinheiro, dias, pessoas). Raio 24 px, contorno 6 px; o valor muda de cor quando acaba.",
      animacao: "Entra deslizando 40 px do topo em 200 ms com mola. O número rola dígito a dígito a cada mudança, com tique.",
      duracaoSeg: [2, 6],
      posicao916: "Topo da área segura, 14% a 22% da altura. Centralizado ou à esquerda.",
      posicao169: "Canto superior esquerdo, dentro da margem de 5%.",
      quando: "Sempre que a fala diz quanto falta, quanto custou ou quanto acumulou.",
    },
    {
      id: "numero-enorme",
      nome: "Número enorme",
      forma:
        "O número em Anton gigante na cor da marca com contorno preto, unidade do mesmo tamanho e rótulo curto embaixo. Sobre cartela chapada ou ao lado da pessoa.",
      animacao: "Conta até o valor em 600 ms com tique e fecha com ding e escala de 105%. Flash branco de 2 quadros quando é revelação.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Faixa de 25% a 50% da altura.",
      posicao169: "Centro, 25% a 70% da altura.",
      quando: "Todo número dito.",
    },
    {
      id: "objeto-estourando",
      nome: "Objeto estourando",
      forma:
        "O objeto do substantivo dito recortado, com contorno branco de 8 px e sombra, grande ao lado da pessoa. Até 30% da largura.",
      animacao: "Escala de 0 a 115% a 100% em 220 ms, com leve rotação de 8 graus que volta a 0. Sai encolhendo em 120 ms.",
      duracaoSeg: [1.2, 2.5],
      posicao916: "Ao lado do rosto, 25% a 55% da altura. Lado oposto ao olhar.",
      posicao169: "Lado livre, 20% a 75% da altura.",
      quando: "Substantivo concreto dito (\"carro\", \"pizza\", \"cheque\").",
    },
    {
      id: "seta-circulo",
      nome: "Seta e círculo",
      forma:
        "Seta grossa e círculo vermelhos com contorno branco, apontando o que importa na imagem. Traço de 14 px.",
      animacao: "A seta entra da borda em 150 ms e o círculo se desenha em 250 ms. Leve pulsação de 3% enquanto fica.",
      duracaoSeg: [1, 2],
      posicao916: "Sobre o detalhe, dentro da área segura.",
      posicao169: "Sobre o detalhe.",
      quando: "\"Olha isso\", \"aqui\", o detalhe que prova.",
    },
    {
      id: "certo-errado",
      nome: "Tela dividida certo e errado",
      forma:
        "Tela dividida ao meio, cada lado com fundo chapado e um X vermelho ou check verde grande no canto. Divisória branca de 8 px.",
      animacao: "Os lados deslizam de fora em 200 ms; o X e o check se desenham com som de game show.",
      duracaoSeg: [1.5, 3],
      posicao916: "Metades de cima e de baixo, 13% a 78% da altura.",
      posicao169: "Metades esquerda e direita.",
      quando: "Comparação dita: barato e caro, antes e depois.",
    },
    {
      id: "barra-de-progresso",
      nome: "Barra de progresso",
      forma:
        "Barra horizontal grossa com borda preta, preenchida na cor da marca até o ponto da história, com ícone no fim. Altura de 3% do quadro; marcos de etapa.",
      animacao: "Preenche do ponto anterior ao atual em 500 ms com whoosh. Pisca no marco alcançado.",
      duracaoSeg: [1.5, 3],
      posicao916: "Faixa de 14% a 20% da altura, sob o contador.",
      posicao169: "Topo, 6% a 12% da altura.",
      quando: "Virada de etapa: \"metade do caminho\", \"falta um\".",
    },
  ],
  insercoesGeradas: {
    quando: "Médias: 2 a 4 por minuto, curtas, para dar imagem ao substantivo ou à ação exagerada; nunca para enfeitar.",
    tipos: [
      "UM objeto herói enorme no quadro, luz clara de estúdio, fundo limpo e luminoso, cor natural",
      "ilustração chapada estilo adesivo, contorno escuro grosso, para estourar ao lado da pessoa",
      "ação rápida e exagerada de 1,5 a 2,5 s, luz clara, câmera rápida",
    ],
    nunca: "fundo preto, clima sombrio, papel ou colagem, número ou texto desenhado pelo modelo.",
  },
  som: {
    trilha: "Energética, 120 a 145 batidas por minuto; sobe no gancho e na revelação, para um instante antes do resultado.",
    efeitos: ["impacto grave curto em cada punch", "whoosh no deslize", "pop na palavra e no objeto", "tique de contagem e ding no fim", "riser antes da revelação", "acerto e erro de game show no check e no X"],
    mixagem: "Voz a -14 LUFS, sempre na frente; trilha a -24 dB sob a fala; efeitos curtos que nunca cobrem a sílaba.",
  },
  nunca: [
    "Fundo escuro em duas cenas seguidas, ou clima dramático sombrio.",
    "Texto em toda frase (mais de 4 por minuto).",
    "Papel, colagem, carimbo ou letra de revista.",
    "Janela de 3 s sem nada mudar.",
    "Fade lento no fim ou abertura com apresentação.",
    "Grito visual sem história: muito efeito e nenhuma virada.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 5 desafios ou passos",
      edicao:
        "Cartela na cor da marca com 5 cartões; 4 apagam e encolhem, o 1 estoura com pop; palavra gigante DESAFIO 1; volta para a pessoa com punch; objetos estouram ao lado conforme ela fala; na troca, a cartela volta com o 1 marcado com check e o 2 estourando.",
    },
    {
      quando: "O primeiro segundo e meio",
      edicao: "A frase da promessa com punch e a palavra gigante (\"30 DIAS\"); corte para a cartela com o número; trailer das melhores frases; contador aparece no topo.",
    },
    {
      quando: "Ela diz quanto falta (\"faltam 3 dias\")",
      edicao: "Contador do topo rola para 3 com tique; barra de progresso avança com whoosh; punch no rosto.",
    },
    {
      quando: "Ela revela um resultado (\"vendemos 10 mil\")",
      edicao: "Riser, trilha para, flash, número enorme contando até 10 MIL com ding; corte para a reação em plano fechado.",
    },
    {
      quando: "Ela compara duas opções",
      edicao: "Tela dividida: a errada com X e som de erro, a certa com check e acerto; volta para a pessoa com punch.",
    },
    {
      quando: "Ela cita um objeto concreto",
      edicao: "O objeto estoura ao lado do rosto com pop, fica 1,5 s e encolhe na palavra seguinte.",
    },
    {
      quando: "O fecho",
      edicao: "Número final com flash, reação, palavra gigante da chamada (\"SEGUE\") com seta, corte seco.",
    },
  ],
  quadrosDeReferencia: [
    "A pessoa em plano médio fechado, muito iluminada e de cor saturada, ligeiramente ampliada; acima da cabeça, \"7 DIAS\" em letras pesadas brancas com contorno preto e o \"DIAS\" na cor da marca; no topo, um cartão branco com contorno preto mostrando um contador.",
    "Cartela de tela cheia na cor viva da marca com um número enorme em letra condensada pesada, contorno preto e um rótulo curto branco embaixo.",
    "Tela dividida em duas metades de cor chapada: numa, um objeto com um X vermelho grande; na outra, o objeto alternativo com um check verde grande, divisória branca.",
  ],
  fontes: [
    "lib/media/biblias/mrbeast.ts (bíblia do projeto, 01/10 e 02/10)",
    "https://www.tubefilter.com/2024/03/04/mrbeast-editing-style-number-of-cuts-per-video/ (38 cortes por minuto em 2023, 23 em 2024; menos superestímulo, mais história)",
    "https://www.creatorhandbook.net/leaked-document-allegedly-reveals-mrbeasts-secrets-to-youtube-success-the-key-takeaways/ (manual vazado: primeiro minuto, nenhum momento morto, retenção)",
    "https://www.videocaptions.ai/mrbeast-font (legenda: caixa alta pesada, contorno preto de 6 a 10 px, 1 a 3 palavras, 10% a 15% da altura)",
    "https://filmora.wondershare.com/ai-generation/how-to-create-mrbeast-font.html (entrada 70% a 110% a 100% em 2 a 3 quadros cada passo)",
  ],
};

export const TEXTO_MRBEAST = textoParaOPrompt(MRBEAST);
