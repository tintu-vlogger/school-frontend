/**
 * Help guide format.
 *
 * Every guide has sections. A section shows a real page of the app (or one of its pop-ups) in a
 * view-only frame running on SAMPLE DATA (?embed=1&demo=1, see lib/help-demo/demo-fetch.ts), with
 * numbered call-outs on the parts listed in `parts`.
 *  - `path`  the page to show; `?tab=<value>` opens a tab where the page supports it
 *  - `click` button / tab / row texts clicked in order before the call-outs (to open a pop-up or tab)
 *  - `parts` `find` is the exact English text visible on screen that locates the element (a heading,
 *            button, tab, column header, label or placeholder); the call-out wraps the card or control
 *            around it. `label` is a short name, `desc` one or two plain sentences.
 * Texts are plain English; the app translates them for the selected language.
 */
export type HelpPart = { find: string; label: string; desc: string };
export type HelpSection = { title: string; desc: string; path: string; click?: string[]; parts: HelpPart[] };
export type HelpTopic = {
  id: string;            // unique, kebab-case
  category: string;      // one of HELP_CATEGORIES
  title: string;
  summary: string;       // one or two sentences: what the page is for
  keywords: string[];    // words people might search for
  audience?: "everyone" | "managers" | "hr";
  sections: HelpSection[];
  steps?: string[];      // "How to" steps for the main task, plain sentences
  tips?: string[];
  related?: string[];    // other topic ids
};

export const HELP_CATEGORIES = [
  "Getting started", "Home and self-service", "People", "Time and leave", "Payroll", "Hiring and onboarding",
  "Performance and learning", "Exits", "Engagement and support", "Reports and insights", "Company setup",
] as const;
