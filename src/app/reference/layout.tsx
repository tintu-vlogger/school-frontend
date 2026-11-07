import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// Reference form for referees: opened from a personal link, no sign-in.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Reference", robots: { index: false, follow: false } };

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app min-h-screen bg-canvas`}>{children}</div>;
}
