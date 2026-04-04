import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db/prisma";
import { parseLinkedInArticleContent } from "@/lib/articles/linkedin-article";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const post = await prisma.post.findUnique({
    where: { articlePublicToken: token },
    select: { content: true, mediaType: true },
  });
  if (!post || post.mediaType !== "article") {
    return { title: "Artigo" };
  }
  const { title, teaser } = parseLinkedInArticleContent(post.content ?? "");
  return {
    title: title || "Artigo",
    description: teaser || undefined,
    robots: { index: true, follow: true },
  };
}

function bodyToParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default async function PublicArticlePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const post = await prisma.post.findUnique({
    where: { articlePublicToken: token },
    include: { project: { select: { name: true } } },
  });

  if (!post || post.mediaType !== "article") {
    notFound();
  }

  const { title, body, teaser } = parseLinkedInArticleContent(post.content ?? "");
  const paragraphs = bodyToParagraphs(body);
  const cover = post.imageUrl?.startsWith("https://") ? post.imageUrl : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between gap-4">
          <span className="text-sm text-zinc-400 truncate">{post.project.name}</span>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 pb-20">
        {cover ? (
          <div className="relative mb-10 aspect-[1.91/1] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <Image
              src={cover}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 48rem"
              unoptimized
            />
          </div>
        ) : null}

        <h1 className="font-mont text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-4">
          {title}
        </h1>
        {teaser ? <p className="text-lg text-zinc-400 mb-10 leading-relaxed">{teaser}</p> : null}

        <div className="prose prose-invert prose-p:text-zinc-300 prose-p:leading-relaxed max-w-none space-y-6">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[17px] leading-7 text-zinc-300 whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}
