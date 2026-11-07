"use client";

/** Adding an employee happens in a modal on the list; keep old links working. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewEmployeeRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/staff?new=1"); }, [router]);
  return null;
}
