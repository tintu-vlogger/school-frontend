import type { HelpTopic } from "../help-types";

/** Help guides for salary bank files (payroll settings and the pay run) and Google / Microsoft sign-in. */
export const TOPICS: HelpTopic[] = [
  {
    id: "bank-files-settings",
    category: "Payroll",
    title: "Bank file settings",
    summary: "Set up the company accounts salaries are paid from, pick each bank's upload layout, and build your own layout when your bank uses a different one.",
    keywords: ["bank file", "salary transfer", "bulk upload", "NEFT", "RTGS", "IMPS", "debit account", "HDFC ENet", "ICICI CIB", "SBI CINB", "Axis", "Kotak", "IFSC", "custom format", "fixed width"],
    audience: "hr",
    sections: [
      {
        title: "Payment rules and debit accounts",
        desc: "How payments to other banks are sent, and the accounts the bank debits.",
        path: "/dashboard/payroll/settings?tab=bank",
        parts: [
          { find: "How salaries are sent", label: "Payment rules", desc: "Choose NEFT, NEFT with RTGS for large amounts, or IMPS. RTGS is only for ₹2 lakh and above; IMPS is limited to ₹5 lakh per payment." },
          { find: "Narration", label: "Narration", desc: "The text employees see on their bank statement. {month} becomes the pay month." },
          { find: "Debit accounts", label: "Debit accounts", desc: "The company accounts salaries are paid from. Each legal entity uses its default account; an account marked for all entities covers the rest." },
          { find: "Add account", label: "Add account", desc: "Enter the account number and IFSC (or copy one saved on the legal entity) and pick the bank's file format. Some banks also need a client code or corporate id." },
        ],
      },
      {
        title: "Bank file formats",
        desc: "Ready-made layouts for Indian banks, and your own.",
        path: "/dashboard/payroll/settings?tab=bank",
        parts: [
          { find: "Bank file formats", label: "Formats", desc: "Layouts for SBI, HDFC, ICICI, Axis, Kotak, Yes Bank, IDFC FIRST, IndusInd, Bank of Baroda, PNB, Canara, Union Bank, Federal Bank, South Indian Bank and a standard CSV. The tag shows how sure we are of each layout." },
          { find: "New custom format", label: "New custom format", desc: "Build a layout to match your bank's sample file: columns and their order, separator or fixed widths, header and footer lines with totals, date and amount style. A preview with sample rows updates as you go." },
        ],
      },
    ],
    steps: [
      "Open Settings, then Payroll settings, then the Bank files tab.",
      "Under Debit accounts click Add account, choose the legal entity, and enter the account number and IFSC.",
      "Pick the file format for that bank and fill in the client code or corporate id if the bank gave you one.",
      "If your bank's sample file looks different, open the closest format, choose Make a copy to change, and adjust the columns until the preview matches.",
      "Save, and compare your first real file with the sample in your bank's corporate banking before uploading.",
    ],
    tips: [
      "Banks change their templates now and then. A format marked Check with your bank was built from a common layout; compare it with your bank's sample.",
      "Same-bank payments are sent as fund transfers automatically when the employee's IFSC belongs to the debit account's bank.",
    ],
    related: ["bank-files-run", "sign-in-options"],
  },
  {
    id: "bank-files-run",
    category: "Payroll",
    title: "Making salary bank files",
    summary: "After a pay run is approved, check everyone's bank details and make the files to upload in your bank's corporate banking.",
    keywords: ["bank file", "salary upload", "pay salaries", "NEFT file", "IFSC check", "left out", "download bank file", "audit"],
    audience: "hr",
    sections: [
      {
        title: "Pay salaries",
        desc: "The bank files panel on a locked pay run.",
        path: "/dashboard/payroll/runs",
        parts: [
          { find: "Pay runs", label: "Pay runs", desc: "Open an approved or locked pay run, then go to its last step, Lock and pay." },
        ],
      },
    ],
    steps: [
      "Open the pay run and go to Lock and pay.",
      "Click Make bank files. The check lists the files that will be made (one per debit account, and separate files where the bank needs them) with counts and totals.",
      "Fix any wrong IFSC or account number on the employee's profile, or choose to leave those people out for now.",
      "Click Make files, then Download each file and upload it in your bank's corporate banking.",
      "Once the bank confirms, use Mark as paid with the bank's batch or UTR reference.",
    ],
    tips: [
      "Every file is kept with the pay run: who made it, when, totals, a check code and how often it was downloaded.",
      "Making files again keeps the earlier ones, marked Replaced, so you can always see what was sent.",
      "Salaries on hold are left out; after releasing them tick Only salaries released from hold to make a file for just those.",
    ],
    related: ["bank-files-settings"],
  },
  {
    id: "sign-in-options",
    category: "Company setup",
    title: "Sign in with Google or Microsoft",
    summary: "Let people sign in with their Google Workspace or Microsoft 365 work account, and limit it to your company's email domains.",
    keywords: ["single sign-on", "SSO", "Google sign-in", "Microsoft sign-in", "Microsoft 365", "Entra ID", "Azure AD", "Google Workspace", "email domain", "login"],
    audience: "hr",
    sections: [
      {
        title: "Sign-in options",
        desc: "Switch each option on or off and list allowed domains.",
        path: "/dashboard/settings/sign-in",
        parts: [
          { find: "Sign in with", label: "Providers", desc: "Turn Google or Microsoft sign-in on. An option shows as not offered yet until the service has set it up." },
          { find: "Allowed email domains", label: "Allowed domains", desc: "Leave empty to allow any address, or list your domains (such as yourcompany.in) so only work accounts can sign in this way." },
          { find: "Save", label: "Save", desc: "The buttons appear on your company's sign-in page straight away." },
        ],
      },
    ],
    steps: [
      "Open Settings, then Sign-in options.",
      "Switch on Google, Microsoft or both.",
      "Add your company's email domains if only work accounts should be used.",
      "Click Save. People now see Sign in with Google or Microsoft on the sign-in page.",
    ],
    tips: [
      "Only people already in the company can sign in this way: the owner and active employees whose work email matches the verified Google or Microsoft address. Nobody is added by signing in.",
      "Make sure each employee's work email in their profile is the same address they use for Google or Microsoft.",
      "Signing in from the main site finds the person's company; if the same email is used at two companies, sign in from the company's own address.",
    ],
    related: ["bank-files-settings"],
  },
];
