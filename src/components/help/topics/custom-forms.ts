import type { HelpTopic } from "../help-types";

/** Help guides for custom services: the Services page, one service's list and the admin set-up. */
export const TOPICS: HelpTopic[] = [
  {
    id: "custom-forms-services",
    category: "Home and self-service",
    title: "Services",
    summary: "Ask for things your company handles with a form, such as training, an ID card, business cards, a visitor pass or IT access, and follow each request.",
    keywords: ["services", "request", "form", "training request", "ID card", "business card", "visitor pass", "IT access", "my requests", "draft"],
    audience: "everyone",
    sections: [
      {
        title: "All services",
        desc: "Every service you may use, with your open requests and drafts.",
        path: "/dashboard/services",
        parts: [
          { find: "Services", label: "Page title", desc: "Services your company has set up. Each one also has its own entry in the menu." },
          { find: "All services", label: "All services", desc: "One card per service. It shows if approval is needed and how many of your requests are still open." },
          { find: "New request", label: "New request", desc: "Opens the form. Fill it in and send it, or save it as a draft to finish later." },
          { find: "My requests", label: "My requests", desc: "Every request you made in any service, with its number and status." },
        ],
      },
      {
        title: "Filling in a form",
        desc: "The form of one service.",
        path: "/dashboard/services",
        click: ["New request"],
        parts: [
          { find: "Send for approval", label: "Send", desc: "Sends the request. When the service needs approval it goes to the approvers first; otherwise it goes straight to the people who handle it." },
          { find: "Save draft", label: "Save draft", desc: "Keeps what you typed without sending it. Only you can see a draft." },
        ],
      },
    ],
    steps: [
      "Open Home, then Services (or the service's own entry in the menu).",
      "Click New request on the service you need.",
      "Fill in the form. Some questions appear only when they apply, and totals are worked out for you.",
      "Click Send for approval (or Submit). You get a request number at once.",
      "Follow it under My requests. Open it to see its status, comments and approval steps, add a comment or withdraw it.",
    ],
    tips: [
      "Some fields are filled in by HR later, such as an ID card number. You can see them once they are filled in.",
      "You can withdraw a request while it is waiting for approval or before work on it has started.",
      "For a visitor pass, enter only the last 4 digits of the visitor's ID. Never type a full Aadhaar number.",
    ],
    related: ["custom-forms-service-list", "custom-forms-setup"],
  },
  {
    id: "custom-forms-service-list",
    category: "Home and self-service",
    title: "A service's records",
    summary: "The list page of one service: your requests, or every record for the people who handle the service, with filters, saved views, columns and export.",
    keywords: ["service list", "records", "export", "excel", "csv", "saved view", "status", "handle requests", "columns"],
    audience: "hr",
    sections: [
      {
        title: "The list",
        desc: "Records of one service.",
        path: "/dashboard/services/training_request",
        parts: [
          { find: "All records", label: "All records", desc: "Shown to the people who handle the service: every record that has been sent. My requests shows only your own." },
          { find: "Status", label: "Filters", desc: "Filter by status, or by the form's choices such as kind of training." },
          { find: "Views", label: "Saved views", desc: "Save the current search, filters and columns under a name, and share it with others who handle the service." },
          { find: "Columns", label: "Columns", desc: "Pick which form fields show in the list." },
          { find: "Export", label: "Export", desc: "Download the list as Excel or CSV. Downloads are recorded in the audit log." },
          { find: "New request", label: "New request", desc: "Fill in the form for yourself." },
        ],
      },
    ],
    steps: [
      "Open the service from the menu.",
      "Click a record to open its details.",
      "Use Edit to fill in the fields kept for HR, or Change status to move it on (for example to Ready to collect).",
      "Add a comment or a file in the Activity tab. The requester is told.",
    ],
    tips: [
      "Statuses after approval are set per service by your admin. Final statuses close the record.",
      "Every change, status move and download is kept in the audit log.",
    ],
    related: ["custom-forms-services", "custom-forms-setup"],
  },
  {
    id: "custom-forms-setup",
    category: "Company setup",
    title: "Services & forms",
    summary: "Make your own request forms without code. Add ready-made ones in a click, build forms by dragging fields, and decide who may use them, who handles them, the approval and the statuses.",
    keywords: ["form builder", "custom service", "custom form", "templates", "drag and drop", "fields", "show if", "condition", "formula", "permissions", "versions", "numbering", "approval"],
    audience: "hr",
    sections: [
      {
        title: "Your services",
        desc: "Every service the company has, with its records.",
        path: "/dashboard/settings/services",
        parts: [
          { find: "Services & forms", label: "Page title", desc: "Services you made or added from templates. Click one to change its form or settings." },
          { find: "New service", label: "New service", desc: "Add a template (Training request, ID card request, Business card request, Visitor pass, IT access request) or start a blank form." },
          { find: "Records", label: "Records", desc: "How many records each service has, and how many are waiting for approval." },
        ],
      },
      {
        title: "Adding a service",
        desc: "Templates and blank services.",
        path: "/dashboard/settings/services",
        click: ["New service"],
        parts: [
          { find: "Templates", label: "Templates", desc: "Ready-made services with their form, statuses and approval. Click Add and they are in the menu at once. You can change everything afterwards." },
          { find: "Blank service", label: "Blank service", desc: "Give it a name and say where it shows in the menu, then build the form." },
        ],
      },
    ],
    steps: [
      "Open Settings, then Services & forms, and click New service.",
      "Add a template, or type a name and create a blank service.",
      "On the Form tab, drag field types from the left onto the form. Drag fields to change their order.",
      "Click a field to set its label, help text, whether it is required, its options and limits.",
      "Use Show only when for questions that apply sometimes, for example travel_needed == true.",
      "Use a Formula field for totals, for example coalesce(fee, 0) + coalesce(travel_cost, 0).",
      "Under Who may see or change it, make HR-only fields view only or hidden for employees.",
      "Click Save form. Each save is a new version; records already sent keep the version they were filled in.",
      "On the Settings tab, choose who may use it, who handles it, whether it needs approval, its statuses and record numbers.",
      "Change the approval steps under Settings, Approval flows. Each service has its own kind of request there.",
    ],
    tips: [
      "A field's kind can't change once saved, so old records always read correctly. Add a new field instead.",
      "Fields marked Show as a column in lists appear in the service's list and in Reports.",
      "Every service's records are available in Reports under Services.",
      "Archiving a service removes it from the menu but keeps its records.",
    ],
    related: ["custom-forms-services", "custom-forms-service-list"],
  },
];
