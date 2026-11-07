import type { HelpTopic } from "../help-types";

/** Help guides for Positions, the position chart, Succession and the internal job marketplace. */
export const TOPICS: HelpTopic[] = [
  {
    id: "positions-list",
    category: "People",
    title: "Positions",
    summary: "The approved seats in your organisation: who sits in each one, which seats are vacant, headcount plans for the year and requests to add, change or close positions.",
    keywords: ["position", "seat", "vacancy", "vacant", "headcount", "manpower plan", "position management", "FTE", "salary band", "key position", "budgeted"],
    audience: "hr",
    sections: [
      {
        title: "The position list",
        desc: "Every open position with its seats, who is in them and its status.",
        path: "/dashboard/positions",
        parts: [
          { find: "Positions", label: "Page title", desc: "A position is an approved seat, such as one Senior Software Engineer in the Platform team." },
          { find: "Vacant seats", label: "Vacant seats", desc: "Seats in approved positions with no one in them and no one starting soon." },
          { find: "Add position", label: "Add position", desc: "Create a position with its department, designation, location, grade, seats and salary band." },
          { find: "Seats", label: "Seats filter", desc: "Show only fully vacant positions, those with a free seat, or full ones." },
          { find: "Position chart", label: "Position chart", desc: "See the positions as a tree by who reports to whom." },
        ],
      },
      {
        title: "Headcount plans",
        desc: "How many people each department may have in a financial year (April to March).",
        path: "/dashboard/positions?tab=plans",
        parts: [
          { find: "Headcount plans", label: "Plans tab", desc: "One plan per department per year. It goes through approval like any other request." },
          { find: "New plan", label: "New plan", desc: "Propose a number for a department. Once approved it becomes the limit for that department's seats." },
          { find: "Approved", label: "Approved number", desc: "The limit in force. A revision keeps this number until the new one is approved." },
        ],
      },
      {
        title: "Requests",
        desc: "Managers ask for a new position, a change (for example more seats) or closing one.",
        path: "/dashboard/positions?tab=requests",
        parts: [
          { find: "Ask for a new position", label: "Ask for a position", desc: "Fill in the position and say why it is needed. The department head and HR approve it from their approvals inbox." },
          { find: "Waiting", label: "Waiting", desc: "Requests still being approved. Approved requests create or change the position at once." },
        ],
      },
    ],
    steps: [
      "Open Talent, then Positions.",
      "Click Add position, give it a title, department, designation and the number of seats, and save.",
      "Open the position and click Put someone in to place an employee. Their job details are updated to match.",
      "When a seat is vacant, click Raise hiring request to send a hiring request for it.",
      "In Settings, switch on Use positions so new hires and job changes pick a vacant position.",
    ],
    tips: [
      "A full position refuses new people until you raise its seats (unless you allow more people than seats in Settings).",
      "With an approved headcount plan, seats in the department can't go above the plan.",
      "A budgeted position is planned but can't be filled until it is approved.",
    ],
    related: ["positions-chart", "succession-plans", "internal-jobs"],
  },
  {
    id: "positions-chart",
    category: "People",
    title: "Position chart",
    summary: "The tree of positions by reports-to line, showing who sits in each seat, vacancies and how many positions sit below each one.",
    keywords: ["position chart", "position hierarchy", "org structure", "tree", "vacancies", "branch"],
    audience: "managers",
    sections: [
      {
        title: "Reading the chart",
        desc: "Each card is a position; a green bar means filled, amber means vacant seats.",
        path: "/dashboard/positions/chart",
        parts: [
          { find: "Position chart", label: "Page title", desc: "Positions arranged by the position they report to." },
          { find: "Find a position or person", label: "Search", desc: "Type a title, code or name. Matching cards are highlighted and their branch opens." },
          { find: "Expand all", label: "Expand or collapse", desc: "Open every branch or close them all." },
          { find: "Position list", label: "Back to the list", desc: "Go back to the table of positions." },
        ],
      },
    ],
    steps: [
      "Open Talent, then Position chart.",
      "Click the arrow beside a position to open the positions below it.",
      "Click the focus icon on the right to show only that branch.",
      "Click a card to open the position and see its people and history.",
    ],
    related: ["positions-list"],
  },
  {
    id: "succession-plans",
    category: "Performance and learning",
    title: "Succession",
    summary: "Plan who could step into key positions, how ready they are, the risk of losing the current holder and the development steps that get successors ready.",
    keywords: ["succession", "successor", "readiness", "ready now", "bench strength", "key position", "critical role", "nine-box", "9 box", "talent pool", "high potential", "HiPo"],
    audience: "hr",
    sections: [
      {
        title: "Succession plans",
        desc: "One plan per key position.",
        path: "/dashboard/succession",
        parts: [
          { find: "New plan", label: "New plan", desc: "Pick a key position and say how likely its holder is to leave (risk) and how much it would hurt (impact)." },
          { find: "Successors", label: "Successors", desc: "The people who could take over, grouped by readiness: ready now, in 1-2 years or in 3+ years." },
          { find: "Bench", label: "Bench", desc: "Strong when there are enough ready-now successors and enough successors in all." },
          { find: "Priority", label: "Priority", desc: "Urgent when risk and impact are both high (or one is high and the other medium)." },
        ],
      },
      {
        title: "Bench strength",
        desc: "How well your key positions are covered.",
        path: "/dashboard/succession?tab=bench",
        parts: [
          { find: "Covered by a ready-now successor", label: "Coverage", desc: "The share of key positions with at least one person ready now." },
          { find: "Key positions without a plan", label: "Gaps", desc: "Key positions that still need a succession plan." },
          { find: "By department", label: "By department", desc: "Successors by readiness for each department." },
        ],
      },
      {
        title: "Nine-box",
        desc: "People placed by performance and potential from their latest review.",
        path: "/dashboard/succession?tab=ninebox",
        parts: [
          { find: "Star", label: "Top box", desc: "High performance and high potential. Good candidates for successor lists and talent pools." },
          { find: "Department", label: "Department filter", desc: "Look at one department at a time." },
        ],
      },
      {
        title: "Talent pools",
        desc: "Named groups such as high potentials or future leaders.",
        path: "/dashboard/succession?tab=pools",
        parts: [
          { find: "New pool", label: "New pool", desc: "Create a pool with a manager and add people to it." },
        ],
      },
    ],
    steps: [
      "Open Talent, then Succession, and click New plan.",
      "Pick the key position, set the risk and impact of loss and save.",
      "Click Add successor, pick a person and how ready they are.",
      "Under the successor, click Add step to add a course, a goal, mentoring or a project.",
      "Change readiness as people grow; the bench strength updates on its own.",
    ],
    tips: [
      "A course step enrols the person in the course; its progress shows on the plan.",
      "A goal step adds a goal to their goals, or links one they already have.",
      "Successor plans are visible only to people with the succession permission.",
    ],
    related: ["positions-list"],
  },
  {
    id: "internal-jobs",
    category: "Hiring and onboarding",
    title: "Internal jobs",
    summary: "Jobs and short gigs open to people already in the company. Employees see how well their skills match and apply; HR and hiring managers pick and move people.",
    keywords: ["internal jobs", "internal job posting", "IJP", "internal mobility", "gig", "project", "talent marketplace", "apply internally", "transfer"],
    audience: "everyone",
    sections: [
      {
        title: "Browsing and applying",
        desc: "Open jobs and gigs, with your skills match on each card.",
        path: "/dashboard/internal-jobs",
        parts: [
          { find: "Internal jobs", label: "Page title", desc: "Roles and short projects inside the company." },
          { find: "Search jobs and gigs", label: "Search", desc: "Find a posting by its title or description." },
          { find: "My applications", label: "My applications", desc: "See where your applications stand." },
        ],
      },
      {
        title: "Managing postings",
        desc: "For HR and hiring managers.",
        path: "/dashboard/internal-jobs?tab=manage",
        parts: [
          { find: "Post a job or gig", label: "Post", desc: "Post a job from an approved hiring request or a vacant position, or a gig with weeks and hours a week." },
          { find: "Applications", label: "Applications", desc: "How many people applied. Open a posting to shortlist, select and move people." },
        ],
      },
    ],
    steps: [
      "Open Talent, then Internal jobs.",
      "Open a job or gig to see what it needs and how well your skills match.",
      "Click Apply and say why you are interested.",
      "If the posting asks for it, your manager agrees first in their approvals inbox.",
      "Follow it under My applications. If you are selected, HR records the move from the date agreed.",
    ],
    tips: [
      "Keep the skills on your profile up to date; the match score comes from them.",
      "You may need to be in your current role for some months before applying for a job (gigs have no wait).",
      "There is a limit on how many applications you can have open at once.",
    ],
    related: ["internal-jobs-mine", "positions-list"],
  },
  {
    id: "internal-jobs-mine",
    category: "Home and self-service",
    title: "My applications",
    summary: "The internal jobs and gigs you applied for and where each one stands.",
    keywords: ["my applications", "internal application", "applied", "shortlisted", "withdraw"],
    audience: "everyone",
    sections: [
      {
        title: "Your applications",
        desc: "Each application shows its steps: applied, manager agreed, shortlisted, selected and moved.",
        path: "/dashboard/internal-jobs/my",
        parts: [
          { find: "My applications", label: "Page title", desc: "Everything you applied for inside the company." },
          { find: "Browse internal jobs", label: "Browse", desc: "Go back to the open jobs and gigs." },
        ],
      },
    ],
    steps: [
      "Open Talent, then My applications.",
      "Click an application's title to see the posting again.",
      "Click Withdraw if you change your mind; you can apply again while it is open.",
    ],
    related: ["internal-jobs"],
  },
];
