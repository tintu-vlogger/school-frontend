"use client";

/** Editing an employee happens in a modal on the list; keep old links working. */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditEmployeeRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => { router.replace(`/dashboard/staff?edit=${encodeURIComponent(id)}`); }, [id, router]);
  return null;
}
