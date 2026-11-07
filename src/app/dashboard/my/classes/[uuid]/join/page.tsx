"use client";

/* Portal join page for a live class (the learner's attendance is recorded on joining). */
import { useParams } from "next/navigation";
import { JoinRoom } from "@/components/lms/video-room";
import { useChild } from "@/components/lms/shared";
import { Skeleton } from "@/components/ui-kit";

export default function PortalJoinPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const child = useChild();
  if (!child.ready) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;
  const q = child.isParent && child.studentId ? `?student_id=${child.studentId}` : "";
  return <JoinRoom joinPath={`/lms/portal/online-classes/${uuid}/join${q}`} backHref="/dashboard/my/classes" />;
}
