"use client";

/* Staff join page for a live class: the built-in video room or the external meeting link. */
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useConfirm } from "@/components/ui-kit";
import { JoinRoom } from "@/components/lms/video-room";

export default function StaffJoinPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <JoinRoom joinPath={`/lms/online-classes/${uuid}/join`} backHref="/dashboard/lms/online-classes"
      onEnd={async () => {
        if (!(await confirm({ title: "End this class?", message: "Learners can no longer join. You can add the recording link afterwards.", confirmLabel: "End class" }))) return;
        try { await api.post(`/lms/online-classes/${uuid}/end`); toast.success("Class ended"); router.push(`/dashboard/lms/online-classes?view=${uuid}`); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't end the class"); }
      }} />
  );
}
