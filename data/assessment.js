const ASSESSMENT = [
  {
    id: "A", label: "Governance", emoji: "🏛️",
    description: "Board structure, meetings, elections, decisions, and committees",
    categories: [
      { id: "A1", label: "Board Meeting Practices", items: [
        "Regular meeting schedule established and followed",
        "Proper notice practices consistently used",
        "Meetings follow a structured agenda",
        "Board participation and quorum consistency",
        "Meeting conduct is organized and controlled",
      ]},
      { id: "A2", label: "Agenda & Minutes Process", items: [
        "Agendas prepared in advance",
        "Agendas distributed properly",
        "Minutes recorded consistently",
        "Minutes reflect decisions clearly",
        "Minutes approved and stored systematically",
      ]},
      { id: "A3", label: "Annual Meeting & Election Readiness", items: [
        "Annual meeting planned in advance",
        "Election procedures defined and followed",
        "Notice and quorum requirements understood",
        "Candidate process is organized",
        "Documentation retained properly",
      ]},
      { id: "A4", label: "Board Decision Tracking", items: [
        "Decisions are documented clearly",
        "Action items are tracked",
        "Follow-up responsibility assigned",
        "Decisions linked to records/minutes",
        "No reliance on memory or informal tracking",
      ]},
      { id: "A5", label: "Committee Structure & Oversight", items: [
        "Committees clearly defined",
        "Roles and authority documented",
        "Reporting to board is consistent",
        "Oversight by board exists",
        "No informal or uncontrolled committee actions",
      ]},
    ],
  },
  {
    id: "B", label: "Records & Admin", emoji: "📁",
    description: "Official records, document retention, contracts, and insurance files",
    categories: [
      { id: "B1", label: "Official Records Organization", items: [
        "Records categorized and structured",
        "Easy retrieval of documents",
        "Digital and/or physical system consistent",
        "No reliance on individual knowledge",
        "Transition-ready organization",
      ]},
      { id: "B2", label: "Document Retention Practices", items: [
        "Retention standards defined",
        "Older records archived properly",
        "No unnecessary duplication",
        "Key records preserved securely",
        "Destruction policy (if any) controlled",
      ]},
      { id: "B3", label: "Owner Records Request Process", items: [
        "Requests logged and tracked",
        "Response timeline defined",
        "Responsibility assigned",
        "Documentation of responses retained",
        "Process consistent and repeatable",
      ]},
      { id: "B4", label: "Contract File Completeness", items: [
        "All vendor contracts on file",
        "Contracts easy to locate",
        "Key terms visible (term, renewal, scope)",
        "Amendments properly stored",
        "No missing or expired contracts unmanaged",
      ]},
      { id: "B5", label: "Insurance & Key File Tracking", items: [
        "Insurance policies accessible",
        "Expiration dates tracked",
        "Certificates organized",
        "Key governing documents accessible",
        "Critical documents centralized",
      ]},
    ],
  },
  {
    id: "C", label: "Financial Operations", emoji: "💰",
    description: "Budget, collections, delinquency, invoices, and financial controls",
    categories: [
      { id: "C1", label: "Budget Preparation Workflow", items: [
        "Budget process defined annually",
        "Inputs from vendors or prior year used",
        "Board review process structured",
        "Timeline followed",
        "Supporting documentation exists",
      ]},
      { id: "C2", label: "Assessment Collection Process", items: [
        "Billing schedule consistent",
        "Payment tracking system in place",
        "Posting process defined",
        "Owner balances accessible",
        "No ambiguity in collection process",
      ]},
      { id: "C3", label: "Delinquency Tracking Workflow", items: [
        "Delinquency stages defined",
        "Follow-up actions consistent",
        "Escalation process exists",
        "Legal/collection coordination structured",
        "Reporting to board consistent",
      ]},
      { id: "C4", label: "Invoice Approval Flow", items: [
        "Invoice intake process defined",
        "Approval authority clear",
        "Supporting documentation required",
        "Payment process separated from approval",
        "No informal approvals",
      ]},
      { id: "C5", label: "Segregation of Duties & Reporting", items: [
        "Roles separated where possible",
        "Oversight by board exists",
        "Reporting frequency consistent",
        "Financial information communicated clearly",
        "No single-point control without oversight",
      ]},
    ],
  },
  {
    id: "D", label: "Maintenance & Vendors", emoji: "🔧",
    description: "Vendor contracts, maintenance scheduling, work orders, bids, and renewals",
    categories: [
      { id: "D1", label: "Vendor Contract Tracking", items: [
        "Vendor list maintained",
        "Contract terms tracked",
        "Start/end dates known",
        "Scope of work clear",
        "Performance monitored",
      ]},
      { id: "D2", label: "Maintenance Scheduling", items: [
        "Preventive maintenance calendar exists",
        "Routine tasks scheduled",
        "Responsibility assigned",
        "Tracking of completion",
        "No reactive-only maintenance",
      ]},
      { id: "D3", label: "Work Order / Service Request Flow", items: [
        "Requests logged consistently",
        "Tracking system exists",
        "Status updates available",
        "Completion confirmation process",
        "No lost or untracked requests",
      ]},
      { id: "D4", label: "Bid Documentation Practices", items: [
        "Multiple bids obtained when required",
        "Bid comparisons documented",
        "Decisions recorded",
        "Vendor selection rationale clear",
        "Documentation retained",
      ]},
      { id: "D5", label: "Renewal / Calendar Control System", items: [
        "Key dates tracked (contracts, insurance, inspections)",
        "Calendar system exists",
        "Alerts/reminders in place",
        "No missed deadlines",
        "Responsibility assigned",
      ]},
    ],
  },
  {
    id: "E", label: "Resident Communications", emoji: "💬",
    description: "Violations, ARC requests, inquiries, onboarding, and bilingual capability",
    categories: [
      { id: "E1", label: "Violation Notice Workflow", items: [
        "Violation process defined",
        "Notices standardized",
        "Timeline consistent",
        "Documentation retained",
        "Enforcement consistent",
      ]},
      { id: "E2", label: "ARC/ACC Request Handling", items: [
        "Submission process defined",
        "Review timeline clear",
        "Decisions documented",
        "Communication consistent",
        "Tracking system exists",
      ]},
      { id: "E3", label: "Resident Inquiry Response Process", items: [
        "Inquiries tracked",
        "Response time defined",
        "Responsibility assigned",
        "Responses consistent",
        "Follow-up ensured",
      ]},
      { id: "E4", label: "Owner/Tenant Onboarding & Offboarding", items: [
        "New owner process defined",
        "Welcome/intro communication exists",
        "Rules and info provided clearly",
        "Tenant process defined (if applicable)",
        "Exit/update process structured",
      ]},
      { id: "E5", label: "Bilingual Communication Capability", items: [
        "Key communications available in English/Spanish (if needed)",
        "Clarity in messaging across languages",
        "No miscommunication risk due to language gaps",
        "Consistency in tone and content",
        "Accessibility for Spanish-speaking residents/vendors",
      ]},
    ],
  },
];

// Build lookup maps
const SECTION_MAP  = Object.fromEntries(ASSESSMENT.map(s => [s.id, s]));
const CATEGORY_MAP = {};
ASSESSMENT.forEach(s => s.categories.forEach(c => {
  CATEGORY_MAP[c.id] = { ...c, sectionId: s.id, sectionLabel: s.label, sectionEmoji: s.emoji };
}));

function sectionByLabel(text) {
  const t = text.toLowerCase();
  return ASSESSMENT.find(s =>
    s.label.toLowerCase().includes(t) ||
    s.id.toLowerCase() === t ||
    s.emoji === text ||
    t.includes(s.id.toLowerCase())
  );
}

module.exports = { ASSESSMENT, SECTION_MAP, CATEGORY_MAP, sectionByLabel };
