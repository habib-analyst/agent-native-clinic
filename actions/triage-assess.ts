import { z } from "zod";
import { defineAction } from "@agent-native/core/action";
import { getDb } from "../server/db/index.js";
import { triageAssessments } from "../server/db/schema.js";
import { assessTriage } from "../server/lib/triage-rules.js";

export const triageAssessSchema = z.object({
  patient_name: z.string().min(1).describe("Patient's full name"),
  symptoms: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Reported symptoms as plain phrases, e.g. ['chest pain', 'shortness of breath']"),
});

export default defineAction({
  description:
    "Run the deterministic triage rules over a patient's reported symptoms and persist the assessment. Returns an urgency band (emergency | urgent | routine | self_care) with matched reasons and the recommended next step. This is decision support, NOT a diagnosis.",
  schema: triageAssessSchema,
  run: async ({ patient_name, symptoms }) => {
    const db = getDb();
    const result = assessTriage(symptoms);

    const inserted = await db
      .insert(triageAssessments)
      .values({
        patientName: patient_name,
        symptoms,
        urgency: result.urgency,
        reasons: result.reasons,
      })
      .returning();

    return {
      assessment_id: inserted[0].id,
      patient_name,
      urgency: result.urgency,
      reasons: result.reasons,
      next_step: result.nextStep,
      disclaimer: result.disclaimer,
      _receipt: {
        changed: true,
        verified: true,
        summary: `Triage assessment ${inserted[0].id} for ${patient_name}: ${result.urgency}`,
        subject: `triage:${inserted[0].id}`,
        checks: [{ id: "assessment-persisted", ok: true }],
      },
    };
  },
});
