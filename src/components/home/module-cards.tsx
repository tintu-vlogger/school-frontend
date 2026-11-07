"use client";

/*
 * The school modules' home cards, loaded on demand from
 * `src/components/<dir>/home-cards.tsx` (exports `StaffHomeCard` and
 * `PortalHomeCard({ studentId })`). A module whose file or export does not exist yet, or
 * whose card throws, renders nothing, so the home page never breaks because of one module.
 *
 *   <ModuleCard dir="fees" kind="portal" studentId={12} />
 *   HOME_MODULES.filter(...)   // order, institution module key and permission prefix
 */
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";

export type HomeModule = {
  /** folder under src/components */
  dir: string;
  /** key in the institution profile's `modules` (null = always on) */
  module: string | null;
  /** permission prefix: staff see the card when they hold any `<prefix>.*` permission */
  perm: string;
};

export const HOME_MODULES: HomeModule[] = [
  { dir: "students", module: null, perm: "students" },
  { dir: "student_attendance", module: "attendance", perm: "attendance" },
  { dir: "timetable", module: "timetable", perm: "timetable" },
  { dir: "lms", module: "lms", perm: "lms" },
  { dir: "exams", module: "exams", perm: "exams" },
  { dir: "fees", module: "fees", perm: "fees" },
  { dir: "comms", module: "comms", perm: "comms" },
  { dir: "library", module: "library", perm: "library" },
  { dir: "transport", module: "transport", perm: "transport" },
  { dir: "hostel", module: "hostel", perm: "hostel" },
  { dir: "wellbeing", module: "wellbeing", perm: "wellbeing" },
  { dir: "admissions", module: "admissions", perm: "admissions" },
];

type CardProps = { studentId?: number };
const Nothing: ComponentType<CardProps> = () => null;

// One lazy component per module and kind, created once.
const cache = new Map<string, ComponentType<CardProps>>();

function load(dir: string, kind: "staff" | "portal"): ComponentType<CardProps> {
  const key = `${dir}:${kind}`;
  let C = cache.get(key);
  if (!C) {
    const exportName = kind === "staff" ? "StaffHomeCard" : "PortalHomeCard";
    C = lazy(() =>
      // A template path lets the bundler include whichever home-cards files exist;
      // a missing one simply fails here and renders nothing.
      import(`../${dir}/home-cards`)
        .then((m: Record<string, unknown>) => ({ default: (m[exportName] as ComponentType<CardProps>) || Nothing }))
        .catch(() => ({ default: Nothing })),
    );
    cache.set(key, C);
  }
  return C;
}

class Contain extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* a module's card failed; leave it out */ }
  render() { return this.state.failed ? null : this.props.children; }
}

export function ModuleCard({ dir, kind, studentId, fallback = null }: { dir: string; kind: "staff" | "portal"; studentId?: number; fallback?: ReactNode }) {
  const C = load(dir, kind);
  return (
    <Contain key={`${dir}:${kind}:${studentId ?? ""}`}>
      <Suspense fallback={fallback}>
        {kind === "portal" ? <C studentId={studentId} /> : <C />}
      </Suspense>
    </Contain>
  );
}
