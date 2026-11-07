import type { HelpTopic } from "../help-types";

/** Help guides for the Company setup pages. */
export const TOPICS: HelpTopic[] = [
  /* ── Company ─────────────────────────────────────────────────────── */
  {
    id: "setup-company",
    category: "Company setup",
    title: "Company settings",
    summary: "Your company's name, logo, tax registrations and registered address, the web address people use to sign in, and your own password.",
    keywords: ["company profile", "logo", "PAN", "TAN", "GSTIN", "CIN", "registered address", "web address", "subdomain", "sign-in address", "change password", "sign out", "company details"],
    audience: "hr",
    sections: [
      {
        title: "Company profile",
        desc: "The basic details shown to employees and printed on letters and payslips.",
        path: "/dashboard/settings",
        parts: [
          { find: "Company settings", label: "Tabs", desc: "Company profile, Web address and Account each have their own tab." },
          { find: "Upload logo", label: "Logo", desc: "Upload your logo. It appears in the app, on letters and on payslips." },
          { find: "Company name", label: "Company name", desc: "The name employees see. It is required." },
          { find: "Registrations", label: "Registrations", desc: "PAN (the company's income tax number), TAN (needed to deduct tax from salaries, called TDS), GSTIN and CIN. Used on payslips and tax certificates such as Form 16." },
          { find: "Registered address", label: "Registered address", desc: "The state chosen here decides which state rules apply by default." },
          { find: "Save changes", label: "Save changes", desc: "Saves the profile. Nothing changes until you press it." },
        ],
      },
      {
        title: "Web address",
        desc: "The address your employees open to sign in.",
        path: "/dashboard/settings?tab=address",
        parts: [
          { find: "Sign-in address", label: "Sign-in address", desc: "Employees open this address to sign in. Share it with your team." },
          { find: "Web address", label: "Web address", desc: "Letters, numbers and hyphens only. The old address stops working once you change it." },
          { find: "Current address", label: "Current address", desc: "The address in use right now." },
          { find: "Change address", label: "Change address", desc: "Saves the new address and moves you to it. Saved bookmarks will break." },
        ],
      },
      {
        title: "Account",
        desc: "Your own sign-in: change your password or sign out of this device.",
        path: "/dashboard/settings?tab=account",
        parts: [
          { find: "Change password", label: "Change password", desc: "Type your current password, then the new one twice. You stay signed in." },
          { find: "8 or more characters", label: "Password checklist", desc: "Ticks turn green as your new password gets stronger." },
          { find: "Update password", label: "Update password", desc: "Saves the new password." },
          { find: "This device", label: "This device", desc: "Shows who is signed in here." },
          { find: "Sign out", label: "Sign out", desc: "Signs you out. Always do this on shared computers." },
        ],
      },
    ],
    steps: [
      "Open Company settings and stay on the Company profile tab.",
      "Upload your logo and check the company name.",
      "Fill in PAN, TAN, GSTIN and CIN under Registrations.",
      "Enter the registered address and pick the state.",
      "Press Save changes.",
    ],
    tips: [
      "If you run more than one company, add each one under Legal entities; each can have its own PAN, TAN and registrations.",
      "Changing the web address breaks old links. Tell your employees before you change it.",
    ],
    related: ["setup-entities", "setup-website", "setup-subscription"],
  },

  /* ── Company website ─────────────────────────────────────────────── */
  {
    id: "setup-website",
    category: "Company setup",
    title: "Company website",
    summary: "A simple public website at your company address, with your story, values, offices, open jobs and an employee sign-in button.",
    keywords: ["website", "careers page", "career site", "brand colour", "about us", "values", "leadership", "offices", "open jobs", "public page", "sign-in button", "design"],
    audience: "hr",
    sections: [
      {
        title: "Design and what to show",
        desc: "Pick a look and a colour, and choose which parts of the site are visible.",
        path: "/dashboard/settings/website",
        parts: [
          { find: "Main content", label: "Tabs", desc: "Design, Main content, Values & life, and People, offices & contact. Each holds part of the site." },
          { find: "Brand colour", label: "Brand colour", desc: "Pick a ready colour or your own. Buttons and highlights use it." },
          { find: "What to show", label: "What to show", desc: "Switch the whole website on or off, and show or hide each part such as About, Values or Open jobs." },
          { find: "Website is live", label: "Website is live", desc: "When off, your address goes straight to the sign-in page." },
          { find: "Preview", label: "Preview", desc: "See the site as visitors will, including changes you have not saved yet." },
          { find: "Save changes", label: "Save changes", desc: "Publishes your changes. Start over undoes unsaved edits." },
        ],
      },
      {
        title: "Main content",
        desc: "The headline, introduction, your story and a few numbers about the company.",
        path: "/dashboard/settings/website",
        click: ["Main content"],
        parts: [
          { find: "Top of the page", label: "Top of the page", desc: "The headline, a short introduction and the main photo." },
          { find: "Headline", label: "Headline", desc: "The first line visitors read." },
          { find: "Your story", label: "Your story", desc: "A few paragraphs about the company. Leave a blank line between paragraphs." },
          { find: "Numbers", label: "Numbers", desc: "Up to six facts, for example the year you were founded or how many people work with you." },
        ],
      },
    ],
    steps: [
      "Open Company website and choose a design and brand colour.",
      "Under What to show, switch on the parts you want.",
      "Fill in Main content, Values & life, and People, offices & contact.",
      "Press Preview to check how it looks.",
      "Switch on Website is live and press Save changes.",
    ],
    tips: [
      "Open jobs are taken from your hiring pages, so the list stays up to date by itself.",
      "Keep the employee sign-in button on so staff can find the sign-in page easily.",
    ],
    related: ["setup-company"],
  },

  /* ── Legal entities ──────────────────────────────────────────────── */
  {
    id: "setup-entities",
    category: "Company setup",
    title: "Legal entities",
    summary: "The registered companies that employ your people, each with its own PAN, TAN, PF and ESI codes, state registrations, bank accounts and signatory.",
    keywords: ["legal entity", "company", "PAN", "TAN", "GSTIN", "PF code", "ESI code", "LIN", "professional tax registration", "LWF", "shops and establishments", "signatory", "bank account", "IFSC"],
    audience: "hr",
    sections: [
      {
        title: "Your entities",
        desc: "A list of every company you run payroll for.",
        path: "/dashboard/entities",
        parts: [
          { find: "New entity", label: "New entity", desc: "Add another company that employs people." },
          { find: "Search by name, PAN or GSTIN", label: "Search", desc: "Find an entity by its name, PAN or GSTIN." },
          { find: "Entity", label: "Entity", desc: "The name. The primary entity is used by default for new joiners and payroll." },
          { find: "Employees", label: "Employees", desc: "How many people this entity employs." },
          { find: "Status", label: "Status", desc: "Active or switched off. Switched-off entities can't be picked for new records." },
        ],
      },
      {
        title: "Add or edit an entity",
        desc: "Four tabs: basic details, state registrations, bank accounts and the signatory.",
        path: "/dashboard/entities",
        click: ["New entity"],
        parts: [
          { find: "Registrations", label: "Tabs", desc: "Details, Registrations, Bank accounts and Signatory. Fill each tab before saving." },
          { find: "Short code", label: "Short code", desc: "A few letters such as NGI. It can be used inside employee IDs and other numbers." },
          { find: "Primary entity", label: "Primary entity", desc: "Used by default for new joiners and payroll." },
          { find: "Tax and statutory IDs", label: "Tax and statutory IDs", desc: "PAN, TAN, CIN, GSTIN, PF code (Provident Fund), ESI code (Employees' State Insurance) and LIN (Labour Identification Number)." },
          { find: "Registered address", label: "Registered address", desc: "The address on the certificate of registration." },
          { find: "Create entity", label: "Create entity", desc: "Saves the new entity." },
        ],
      },
      {
        title: "State registrations",
        desc: "Professional Tax, Labour Welfare Fund and shop registrations, one per state.",
        path: "/dashboard/entities",
        click: ["New entity", "Registrations"],
        parts: [
          { find: "Professional Tax, Labour Welfare Fund", label: "What goes here", desc: "PT (a small monthly state tax on salaries), LWF (a small state welfare contribution) and the Shops and Establishments licence." },
          { find: "Bank accounts", label: "Bank accounts", desc: "Accounts used for salary payouts and statutory payments. Mark one as primary." },
          { find: "Signatory", label: "Signatory", desc: "The person who signs statutory returns and letters for this entity." },
        ],
      },
    ],
    steps: [
      "Press New entity.",
      "Enter the name, registered name and short code.",
      "Fill in PAN, TAN, PF code and ESI code, and the registered address.",
      "On Registrations, add the PT and LWF registration for each state you work in.",
      "Add the salary bank account and the signatory, then press Create entity.",
    ],
    tips: [
      "Each location is linked to a legal entity, so add entities first.",
      "Switch an entity off instead of deleting it; past payslips still need it.",
    ],
    related: ["setup-company", "setup-locations", "setup-numbering"],
  },

  /* ── Regions & locations ─────────────────────────────────────────── */
  {
    id: "setup-locations",
    category: "Company setup",
    title: "Regions and locations",
    summary: "Your offices, branches and sites, grouped into regions. A location's state decides Professional Tax, LWF and holidays.",
    keywords: ["location", "office", "branch", "site", "region", "work location", "state", "professional tax", "LWF", "holidays", "geo-fence", "attendance boundary", "timezone"],
    audience: "hr",
    sections: [
      {
        title: "Locations",
        desc: "Every place where people work.",
        path: "/dashboard/locations",
        parts: [
          { find: "New location", label: "New location", desc: "Add an office, branch, factory, warehouse, site or remote location." },
          { find: "Regions", label: "Regions tab", desc: "Group locations into regions such as South or West, each with a head." },
          { find: "Search by name, city or state", label: "Search", desc: "Find a location by name, city or state." },
          { find: "Location", label: "Location", desc: "Click a row to see details, the address and the attendance boundary." },
          { find: "Legal entity", label: "Legal entity", desc: "The company that employs the people at this location." },
          { find: "Employees", label: "Employees", desc: "How many people work here." },
        ],
      },
      {
        title: "Add a location",
        desc: "Name, type, address and the area where people can mark attendance.",
        path: "/dashboard/locations",
        click: ["New location"],
        parts: [
          { find: "Basics", label: "Basics", desc: "Name, short code, type, region and legal entity." },
          { find: "Address", label: "Address", desc: "The full address of the place." },
          { find: "Decides Professional Tax, LWF and holidays", label: "State", desc: "Required. The state decides which PT and LWF rules and which holidays apply here." },
          { find: "Attendance boundary", label: "Attendance boundary", desc: "Latitude, longitude and radius. People can mark attendance from the app only inside this circle." },
          { find: "Use my current location", label: "Use my current location", desc: "Fills in the point from where you are standing now." },
        ],
      },
    ],
    steps: [
      "Press New location.",
      "Enter the name and pick the type, region and legal entity.",
      "Fill in the address and pick the state.",
      "Set the attendance boundary if people mark attendance on their phone.",
      "Save the location.",
    ],
    tips: [
      "Getting the state right matters: Professional Tax, LWF and the holiday list all follow it.",
      "Create regions first if you want to group locations.",
    ],
    related: ["setup-entities"],
  },

  /* ── Grades ──────────────────────────────────────────────────────── */
  {
    id: "setup-grades",
    category: "Company setup",
    title: "Grades",
    summary: "Levels of seniority, from the most junior up, with an optional yearly CTC range for each.",
    keywords: ["grade", "band", "level", "seniority", "CTC range", "salary band", "pay range", "job level", "rank"],
    audience: "hr",
    sections: [
      {
        title: "Your grades",
        desc: "All grades in order of seniority.",
        path: "/dashboard/grades",
        parts: [
          { find: "New grade", label: "New grade", desc: "Add a level, such as Associate or Manager." },
          { find: "Rank", label: "Rank", desc: "The order of seniority. 1 is the most junior." },
          { find: "Band", label: "Band", desc: "An optional group of grades, such as Band A." },
          { find: "CTC range", label: "CTC range", desc: "The yearly pay range for this grade. CTC means cost to company: everything the company spends on a person in a year." },
          { find: "Designations", label: "Designations", desc: "How many job titles use this grade." },
        ],
      },
      {
        title: "Add a grade",
        desc: "Name, code, band, rank and pay range.",
        path: "/dashboard/grades",
        click: ["New grade"],
        parts: [
          { find: "Name", label: "Name", desc: "Required, for example Senior associate." },
          { find: "Rank", label: "Rank", desc: "1 is the most junior. Higher numbers are more senior." },
          { find: "Minimum CTC", label: "Minimum CTC", desc: "The lowest yearly CTC for this grade, in rupees." },
          { find: "Maximum CTC", label: "Maximum CTC", desc: "The highest yearly CTC. It must be more than the minimum." },
          { find: "Description", label: "Description", desc: "Who sits at this grade." },
        ],
      },
    ],
    steps: [
      "Press New grade.",
      "Enter the name and, if you like, a code and band.",
      "Set the rank so grades sort from junior to senior.",
      "Add the minimum and maximum yearly CTC.",
      "Save the grade.",
    ],
    tips: ["Switch a grade off instead of deleting it; people already in it keep it."],
    related: ["setup-cost-centres"],
  },

  /* ── Cost centres ────────────────────────────────────────────────── */
  {
    id: "setup-cost-centres",
    category: "Company setup",
    title: "Cost centres",
    summary: "Where salary and other costs are booked, so finance can see what each part of the company spends.",
    keywords: ["cost centre", "cost center", "budget", "finance", "accounting", "salary cost", "department cost", "owner", "payroll journal"],
    audience: "hr",
    sections: [
      {
        title: "Your cost centres",
        desc: "Every cost centre with its owner and how many people are booked to it.",
        path: "/dashboard/cost-centres",
        parts: [
          { find: "New cost centre", label: "New cost centre", desc: "Add a place to book costs, such as Engineering or Sales." },
          { find: "Cost centre", label: "Cost centre", desc: "The name and code. Click a row to see details." },
          { find: "Owner", label: "Owner", desc: "The person who answers for this budget." },
          { find: "Departments", label: "Departments", desc: "How many departments book their costs here." },
          { find: "Employees", label: "Employees", desc: "How many people are booked here." },
        ],
      },
      {
        title: "Add a cost centre",
        desc: "Name, code, legal entity and owner.",
        path: "/dashboard/cost-centres",
        click: ["New cost centre"],
        parts: [
          { find: "Name", label: "Name", desc: "Required, for example Engineering and product." },
          { find: "Code", label: "Code", desc: "Optional. Use the same code as your accounts software." },
          { find: "Legal entity", label: "Legal entity", desc: "Leave empty if any entity can use it." },
          { find: "Owner", label: "Owner", desc: "Search for the person who answers for this budget." },
          { find: "Description", label: "Description", desc: "What is booked here." },
        ],
      },
    ],
    steps: [
      "Press New cost centre.",
      "Enter the name and the code your accounts team uses.",
      "Pick the legal entity and the owner if needed.",
      "Save, then link departments to it.",
    ],
    tips: ["Using the same codes as your accounts software makes payroll journals easier to post."],
    related: ["setup-grades", "setup-entities"],
  },

  /* ── Masters ─────────────────────────────────────────────────────── */
  {
    id: "setup-masters",
    category: "Company setup",
    title: "Lists (masters)",
    summary: "The choices behind dropdowns across the app, such as blood group, bank or document type. Add your own values or switch old ones off.",
    keywords: ["masters", "lists", "dropdown", "values", "blood group", "bank", "document type", "states", "options", "picklist", "sub-values"],
    audience: "hr",
    sections: [
      {
        title: "Lists and their values",
        desc: "Pick a list on the left to see and change its values.",
        path: "/dashboard/masters",
        parts: [
          { find: "New list", label: "New list", desc: "Make your own list, such as Shirt size, to use in forms and custom fields." },
          { find: "Find a list", label: "Find a list", desc: "Type to find a list by name." },
          { find: "Add value", label: "Add value", desc: "Add a new choice to the list you picked." },
          { find: "List settings", label: "List settings", desc: "Rename the list, allow sub-values, or switch it off." },
          { find: "Value", label: "Value", desc: "Each choice. Use the arrows to change the order and the switch to turn it on or off." },
        ],
      },
      {
        title: "New list",
        desc: "Create a list of choices for forms and custom fields.",
        path: "/dashboard/masters",
        click: ["New list"],
        parts: [
          { find: "Name", label: "Name", desc: "Required, for example Shirt size." },
          { find: "Description", label: "Description", desc: "What the list is for." },
          { find: "Sub-values", label: "Sub-values", desc: "Lets values sit under another value, like districts under a state." },
        ],
      },
    ],
    steps: [
      "Pick a list on the left, or press New list.",
      "Press Add value and type the name people should see.",
      "Use the arrows to put the values in order.",
      "Switch off values you no longer use.",
    ],
    tips: [
      "Switch values off instead of deleting them. Old records keep the value, but it can't be picked any more.",
      "Built-in values can be renamed, but their code stays the same.",
    ],
    related: ["setup-custom-fields"],
  },

  /* ── Roles & access ──────────────────────────────────────────────── */
  {
    id: "setup-roles",
    category: "Company setup",
    title: "Roles and access",
    summary: "Decide what each role can see and do, then give people the roles they need.",
    keywords: ["roles", "access", "permissions", "HR admin", "manager role", "payroll officer", "security", "who can see", "masked fields", "sensitive data", "user rights"],
    audience: "hr",
    sections: [
      {
        title: "Roles",
        desc: "Every role, with how many permissions it has.",
        path: "/dashboard/roles",
        parts: [
          { find: "New role", label: "New role", desc: "Create your own role, such as Payroll officer." },
          { find: "Roles", label: "Roles tab", desc: "System roles come built in; custom roles are the ones you made." },
          { find: "People", label: "People tab", desc: "See which roles each person has, and add or remove roles." },
          { find: "Permissions", label: "Permissions", desc: "How many things this role can see or do." },
        ],
      },
      {
        title: "Create or edit a role",
        desc: "Tick what the role can do and choose whose records it covers.",
        path: "/dashboard/roles",
        click: ["New role"],
        parts: [
          { find: "Name", label: "Name", desc: "Required, for example Payroll officer." },
          { find: "Search permissions", label: "Search permissions", desc: "Find a permission by typing part of its name." },
          { find: "Who it covers", label: "Who it covers", desc: "Whose records the permission applies to, for example only their team or the whole company." },
          { find: "Sensitive fields", label: "Sensitive fields", desc: "Hide, partly show (masked, such as XXXX1234) or fully show details like bank account, PAN and Aadhaar." },
          { find: "Create role", label: "Create role", desc: "Saves the role. You can then give it to people." },
        ],
      },
      {
        title: "People and their roles",
        desc: "Who has which role.",
        path: "/dashboard/roles?tab=people",
        parts: [
          { find: "Person", label: "Person", desc: "Each person with access to the app." },
          { find: "Job", label: "Job", desc: "Their job title and department." },
          { find: "Roles", label: "Roles", desc: "The roles they have. Click a person to change them." },
        ],
      },
    ],
    steps: [
      "Press New role and give it a name.",
      "Tick the permissions it needs and choose who each one covers.",
      "Set how sensitive fields are shown.",
      "Press Create role.",
      "Open the People tab and give the role to the right people.",
    ],
    tips: [
      "HR admin always has every permission and can't be changed.",
      "Use Make a copy on a system role to start from something close to what you need.",
    ],
    related: ["setup-workflows"],
  },

  /* ── Rules ───────────────────────────────────────────────────────── */
  {
    id: "setup-rules",
    category: "Company setup",
    title: "Rules",
    summary: "Write a condition or a formula and try it with sample values. The same rules are used in approval flows, policies and salary formulas.",
    keywords: ["rules", "formula", "condition", "expression", "salary formula", "basic", "HRA", "gratuity eligibility", "years of service", "test rule"],
    audience: "hr",
    sections: [
      {
        title: "Try a rule",
        desc: "Type a rule, give some sample values and see the answer.",
        path: "/dashboard/rules",
        parts: [
          { find: "Try a rule", label: "Try a rule", desc: "The place to type and test a rule." },
          { find: "Condition or formula", label: "Condition or formula", desc: "For example round(basic * 0.4, 0) for 40% of basic pay." },
          { find: "Gratuity eligible", label: "Examples", desc: "Click an example to load it. Gratuity is a lump sum paid on leaving after 5 or more years of service." },
          { find: "Sample values", label: "Sample values", desc: "The fields the rule can use, with test values." },
          { find: "Run", label: "Run", desc: "Works out the answer and shows which fields the rule used." },
          { find: "What you can use", label: "What you can use", desc: "The comparisons and functions you can write in a rule." },
        ],
      },
    ],
    steps: [
      "Type a condition or formula, or click an example.",
      "Change the sample values to match a real case.",
      "Press Run and check the answer.",
      "Copy the rule into an approval flow, automation or salary formula.",
    ],
    tips: ["Press Ctrl + Enter (Cmd + Enter on a Mac) to run the rule quickly."],
    related: ["setup-workflows", "setup-automation"],
  },

  /* ── Approval flows ──────────────────────────────────────────────── */
  {
    id: "setup-workflows",
    category: "Company setup",
    title: "Approval flows",
    summary: "Who approves each kind of request, in which order, and what happens when an approval waits too long.",
    keywords: ["approval", "workflow", "approver", "leave approval", "multi-level approval", "escalation", "reminder", "time limit", "manager approval", "HR approval", "reimbursement approval"],
    audience: "hr",
    sections: [
      {
        title: "Flows for each kind of request",
        desc: "Pick a kind of request on the left to see its approval flows.",
        path: "/dashboard/workflows",
        parts: [
          { find: "Kinds of request", label: "Kinds of request", desc: "Leave, reimbursements, letters and more. Each can have its own flows." },
          { find: "New flow", label: "New flow", desc: "Add a flow for the kind of request you picked." },
          { find: "Approval settings", label: "Approval settings", desc: "Rules for every flow: who decides when there is no approver, reminders and email approvals." },
          { find: "History and time limits", label: "History and time limits", desc: "See past approvals and which ones waited too long." },
          { find: "Versions", label: "Versions and Edit", desc: "Each flow card shows its steps. Edit changes it; Versions shows the older versions. When several flows exist, the first one (lowest order number) whose condition matches is used." },
        ],
      },
      {
        title: "Add a flow",
        desc: "Name the flow, say when it is used, and add steps in order.",
        path: "/dashboard/workflows",
        click: ["New flow"],
        parts: [
          { find: "Use this flow when", label: "Use this flow when", desc: "A condition such as request.days > 3. Leave empty to use it for every request of this kind." },
          { find: "Steps, in order", label: "Steps", desc: "Each step names who approves: a manager, a role, a person or a field on the request." },
          { find: "Who approves", label: "Who approves", desc: "Choose the approver for this step." },
          { find: "When there are several approvers", label: "Several approvers", desc: "Any one of them can decide, or every one must approve." },
          { find: "Time limit (hours)", label: "Time limit", desc: "How long the step may wait before it is sent to someone else." },
          { find: "Save flow", label: "Save flow", desc: "Saves a new version. Requests already in progress keep the old one." },
        ],
      },
      {
        title: "Approval settings",
        desc: "Rules that apply to every approval flow.",
        path: "/dashboard/workflows",
        click: ["Approval settings"],
        parts: [
          { find: "When no approver is found", label: "No approver found", desc: "Who decides when, for example, someone has no manager on record." },
          { find: "When an approver leaves", label: "Approver leaves", desc: "Their pending approvals move to someone else the day they leave." },
          { find: "Reminders and email", label: "Reminders and email", desc: "How often people can send reminders, and whether approvers can decide straight from the email." },
          { find: "Save settings", label: "Save settings", desc: "Saves these rules for all flows." },
        ],
      },
    ],
    steps: [
      "Pick a kind of request on the left, such as leave.",
      "Press New flow and give it a name.",
      "Add a condition if the flow is only for some requests.",
      "Add the steps in order and choose who approves each one.",
      "Set a time limit and reminders if needed, then press Save flow.",
    ],
    tips: [
      "Without any flow, requests of that kind are approved straight away.",
      "Editing a flow makes a new version; you can see older ones under Versions.",
    ],
    related: ["setup-rules", "setup-automation", "setup-roles"],
  },

  /* ── Automation ──────────────────────────────────────────────────── */
  {
    id: "setup-automation",
    category: "Company setup",
    title: "Automation",
    summary: "Rules that act on their own: send a reminder, email someone, create a task, change a field, start an approval or call another system.",
    keywords: ["automation", "auto reminder", "trigger", "probation reminder", "birthday", "work anniversary", "webhook", "run log", "email alert", "scheduled rule", "task"],
    audience: "hr",
    sections: [
      {
        title: "Automation rules",
        desc: "All rules, whether they are on, and how often they have run.",
        path: "/dashboard/automation",
        parts: [
          { find: "New rule", label: "New rule", desc: "Make a rule that acts when something happens to a record." },
          { find: "Run date rules now", label: "Run date rules now", desc: "Runs date-based rules (such as birthdays or probation end) straight away instead of waiting." },
          { find: "Run log", label: "Run log", desc: "Every time a rule ran and what it did." },
          { find: "Webhooks", label: "Webhooks", desc: "Send events to another system's web address." },
          { find: "Rule", label: "Rule", desc: "The name of each rule. Use the switch on the left to turn it on or off." },
          { find: "Last run", label: "Last run", desc: "When the rule last acted." },
        ],
      },
      {
        title: "Make a rule",
        desc: "When something happens to a record, do one or more things automatically.",
        path: "/dashboard/automation",
        click: ["New rule"],
        parts: [
          { find: "Remind the manager before probation ends", label: "Name", desc: "A clear name, for example Remind the manager before probation ends." },
          { find: "Record type", label: "Record type", desc: "The kind of record the rule watches, such as employee or leave request." },
          { find: "Runs when", label: "Runs when", desc: "What makes it run: a record is added or changed, or a date arrives." },
          { find: "Only if", label: "Only if", desc: "Optional. The rule acts only when this condition is true." },
          { find: "Then", label: "Then", desc: "What to do: send a reminder or email, create a task, change a field or start an approval." },
          { find: "Save rule", label: "Save rule", desc: "Saves the rule." },
        ],
      },
    ],
    steps: [
      "Press New rule and name it.",
      "Choose the record type and what makes it run.",
      "Add a condition under Only if, if needed.",
      "Under Then, add what should happen.",
      "Press Save rule and check the Run log later.",
    ],
    tips: [
      "Use Repeat every year for birthdays and work anniversaries.",
      "Switch a rule off to pause it without losing it.",
    ],
    related: ["setup-workflows", "setup-notifications"],
  },

  /* ── Notifications ───────────────────────────────────────────────── */
  {
    id: "setup-notifications",
    category: "Company setup",
    title: "Notifications",
    summary: "How people are told about things: in the app, by email and on the phone. Change email wording and see what was sent.",
    keywords: ["notifications", "email", "push", "phone app", "daily summary", "digest", "email template", "test email", "delivery log", "reminder email", "alerts"],
    audience: "hr",
    sections: [
      {
        title: "Channels and summaries",
        desc: "Switch email and phone messages on or off, and set defaults for everyone.",
        path: "/dashboard/settings/notifications",
        parts: [
          { find: "Email wording", label: "Tabs", desc: "Channels and summaries, Email wording, and Delivery log." },
          { find: "Send emails", label: "Send emails", desc: "The main switch for every notification email." },
          { find: "Defaults for everyone", label: "Defaults for everyone", desc: "Which kinds of message go by email or phone. People can change these for themselves." },
          { find: "Daily summary emails", label: "Daily summary emails", desc: "A daily list of waiting requests for approvers, and of joiners, exits and expiring documents for HR." },
          { find: "Send a test email", label: "Send a test email", desc: "Check that emails reach the inbox." },
          { find: "Save changes", label: "Save changes", desc: "Saves the settings on this tab." },
        ],
      },
      {
        title: "Email wording",
        desc: "Change the subject and message of each email the app sends.",
        path: "/dashboard/settings/notifications?tab=emails",
        parts: [
          { find: "Email", label: "Email", desc: "Each email the app sends. Click one to change its wording." },
          { find: "Subject", label: "Subject", desc: "The subject line people see in their inbox." },
          { find: "Standard", label: "Standard or changed", desc: "Changed means you edited the wording. You can go back to the standard wording any time." },
        ],
      },
      {
        title: "Delivery log",
        desc: "Every email and phone message sent, and whether it arrived.",
        path: "/dashboard/settings/notifications?tab=log",
        parts: [
          { find: "To", label: "To", desc: "The subject and who it went to." },
          { find: "From", label: "From", desc: "What sent it, such as an approval or an automation." },
          { find: "Status", label: "Status", desc: "Sent, Failed, Will retry or Skipped. Failed messages can be sent again." },
          { find: "When", label: "When", desc: "The date and time it was sent." },
        ],
      },
    ],
    steps: [
      "Set up email first under Integrations.",
      "Switch on Send emails and choose the defaults for each kind of message.",
      "Set the daily summary time.",
      "Send a test email to yourself.",
      "Press Save changes.",
    ],
    tips: ["If emails are not arriving, look in the Delivery log for failed messages and press Retry now."],
    related: ["setup-integrations", "setup-automation"],
  },

  /* ── Custom fields ───────────────────────────────────────────────── */
  {
    id: "setup-custom-fields",
    category: "Company setup",
    title: "Custom fields",
    summary: "Add the extra details your company keeps, grouped in sections. They appear on forms and profiles right away.",
    keywords: ["custom fields", "extra fields", "employee form", "profile fields", "section", "UAN", "PF number", "uniform size", "dropdown field", "required field"],
    audience: "hr",
    sections: [
      {
        title: "Fields and sections",
        desc: "Choose a record type, then add sections and fields.",
        path: "/dashboard/custom-fields",
        parts: [
          { find: "Fields for", label: "Fields for", desc: "Pick which record the fields belong to: employee, department, location, candidate and more." },
          { find: "New section", label: "New section", desc: "A titled group of fields, such as Statutory details." },
          { find: "Add field", label: "Add field", desc: "Add a new field to the form." },
          { find: "Preview", label: "Preview", desc: "Shows the form as people will see it." },
        ],
      },
      {
        title: "Add a field",
        desc: "Name, type, section and checks for the new field.",
        path: "/dashboard/custom-fields",
        click: ["Add field"],
        parts: [
          { find: "Field name", label: "Field name", desc: "Required, for example PF number." },
          { find: "Section", label: "Section", desc: "The section it appears in. Leave empty to show it under Other details." },
          { find: "Type", label: "Type", desc: "Text, number, date, dropdown, yes/no, file and more. It can't change once saved." },
          { find: "Help text", label: "Help text", desc: "A short hint shown under the field." },
          { find: "Required", label: "Required", desc: "The form can't be saved without it." },
        ],
      },
    ],
    steps: [
      "Pick the record type under Fields for.",
      "Press New section and name it, for example Statutory details.",
      "Press Add field, enter the name and pick the type.",
      "Choose the section and switch on Required if needed.",
      "Save, then drag fields to change their order.",
    ],
    tips: [
      "Switch a field off instead of deleting it; saved values are kept.",
      "For dropdowns, you can reuse a list from Masters.",
    ],
    related: ["setup-masters"],
  },

  /* ── Templates ───────────────────────────────────────────────────── */
  {
    id: "setup-templates",
    category: "Company setup",
    title: "Letter templates",
    summary: "Letters filled in with employee details, such as offer, appointment or experience letters, printed on your own header and footer.",
    keywords: ["template", "letter", "offer letter", "appointment letter", "experience letter", "relieving letter", "letterhead", "header", "footer", "e-sign", "merge fields"],
    audience: "hr",
    sections: [
      {
        title: "Letter templates",
        desc: "All your letter templates.",
        path: "/dashboard/templates",
        parts: [
          { find: "New template", label: "New template", desc: "Write a new letter template." },
          { find: "Headers and footers", label: "Headers and footers", desc: "Your letterhead designs, with logo, address and signature." },
          { find: "Generated letters", label: "Generated letters", desc: "Letters already made from these templates." },
          { find: "Template", label: "Template", desc: "Each template. Badges show if it is the default, can be requested by employees, or needs signatures." },
          { find: "Kind", label: "Kind", desc: "The kind of letter, such as offer or experience letter." },
        ],
      },
      {
        title: "Write a template",
        desc: "Write the letter and add fields that fill in by themselves.",
        path: "/dashboard/templates",
        click: ["New template"],
        parts: [
          { find: "Template name", label: "Template name", desc: "A name you will recognise later." },
          { find: "Letter title, e.g. Offer of employment", label: "Title and letter text", desc: "The heading of the letter, with the text below it. Merge fields such as the employee's name fill in by themselves." },
          { find: "Merge fields", label: "Merge fields", desc: "Click a field to add it, such as name, designation or CTC." },
          { find: "Use and signing", label: "Use and signing", desc: "Make it the default, let employees request it, or send it for e-signature." },
          { find: "Save template", label: "Save template", desc: "Saves the template." },
        ],
      },
      {
        title: "Headers and footers",
        desc: "The letterhead printed on every letter.",
        path: "/dashboard/templates?tab=designs",
        parts: [
          { find: "New header", label: "New header", desc: "Design the top of the page: logo, company name and address." },
          { find: "New footer", label: "New footer", desc: "Design the bottom: registration details, page numbers or a signature." },
        ],
      },
    ],
    steps: [
      "Set up a header and footer on the Headers and footers tab.",
      "Press New template and pick the kind of letter.",
      "Write the letter and add merge fields.",
      "Choose the header, footer and page settings.",
      "Set who signs, then press Save template.",
    ],
    tips: ["Switch on Employees can request it for letters like address proof, so staff can ask for them themselves."],
    related: ["setup-numbering"],
  },

  /* ── Numbering ───────────────────────────────────────────────────── */
  {
    id: "setup-numbering",
    category: "Company setup",
    title: "Numbering",
    summary: "How employee IDs, requests, letters and other records are numbered. Changes apply to the next number.",
    keywords: ["numbering", "employee ID", "employee code", "series", "prefix", "sequence", "letter number", "auto number", "format", "counter"],
    audience: "hr",
    sections: [
      {
        title: "Number series",
        desc: "Each kind of record and the format of its numbers.",
        path: "/dashboard/numbering",
        parts: [
          { find: "New series", label: "New series", desc: "Add numbering for another kind of record." },
          { find: "Series", label: "Series", desc: "What the numbers are for, such as employee IDs." },
          { find: "Format", label: "Format", desc: "How the number is built, for example EMP-{SEQ}." },
          { find: "Next number", label: "Next number", desc: "The number the next record will get." },
          { find: "Starts again", label: "Starts again", desc: "Whether the counter restarts every year, month or never." },
          { find: "In use", label: "In use", desc: "Switch a series on or off." },
        ],
      },
      {
        title: "Add a number series",
        desc: "A format and counter for one kind of record.",
        path: "/dashboard/numbering",
        click: ["New series"],
        parts: [
          { find: "Prefix", label: "Prefix", desc: "Text such as EMP that goes at the start." },
          { find: "Counter starts again", label: "Counter starts again", desc: "Restart the count each year or month, or never." },
          { find: "Next numbers", label: "Next numbers", desc: "A preview of the next few numbers." },
          { find: "First number", label: "First number", desc: "Where counting starts." },
          { find: "People may type their own number", label: "Typing a number", desc: "When off, the number is always given automatically." },
        ],
      },
    ],
    steps: [
      "Press Edit on a series, or New series.",
      "Set the prefix and build the format from the parts shown.",
      "Choose when the counter starts again.",
      "Check the next numbers preview, then press Save.",
    ],
    tips: ["Give each legal entity a short code to use it inside numbers, such as KA-001 and MH-001."],
    related: ["setup-entities"],
  },

  /* ── Import & export ─────────────────────────────────────────────── */
  {
    id: "setup-import-export",
    category: "Company setup",
    title: "Import and export",
    summary: "Bring records in from Excel or CSV, or take them out as a spreadsheet. Every import is checked before anything changes.",
    keywords: ["import", "export", "Excel", "CSV", "bulk upload", "spreadsheet", "template", "migrate data", "download data", "bulk update"],
    audience: "hr",
    sections: [
      {
        title: "Import and export",
        desc: "One card for each kind of record you can bring in or take out.",
        path: "/dashboard/settings/import-export",
        parts: [
          { find: "Export data", label: "Export data", desc: "Download records as a spreadsheet." },
          { find: "Import", label: "Import", desc: "Upload an Excel or CSV file. You see what will be added or changed before anything is saved." },
          { find: "Template", label: "Template", desc: "Download a blank spreadsheet with the right columns to fill in." },
        ],
      },
      {
        title: "Export data",
        desc: "Choose what to download and in which format.",
        path: "/dashboard/settings/import-export",
        click: ["Export data"],
        parts: [
          { find: "What to export", label: "What to export", desc: "The kind of records to download." },
          { find: "Format", label: "Format", desc: "Excel or CSV." },
          { find: "Protect with a password", label: "Password", desc: "Lock the file with a password, which is wise for salary or bank details." },
        ],
      },
    ],
    steps: [
      "Press Template on the card you need and fill in the spreadsheet.",
      "Press Import and drop the file.",
      "Match the columns and check the rows with problems.",
      "Confirm to add or update the records.",
    ],
    tips: ["Imports can add new records or update existing ones; existing records are matched by the field you choose."],
    related: ["setup-integrations"],
  },

  /* ── Integrations ────────────────────────────────────────────────── */
  {
    id: "setup-integrations",
    category: "Company setup",
    title: "Integrations",
    summary: "Connect the services the app works with, such as email, messages, accounts, sign-in and job boards. Keys and passwords are stored encrypted.",
    keywords: ["integrations", "email setup", "SMTP", "SMS", "WhatsApp", "single sign-on", "SSO", "accounting", "job board", "connect", "API key", "token"],
    audience: "hr",
    sections: [
      {
        title: "Services",
        desc: "Each card is one service. Its badge shows whether it is connected.",
        path: "/dashboard/settings/integrations",
        parts: [
          { find: "Messages", label: "Messages", desc: "Email and message services used to send notifications." },
          { find: "Finance", label: "Finance", desc: "Send payroll journals to your accounts." },
          { find: "Sign-in", label: "Sign-in", desc: "Single sign-on, so people sign in with their work account." },
          { find: "Set up", label: "Set up", desc: "Opens the settings for a service. Use Test connection before saving." },
          { find: "New token", label: "Personal tokens", desc: "Create a token to connect another app to your HR data. Copy it straight away; it is shown only once." },
        ],
      },
    ],
    steps: [
      "Find the service and press Set up.",
      "Enter the details the service gave you.",
      "Press Test connection.",
      "Switch on Enabled and press Save.",
    ],
    tips: ["Set up email first, so notifications and payslips can be sent."],
    related: ["setup-notifications", "setup-import-export"],
  },

  /* ── Subscription ────────────────────────────────────────────────── */
  {
    id: "setup-subscription",
    category: "Company setup",
    title: "Subscription",
    summary: "Your plan, how long it runs, and how to pay by UPI.",
    keywords: ["subscription", "plan", "billing", "pay", "UPI", "renew", "free trial", "coupon", "invoice", "upgrade", "price"],
    audience: "hr",
    sections: [
      {
        title: "Your plan and payment",
        desc: "See what you have now, pick a plan and period, and pay.",
        path: "/dashboard/subscription",
        parts: [
          { find: "days left", label: "Days left", desc: "How many days are left on your trial or plan." },
          { find: "Have a coupon code?", label: "Coupon", desc: "Enter a coupon code for a discount." },
          { find: "/ month", label: "Plans", desc: "Each plan with its price per month. Click one to choose it." },
          { find: "Pay with UPI", label: "Pay with UPI", desc: "Scan the QR code or use the UPI ID. Include the payment code as the note." },
          { find: "Confirmed within 1 working day", label: "Confirmation", desc: "Your payment is confirmed within one working day." },
        ],
      },
    ],
    steps: [
      "Choose how long to pay for; longer periods cost less per month.",
      "Pick a plan.",
      "Add a coupon code if you have one.",
      "Pay with UPI using the QR code or UPI ID, with the payment code as the note.",
    ],
    tips: ["When the plan ends there is a short grace period to pay before access stops."],
    related: ["setup-company"],
  },
];
