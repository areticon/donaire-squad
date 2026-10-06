import type { Assinaturas, LinhaDoPainel, Origem, PassoDoFunil, ResumoDoPainel } from "@/lib/admin/painel";
import type { DadosDosGraficos, Periodo } from "@/lib/admin/tipos-do-painel";
import { eixoDoTempo } from "@/lib/admin/graficos-do-painel";
import { traducaoCompleta } from "@/lib/publish/codigos-admin";

/**
 * DADOS DE EXEMPLO DO PAINEL, SÓ NO AMBIENTE LOCAL (01/10).
 *
 * O banco de hoje tem quase só a conta do Bruno, e um gráfico com uma linha
 * reta no zero não prova que o desenho aguenta dado de verdade. Com
 * /admin?exemplo=1 no `next dev`, a página troca os números por estes,
 * inventados aqui, em memória. Nada é gravado no banco, e em produção o
 * parâmetro é ignorado (a página confere NODE_ENV antes de chamar).
 *
 * Os números saem de um sorteio com semente fixa: o mesmo período dá sempre o
 * mesmo desenho, e o print de hoje bate com o de amanhã.
 */
export function painelDeExemplo(dias: Periodo, agora = new Date()) {
  let semente = 20261001 + dias;
  const sorteio = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
  const ate = (max: number) => Math.floor(sorteio() * (max + 1));

  const eixo = eixoDoTempo(dias, agora);
  const n = eixo.baldes.length;
  const fator = eixo.porSemana ? 6 : 1;
  const serie = (max: number, crescimento = 0.6) =>
    Array.from({ length: n }, (_, i) => Math.round(ate(max * fator) * (1 - crescimento + crescimento * (i / Math.max(1, n - 1)))));

  const cadastros = serie(4);
  const leads = serie(6);
  const marcadas = serie(2);
  const realizadas = marcadas.map((m) => Math.max(0, m - ate(1)));
  // Os preços do catálogo de hoje (lib/planos.ts): Starter, Pro e Enterprise.
  const mrr = 3 * 2997 + 2 * 3997 + 1 * 5667;
  const custo = Array.from({ length: n }, () => (8 + sorteio() * 22) * fator);

  const graficos: DadosDosGraficos = {
    dias,
    porSemana: eixo.porSemana,
    movimento: {
      baldes: eixo.baldes,
      series: [
        { chave: "cadastros", nome: "Cadastros confirmados", cor: "var(--painel-1)", valores: cadastros },
        { chave: "leads", nome: "Leads", cor: "var(--painel-3)", valores: leads },
        { chave: "marcadas", nome: "Demonstrações marcadas", cor: "var(--painel-2)", valores: marcadas },
        { chave: "realizadas", nome: "Demonstrações realizadas", cor: "var(--painel-4)", valores: realizadas },
      ],
    },
    dinheiro: {
      baldes: eixo.baldes,
      series: [
        { chave: "receita", nome: "Receita real (exemplo)", cor: "var(--painel-1)", valores: eixo.diasPorBalde.map((d) => (mrr / 30) * d) },
        { chave: "custo", nome: "Custo de IA", cor: "var(--painel-2)", valores: custo },
      ],
    },
    creditos: {
      baldes: eixo.baldes,
      series: [
        { chave: "plano", nome: "Créditos do plano", cor: "var(--painel-1)", valores: serie(900, 0.3) },
        { chave: "video", nome: "Créditos de vídeo", cor: "var(--painel-2)", valores: serie(600, 0.3) },
      ],
    },
    publicacoes: {
      baldes: eixo.baldes,
      series: [
        { chave: "linkedin", nome: "LinkedIn", cor: "var(--painel-1)", valores: serie(5) },
        { chave: "instagram", nome: "Instagram", cor: "var(--painel-2)", valores: serie(4) },
        { chave: "youtube", nome: "YouTube", cor: "var(--painel-3)", valores: serie(2) },
        { chave: "tiktok", nome: "TikTok", cor: "var(--painel-4)", valores: serie(2) },
      ],
    },
    falhas: {
      total: 9,
      porRede: [
        { rede: "Instagram", n: 5 },
        { rede: "LinkedIn", n: 3 },
        { rede: "TikTok", n: 1 },
      ],
      porCodigo: [
        { codigo: "PUB-MID", titulo: traducaoCompleta("PUB-MID").titulo, n: 4 },
        { codigo: "PUB-CFG", titulo: traducaoCompleta("PUB-CFG").titulo, n: 3 },
        { codigo: "PUB-LIM", titulo: traducaoCompleta("PUB-LIM").titulo, n: 2 },
      ],
    },
    demonstracoes: {
      marcadas: marcadas.reduce((a, b) => a + b, 0),
      realizadas: realizadas.reduce((a, b) => a + b, 0),
      faltou: 1,
      canceladas: 1,
    },
    custoForaDeProjeto: 42.5,
  };

  const visitas = 180 * (dias / 30);
  const funil: PassoDoFunil[] = [
    { passo: "visita", eventos: Math.round(visitas * 1.6), pessoas: Math.round(visitas), taxa: null, entrouDireto: false },
    { passo: "demo", eventos: Math.round(visitas * 0.12), pessoas: Math.round(visitas * 0.1), taxa: 10, entrouDireto: false },
    { passo: "contato", eventos: Math.round(visitas * 0.05), pessoas: Math.round(visitas * 0.05), taxa: 50, entrouDireto: false },
    { passo: "cadastro", eventos: cadastros.reduce((a, b) => a + b, 0), pessoas: cadastros.reduce((a, b) => a + b, 0), taxa: null, entrouDireto: false },
    { passo: "checkout", eventos: 14, pessoas: 11, taxa: null, entrouDireto: false },
    { passo: "assinatura", eventos: 6, pessoas: 6, taxa: 55, entrouDireto: false },
    { passo: "ativação", eventos: 4, pessoas: 4, taxa: 67, entrouDireto: false },
  ];

  const origens: Origem[] = [
    { origem: "(direto)", campanha: null, visitas: Math.round(visitas * 0.4), cadastros: 9, assinaturas: 2 },
    { origem: "linkedin", campanha: "lancamento-out", visitas: Math.round(visitas * 0.3), cadastros: 7, assinaturas: 3 },
    { origem: "google", campanha: "busca-marca", visitas: Math.round(visitas * 0.2), cadastros: 4, assinaturas: 1 },
    { origem: "instagram", campanha: null, visitas: Math.round(visitas * 0.1), cadastros: 2, assinaturas: 0 },
  ];

  const conta = (i: number, plano: string, planoNome: string, mensalidade: number, custoIa: number): LinhaDoPainel => ({
    id: `exemplo-${i}`,
    email: `conta${i}@exemplo.invalid`,
    nome: `Conta de exemplo ${i}`,
    plano,
    planoNome,
    papel: "user",
    interna: false,
    mensalidade,
    creditos: 400 + i * 120,
    creditosDeVideo: 200 * (i % 3),
    consumidos: 300 + i * 90,
    projetos: 1 + (i % 2),
    gravacoes: i % 4,
    campanhas: 2 + i,
    custoIaReais: custoIa,
    margemReais: mensalidade - custoIa,
    armazenamentoGb: 0.4 * i,
    cadastroEm: new Date(agora.getTime() - i * 5 * 86400000).toISOString(),
    suspeita: false,
    ultimaCampanha: new Date(agora.getTime() - i * 86400000).toISOString(),
    ativo: i < 5,
  });
  const linhas: LinhaDoPainel[] = [
    conta(1, "studio", "Enterprise", 5667, 610),
    conta(2, "business", "Pro", 3997, 460),
    conta(3, "business", "Pro", 3997, 4120),
    conta(4, "pro", "Starter", 2997, 295),
    conta(5, "pro", "Starter", 2997, 320),
    conta(6, "pro", "Starter", 2997, 160),
  ];

  const resumo: ResumoDoPainel = {
    usuarios: 31,
    ativos: 5,
    pagantes: 6,
    mrr,
    custoIaReais: custo.reduce((a, b) => a + b, 0),
    armazenamentoGb: 8.4,
    videosHoje: 7,
    janelaDias: dias,
    suspeitas: 4,
    confirmadas: 22,
    semConfirmar: 3,
  };

  const assinaturas: Assinaturas = { ativas: 4, emTeste: 2, canceladas: 1, saindo: 1, leu: true };

  return { graficos, funil, origens, linhas, resumo, assinaturas };
}
