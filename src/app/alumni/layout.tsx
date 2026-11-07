import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// The alumni portal sits outside the app shell: former employees open it from a personal link, no sign-in.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Alumni", robots: { index: false, follow: false } };

export default function AlumniLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app min-h-screen bg-canvas`}>{children}</div>;
}
