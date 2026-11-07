import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// Kiosk screens sit outside the app shell: no sign-in, no navigation, just the wall display.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Kiosk", robots: { index: false, follow: false } };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app`}>{children}</div>;
}
