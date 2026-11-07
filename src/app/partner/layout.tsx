"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { PlatformShell } from "@/components/platform-shell";

const NAV = [{ label: "My companies", href: "/partner", icon: LayoutDashboard }];

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/partner/login") return <>{children}</>;
  return <PlatformShell role="executive" nav={NAV} loginPath="/partner/login" title="Next Gen HRMS partner">{children}</PlatformShell>;
}
