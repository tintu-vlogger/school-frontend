"use client";

import { usePathname } from "next/navigation";
import { Building2, Users, Wallet, Settings, ScanSearch, LayoutDashboard, KeyRound } from "lucide-react";
import { PlatformShell } from "@/components/platform-shell";

const NAV = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Institutions", href: "/admin/companies", icon: Building2 },
  { label: "Find payment", href: "/admin/payments", icon: ScanSearch },
  { label: "Team", href: "/admin/executives", icon: Users },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Sign-in apps", href: "/admin/sign-in", icon: KeyRound },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  return <PlatformShell role="admin" nav={NAV} loginPath="/admin/login" title="Campusly admin">{children}</PlatformShell>;
}
