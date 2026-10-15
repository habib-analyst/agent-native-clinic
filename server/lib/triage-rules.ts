/**
 * triage-rules.ts — deterministic, LLM-free patient triage.
 *
 * This is DECISION SUPPORT, not diagnosis. It maps reported symptoms to one of
 * four urgency bands via keyword rules derived from standard red-flag lists
 * (emergency medicine triage references). The ruleset is intentionally small
 * and transparent: every band assignment carries its matched reasons, and any
 * symptom the ruleset does not recognize defaults to "routine" (human review)
 * rather than being silently downgraded.
 *
 * Pure function — no I/O — so it is unit-testable and behaves identically
 * whether invoked from the agent, the UI, HTTP, or the CLI.
 */

export type Urgency = "emergency" | "urgent" | "routine" | "self_care";

export interface TriageResult {
  urgency: Urgency;
  reasons: string[];
  nextStep: string;
  disclaimer: string;
}

interface Rule {
  band: Urgency;
  keywords: string[];
  label: string;
}

const RULES: Rule[] = [
  {
    band: "emergency",
    label: "red-flag symptom",
    keywords: [
      "chest pain",
      "chest pressure",
      "difficulty breathing",
      "shortness of breath",
      "can't breathe",
      "cannot breathe",
      "unconscious",
      "fainted and not waking",
      "seizure",
      "stroke",
      "face drooping",
      "slurred speech",
      "sudden weakness",
      "severe bleeding",
      "bleeding heavily",
      "suicidal",
      "suicide",
      "overdose",
      "heart attack",
      "blue lips",
    ],
  },
  {
    band: "urgent",
    label: "urgent symptom",
    keywords: [
      "high fever",
      "fever over 103",
      "severe pain",
      "vomiting blood",
      "coughing blood",
      "dehydration",
      "dizzy and faint",
      "broken bone",
      "fracture",
      "deep cut",
      "eye injury",
      "severe burn",
      "abdominal pain severe",
      "severe headache sudden",
      "worst headache",
    ],
  },
  {
    band: "self_care",
    label: "minor symptom suitable for self-care",
    keywords: [
      "mild cold",
      "runny nose",
      "mild headache",
      "mild sore throat",
      "minor rash",
      "mild cough",
      "sneezing",
      "mild muscle ache",
      "paper cut",
      "mild sunburn",
    ],
  },
];

const BAND_RANK: Record<Urgency, number> = {
  self_care: 0,
  routine: 1,
  urgent: 2,
  emergency: 3,
};

const NEXT_STEP: Record<Urgency, string> = {
  emergency: "Call emergency services now (e.g. 1122 / 911). Do not drive yourself.",
  urgent: "Seek same-day urgent care or an urgent clinic slot today.",
  routine: "Book a routine clinic appointment within the next few days.",
  self_care: "Self-care at home is reasonable; book a routine visit if it worsens or persists beyond 3 days.",
};

const DISCLAIMER =
  "Decision support only, not a diagnosis. Rules cover common red flags; " +
  "anything unrecognized defaults to routine human review. When in doubt, seek care.";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function assessTriage(symptoms: string[]): TriageResult {
  const matched: Array<{ band: Urgency; label: string; keyword: string }> = [];
  for (const raw of symptoms) {
    const s = normalize(raw);
    if (!s) continue;
    let hit = false;
    for (const rule of RULES) {
      for (const kw of rule.keywords) {
        if (s.includes(normalize(kw))) {
          matched.push({ band: rule.band, label: rule.label, keyword: kw });
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) {
      matched.push({ band: "routine", label: "unrecognized symptom (default: human review)", keyword: raw });
    }
  }

  if (matched.length === 0) {
    return {
      urgency: "routine",
      reasons: ["no symptoms provided; default to human review"],
      nextStep: NEXT_STEP.routine,
      disclaimer: DISCLAIMER,
    };
  }

  const top = matched.reduce((a, b) => (BAND_RANK[b.band] > BAND_RANK[a.band] ? b : a));
  const reasons = matched.map((m) => `${m.label}: "${m.keyword}"`);

  return {
    urgency: top.band,
    reasons,
    nextStep: NEXT_STEP[top.band],
    disclaimer: DISCLAIMER,
  };
}
