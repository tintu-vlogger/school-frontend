import { Outfit } from "next/font/google";

// Same light geometric face as the HR app.
const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${outfit.variable} hr-app`}>{children}</div>;
}
