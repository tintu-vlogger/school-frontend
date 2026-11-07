"use client";

/*
 * Feedback: what I received and gave, requests waiting for me, what I asked for and, for
 * managers, feedback shared with them about their team. Give, ask and answer in modals.
 */
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HandHeart, Inbox, MessageSquareHeart, Send, Users } from "lucide-react";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Button, Skeleton, Tabs } from "@/components/ui-kit";
import { PerformanceTabs, useList, usePerfMe } from "@/components/performance/shared";
import { AnswerFeedbackModal, AskFeedbackModal, FeedbackCard, GiveFeedbackModal } from "@/components/performance/talent/feedback";
import type { FeedbackItem } from "@/components/performance/types";

type Box = "received" | "given" | "requests" | "asked" | "team";

const EMPTY: Record<Box, { title: string; hint: string }> = {
  received: { title: "No feedback yet", hint: "Ask a few colleagues what you should keep doing and what to change." },
  given: { title: "You haven't given feedback yet", hint: "A short note of thanks goes a long way." },
  requests: { title: "Nothing waiting for you", hint: "When someone asks for your feedback, it shows up here." },
  asked: { title: "You haven't asked anyone yet", hint: "Ask people you work closely with." },
  team: { title: "Nothing shared about your team yet", hint: "Feedback that people share with you as their manager shows up here." },
};

function FeedbackPage() {
  const { me, reload } = usePerfMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const box = (params.get("box") as Box) || "received";
  const [give, setGive] = useState(false);
  const [ask, setAsk] = useState(false);
  const [answering, setAnswering] = useState<FeedbackItem | null>(null);
  const [session, setSession] = useState(0);
  const list = useList<FeedbackItem>(`/performance/feedback?box=${box}`, "Couldn't load feedback");
  const requests = useList<FeedbackItem>("/performance/feedback?box=requests", "Couldn't load requests");

  const setBox = (b: string) => router.replace(b === "received" ? pathname : `${pathname}?box=${b}`, { scroll: false });
  const after = () => { list.refresh(); requests.refresh(); reload(); };
  const isEmployee = !!me?.employee_id;

  const items = [
    { value: "received", label: "Received", icon: Inbox },
    { value: "given", label: "Given", icon: Send },
    { value: "requests", label: "Requests for me", icon: HandHeart, count: requests.rows.length || undefined },
    { value: "asked", label: "I asked", icon: MessageSquareHeart },
    ...(me?.is_manager || me?.is_admin ? [{ value: "team", label: "My team", icon: Users }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow="Performance" title="Feedback"
        description="Praise, suggestions and requests for feedback, all year round."
        actions={<>
          {isEmployee && <Button variant="secondary" icon={HandHeart} onClick={() => { setSession((s) => s + 1); setAsk(true); }}>Ask for feedback</Button>}
          <Button variant="primary" icon={Send} onClick={() => { setSession((s) => s + 1); setGive(true); }}>Give feedback</Button>
        </>} />
      <PerformanceTabs me={me} />
      <Tabs variant="pill" value={box} onChange={setBox} items={items} className="mb-5" />

      <div className="mx-auto max-w-3xl">
        {list.loading && !list.rows.length ? (
          <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        ) : list.rows.length ? (
          <div className="space-y-4">
            {list.rows.map((f) => <FeedbackCard key={f.uuid} item={f} view={box} onAnswer={() => setAnswering(f)} />)}
          </div>
        ) : (
          <Paper><EmptyState icon={MessageSquareHeart} title={EMPTY[box].title} hint={EMPTY[box].hint} /></Paper>
        )}
      </div>

      <GiveFeedbackModal key={`g${session}`} open={give} onClose={() => setGive(false)}
        onSaved={() => { setGive(false); after(); if (box !== "given") setBox("given"); }} />
      <AskFeedbackModal key={`a${session}`} open={ask} isManager={!!me?.is_manager} onClose={() => setAsk(false)}
        onSaved={() => { setAsk(false); after(); setBox("asked"); }} />
      <AnswerFeedbackModal key={answering?.uuid ?? "none"} item={answering} onClose={() => setAnswering(null)}
        onSaved={() => { setAnswering(null); after(); }} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><FeedbackPage /></Suspense>;
}
