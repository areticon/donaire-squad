import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * REMARCAR COM UM TOQUE (01/10, régua de alertas). O botão do WhatsApp só
 * aceita a parte variável no FIM do endereço, então "?remarcar=1" não cabe no
 * modelo: este endereço curto leva à página da reunião já no calendário.
 */
export default async function RemarcarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/demonstracao/reuniao/${encodeURIComponent(token)}?remarcar=1`);
}
