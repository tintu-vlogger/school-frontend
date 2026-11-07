"use client";

/*
 * The join page for a live class (staff and portal).
 *   <JoinRoom joinPath={`/lms/online-classes/${uuid}/join`} backHref="/dashboard/lms/online-classes" />
 * Joining is recorded by the API (attendance). Built-in classes open a Jitsi Meet room inside the
 * page through the Jitsi iframe API (the institution's own Jitsi server when set in settings);
 * Zoom / Google Meet / Teams classes show the meeting details and open the link in a new tab.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Maximize2, PhoneOff, Video } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { Button, KeyValue, Skeleton } from "@/components/ui-kit";
import { Paper } from "@/components/shell/page";
import { PhaseBadge } from "./shared";
import type { JoinInfo } from "./lib";

type JitsiApi = { dispose: () => void; addListener: (e: string, fn: () => void) => void };
declare global {
  interface Window { JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi }
}

const loaded: Record<string, Promise<void>> = {};
function loadJitsi(domain: string): Promise<void> {
  if (typeof window !== "undefined" && window.JitsiMeetExternalAPI) return Promise.resolve();
  if (!loaded[domain]) {
    loaded[domain] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://${domain}/external_api.js`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete loaded[domain]; reject(new Error("The video service could not be reached.")); };
      document.head.appendChild(s);
    });
  }
  return loaded[domain];
}

export function JoinRoom({ joinPath, backHref, onEnd }: { joinPath: string; backHref: string; onEnd?: (info: JoinInfo) => Promise<void> }) {
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);

  useEffect(() => {
    let live = true;
    api.post<JoinInfo>(joinPath).then((r) => { if (live) setInfo(r); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Couldn't open the class"); });
    return () => { live = false; };
  }, [joinPath]);

  useEffect(() => {
    if (!info || info.provider !== "jitsi" || !info.jitsi_domain || !info.room_name || left) return;
    let disposed = false;
    loadJitsi(info.jitsi_domain).then(() => {
      if (disposed || !host.current || !window.JitsiMeetExternalAPI) return;
      host.current.innerHTML = "";
      apiRef.current = new window.JitsiMeetExternalAPI(info.jitsi_domain!, {
        roomName: info.room_name, parentNode: host.current, width: "100%", height: "100%",
        userInfo: { displayName: info.display_name || "Guest" },
        configOverwrite: { prejoinPageEnabled: false, startWithAudioMuted: !info.is_moderator, subject: info.title,
          disableDeepLinking: true },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false, SHOW_JITSI_WATERMARK: false },
      });
      apiRef.current.addListener("readyToClose", () => setLeft(true));
    }).catch((e) => setError(e instanceof Error ? e.message : "The video service could not be reached."));
    return () => { disposed = true; apiRef.current?.dispose(); apiRef.current = null; };
  }, [info, left]);

  const back = (
    <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink">
      <ArrowLeft size={15} strokeWidth={1.4} /> Back to classes
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <Paper className="flex flex-col items-center px-6 py-14 text-center">
          <Video size={28} strokeWidth={1.2} className="mb-3 text-faint" />
          <p className="text-[15px] text-ink">{error}</p>
          <p className="mt-1 text-[13.5px] text-muted">Check the class time and try again.</p>
        </Paper>
      </div>
    );
  }
  if (!info) return <div className="space-y-4">{back}<Skeleton className="h-[70vh] w-full rounded-2xl" /></div>;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-[20px] font-light text-ink">{info.title}</h1>
          <PhaseBadge phase={info.phase} />
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {[info.subject_name, info.section_label, info.teacher_name].filter(Boolean).join(" · ")} · {formatTime(info.starts_at)}–{formatTime(info.ends_at)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {info.provider === "jitsi" && info.join_url && <a href={info.join_url} target="_blank" rel="noreferrer"><Button size="sm" icon={Maximize2}>Open in new tab</Button></a>}
        {info.is_moderator && onEnd && <Button size="sm" variant="danger" icon={PhoneOff} onClick={() => onEnd(info)}>End class</Button>}
      </div>
    </div>
  );

  if (info.provider !== "jitsi") {
    return (
      <div className="space-y-4">
        {back}
        {header}
        <Paper className="p-6">
          <p className="text-[14px] text-ink">This class runs on {info.provider_label}.</p>
          <p className="mt-1 text-[13.5px] text-muted">Your attendance has been noted. Open the meeting to join.</p>
          <div className="my-5">
            <KeyValue columns={3} items={[
              { label: "Starts", value: formatDateTime(info.starts_at) },
              { label: "Meeting ID", value: info.meeting_code },
              { label: "Passcode", value: info.passcode },
            ]} />
          </div>
          {info.join_url && <a href={info.join_url} target="_blank" rel="noreferrer"><Button variant="primary" iconRight={ExternalLink}>Open {info.provider_label}</Button></a>}
        </Paper>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      {header}
      {left ? (
        <Paper className="flex flex-col items-center px-6 py-14 text-center">
          <p className="text-[15px] text-ink">You left the class.</p>
          <Button className="mt-4" icon={Video} onClick={() => setLeft(false)}>Rejoin</Button>
        </Paper>
      ) : (
        <div ref={host} className="h-[calc(100vh-220px)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-line bg-black" />
      )}
    </div>
  );
}
