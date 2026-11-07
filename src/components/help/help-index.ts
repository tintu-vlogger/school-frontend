/* All help guides, in menu order. Each group's guides live in ./topics/<group>.ts. */
import type { HelpTopic } from "./help-types";
import { TOPICS as homePeople } from "./topics/home-people";
import { TOPICS as timePay } from "./topics/time-pay";
import { TOPICS as talent } from "./topics/talent";
import { TOPICS as engageInsights } from "./topics/engage-insights";
import { TOPICS as setup } from "./topics/setup";
import { TOPICS as devices } from "./topics/devices";
import { TOPICS as faceAttendance } from "./topics/face-attendance";
import { TOPICS as travelBin } from "./topics/travel-bin";
import { TOPICS as positions } from "./topics/positions";
import { TOPICS as customForms } from "./topics/custom-forms";
import { TOPICS as bankSso } from "./topics/bank-sso";

// Newer, more detailed guides replace an older one for the same page (e.g. Devices).
const ALL: HelpTopic[] = [...homePeople, ...customForms, ...faceAttendance, ...timePay, ...devices, ...travelBin, ...bankSso,
  ...talent, ...positions, ...engageInsights, ...setup];
const newer = new Set([...devices].map((t) => t.sections[0]?.path.split("?")[0]));
export const HELP_TOPICS: HelpTopic[] = ALL.filter((t, i, list) =>
  list.findIndex((x) => x.id === t.id) === i &&
  !(newer.has(t.sections[0]?.path.split("?")[0]) && !devices.includes(t)));

export const topicById = (id: string) => HELP_TOPICS.find((t) => t.id === id);

/** The guide for the page someone is on (longest matching page address wins). */
export function topicForPath(pathname: string): string | undefined {
  let best: { id: string; len: number } | undefined;
  for (const t of HELP_TOPICS) for (const s of t.sections) {
    const p = s.path.split("?")[0];
    if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > best.len)) best = { id: t.id, len: p.length };
  }
  return best?.id;
}
