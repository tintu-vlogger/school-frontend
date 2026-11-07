"use client";

/*
 * Buzz context: the engagement meta (reactions, permissions) and page-level actions that
 * any card may need (open an announcement, take a survey, edit a post, give kudos).
 *   <BuzzProvider value={{ meta, ... }}>...</BuzzProvider>    const buzz = useBuzz();
 */
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Meta, Post } from "./types";

export type BuzzActions = {
  meta: Meta | null;
  openAnnouncement?: (uuid: string) => void;
  takeSurvey?: (uuid: string) => void;
  editPost?: (post: Post) => void;
  giveKudos?: (to?: import("./types").Person) => void;
  openPost?: (uuid: string) => void;
};

const Ctx = createContext<BuzzActions>({ meta: null });

export function BuzzProvider({ value, children }: { value: BuzzActions; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBuzz = () => useContext(Ctx);

let metaCache: Meta | null = null;
export function useEngagementMeta() {
  const [meta, setMeta] = useState<Meta | null>(metaCache);
  useEffect(() => {
    api.get<Meta>("/engagement/meta").then((m) => { metaCache = m; setMeta(m); }).catch(() => {});
  }, []);
  return meta;
}

export const FALLBACK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "🔥", "🤩", "💯"];
