/**
 * Facebook (páginas) pelo mesmo app da Meta do Instagram.
 *
 * A diferença estrutural para o Instagram: quem publica não é o usuário, é a
 * PÁGINA. O fluxo tem um passo a mais: depois do OAuth do usuário, lista-se
 * as páginas que ele administra em /me/accounts e guarda-se o token DE CADA
 * PÁGINA, que é o que o POST /{page_id}/feed aceita. Token de usuário no
 * feed da página é erro.
 *
 * Permissões (conferidas na doc em 21/08/2026): pages_show_list para listar,
 * pages_read_engagement e pages_manage_posts para publicar. O token de página
 * obtido a partir de um token de usuário de longa duração não expira por
 * tempo; morre por troca de senha, revogação ou auditoria da Meta, e nesse
 * caso a publicação falha com erro claro pedindo reconexão.
 */

const FB = "https://www.facebook.com/v23.0";
const GRAPH = "https://graph.facebook.com/v23.0";

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
].join(",");

export function facebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function getFacebookAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  // App Business com "Login do Facebook para Empresas" NÃO aceita permissões
  // soltas no parâmetro scope: o diálogo responde "Invalid Scopes" mesmo com
  // os nomes oficiais (pago em 21/08 no teste do Bruno). Essa variante exige
  // uma Configuração criada no painel do app, que empacota as permissões, e
  // a URL passa só o id dela. O fallback por scope fica para o caso de app
  // clássico (Consumer), que aceita.
  if (process.env.FACEBOOK_CONFIG_ID) {
    params.set("config_id", process.env.FACEBOOK_CONFIG_ID);
  } else {
    params.set("scope", FACEBOOK_SCOPES);
  }

  // Força a tela de escolha de páginas em toda conexão. Sem isto a Meta
  // oferece "continuar com suas configurações anteriores", e quem já tinha
  // autorizado o app antes (inclusive numa tentativa que falhou) entra
  // reaproveitando a concessão velha: o OAuth passa, /me/accounts volta
  // vazio, e a conexão morre em silêncio. Pago em 21/08 no teste do Bruno.
  params.set("auth_type", "rerequest");

  /**
   * O IDIOMA DO DIALOGO DA META, quando a gravacao do App Review exige.
   *
   * A analise de 22/09 reprovou as cinco permissoes com o mesmo motivo (o
   * screencast nao mostra o caso de uso completo) e pediu, entre as boas
   * praticas, "usar ingles como idioma de interface do app".
   *
   * MEDIDO EM 22/09, e o resultado foi NAO: a mesma URL com `locale=en_US` e
   * com `locale=pt_BR` devolve `<html lang="pt">` nos dois casos, com os
   * mesmos rotulos em portugues. **O Facebook ignora este parametro aqui** e
   * decide o idioma pela conta de quem esta logado. Quem precisa do dialogo
   * em ingles troca o idioma da CONTA do Facebook antes de gravar.
   *
   * O parametro fica porque nao custa nada e pode valer em outro dialogo da
   * Meta, mas quem contar com ele para a gravacao vai gravar em portugues de
   * novo. O comentario existe para ninguem repetir o meu erro.
   */
  const locale = process.env.OAUTH_LOCALE;
  if (locale) params.set("locale", locale);

  return `${FB}/dialog/oauth?${params.toString()}`;
}

/** Troca o code pelo token de usuário e este pelo de longa duração. */
export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{ userToken: string }> {
  const res = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri: redirectUri,
        code,
      })
  );
  if (!res.ok) throw new Error(`Facebook token exchange failed: ${await res.text()}`);
  const short = (await res.json()) as { access_token: string };

  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        fb_exchange_token: short.access_token,
      })
  );
  if (!longRes.ok) {
    throw new Error(`Facebook long-lived exchange failed: ${await longRes.text()}`);
  }
  const long = (await longRes.json()) as { access_token: string };
  return { userToken: long.access_token };
}

export interface FacebookPage {
  pageId: string;
  name: string;
  pageToken: string;
  avatarUrl: string | null;
}

/**
 * Páginas que a pessoa administra, cada uma com o próprio token. Vem só o que
 * a pessoa marcou na tela de consentimento: ela pode conceder uma página e
 * negar as outras, e lista vazia aqui é isso, não erro.
 */
export async function listFacebookPages(userToken: string): Promise<FacebookPage[]> {
  const paginas = await viaMeAccounts(userToken);
  if (paginas.length > 0) return paginas;

  // Caminho do Login para Empresas. Descoberto em 22/08 depois de horas: com
  // a variante Business, o token é vinculado ao PORTFÓLIO, e as páginas
  // concedidas não saem por /me/accounts, que devolve {"data":[]} mesmo com
  // pages_show_list, pages_read_engagement e pages_manage_posts todas
  // "granted" (conferido no log de produção). Elas saem pelos portfólios do
  // usuário, em owned_pages e client_pages.
  const doPortfolio = await viaPortfolios(userToken);
  if (doPortfolio.length > 0) return doPortfolio;

  const perms = await fetch(`${GRAPH}/me/permissions?access_token=${userToken}`)
    .then((r) => r.text())
    .catch((e) => `falhou: ${e}`);
  console.error(
    "[facebook] nenhuma página por /me/accounts nem pelos portfólios.",
    "permissões efetivas:", perms.slice(0, 400)
  );
  return [];
}

async function viaMeAccounts(userToken: string): Promise<FacebookPage[]> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${userToken}`
  );
  const bruto = await res.text();
  if (!res.ok) {
    console.error("[facebook] /me/accounts falhou:", bruto.slice(0, 300));
    return [];
  }
  const json = JSON.parse(bruto) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
    }>;
  };
  return (json.data ?? []).map((p) => ({
    pageId: p.id,
    name: p.name,
    pageToken: p.access_token,
    avatarUrl: p.picture?.data?.url ?? null,
  }));
}

/**
 * Páginas alcançáveis pelos portfólios empresariais do usuário. O token de
 * página vem numa segunda chamada, por página: o campo access_token não vem
 * nas listas de portfólio, só na leitura direta da página.
 */
async function viaPortfolios(userToken: string): Promise<FacebookPage[]> {
  const negocios = await fetch(
    `${GRAPH}/me/businesses?fields=id,name&access_token=${userToken}`
  )
    .then((r) => r.json())
    .catch(() => null);

  const lista = (negocios?.data ?? []) as Array<{ id: string; name: string }>;
  console.error(
    "[facebook] portfólios visíveis ao token:",
    JSON.stringify(lista).slice(0, 300)
  );

  const encontradas: FacebookPage[] = [];
  const vistas = new Set<string>();

  for (const negocio of lista) {
    for (const rel of ["owned_pages", "client_pages"]) {
      const r = await fetch(
        `${GRAPH}/${negocio.id}/${rel}?fields=id,name,picture{url}&access_token=${userToken}`
      )
        .then((x) => x.json())
        .catch(() => null);

      const itens = (r?.data ?? []) as Array<{
        id: string;
        name: string;
        picture?: { data?: { url?: string } };
      }>;
      if (r?.error) {
        console.error(`[facebook] ${rel} de ${negocio.id}:`, JSON.stringify(r.error).slice(0, 200));
      }

      for (const pag of itens) {
        if (vistas.has(pag.id)) continue;
        vistas.add(pag.id);

        // O token da página só vem na leitura direta dela.
        const det = await fetch(
          `${GRAPH}/${pag.id}?fields=access_token,name,picture{url}&access_token=${userToken}`
        )
          .then((x) => x.json())
          .catch(() => null);

        if (!det?.access_token) {
          console.error(
            `[facebook] página ${pag.id} (${pag.name}) sem access_token:`,
            JSON.stringify(det?.error ?? det).slice(0, 200)
          );
          continue;
        }

        encontradas.push({
          pageId: pag.id,
          name: det.name ?? pag.name,
          pageToken: det.access_token,
          avatarUrl:
            det.picture?.data?.url ?? pag.picture?.data?.url ?? null,
        });
      }
    }
  }

  return encontradas;
}

async function fbPost(
  path: string,
  pageToken: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: pageToken }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Facebook ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** Post de texto no feed da página. */
export async function publishFacebookText(
  pageToken: string,
  pageId: string,
  message: string
): Promise<{ postId: string; url: string }> {
  const json = await fbPost(`${pageId}/feed`, pageToken, { message });
  const postId = String(json.id ?? "");
  if (!postId) throw new Error("Facebook feed: resposta sem id");
  return { postId, url: `https://www.facebook.com/${postId}` };
}

/**
 * Post com 1+ imagens. A imagem sobe como foto não publicada e o feed a
 * referencia por attached_media, que é o único jeito de juntar várias fotos
 * num post só. A Meta busca a imagem por URL pública, a mesma regra do
 * Instagram, então quem chama passa URLs já alcançáveis.
 */
/**
 * Publica vídeo na página, pelo mesmo caminho de busca por URL do Instagram.
 *
 * A Meta BUSCA o arquivo, ela não recebe upload, então a URL precisa ser
 * alcançável da internet. Blob privado não serve, e por isso quem chama passa a
 * rota assinada.
 *
 * `/videos` e não `/feed` com anexo: vídeo postado como anexo de feed vira um
 * link, sem player nem alcance de vídeo, que é o motivo de alguém publicar
 * vídeo na página.
 */
export async function publishFacebookVideo(
  pageToken: string,
  pageId: string,
  message: string,
  videoUrl: string
): Promise<{ postId: string; url: string }> {
  const json = await fbPost(`${pageId}/videos`, pageToken, {
    file_url: videoUrl,
    description: message,
  });
  const videoId = String(json.id ?? "");
  if (!videoId) throw new Error("Facebook videos: resposta sem id");
  // A resposta traz o id do VÍDEO, não o do post. O endereço abaixo abre o
  // vídeo na página, que é o que o cliente quer ver ao clicar no link.
  return { postId: videoId, url: `https://www.facebook.com/${pageId}/videos/${videoId}` };
}

export async function publishFacebookImagePost(
  pageToken: string,
  pageId: string,
  message: string,
  imageUrls: string[]
): Promise<{ postId: string; url: string }> {
  const mediaIds: string[] = [];
  for (const url of imageUrls) {
    const photo = await fbPost(`${pageId}/photos`, pageToken, {
      url,
      published: "false",
    });
    const id = String(photo.id ?? "");
    if (!id) throw new Error("Facebook photos: resposta sem id");
    mediaIds.push(id);
  }

  const body: Record<string, string> = { message };
  mediaIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const json = await fbPost(`${pageId}/feed`, pageToken, body);
  const postId = String(json.id ?? "");
  if (!postId) throw new Error("Facebook feed: resposta sem id");
  return { postId, url: `https://www.facebook.com/${postId}` };
}

/* ── Reels e stories de página (21/09, o formato por rede) ────────────────
 *
 * O feed da página publica por um POST só. Reels e stories de VÍDEO não: eles
 * usam o protocolo de upload em fases da Meta, que são três chamadas em dois
 * domínios diferentes (`graph.facebook.com` abre e fecha, `rupload.facebook.com`
 * recebe o arquivo). Pular uma fase devolve sucesso e não publica nada, que é
 * o mesmo defeito que o vídeo do LinkedIn teve em 21/09: "publicado" sem post.
 *
 * O arquivo vai por URL HOSPEDADA (cabeçalho `file_url`), e não por bytes:
 * a nossa mídia já é servida pela rota assinada que o Instagram usa, e mandar
 * o binário por aqui significaria carregar um vídeo de 19 MB na memória da
 * função para reenviá-lo.
 *
 * MEDIDO CONTRA A DOC, NÃO CONTRA A API: as contas de página do Bruno
 * dependem do App Review da Meta (card 520), então estes três caminhos estão
 * escritos a partir da documentação de 21/09 e provados na forma das chamadas,
 * não contra a rede. A diferença está dita aqui e no card, porque foi
 * exatamente essa distinção ("medido" contra "calculado") que salvou o preço
 * do vídeo longo.
 */

/**
 * Manda o arquivo pela URL onde ele já está, e devolve quando a Meta aceitou.
 *
 * `file_url` é cabeçalho, e não corpo: o corpo vai vazio. A Meta busca o
 * arquivo, então a URL precisa ser alcançável de fora (rota assinada, nunca
 * blob privado).
 */
async function fbUploadPorUrl(uploadUrl: string, pageToken: string, fileUrl: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: fileUrl,
    },
    signal: AbortSignal.timeout(5 * 60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Facebook upload falhou (${res.status}): ${text.slice(0, 400)}`);
  // A Meta responde `{"success":true}`. Resposta 200 com success ausente é o
  // caso em que o finish seguinte falharia sem dizer por quê, então é aqui que
  // a gente para: medir o que voltou, e não confiar no código de status.
  const json = JSON.parse(text) as { success?: boolean };
  if (json.success === false) throw new Error(`Facebook upload recusado: ${text.slice(0, 300)}`);
}

/**
 * Reels da página. `video_state: PUBLISHED` é o que faz o reel ir ao ar; sem
 * ele o vídeo fica como rascunho na página, invisível e sem erro nenhum.
 */
export async function publishFacebookReel(
  pageToken: string,
  pageId: string,
  message: string,
  videoUrl: string
): Promise<{ postId: string; url: string }> {
  const inicio = await fbPost(`${pageId}/video_reels`, pageToken, { upload_phase: "start" });
  const videoId = String(inicio.video_id ?? "");
  const uploadUrl = String(inicio.upload_url ?? "");
  if (!videoId || !uploadUrl) {
    throw new Error(`Facebook video_reels: start sem video_id ou upload_url (${JSON.stringify(inicio).slice(0, 300)})`);
  }

  await fbUploadPorUrl(uploadUrl, pageToken, videoUrl);

  const fim = await fbPost(`${pageId}/video_reels`, pageToken, {
    video_id: videoId,
    upload_phase: "finish",
    video_state: "PUBLISHED",
    description: message,
  });
  if (fim.success === false) {
    throw new Error(`Facebook video_reels: finish recusado (${JSON.stringify(fim).slice(0, 300)})`);
  }
  return { postId: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}

/**
 * Story de FOTO. Duas chamadas: a foto sobe não publicada (o mesmo truque do
 * post com várias imagens) e o story a referencia pelo id.
 *
 * Story não tem legenda em rede nenhuma, então o texto do post não entra aqui.
 * Quem chama é que decide o que dizer ao cliente sobre isso.
 */
export async function publishFacebookPhotoStory(
  pageToken: string,
  pageId: string,
  imageUrl: string
): Promise<{ postId: string; url: string }> {
  const foto = await fbPost(`${pageId}/photos`, pageToken, { url: imageUrl, published: "false" });
  const photoId = String(foto.id ?? "");
  if (!photoId) throw new Error("Facebook photos: resposta sem id para o story");

  const story = await fbPost(`${pageId}/photo_stories`, pageToken, { photo_id: photoId });
  if (story.success === false) {
    throw new Error(`Facebook photo_stories recusado (${JSON.stringify(story).slice(0, 300)})`);
  }
  const postId = String(story.post_id ?? photoId);
  return { postId, url: `https://www.facebook.com/stories/${pageId}` };
}

/** Story de VÍDEO: mesmas três fases do reel, sem `video_state`. */
export async function publishFacebookVideoStory(
  pageToken: string,
  pageId: string,
  videoUrl: string
): Promise<{ postId: string; url: string }> {
  const inicio = await fbPost(`${pageId}/video_stories`, pageToken, { upload_phase: "start" });
  const videoId = String(inicio.video_id ?? "");
  const uploadUrl = String(inicio.upload_url ?? "");
  if (!videoId || !uploadUrl) {
    throw new Error(`Facebook video_stories: start sem video_id ou upload_url (${JSON.stringify(inicio).slice(0, 300)})`);
  }

  await fbUploadPorUrl(uploadUrl, pageToken, videoUrl);

  const fim = await fbPost(`${pageId}/video_stories`, pageToken, {
    video_id: videoId,
    upload_phase: "finish",
  });
  if (fim.success === false) {
    throw new Error(`Facebook video_stories: finish recusado (${JSON.stringify(fim).slice(0, 300)})`);
  }
  const postId = String(fim.post_id ?? videoId);
  return { postId, url: `https://www.facebook.com/stories/${pageId}` };
}
