"use client";

/*
 * Assistant: ask questions about people, time, leave and reports in plain words.
 * Answers come with numbers, tables and charts. Recent conversations sit on the left.
 * A question typed on the overview arrives as ?q= and is asked once on load.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, History, MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { Button, IconButton, Menu, Skeleton, useConfirm, useToast, type MenuItem } from "@/components/ui-kit";
import { PageHeader } from "@/components/shell/page";
import { MessageView, Typing, type Block, type Msg, type ToolUse } from "@/components/insights/assistant/message";

type Status = { mode: "model" | "builtin"; model_label: string | null; examples: string[]; can_configure: boolean };
type ThreadBrief = { uuid: string; title: string; updated_at: string; messages: number };
type AskResult = { thread_uuid: string; answer: { text: string; blocks: Block[]; tools: ToolUse[]; mode: string } };

export default function AssistantPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [threads, setThreads] = useState<ThreadBrief[] | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [opening, setOpening] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<string | null>(null);
  useEffect(() => { threadRef.current = thread; }, [thread]);

  const loadThreads = useCallback(() => {
    api.get<ThreadBrief[]>("/assistant/threads").then(setThreads).catch(() => setThreads([]));
  }, []);

  useEffect(() => {
    api.get<Status>("/assistant/status").then(setStatus).catch(() => {});
    loadThreads();
  }, [loadThreads]);

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setSending(true);
    try {
      const r = await api.post<AskResult>("/assistant/ask", { question: q, ...(threadRef.current ? { thread_uuid: threadRef.current } : {}) });
      threadRef.current = r.thread_uuid;
      setThread(r.thread_uuid);
      setMessages((m) => [...m, { role: "assistant", text: r.answer.text, blocks: r.answer.blocks, tools: r.answer.tools, mode: r.answer.mode }]);
      loadThreads();
    } catch (e) {
      setMessages((m) => (m.length && m[m.length - 1].role === "user" && m[m.length - 1].text === q ? m.slice(0, -1) : m));
      setInput(q);
      toast.error("Couldn't get an answer", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
      setTimeout(() => boxRef.current?.focus(), 0);
    }
  }, [loadThreads, toast]);

  // A question typed on the overview arrives as ?q=
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      router.replace("/dashboard/assistant", { scroll: false });
      ask(q);
    }
  }, [ask, router]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  // Autosize the composer
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  async function open(uuid: string) {
    if (uuid === thread || sending) return;
    setOpening(true);
    setThread(uuid);
    try {
      const t = await api.get<{ uuid: string; messages: Msg[] }>(`/assistant/threads/${uuid}`);
      setMessages(t.messages);
    } catch (e) {
      toast.error("Couldn't open the conversation", { description: e instanceof Error ? e.message : undefined });
      setThread(null);
      setMessages([]);
    } finally {
      setOpening(false);
    }
  }

  function newChat() {
    if (sending) return;
    setThread(null);
    threadRef.current = null;
    setMessages([]);
    setInput("");
    boxRef.current?.focus();
  }

  async function remove(t: ThreadBrief) {
    const ok = await confirm({ title: "Delete this conversation?", message: `“${t.title}” will be removed.`, confirmLabel: "Delete", tone: "danger",
      onConfirm: () => api.delete(`/assistant/threads/${t.uuid}`) });
    if (!ok) return;
    setThreads((l) => l?.filter((x) => x.uuid !== t.uuid) ?? null);
    if (thread === t.uuid) newChat();
  }

  const recentMenu: MenuItem[] = (threads ?? []).slice(0, 12).map((t) => ({ label: t.title, onSelect: () => open(t.uuid), hint: formatRelative(t.updated_at) }));

  const modeChip = status && (
    status.mode === "model" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.05] px-3 py-1 text-[12.5px] text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />Answering with {status.model_label || "your AI model"}
      </span>
    ) : (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" />Built-in answers
        {status.can_configure ? (
          <> · <Link href="/dashboard/settings/integrations" className="text-primary hover:underline">connect an AI model</Link> for free-form questions</>
        ) : <span className="text-faint"> · free-form questions need an AI model</span>}
      </span>
    )
  );

  const empty = messages.length === 0 && !opening;

  return (
    <div className="flex gap-8">
      <aside className="sticky top-6 hidden max-h-[calc(100vh-8rem)] w-60 shrink-0 flex-col lg:flex">
        <Button icon={MessageSquarePlus} onClick={newChat} className="w-full justify-start">New chat</Button>
        <p className="mb-1.5 mt-6 px-2 text-[11.5px] uppercase tracking-[0.08em] text-faint">Recent</p>
        <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
          {threads === null ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="my-2 h-4 w-full" />)
          ) : !threads.length ? (
            <p className="px-2 text-[13px] text-faint">Your conversations will show here.</p>
          ) : threads.map((t) => (
            <div key={t.uuid}
              className={`group flex items-center gap-1 rounded-lg pl-2.5 pr-1 transition-colors ${t.uuid === thread ? "bg-sunken" : "hover:bg-sunken/60"}`}>
              <button type="button" onClick={() => open(t.uuid)} className="min-w-0 flex-1 py-2 text-left">
                <span className={`block truncate text-[13.5px] ${t.uuid === thread ? "text-ink" : "text-muted"}`}>{t.title}</span>
                <span className="block text-[11.5px] text-faint">{formatRelative(t.updated_at)}</span>
              </button>
              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <IconButton icon={Trash2} label="Delete conversation" size="sm" onClick={() => remove(t)} />
              </span>
            </div>
          ))}
        </div>
      </aside>

      <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full min-w-0 max-w-3xl flex-col">
        <PageHeader title="Assistant" actions={
          <>
            {modeChip}
            <span className="lg:hidden">
              {!!threads?.length && <Menu items={recentMenu} label="Recent conversations" trigger={<IconButton icon={History} label="Recent conversations" />} />}
            </span>
            <span className="lg:hidden"><IconButton icon={MessageSquarePlus} label="New chat" onClick={newChat} /></span>
          </>
        } />

        <div className="flex-1 space-y-7 pb-8">
          {opening ? (
            <div className="space-y-6">
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
              <Skeleton className="h-24 w-4/5 rounded-2xl" />
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center pt-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.05]">
                <Sparkles size={26} strokeWidth={1.2} className="text-primary" />
              </span>
              <h2 className="mt-5 text-[26px] font-extralight text-ink">What would you like to know?</h2>
              <p className="mt-1.5 max-w-md text-[14.5px] text-muted">Ask about your people, attendance, leave and reports. Answers only include what you are allowed to see.</p>
              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {(status?.examples ?? []).slice(0, 6).map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} disabled={sending}
                    className="rounded-xl border border-line bg-surface px-4 py-3.5 text-left text-[14px] text-muted transition-colors hover:border-primary/40 hover:text-ink">
                    {s}
                  </button>
                ))}
                {!status && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[50px] rounded-xl" />)}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <MessageView key={i} m={m} />)
          )}
          {sending && <Typing />}
          <div ref={endRef} />
        </div>

        <div className="sticky bottom-0 bg-gradient-to-t from-canvas via-canvas to-transparent pb-4 pt-3">
          <form onSubmit={(e) => { e.preventDefault(); if (!sending) ask(input); }}
            className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 transition-colors focus-within:border-primary/40">
            <textarea ref={boxRef} id="assistant-input" rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!sending) ask(input);
                }
              }}
              placeholder="Ask anything about your people…" aria-label="Your question"
              className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-faint" />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity disabled:opacity-30">
              <ArrowUp size={17} strokeWidth={1.6} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11.5px] text-faint">Enter to send · Shift + Enter for a new line</p>
        </div>
      </div>
    </div>
  );
}
