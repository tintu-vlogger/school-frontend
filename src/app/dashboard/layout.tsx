import { Outfit } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";

// Light geometric face for the tenant app; weights stop at 500 on purpose.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${outfit.variable} hr-app`}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
