"use client";

/*
 * The employee profile in a large modal (opened from the directory, org chart, teams ...).
 *   <ProfileModal uuid={viewId} onClose={() => ...} onOpenPerson={(uuid) => ...} onChanged={refresh} />
 * Clicking a manager or report inside switches the modal to that person.
 */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui-kit";
import { ProfileView } from "./profile-view";

export function ProfileModal({ uuid, onClose, onOpenPerson, onChanged }: {
  uuid: string | null; onClose: () => void; onOpenPerson?: (uuid: string) => void; onChanged?: () => void;
}) {
  return (
    <Modal open={!!uuid} onClose={onClose} size="full" aria-label="Employee profile" bodyClassName="bg-canvas/40"
      title={<span className="text-[15px] text-muted">Employee profile</span>}
      headerActions={uuid && <Link href={`/dashboard/staff/${uuid}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-primary hover:bg-primary-soft/60">Open as page <ArrowUpRight size={14} strokeWidth={1.4} /></Link>}>
      {uuid && <ProfileView key={uuid} uuid={uuid} onOpenPerson={onOpenPerson} onChanged={onChanged} />}
    </Modal>
  );
}
