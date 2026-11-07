import type { HelpTopic } from "../help-types";

/** Help guides for face attendance: HR pages, the employee's face sign-in and the kiosk. */
export const TOPICS: HelpTopic[] = [
  {
    id: "face-attendance-review",
    category: "Time and leave",
    title: "Face attendance: review flagged punches",
    summary: "Check face punches that need a second look, such as a PIN used after the face was not recognised or a photo held up to the camera, and accept or reject them.",
    keywords: ["face attendance", "face recognition", "flagged punch", "review", "spoof", "photo", "PIN fallback", "kiosk", "liveness", "buddy punching"],
    audience: "hr",
    sections: [
      {
        title: "The face attendance page",
        desc: "Numbers at a glance and the list of face checks waiting for you.",
        path: "/dashboard/face-attendance",
        parts: [
          { find: "Face attendance", label: "Page title", desc: "Everything about clocking in by face: reviews, enrolled people, kiosks and settings." },
          { find: "To review", label: "To review", desc: "How many flagged face checks are waiting for a decision." },
          { find: "Enrolled", label: "Enrolled", desc: "How many active employees have agreed to face attendance and are set up." },
          { find: "Face checks to review", label: "Review list", desc: "Each row is one face check: who, when, what happened and why it was flagged. Click a row to open it." },
          { find: "Show", label: "Filters", desc: "Show only the checks to review, every flagged one, the ones already reviewed or every face check." },
        ],
      },
      {
        title: "Deciding on a flagged check",
        desc: "The details of one check, with accept and reject.",
        path: "/dashboard/face-attendance",
        click: ["Face checks to review"],
        parts: [
          { find: "Match (server)", label: "Match score", desc: "How alike the face was to the enrolled samples, as worked out by the server. It must reach the 'Needed' value." },
          { find: "Photo / screen check", label: "Liveness", desc: "Scores that tell a live face from a printed photo or a phone screen, and the blink or head turn that was done." },
          { find: "Note", label: "Note", desc: "Say why you reject a punch. It is kept in the audit log." },
        ],
      },
    ],
    steps: [
      "Open Time, then Face attendance. The Review tab opens.",
      "Click a row to see the details and, if one was kept, the snapshot (opening it is logged).",
      "Click Accept if the punch is fine. For a check without a punch you can tick 'Add the punch on accept'.",
      "To reject, write a note and click Reject. The punch is kept on record but no longer counts in attendance.",
    ],
    tips: [
      "A punch in a locked pay period cannot be rejected until the period is unlocked.",
      "Someone who often needs the PIN may have a poor enrolment. Enrol them again in good light.",
    ],
    related: ["face-attendance-enrol", "face-attendance-settings", "face-attendance-self"],
  },
  {
    id: "face-attendance-enrol",
    category: "Time and leave",
    title: "Face attendance: enrolled faces",
    summary: "See who has agreed to face attendance, enrol someone in person with their consent, or delete a person's face data.",
    keywords: ["enrol face", "face templates", "consent", "DPDP", "withdraw consent", "delete face data", "biometric"],
    audience: "hr",
    sections: [
      {
        title: "Enrolled faces",
        desc: "Every active employee and whether they are enrolled.",
        path: "/dashboard/face-attendance?tab=enrolments",
        parts: [
          { find: "Enrolled faces", label: "Enrolled faces", desc: "People who agreed, people not enrolled, and people who withdrew their consent." },
          { find: "Search by name or employee ID", label: "Search", desc: "Find a person quickly." },
          { find: "Status", label: "Status", desc: "Enrolled, Not enrolled or Consent withdrawn. Open the row menu to enrol or delete face data." },
        ],
      },
    ],
    steps: [
      "Open the Enrolled faces tab and find the person.",
      "Open the row menu and choose Enrol.",
      "Let the employee read the consent notice. Tick the box only if they agree, then continue.",
      "The employee looks at the camera and follows the prompts (a blink or a head turn). Four samples are taken in a few seconds.",
      "Only face templates (numbers) are saved, encrypted. No photo is kept and the templates are never shown again.",
    ],
    tips: [
      "Face data needs the person's own free consent under the Digital Personal Data Protection Act, 2023. Nobody may be forced; they can always use their employee ID and PIN.",
      "If someone asks in writing to withdraw consent, choose Delete face data and enter the reason. The templates and their face check photos are deleted at once.",
      "Face data of people who leave the company is deleted automatically.",
      "The same face cannot be enrolled for two people.",
    ],
    related: ["face-attendance-review", "face-attendance-settings"],
  },
  {
    id: "face-attendance-settings",
    category: "Time and leave",
    title: "Face attendance: kiosks and settings",
    summary: "Choose which kiosks check faces, how strict the match and the liveness check are, how long snapshots are kept, and whether web clock-in needs a selfie match.",
    keywords: ["face settings", "threshold", "liveness", "snapshot retention", "kiosk face", "selfie match", "web clock-in", "consent notice"],
    audience: "hr",
    sections: [
      {
        title: "Kiosks",
        desc: "Face check per clock-in kiosk.",
        path: "/dashboard/face-attendance?tab=kiosks",
        parts: [
          { find: "Kiosks", label: "Kiosks", desc: "Every clock-in kiosk. Add new ones in Shifts & attendance settings, Kiosks." },
          { find: "Face check", label: "Face check", desc: "Off (PIN only), Face first (PIN always offered) or Face required (PIN only after the face is not recognised, and sent for review)." },
          { find: "Faces", label: "Faces", desc: "How many people's face templates the kiosk downloads: only people at its location." },
        ],
      },
      {
        title: "Settings",
        desc: "Company-wide face attendance settings.",
        path: "/dashboard/face-attendance?tab=settings",
        parts: [
          { find: "Use face attendance", label: "On or off", desc: "The company switch. When off, every kiosk uses PINs." },
          { find: "Match threshold", label: "Match threshold", desc: "How alike a face must be to match. Lower is stricter: fewer wrong matches, more retries." },
          { find: "Liveness", label: "Liveness", desc: "Stops punching with a photo or a phone screen. Standard asks for a blink or a head turn." },
          { find: "Keep a snapshot", label: "Snapshots", desc: "Keep a small photo with flagged checks (or every check) for a set number of days, then delete it." },
          { find: "Web and phone clock-in", label: "Selfie match", desc: "Ask for a selfie that matches the person's enrolled face when they clock in on the web or phone." },
          { find: "Consent", label: "Consent notice", desc: "The notice people agree to before enrolling. Changing it starts a new version." },
        ],
      },
    ],
    steps: [
      "Open the Settings tab, switch on Use face attendance and click Save.",
      "Open the Kiosks tab, click a kiosk, choose Face first or Face required and its location, then Save.",
      "The kiosk picks up the change at its next refresh (or reload the kiosk page).",
    ],
    tips: [
      "Start with the standard threshold (0.40) and liveness level. Make it stricter only if you see wrong matches.",
      "Kiosks keep face templates on the tablet so they work offline. Lock the tablet in kiosk mode and keep it in a public place.",
    ],
    related: ["face-attendance-review", "face-attendance-kiosk"],
  },
  {
    id: "face-attendance-self",
    category: "Home and self-service",
    title: "Face sign-in",
    summary: "Set up face sign-in to punch at the office kiosk by looking at the camera, or withdraw your consent at any time.",
    keywords: ["face sign-in", "face attendance", "consent", "withdraw", "selfie", "clock in with face"],
    audience: "everyone",
    sections: [
      {
        title: "Face sign-in in My attendance",
        desc: "Set it up or withdraw your consent.",
        path: "/dashboard/attendance",
        click: ["Face sign-in"],
        parts: [
          { find: "Face sign-in", label: "Face sign-in", desc: "Shows whether you are set up, when you agreed, and lets you withdraw." },
        ],
      },
    ],
    steps: [
      "Open Time, then Attendance, and click Face sign-in.",
      "Click Set up face sign-in and read the consent notice. Tick the box if you agree.",
      "Look at the camera and follow the prompts. It takes a few seconds.",
      "At the kiosk, just look at the camera. If you are not recognised, use your employee ID and PIN.",
    ],
    tips: [
      "Your photos are not stored, only face templates (numbers), encrypted.",
      "Withdraw consent from the same window at any time. Your face data is deleted at once.",
      "If your company asks for a selfie match on the web, the Clock in button opens the camera.",
    ],
    related: ["time-pay-attendance", "face-attendance-kiosk"],
  },
  {
    id: "face-attendance-kiosk",
    category: "Time and leave",
    title: "Clocking in by face at the kiosk",
    summary: "How the office tablet recognises faces, what happens when it does not, and how it works without internet.",
    keywords: ["kiosk", "tablet", "face", "offline", "PIN", "clock in", "camera"],
    audience: "everyone",
    sections: [
      {
        title: "Face attendance settings",
        desc: "Where HR switches the face check on for a kiosk.",
        path: "/dashboard/face-attendance?tab=kiosks",
        parts: [
          { find: "Face check", label: "Face check", desc: "When a kiosk shows Face first or Face required, people punch by looking at its camera." },
        ],
      },
    ],
    steps: [
      "Stand in front of the tablet and look at the camera.",
      "Follow the prompt: blink slowly, or turn your head to one side and back.",
      "Your name and the punch time appear when you are recognised.",
      "If you are not recognised after a few tries, tap Use employee ID and PIN.",
    ],
    tips: [
      "Without internet the tablet still recognises faces and keeps the punches, then sends them when it is back online. The server checks every match again.",
      "Punches made with a PIN after the face was not recognised may be checked by HR.",
    ],
    related: ["face-attendance-self", "face-attendance-settings"],
  },
];
