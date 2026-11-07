import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// Public careers page: no sign-in, no app navigation. Works on the company's own address.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Careers" };

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app min-h-screen bg-canvas`}>{children}</div>;
}
