/**
 * A TABELA DE CREDITO, sem dependencia nenhuma.
 *
 * Ela morava em `lib/stripe/index.ts`, que importa o SDK do Stripe e por isso
 * nunca pode ser importado por um componente cliente. O efeito, medido em
 * 21/09: a janela da campanha nao conseguia usar os precos de verdade e
 * carregava uma COPIA deles, de agosto, com imagem a 8 creditos e sem contar
 * as redes. A tela dizia 688 creditos, o servidor cobrava o dobro e recusava.
 *
 * Aqui nao ha preco novo: e a mesma tabela, num arquivo que os dois lados
 * podem importar. `lib/stripe/index.ts` reexporta, para quem ja importava de
 * la continuar valendo.
 */
// Créditos cobrados por operação (1 crédito = R$ 0,10).
// Calibrados a ~3x o custo variável medido; ver MODELO_DE_NEGOCIO_v2.md seção 4.
export const CREDIT_COSTS = {
  post_text: 15, // post de texto em qualquer rede
  /**
   * Comentário com fontes no X: o link custa US$ 0,20 na API do X, R$ 1,07 no
   * dólar a R$ 5,36. Com 20 créditos saía a R$ 0,054 por crédito, a única linha
   * da tabela acima da régua de R$ 0,027 do preço de 01/10 (ver
   * lib/media/limits.ts); 40 deixa a peça dentro dela (01/10). O resto da
   * tabela de campanha já passava: o texto no Sonnet 5 sai a ~US$ 0,06 por
   * peça (R$ 0,021 por crédito) e a arte e a lâmina na Higgsfield a ~US$ 0,05
   * (R$ 0,007 por crédito).
   */
  // Até 30/09: x_sources_comment: 20,
  x_sources_comment: 40,
  /**
   * UMA ARTE GERADA, cobrada por PROPORCAO e nao por rede.
   *
   * Era `post_image: 25` (15 de texto + 10 de imagem), calibrado contra o
   * Gemini a R$ 0,21 por geracao. Em 19/09 mudaram as duas pontas:
   *
   *   . o CUSTO: a imagem passou a sair no GPT Image 2, a R$ 0,89 por geracao,
   *     porque a arte agora tem MANCHETE em portugues e o Gemini escreve
   *     errado (as duas pecas com erro do dia saíram dele). O mesmo preco de
   *     uma lamina de carrossel, que e o mesmo modelo e a mesma chamada;
   *   . a CONTAGEM: cobrava-se por REDE. Um dia com quatro redes gera DUAS
   *     artes (4:5 e 16:9) e recorta o resto, entao cobrar quatro era cobrar
   *     duas geracoes que nunca aconteceram.
   *
   * O multiplo e o mesmo do resto da tabela, 47,6 creditos por real de custo
   * variavel: R$ 0,89 x 47,6 = 42. Identico a `carousel_lamina` de proposito,
   * porque e literalmente a mesma operacao.
   */
  imagem_geracao: 42,
  /**
   * Mantido para as telas antigas que somam "um post com imagem" numa linha
   * so. Nao e mais o que o pipeline cobra: la a conta e por proporcao.
   */
  post_image: 57, // 15 de texto + 42 de uma arte gerada
  /**
   * CARROSSEL, cobrado POR LAMINA desde 19/09.
   *
   * `carousel_3: 40` saiu porque o carrossel deixou de ser tres imagens do
   * mesmo modelo e virou N laminas no GPT Image 2, que e o modelo com o melhor
   * texto dentro da arte e custa US$ 0,165 por lamina em alta qualidade, ou
   * R$ 0,89 no dolar a 5,40.
   *
   * A CONTA SAI DA PROPRIA LINHA `post_image`, e nao de uma regra nova: la, a
   * parte de imagem sao 10 creditos para R$ 0,21 de custo variavel medido, ou
   * seja 47,6 creditos por real de custo. A lamina custa R$ 0,89, entao 42. Um
   * carrossel de cinco laminas fica em 15 de texto mais 210, ou 225 creditos.
   * Usar o mesmo multiplo do que ja existe e o que mantem a margem igual entre
   * as pecas; inventar um multiplo novo aqui mudaria a margem sem ninguem ver.
   *
   * E cobrado UMA VEZ POR DIA, e nao por rede: as tres redes que aceitam
   * carrossel usam a mesma proporcao, entao recebem a MESMA arte. Cobrar por
   * rede seria cobrar tres vezes por uma geracao so.
   */
  carousel_lamina: 42,
  // Vídeo gerado por IA (Veo) saiu em 18/08/2026. Motivo: o custo não era
  // determinístico. A cascata de fallback tentava veo-3.0-fast a US$ 0,10 por
  // segundo e caía para veo-3.0 standard a US$ 0,40, o que levava um vídeo de
  // 8 segundos de R$ 4,85 para R$ 18,05 contra R$ 10,00 de receita, 80% de
  // prejuízo, sem nada registrado que denunciasse. Vídeo passa a vir da
  // gravação do próprio cliente, cortada e legendada, cobrada por
  // créditos em duas partes, no envio e na aprovação (lib/media/limits.ts,
  // preço de 01/10).
} as const;
