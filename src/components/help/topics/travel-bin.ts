import type { HelpTopic } from "../help-types";

/** Help guides for Travel (my trips, team trips, travel desk, travel policy) and the Recycle bin. */
export const TOPICS: HelpTopic[] = [
  {
    id: "travel-my-trips",
    category: "Home and self-service",
    title: "My trips",
    summary: "Plan a work trip with its journeys and hotel stays, get it approved, see your tickets, and turn it into an expense claim when you are back.",
    keywords: ["travel", "trip", "business travel", "tour", "flight", "train", "hotel", "per diem", "daily allowance", "DA", "travel advance", "TA", "settle", "ticket"],
    audience: "everyone",
    sections: [
      {
        title: "Your trips",
        desc: "Every trip you planned and where it stands.",
        path: "/dashboard/travel",
        parts: [
          { find: "My trips", label: "Page title", desc: "Your own work trips. Managers see their team's trips on Team trips." },
          { find: "Plan a trip", label: "Plan a trip", desc: "Start a new trip: what it is for, dates, journeys, hotel stays and any advance you need." },
          { find: "Status", label: "Status filter", desc: "Show trips that are waiting, approved, booked, being claimed or settled." },
          { find: "My travel policy", label: "My travel policy", desc: "How you may travel for your grade, hotel limits and your daily allowance in each city tier." },
        ],
      },
      {
        title: "Planning a trip",
        desc: "The form checks your trip against the travel policy as you type.",
        path: "/dashboard/travel",
        click: ["Plan a trip"],
        parts: [
          { find: "What is the trip for?", label: "Purpose", desc: "A short reason, such as a client workshop. Approvers see it." },
          { find: "Trip type", label: "Domestic or international", desc: "International trips use the international hotel limit and allowance, and may need an extra approval." },
          { find: "Project", label: "Project", desc: "Charge the trip to a project from timesheets. Switch on Billable when the client pays for it." },
          { find: "Journeys", label: "Journeys", desc: "One line per journey: flight, train, bus, cab or your own vehicle, with the class, date and fare." },
          { find: "I need a hotel", label: "Hotel stays", desc: "Where you will stay and your budget a night. The city tier (X, Y or Z) sets the limit." },
          { find: "Travel advance", label: "Advance", desc: "Money paid to you before you leave. It is set off against your claim later." },
          { find: "Send for approval", label: "Send", desc: "Sends the trip to your manager. If it is outside the policy you must say why first." },
        ],
      },
    ],
    steps: [
      "Open Home, then My trips, and click Plan a trip.",
      "Enter the purpose, dates and each journey; add hotel stays if you need them.",
      "Check the estimate and any policy warnings at the bottom; give a reason if the trip is outside the policy.",
      "Click Send for approval. Once approved, the travel desk books tickets and hotels and you can download them from the trip.",
      "After the trip, open it and click Settle trip. A draft expense claim is made with your journeys, hotel nights and daily allowance.",
      "Open the claim, attach your bills and send it. Any advance is set off; the rest is paid with your salary.",
    ],
    tips: [
      "Tickets and hotels the company paid for are never added to your claim.",
      "If you spent less than the advance, give the balance back to finance; anything left is recovered in your final settlement.",
      "Cities use the X, Y and Z tiers used for house rent allowance; metros such as Mumbai and Bengaluru are tier X.",
    ],
    related: ["travel-team-trips", "travel-desk", "travel-policy"],
  },
  {
    id: "travel-team-trips",
    category: "Home and self-service",
    title: "Team trips",
    summary: "See the work trips of the people who report to you, with policy warnings, and approve or reject them.",
    keywords: ["team travel", "approve trip", "manager", "travel request", "outside policy"],
    audience: "managers",
    sections: [
      {
        title: "Your team's trips",
        desc: "Trips of your direct reports.",
        path: "/dashboard/travel/team",
        parts: [
          { find: "Team trips", label: "Page title", desc: "Trips your team has sent. Drafts stay private until they are sent." },
          { find: "Policy", label: "Policy filter", desc: "Show only trips outside the travel policy." },
          { find: "Estimated", label: "Estimated cost", desc: "Fares, hotel nights and daily allowance added up." },
        ],
      },
    ],
    steps: [
      "Open Home, then Team trips.",
      "Click a trip to see its journeys, hotels, warnings and the reason given.",
      "Click Approve or Reject. The trip also appears in your Approvals inbox.",
    ],
    tips: ["A trip outside the policy or abroad goes to HR after you, unless your company changed the approval flow."],
    related: ["travel-my-trips"],
  },
  {
    id: "travel-desk",
    category: "Payroll",
    title: "Travel desk",
    summary: "Book tickets and hotels for approved trips, attach the tickets, pay travel advances and see travel spend and policy breaches.",
    keywords: ["travel desk", "booking", "PNR", "ticket", "hotel voucher", "advance", "travel spend", "travel report", "policy breach"],
    audience: "hr",
    sections: [
      {
        title: "Trips to book",
        desc: "Approved trips that still need tickets or hotels.",
        path: "/dashboard/travel/desk",
        parts: [
          { find: "To book", label: "To book", desc: "Approved trips with journeys or stays not booked yet." },
          { find: "Advances to pay", label: "Advances", desc: "Approved travel advances waiting for payment." },
          { find: "All trips", label: "All trips", desc: "Every trip that has been sent, with filters for status, type and policy." },
          { find: "Reports", label: "Reports", desc: "Spend by department, project, employee or mode, and the list of policy breaches." },
        ],
      },
      {
        title: "Reports",
        desc: "Where the travel money goes.",
        path: "/dashboard/travel/desk?tab=reports",
        parts: [
          { find: "Group by", label: "Group by", desc: "Department, project, employee, mode of travel, or domestic and international." },
          { find: "Travel spend", label: "Spend", desc: "Company bookings plus approved claims; trips not settled yet count at their estimate." },
          { find: "Policy breaches", label: "Breaches", desc: "Trips sent outside the policy, what was broken and the reason given." },
        ],
      },
    ],
    steps: [
      "Open Payroll, then Travel desk. The To book tab lists approved trips.",
      "Click a trip, then Book next to a journey or stay.",
      "Enter the airline or hotel, the PNR or confirmation number and the cost, choose who paid, and attach the ticket.",
      "When everything is booked the trip moves to Booked on its own (or click Mark all booked).",
      "Click Pay advance to record the advance payment with its bank reference.",
      "After the traveller's claim is approved, record any unspent advance that was given back.",
    ],
    tips: [
      "Bookings marked as paid by the company are left out of the traveller's claim.",
      "Cancelling a trip marks its bookings cancelled and withdraws an unpaid advance.",
    ],
    related: ["travel-policy", "travel-my-trips"],
  },
  {
    id: "travel-policy",
    category: "Payroll",
    title: "Travel policy",
    summary: "Set how each grade may travel, hotel limits and daily allowance by city tier, how early to ask and the advance limit. Changes are saved as new versions from a date.",
    keywords: ["travel policy", "grade", "class of travel", "hotel limit", "per diem", "daily allowance", "city tier", "X Y Z", "lead time"],
    audience: "hr",
    sections: [
      {
        title: "The policy in force",
        desc: "One card per grade band.",
        path: "/dashboard/travel/policy",
        parts: [
          { find: "Change policy", label: "Change policy", desc: "Edit the policy. It is saved as a new version from the date you choose." },
          { find: "Versions", label: "Versions", desc: "Every version with its start date. Trips are checked against the version in force on their start date." },
        ],
      },
    ],
    steps: [
      "Open Payroll, then Travel policy, and click Change policy.",
      "Choose the date the change applies from and describe what changed.",
      "For each band, pick its grades, the modes and classes allowed, hotel limits and daily allowance per tier, and how many days ahead people must ask.",
      "Keep one band with no grades: it covers everyone else.",
      "Click Save new version.",
    ],
    tips: [
      "Tier X and Y city lists follow the house rent allowance classification; every other city is tier Z. Edit the lists if your company uses its own.",
      "Daily allowance and hotel limits are company rules; reimbursements against bills are not taxed, but fixed allowances paid without bills may be.",
    ],
    related: ["travel-desk"],
  },
  {
    id: "setup-recycle-bin",
    category: "Company setup",
    title: "Recycle bin",
    summary: "See everything that was deleted, archived or switched off across the app, restore it, or remove it for good after the retention period where the law allows.",
    keywords: ["recycle bin", "trash", "deleted", "archived", "restore", "undelete", "purge", "retention"],
    audience: "hr",
    sections: [
      {
        title: "The bin",
        desc: "Deleted records of every kind in one list.",
        path: "/dashboard/settings/recycle-bin",
        parts: [
          { find: "Recycle bin", label: "Page title", desc: "Departments, lists, custom fields, files, templates, leave types, salary components, assets and more." },
          { find: "Kind", label: "Kind filter", desc: "Show one or more kinds of record." },
          { find: "Removed by", label: "Who", desc: "Show what one person removed." },
          { find: "Remove for good", label: "Remove for good", desc: "When the record may be deleted permanently. Records the law needs are kept for good." },
        ],
      },
    ],
    steps: [
      "Open Settings, then Recycle bin.",
      "Filter by kind, person or dates, or search by name.",
      "Click a record to see its details and history.",
      "Click Restore. If something it depends on (such as a parent department) is also in the bin, restore that first.",
      "To delete permanently, wait for the retention period, then click Remove for good. A copy stays in the audit log.",
    ],
    tips: [
      "Payroll, attendance, leave, employee records, statutory and POSH records are never removed, only restored.",
      "A record that other records still use cannot be removed.",
      "Bin settings sets how long records are kept (90 days by default) and whether they are removed on their own after that.",
      "Select several rows to restore them together.",
    ],
    related: [],
  },
];
