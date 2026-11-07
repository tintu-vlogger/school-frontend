"use client";

/* Shows a study material: YouTube player, link, note text and files.  <MaterialPreview m={material} /> */
import { FileText, Link2, NotebookText, PlayCircle } from "lucide-react";
import type { IconType } from "@/components/ui-kit";
import { Attachments, LinkOut, RichText } from "./shared";
import type { Material } from "./lib";

export const KIND_ICON: Record<string, IconType> = { file: FileText, link: Link2, video: PlayCircle, note: NotebookText };
export const KIND_LABEL: Record<string, string> = { file: "File", link: "Link", video: "Video", note: "Note" };

export function MaterialPreview({ m }: { m: Material }) {
  return (
    <div className="space-y-4">
      {m.kind === "video" && m.embed_url && (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
          <iframe src={m.embed_url} title={m.title} className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      {m.kind === "video" && !m.embed_url && m.url && <LinkOut href={m.url}>Watch the video</LinkOut>}
      {m.kind === "link" && m.url && <LinkOut href={m.url}>{m.url}</LinkOut>}
      <RichText text={m.description} />
      <Attachments files={m.attachments} />
    </div>
  );
}

