import type { ReactNode } from "react";
import { encaixar, larguraDoTexto } from "@/lib/modelos-de-arte/encaixe";
import { estiloDaFonte, type FonteId } from "@/lib/modelos-de-arte/fontes";
import type { ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import type { EntradaDoDesenho, Zona } from "@/lib/modelos-de-arte/desenho";
import { mapaPontilhadoDataUri } from "@/lib/modelos-de-arte/mapa-pontilhado";
import { Arraste, Assinatura, Imagem, Pessoa, Texto, Vazio, Vinheta, base, efeitoDoModelo, flex, luminancia, misturar, rgba, sobre } from "@/lib/modelos-de-arte/pecas-do-desenho";
import { ARQUETIPOS_VOX, TEXTO_FIXO_DOS_MODELOS_VOX, desenharModeloVox, zonaDaFotoVox } from "@/lib/modelos-de-arte/desenho-vox";
import { deslocamentoDoTitulo, efeitoComAjustes } from "@/lib/modelos-de-arte/ajustes-da-peca";

/**
 * OS MODELOS COM FOTO DE 05/10/2026, o desenho.
 *
 * Pedido do Bruno: "mais modelos, principalmente com foto", a partir de três
 * linguagens que ele mandou de referência (sem copiar marca nem pessoa):
 *
 *   A) o apresentador em cores, título grande em caixa alta condensada e a
 *      palavra-chave num retângulo sólido; o título inteiro em faixas; a foto
 *      escura com o texto no centro; e o post só texto com frase e complemento;
 *   B) a foto em PRETO E BRANCO com uma única palavra na cor; o só texto com
 *      a palavra repetida ao fundo como textura; a foto de palco sem texto;
 *   C) a capa de carrossel escura com objeto, o apresentador sobre o mapa
 *      pontilhado e o selo "arraste para o lado".
 *
 * Mesma regra do desenho principal (lib/modelos-de-arte/desenho.tsx): uma
 * função só para a prévia no navegador e para a arte no servidor (Satori), por
 * isso tudo é div em flex, posição absoluta e pixel calculado aqui. A letra e
 * os papéis aprovados (fundo, título, destaque) mandam em todos.
 *
 * O preto e branco é feito em código, sem IA: na prévia, filtro CSS (só no
 * navegador); no servidor, o sharp tira a cor do pixel antes de compor
 * (lib/modelos-de-arte/compor.tsx), porque o Satori não entende `filter`.
 *
 * OS EFEITOS (05/10): cada modelo tem o seu em EFEITOS_DO_MODELO
 * (lib/modelos-de-arte/pecas-do-desenho.tsx): sombra dura ou suave da pessoa,
 * rim light ou glow atrás dela, vinheta e desfoque do fundo, contraste.
 *
 * Fica num arquivo próprio para o desenho principal receber só a chamada; as
 * peças comuns moram em lib/modelos-de-arte/pecas-do-desenho.tsx e a família
 * Vox (colagem editorial) em lib/modelos-de-arte/desenho-vox.tsx.
 * Puro: sem banco, sem fs, sem sharp. Componente de cliente pode importar.
 */

/** Os arquétipos que este arquivo desenha. */
export const ARQUETIPOS_COM_FOTO: ReadonlySet<ModeloDeArte["arquetipo"]> = new Set<ModeloDeArte["arquetipo"]>([
  "retrato-bloco",
  "retrato-faixas",
  "foto-escurecida",
  "frase-dupla",
  "pb-palavra",
  "textura-tipografica",
  "foto-pura",
  "capa-objetos",
  "mapa-pontilhado",
  "papel-pb",
]);

/** O texto fixo que estes modelos desenham, para a conferência saber que é do código. */
export const TEXTO_FIXO_DOS_MODELOS_COM_FOTO = ["Arraste para o lado", ...TEXTO_FIXO_DOS_MODELOS_VOX];

/** A zona da foto dos modelos daqui (o servidor recorta a foto da IA para ela). */
export function zonaDaFotoNova(modelo: ModeloDeArte, W: number, H: number): Zona | null {
  const m = Math.round(Math.min(W, H) * 0.075);
  const alta = H / W > 1.6;
  switch (modelo.arquetipo) {
    case "retrato-bloco":
    case "retrato-faixas":
    case "foto-escurecida":
    case "pb-palavra":
    case "foto-pura":
    case "mapa-pontilhado":
    case "papel-pb":
      return { x: 0, y: 0, w: W, h: H };
    case "capa-objetos": {
      // O círculo do objeto: grande, no canto de baixo à direita (no story, mais ao centro).
      const lado = Math.round(Math.min(W * 0.64, H * 0.46));
      return { x: alta ? Math.round((W - lado) / 2 + W * 0.12) : W - lado - Math.round(m * 0.6), y: H - lado - Math.round(m * 2.2), w: lado, h: lado };
    }
    default:
      return zonaDaFotoVox(modelo, W, H);
  }
}

// ── o desenho ────────────────────────────────────────────────────────────────

/** O desenho de um modelo daqui; null quando o arquétipo é do desenho principal. */
export function desenharModeloNovo(e: EntradaDoDesenho): ReactNode | null {
  if (ARQUETIPOS_VOX.has(e.modelo.arquetipo)) return desenharModeloVox(e);
  if (!ARQUETIPOS_COM_FOTO.has(e.modelo.arquetipo)) return null;
  const b = base(e);
  const { W, H, u, m, md, acento, acentoLegivel, fundo, tinta, tintaFraca, tf, xf, caixaAlta, palavra, logoH, larguraUtil, alta, tomDaFoto, capaDoCarrossel, raiz, t } = b;
  const inteira: Zona = { x: 0, y: 0, w: W, h: H };
  const pb = Boolean(md.fotoPretoEBranco);
  const fotoInteira = (src: string | null | undefined) => (src ? <Imagem src={src} z={inteira} pb={pb} desfoque={efeito.fundo?.desfoque ?? 0} contraste={Boolean(efeito.contrasteDaFoto)} /> : <Vazio z={inteira} cor={tomDaFoto} />);
  // O efeito do modelo com os ajustes da peça por cima (a luz de fundo e a
  // sombra que o cliente pediu no chat); o título desloca pelo mesmo pedido.
  const efeito = efeitoComAjustes(efeitoDoModelo(md.arquetipo), e.ajustes);
  const sobeTitulo = deslocamentoDoTitulo(e.ajustes, H);
  const coresDoEfeito = { acento, tinta };
  const recorteNaFrente = (desloca = 0, escala = 1) =>
    e.recorte ? <Pessoa src={e.recorte} W={W} H={H} desloca={desloca} escala={escala} pb={pb} efeito={efeito.pessoa} cores={coresDoEfeito} sombraSrc={e.recorteSombra} /> : null;
  const vinheta = efeito.fundo?.vinheta ? <Vinheta W={W} H={H} forca={efeito.fundo.vinheta} /> : null;
  const logoNoAlto = (bg: string, alinhar: "flex-start" | "center" | "flex-end" = "flex-start") => (
    <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, justifyContent: alinhar })}>
      <Assinatura e={e} fundo={bg} altura={logoH} alinhar={alinhar} />
    </div>
  );
  const logoNoPe = (bg: string, alinhar: "flex-start" | "center" | "flex-end" = "flex-start", sobe = 0) => (
    <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: H - m - logoH - sobe - (luminancia(bg) < 0.35 ? logoH * 0.56 : 0), justifyContent: alinhar })}>
      <Assinatura e={e} fundo={bg} altura={logoH} alinhar={alinhar} />
    </div>
  );

  switch (md.arquetipo) {
    case "retrato-bloco": {
      // A: a pessoa em cores, o degradê na cor de fundo e a manchete com a
      // palavra-chave num bloco sólido do destaque, na frente de tudo.
      const tituloH = Math.round(H * (alta ? 0.24 : 0.3));
      const baseH = Math.round(H * (alta ? 0.5 : 0.58));
      // Sobre o degradê quase opaco do fundo, o título lê na tinta aprovada.
      return raiz(
        <>
          {fotoInteira(e.fundoDesfocado ?? e.foto)}
          {vinheta}
          {recorteNaFrente()}
          <div style={flex({ position: "absolute", left: 0, top: H - baseH, width: W, height: baseH, backgroundImage: `linear-gradient(180deg, ${rgba(fundo, 0)} 0%, ${rgba(fundo, 0.72)} 45%, ${rgba(fundo, 0.96)} 100%)` })} />
          {logoNoAlto("#000000")}
          <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 0.4 - tituloH + sobeTitulo, width: larguraUtil, height: tituloH, flexDirection: "column", justifyContent: "flex-end" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={150 * u} corpoMinimo={56 * u} entrelinha={1.0} cor={tinta} caixaAlta={caixaAlta} destaque="bloco" corDestaque={acento} palavras={[palavra]} maxLinhas={4} />
          </div>
        </>,
        fundo
      );
    }

    case "retrato-faixas": {
      // A: cada linha do título dentro de uma faixa sólida do destaque.
      const tituloH = Math.round(H * (alta ? 0.3 : 0.36));
      const texto = caixaAlta ? t.titulo.toUpperCase() : t.titulo;
      const enc = encaixar({ texto, fonte: tf, largura: larguraUtil - 60 * u, altura: tituloH, entrelinha: 1.3, corpoMaximo: 120 * u, corpoMinimo: 48 * u, maxLinhas: 4 });
      return raiz(
        <>
          {fotoInteira(e.foto)}
          {vinheta}
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" })} />
          {logoNoAlto("#000000")}
          <div style={flex({ position: "absolute", left: m, bottom: m + (alta ? H * 0.08 : 0), width: larguraUtil, flexDirection: "column", alignItems: "flex-start" })}>
            {enc.linhas.map((l, i) => (
              <div key={i} style={flex({ background: acento, color: sobre(acento), padding: `${2 * u}px ${24 * u}px`, marginTop: i ? 8 * u : 0, ...estiloDaFonte(tf), fontSize: enc.corpo, lineHeight: 1.18, whiteSpace: "nowrap" })}>
                {l}
              </div>
            ))}
          </div>
        </>,
        "#000000"
      );
    }

    case "foto-escurecida": {
      // A: a foto sob um véu do fundo, a frase no centro entre dois fios do destaque.
      const caixaH = Math.round(H * (alta ? 0.4 : 0.5));
      const corFio = acentoLegivel;
      return raiz(
        <>
          {fotoInteira(e.foto)}
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, background: rgba(fundo, 0.78) })} />
          <div style={flex({ position: "absolute", left: m, top: (H - caixaH) / 2, width: larguraUtil, height: caixaH, flexDirection: "column", alignItems: "center", justifyContent: "center" })}>
            <div style={flex({ width: 120 * u, height: 6 * u, background: corFio, marginBottom: 40 * u })} />
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={caixaH - 140 * u} corpoMaximo={96 * u} corpoMinimo={40 * u} entrelinha={1.12} cor={tinta} caixaAlta={caixaAlta} alinhar="center" maxLinhas={5} />
            <div style={flex({ width: 120 * u, height: 6 * u, background: corFio, marginTop: 40 * u })} />
          </div>
          {logoNoPe(fundo, "center")}
        </>,
        fundo
      );
    }

    case "frase-dupla": {
      // A: só texto; a frase grande e, abaixo, a linha menor que fecha a ideia.
      const areaH = H - 2 * m - logoH * 2.2;
      const apoioH = t.apoio ? Math.round(130 * u) : 0;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: 44 * u, height: 44 * u, background: acentoLegivel })} />
          <div style={flex({ position: "absolute", left: m, top: m + 44 * u, width: larguraUtil, height: areaH - 44 * u, flexDirection: "column", justifyContent: "center" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={areaH - 44 * u - apoioH - 40 * u} corpoMaximo={88 * u} corpoMinimo={36 * u} entrelinha={1.18} cor={tinta} caixaAlta={caixaAlta} destaque="cor" corDestaque={acentoLegivel} palavras={[palavra]} />
            {t.apoio ? (
              <div style={flex({ marginTop: 34 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={larguraUtil} altura={apoioH} corpoMaximo={38 * u} entrelinha={1.3} cor={tintaFraca} maxLinhas={3} />
              </div>
            ) : null}
          </div>
          {logoNoPe(fundo, "flex-start")}
        </>,
        fundo
      );
    }

    case "pb-palavra": {
      // B: a foto sem cor; a palavra-chave gigante no destaque passa atrás da
      // pessoa recortada; o resto da frase pequeno embaixo. Sem recorte, a
      // palavra fica por cima da foto.
      const palavraCaixa = Math.round(H * (alta ? 0.22 : 0.3));
      // A palavra gigante sobe ou desce pelo ajuste ("o texto ficou atrás de mim, precisa subir"), sem sair do quadro.
      const topoDaPalavra = Math.max(Math.round(m * 0.5), Math.round(H * (alta ? 0.3 : 0.2)) + sobeTitulo);
      const resto = t.titulo
        .split(/\s+/)
        .filter((w) => w.toLowerCase() !== palavra.toLowerCase())
        .join(" ");
      const palavraLimpa = palavra.replace(/[.,;:!?]+$/u, "");
      return raiz(
        <>
          {fotoInteira(e.recorte ? (e.fundoDesfocado ?? e.foto) : e.foto)}
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.85) 100%)" })} />
          <div style={flex({ position: "absolute", left: m * 0.5, top: topoDaPalavra, width: W - m, height: palavraCaixa, justifyContent: "center", alignItems: "center" })}>
            <Texto texto={palavraLimpa} fonte={tf} largura={W - m} altura={palavraCaixa} corpoMaximo={360 * u} corpoMinimo={80 * u} entrelinha={1.0} cor={acento} caixaAlta alinhar="center" maxLinhas={1} />
          </div>
          {recorteNaFrente()}
          <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 1.6 - (resto ? 120 * u : 0) - (alta ? H * 0.08 : 0), width: larguraUtil, flexDirection: "column", alignItems: "center" })}>
            {resto ? (
              <div style={flex({ marginBottom: 26 * u })}>
                <Texto texto={resto} fonte={xf} largura={larguraUtil} altura={110 * u} corpoMaximo={40 * u} entrelinha={1.2} cor="#ffffff" caixaAlta alinhar="center" maxLinhas={2} sombra />
              </div>
            ) : null}
            <Assinatura e={e} fundo="#000000" altura={logoH} alinhar="center" />
          </div>
        </>,
        "#000000"
      );
    }

    case "textura-tipografica": {
      // B: a palavra-chave repetida em fileiras, um tom acima do fundo, e a
      // frase por cima com a palavra no destaque.
      const corTextura = misturar(fundo, tinta, 0.1);
      const corpo = Math.round(150 * u);
      const passo = Math.round(corpo * 0.98);
      const fileiras = Math.ceil(H / passo) + 1;
      const palavraLimpa = palavra.replace(/[.,;:!?]+$/u, "").toUpperCase();
      const umaFileira = `${palavraLimpa} `.repeat(Math.ceil((W * 1.6) / (larguraDoTexto(`${palavraLimpa} `, tf) * corpo)) + 1);
      const areaH = H - 2 * m - logoH * 2.2;
      return raiz(
        <>
          {Array.from({ length: fileiras }, (_, i) => (
            <div key={i} style={flex({ position: "absolute", left: -Math.round((i % 2) * corpo * 1.1) - 20 * u, top: i * passo - corpo * 0.3, whiteSpace: "nowrap", ...estiloDaFonte(tf), fontSize: corpo, lineHeight: 1, color: corTextura })}>
              {umaFileira}
            </div>
          ))}
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: areaH, flexDirection: "column", justifyContent: "center" })}>
            <div style={flex({ width: 90 * u, height: 8 * u, background: acentoLegivel, marginBottom: 36 * u })} />
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={areaH - 60 * u} corpoMaximo={118 * u} corpoMinimo={44 * u} entrelinha={1.05} cor={tinta} caixaAlta={caixaAlta} destaque="cor" corDestaque={acentoLegivel} palavras={[palavra]} />
          </div>
          {logoNoPe(fundo, "flex-start")}
        </>,
        fundo
      );
    }

    case "foto-pura": {
      // B: a foto inteira, sem texto; um fio do destaque e o logo pequeno no canto.
      return raiz(
        <>
          {fotoInteira(e.foto)}
          {vinheta}
          <div style={flex({ position: "absolute", left: 0, top: H - Math.round(H * 0.2), width: W, height: Math.round(H * 0.2), backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)" })} />
          <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 0.8 - 10 * u, width: 90 * u, height: 8 * u, background: acento })} />
          <div style={flex({ position: "absolute", right: m, top: H - m - logoH * 0.8, justifyContent: "flex-end" })}>
            <Assinatura e={e} fundo="#000000" altura={Math.round(logoH * 0.8)} alinhar="flex-end" />
          </div>
        </>,
        "#000000"
      );
    }

    case "capa-objetos": {
      // C: capa escura com o título em duas cores e o objeto num círculo com
      // anel do destaque; o "arraste para o lado" só na capa do carrossel.
      const z = zonaDaFotoNova(md, W, H)!;
      const anel = Math.round(10 * u);
      // O raio é metade do lado (o Satori ignora um raio maior que a caixa).
      const raio = Math.round(z.w / 2);
      const tituloH = Math.round(z.y - m - logoH - 40 * u);
      return raiz(
        <>
          {logoNoAlto(fundo)}
          <div style={flex({ position: "absolute", left: m, top: m + logoH + 40 * u, width: larguraUtil, height: tituloH, flexDirection: "column", justifyContent: "flex-start" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={104 * u} corpoMinimo={40 * u} entrelinha={1.08} cor={tinta} caixaAlta={caixaAlta} destaque="cor" corDestaque={acentoLegivel} palavras={[palavra]} maxLinhas={4} />
          </div>
          <div style={flex({ position: "absolute", left: z.x - anel, top: z.y - anel, width: z.w + 2 * anel, height: z.h + 2 * anel, borderRadius: raio + anel, background: acento })} />
          {e.foto ? <Imagem src={e.foto} z={z} raio={raio} /> : <Vazio z={z} cor={tomDaFoto} raio={raio} />}
          {capaDoCarrossel ? (
            <div style={flex({ position: "absolute", left: m, top: H - m - 70 * u })}>
              <Arraste cor={acentoLegivel} tinta={tinta} fonte={xf} u={u} />
            </div>
          ) : null}
        </>,
        fundo
      );
    }

    case "mapa-pontilhado": {
      // C: o mapa-múndi pontilhado num tom acima do fundo, o título em duas
      // cores à esquerda e a pessoa recortada à direita; o selo só na capa.
      const corMapa = misturar(fundo, tinta, 0.22);
      const mapaW = Math.round(W * 1.1);
      const mapaH = Math.round((mapaW * 44) / 96);
      const mapaTop = Math.round(H * (alta ? 0.36 : 0.3));
      const tituloH = Math.round(H * (alta ? 0.26 : 0.3));
      const quadro: Zona = alta
        ? { x: Math.round(W * 0.3), y: Math.round(H * 0.5), w: Math.round(W * 0.64), h: Math.round(H * 0.4) }
        : { x: Math.round(W * 0.44), y: Math.round(H * 0.46), w: Math.round(W * 0.5), h: Math.round(H * 0.46) };
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: -Math.round(W * 0.05), top: mapaTop, width: mapaW, height: mapaH })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapaPontilhadoDataUri(corMapa)} alt="" width={mapaW} height={mapaH} style={{ width: mapaW, height: mapaH }} />
          </div>
          {logoNoAlto(fundo)}
          <div style={flex({ position: "absolute", left: m, top: Math.max(Math.round(m * 0.5), m + logoH + 40 * u + sobeTitulo), width: Math.round(larguraUtil * (alta ? 1 : 0.92)), height: tituloH, flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={Math.round(larguraUtil * (alta ? 1 : 0.92))} altura={tituloH} corpoMaximo={100 * u} corpoMinimo={40 * u} entrelinha={1.08} cor={tinta} caixaAlta={caixaAlta} destaque="cor" corDestaque={acentoLegivel} palavras={[palavra]} maxLinhas={4} />
          </div>
          {e.recorte ? (
            recorteNaFrente(alta ? 0.12 : 0.2, alta ? 0.78 : 0.82)
          ) : e.foto ? (
            <Imagem src={e.foto} z={quadro} raio={Math.round(36 * u)} />
          ) : (
            <Vazio z={quadro} cor={tomDaFoto} raio={Math.round(36 * u)} />
          )}
          <div style={flex({ position: "absolute", left: 0, top: H - Math.round(H * 0.16), width: W, height: Math.round(H * 0.16), backgroundImage: `linear-gradient(180deg, ${rgba(fundo, 0)} 0%, ${rgba(fundo, 0.9)} 100%)` })} />
          {capaDoCarrossel ? (
            <div style={flex({ position: "absolute", left: m, top: H - m - 70 * u })}>
              <Arraste cor={acentoLegivel} tinta={tinta} fonte={xf} u={u} />
            </div>
          ) : null}
        </>,
        fundo
      );
    }

    case "papel-pb": {
      // Colagem: a foto sem cor, a tira de papel torta com a frase e a
      // palavra-chave em pincel no destaque, presa com fita.
      const tiraW = Math.round(larguraUtil * 1.04);
      const tiraX = Math.round((W - tiraW) / 2);
      const pad = Math.round(34 * u);
      const tiraTop = Math.round(H * (alta ? 0.5 : 0.52));
      const alturaTexto = Math.round(H * (alta ? 0.2 : 0.26));
      const fonteDoPincel: FonteId = md.tipografia.texto;
      return raiz(
        <>
          {fotoInteira(e.foto)}
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.5) 100%)" })} />
          <div style={flex({ position: "absolute", left: tiraX, top: tiraTop, width: tiraW, padding: pad, background: "#f7f4ee", transform: "rotate(-2deg)", boxShadow: "0 24px 50px rgba(0,0,0,0.35)", flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={tiraW - 2 * pad} altura={alturaTexto} corpoMaximo={82 * u} corpoMinimo={36 * u} entrelinha={1.12} cor="#151515" caixaAlta={caixaAlta} destaque="pincel" corDestaque={acento} fonteDoDestaque={fonteDoPincel} palavras={[palavra]} maxLinhas={4} />
          </div>
          <div style={flex({ position: "absolute", left: tiraX + tiraW * 0.08, top: tiraTop - 22 * u, width: 170 * u, height: 48 * u, background: rgba(acento, 0.85), transform: "rotate(-8deg)" })} />
          <div style={flex({ position: "absolute", left: tiraX + tiraW * 0.74, top: tiraTop - 10 * u, width: 150 * u, height: 48 * u, background: rgba(acento, 0.85), transform: "rotate(6deg)" })} />
          {logoNoPe("#000000", "flex-end")}
        </>,
        "#000000"
      );
    }
  }
  return null;
}
