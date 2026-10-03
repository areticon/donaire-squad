"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ajustarEnquadramento,
  escalaDeCobertura,
  recorteNaImagem,
  type Enquadramento,
} from "@/lib/media/recorte-circular";

/**
 * O recorte da foto de perfil, antes de enviar.
 *
 * Nasceu em 17/09 de duas reclamacoes que pareciam separadas e sao a mesma:
 * "nao consigo subir a minha foto por causa do limite de 2 MB" e "precisa dar
 * para posicionar no circulo". **Recortar no navegador resolve as duas**, e e
 * por isso que este componente existe em vez de um limite maior no servidor.
 *
 * O arquivo original NUNCA sai da maquina da pessoa. O que sobe e o recorte
 * gerado aqui, 512 por 512, que sai em torno de 100 KB. O teto de 2 MB do
 * servidor deixou de ser um limite na pratica: ele virou so uma protecao contra
 * quem chamar a rota por fora.
 *
 * A area de preview e QUADRADA e a mascara e redonda. O recorte gerado tambem
 * e quadrado, de proposito: o circulo e decisao de quem exibe, e guardar a foto
 * ja recortada em circulo impediria mostrar quadrada em outro lugar depois.
 */

const LADO_DA_AREA = 320;
const LADO_DO_ARQUIVO = 512;
const TETO_DO_ORIGINAL = 25 * 1024 * 1024;

export function RecorteDeFoto({
  arquivo,
  aoCancelar,
  aoConfirmar,
  salvando,
}: {
  arquivo: File;
  aoCancelar: () => void;
  aoConfirmar: (recorte: Blob) => void | Promise<void>;
  salvando: boolean;
}) {
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enq, setEnq] = useState<Enquadramento>({ zoom: 1, x: 0, y: 0 });
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  const tela = useRef<HTMLCanvasElement>(null);

  // A imagem entra por <img> e nao por createImageBitmap porque a tag aplica a
  // orientacao do EXIF sozinha. Foto de celular tirada em pe costuma vir com a
  // rotacao so no metadado, e desenhar o bitmap cru a mostraria deitada.
  useEffect(() => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => setImagem(img);
    img.onerror = () =>
      setErro("Não consegui abrir esta imagem. Tente uma foto em PNG, JPG ou WEBP.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const desenhar = useCallback(() => {
    const canvas = tela.current;
    if (!canvas || !imagem) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const seguro = ajustarEnquadramento(enq, imagem.width, imagem.height, LADO_DA_AREA);
    const escala = escalaDeCobertura(imagem.width, imagem.height, LADO_DA_AREA) * seguro.zoom;
    const largura = imagem.width * escala;
    const altura = imagem.height * escala;

    ctx.clearRect(0, 0, LADO_DA_AREA, LADO_DA_AREA);
    ctx.drawImage(
      imagem,
      LADO_DA_AREA / 2 - largura / 2 + seguro.x,
      LADO_DA_AREA / 2 - altura / 2 + seguro.y,
      largura,
      altura
    );

    // A mascara: escurece tudo que fica FORA do circulo, para a pessoa ver o
    // que sobra sem precisar imaginar.
    ctx.save();
    ctx.fillStyle = "rgba(10,10,12,0.66)";
    ctx.beginPath();
    ctx.rect(0, 0, LADO_DA_AREA, LADO_DA_AREA);
    ctx.arc(LADO_DA_AREA / 2, LADO_DA_AREA / 2, LADO_DA_AREA / 2 - 2, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LADO_DA_AREA / 2, LADO_DA_AREA / 2, LADO_DA_AREA / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [imagem, enq]);

  useEffect(() => {
    desenhar();
  }, [desenhar]);

  function mover(dx: number, dy: number) {
    if (!imagem) return;
    setEnq((atual) =>
      ajustarEnquadramento(
        { ...atual, x: atual.x + dx, y: atual.y + dy },
        imagem.width,
        imagem.height,
        LADO_DA_AREA
      )
    );
  }

  async function confirmar() {
    if (!imagem) return;
    const r = recorteNaImagem(enq, imagem.width, imagem.height, LADO_DA_AREA);
    const saida = document.createElement("canvas");
    saida.width = LADO_DO_ARQUIVO;
    saida.height = LADO_DO_ARQUIVO;
    const ctx = saida.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem, r.sx, r.sy, r.sLargura, r.sAltura, 0, 0, LADO_DO_ARQUIVO, LADO_DO_ARQUIVO);

    const blob = await new Promise<Blob | null>((resolve) =>
      // JPEG e nao WEBP: a rota aceita os dois, mas JPEG e o formato que
      // qualquer navegador escreve sem surpresa, e a diferenca de tamanho num
      // quadrado de 512 e irrelevante.
      saida.toBlob((b) => resolve(b), "image/jpeg", 0.9)
    );
    if (blob) await aoConfirmar(blob);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar foto de perfil"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border p-5"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Ajuste sua foto
        </h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Arraste para posicionar e use o controle para aproximar.
        </p>

        {erro ? (
          <p className="my-6 text-sm text-red-400">{erro}</p>
        ) : (
          <>
            <div className="my-4 flex justify-center">
              <canvas
                ref={tela}
                width={LADO_DA_AREA}
                height={LADO_DA_AREA}
                className="max-w-full cursor-grab rounded-lg active:cursor-grabbing"
                style={{ background: "var(--bg-elevated)", touchAction: "none" }}
                onPointerDown={(e) => {
                  arrastando.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const de = arrastando.current;
                  if (!de) return;
                  mover(e.clientX - de.x, e.clientY - de.y);
                  arrastando.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={() => {
                  arrastando.current = null;
                }}
                onPointerCancel={() => {
                  arrastando.current = null;
                }}
              />
            </div>

            <label className="flex items-center gap-3">
              <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Zoom
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={enq.zoom}
                disabled={!imagem}
                onChange={(e) => {
                  if (!imagem) return;
                  setEnq((atual) =>
                    ajustarEnquadramento(
                      { ...atual, zoom: Number(e.target.value) },
                      imagem.width,
                      imagem.height,
                      LADO_DA_AREA
                    )
                  );
                }}
                className="flex-1 accent-orange-500"
              />
            </label>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} loading={salvando} disabled={!imagem || !!erro}>
            Salvar foto
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O teto do arquivo de ENTRADA, que nunca chega ao servidor. */
export const TETO_DA_FOTO_ORIGINAL = TETO_DO_ORIGINAL;
