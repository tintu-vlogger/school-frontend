// Fixed list of greetings the admin can pick from.
// Keep ids (stored value) and display strings identical — they render directly.
export const GREETINGS = [
  "Dr.",
  "Prof.",
  "Mr.",
  "Ms.",
  "Mrs.",
  "Nurse",
  "Sister",
  "Brother",
] as const;

export type Greeting = typeof GREETINGS[number];

type NameParts = {
  greeting?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** Format a staff member's full display name, prefixing the greeting if set. */
export function formatStaffName(p: NameParts): string {
  return [p.greeting, p.first_name, p.last_name]
    .filter((x) => x && String(x).trim())
    .map((x) => String(x).trim())
    .join(" ");
}
