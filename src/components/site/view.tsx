"use client";

/* Renders an institution website in its chosen design, with the fonts each design uses. */
import { Bricolage_Grotesque, Instrument_Serif, Outfit } from "next/font/google";
import { TalkingAvatar } from "@/components/talking-avatar";
import Classic from "./classic";
import Modern from "./modern";
import Pulse from "./pulse";
import Serene from "./serene";
import type { SiteData, Theme } from "./shared";

const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const grotesque = Bricolage_Grotesque({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-grotesque" });

/** The talking avatar was an experiment on institution websites; switch on again when it is ready. */
const SHOW_AVATAR = false;

const DESIGNS: Record<Theme, (p: { data: SiteData; signedIn: boolean }) => React.ReactElement> = {
  classic: Classic, modern: Modern, serene: Serene, pulse: Pulse,
};

export function SiteView({ data, signedIn = false, preview = false }: { data: SiteData; signedIn?: boolean; preview?: boolean }) {
  const Design = DESIGNS[data.site.theme] ?? Classic;
  return (
    <div className={`${outfit.variable} ${serif.variable} ${grotesque.variable}`}>
      <Design data={data} signedIn={signedIn} />
      {SHOW_AVATAR && !preview && <TalkingAvatar hint={`Welcome to ${data.company.name}! Tap me.`}
        text={`Hello, and welcome to ${data.company.name}. ${data.site.hero.subline} ` +
          (data.site.sections?.admissions !== false ? "Admissions are open, so do look at our admissions section. " : "") +
          "Staff, parents and students can sign in with the button at the top. Thank you for visiting!"} />}
    </div>
  );
}

export const THEMES: { id: Theme; name: string; desc: string; bg: string; ink: string }[] = [
  { id: "classic", name: "Classic", desc: "Dark and cinematic, with big thin type and a full-width photo.", bg: "#0c0d10", ink: "#ffffff" },
  { id: "modern", name: "Modern", desc: "Bright and friendly, with soft cards and rounded photos.", bg: "#f6f7f9", ink: "#14171f" },
  { id: "serene", name: "Serene", desc: "Warm cream paper, elegant serif type and arched photos.", bg: "#f6f0e7", ink: "#2a241d" },
  { id: "pulse", name: "Pulse", desc: "Bold tiles and big type. Feels like a modern app.", bg: "#eceef1", ink: "#0b0d12" },
];
