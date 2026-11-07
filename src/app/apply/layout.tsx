import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// Public admission form: no sign-in, no app navigation. Works on the institution's own address.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Apply for admission" };

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app min-h-screen bg-canvas`}>{children}</div>;
}
