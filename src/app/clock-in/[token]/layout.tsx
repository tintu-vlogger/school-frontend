import type { Metadata } from "next";
import { Outfit } from "next/font/google";

// The clock-in kiosk sits outside the app shell: no sign-in, no navigation, one shared tablet.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export const metadata: Metadata = { title: "Clock in", robots: { index: false, follow: false } };

export default function ClockInLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app`}>{children}</div>;
}
