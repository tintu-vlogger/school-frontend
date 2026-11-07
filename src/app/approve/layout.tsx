import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// One-click approve or reject from an email: no sign-in, the link itself is the key.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Approval", robots: { index: false, follow: false } };

export default function ApproveLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app min-h-screen bg-canvas`}>{children}</div>;
}
