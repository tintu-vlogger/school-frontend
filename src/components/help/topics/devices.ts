import type { HelpTopic } from "../help-types";

/** Help guides for the Devices page: connecting attendance machines of any make. */
export const TOPICS: HelpTopic[] = [
  {
    id: "devices-connect",
    category: "Time and leave",
    title: "Connecting attendance machines",
    summary: "Connect biometric, card and face machines of any make: they can send punches to us, we can read their software or database, or a small office program can do it for you.",
    keywords: ["biometric", "device", "attendance machine", "ADMS", "cloud server", "iclock", "eSSL", "ZKTeco", "Matrix", "COSEC", "Realtime", "eTimeTrackLite", "BioTime", "Hikvision", "Suprema", "BioStar", "SQL Server", "database", "connector", "port 4370", "sync"],
    audience: "hr",
    sections: [
      {
        title: "Your machines",
        desc: "Every machine, how it connects and whether it is online.",
        path: "/dashboard/devices",
        parts: [
          { find: "Add device", label: "Add device", desc: "Add a machine in a few steps: its details, how punches arrive, the settings and a test." },
          { find: "Connection", label: "Connection", desc: "How punches arrive. 'Office connector' under it means a small program on an office PC reads this machine." },
          { find: "Status", label: "Status", desc: "Online or offline for machines that call us and for the office connector. 'Problem' means the last read failed: open the machine to see why." },
          { find: "Last activity", label: "Last activity", desc: "When the machine last sent or we last read punches." },
          { find: "Sync log", label: "Sync log", desc: "Every batch of punches: new ones, ones already there and user ids nobody is enrolled with." },
        ],
      },
      {
        title: "Choosing how punches arrive",
        desc: "The second step of Add device.",
        path: "/dashboard/devices",
        click: ["Add device", "Next"],
        parts: [
          { find: "ADMS cloud push (ZKTeco, eSSL)", label: "ADMS cloud push", desc: "Best for most ZKTeco and eSSL machines: enter our address in the machine's Cloud Server or ADMS menu and it sends every punch. Nothing to install." },
          { find: "Vendor push (Hikvision, any JSON)", label: "Vendor push", desc: "For Hikvision and other machines that post their own format to an address. You match its fields once." },
          { find: "Vendor software API", label: "Software API", desc: "We call your attendance software's web API on a schedule. Presets for eSSL eTimeTrackLite, Matrix COSEC, Realtime, ZKBioTime and Suprema BioStar 2." },
          { find: "Database read", label: "Database read", desc: "We read punches straight from the attendance software's database: Matrix COSEC, eSSL eTimeTrackLite, ZKBioTime, ZKTime and others." },
          { find: "LAN pull (ZKTeco, port 4370)", label: "LAN pull", desc: "The machine is read directly over the office network, usually by the office connector." },
          { find: "Email attachments", label: "Email", desc: "For software that emails a daily punch report: we read the attachments from a mailbox." },
        ],
      },
    ],
    steps: [
      "Open Time, then Devices, and click Add device.",
      "Fill in the name, make and serial number, then click Next.",
      "Choose how punches arrive. For ZKTeco or eSSL machines with a Cloud Server / ADMS menu, choose ADMS cloud push.",
      "Fill in the settings. Choose a preset for your software where there is one; it fills in the usual values.",
      "For a software API or database: click Test to see the first rows, check that the employee, time and in / out fields are right, and look at how they read as punches.",
      "For a database or LAN pull inside the office: choose Office connector, save, open the machine and click Connector settings file. Put the file next to connector.exe on an office PC and run it.",
      "Enrol each person's user id on the machine under Enrolments, or match people by their employee ID.",
      "Watch the Sync log: new punches appear within a few minutes.",
    ],
    tips: [
      "Not sure which to choose? ADMS cloud push for ZKTeco / eSSL machines; Database read through the office connector for Matrix COSEC and eTimeTrackLite.",
      "Give us a database user that can only read. We only ever run SELECT queries.",
      "Punches from user ids that are not enrolled are counted under Not enrolled; enrol them and the next read picks them up.",
      "The office connector keeps punches on the PC when the internet is down and sends them later.",
      "An ADMS machine can be asked to send its last 31 days again: open it and click Fetch last 31 days again.",
    ],
    related: ["time-pay-devices", "time-pay-attendance-admin"],
  },
];
