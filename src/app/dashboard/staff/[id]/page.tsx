"use client";

/*
 * Employee profile as a full page (deep links and "Open as page" from the profile modal).
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProfileView } from "@/components/people/profile-view";

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <div>
      <Link href="/dashboard/staff" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ChevronLeft size={15} strokeWidth={1.4} /> All employees</Link>
      <ProfileView uuid={id} onOpenPerson={(uuid) => router.push(`/dashboard/staff/${uuid}`)} />
    </div>
  );
}
