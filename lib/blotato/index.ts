const BLOTATO_BASE = "https://mcp.blotato.com/mcp";

async function blotatoCall(toolName: string, args: Record<string, unknown>) {
  const res = await fetch(BLOTATO_BASE, {
    method: "POST",
    headers: {
      "blotato-api-key": process.env.BLOTATO_API_KEY!,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Blotato HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  const textContent = json?.result?.content?.[0]?.text;
  if (!textContent) throw new Error("No content in Blotato response");
  return JSON.parse(textContent);
}

export async function listAccounts() {
  return blotatoCall("blotato_list_accounts", {});
}

export async function createPost(params: {
  accountId: string;
  platform: string;
  text: string;
  mediaUrls?: string[];
  additionalPosts?: Array<{ text: string; mediaUrls?: string[] }>;
  pageId?: string;
  scheduledAt?: string;
}) {
  return blotatoCall("blotato_create_post", {
    accountId: params.accountId,
    platform: params.platform,
    text: params.text,
    mediaUrls: params.mediaUrls ?? [],
    ...(params.additionalPosts && { additionalPosts: params.additionalPosts }),
    ...(params.pageId && { pageId: params.pageId }),
    ...(params.scheduledAt && { scheduledAt: params.scheduledAt }),
  });
}

export const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};
