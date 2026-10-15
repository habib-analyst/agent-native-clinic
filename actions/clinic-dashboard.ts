import { z } from "zod";
import { defineAction } from "@agent-native/core/action";
import { eq, desc, count } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { appointments, triageAssessments, doctors } from "../server/db/schema.js";

export default defineAction({
  description:
    "Clinic front-desk dashboard: counts of confirmed/cancelled appointments, today's-per-day breakdown, the triage queue by urgency, and roster size. Read-only.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();

    const [confirmed] = await db
      .select({ n: count() })
      .from(appointments)
      .where(eq(appointments.status, "confirmed"));
    const [cancelled] = await db
      .select({ n: count() })
      .from(appointments)
      .where(eq(appointments.status, "cancelled"));

    const recent = await db
      .select({
        id: appointments.id,
        doctor: appointments.doctor,
        day: appointments.day,
        time: appointments.time,
        patientName: appointments.patientName,
      })
      .from(appointments)
      .where(eq(appointments.status, "confirmed"))
      .orderBy(desc(appointments.id))
      .limit(10);

    const queue = await db
      .select({
        id: triageAssessments.id,
        patientName: triageAssessments.patientName,
        urgency: triageAssessments.urgency,
        symptoms: triageAssessments.symptoms,
      })
      .from(triageAssessments)
      .orderBy(desc(triageAssessments.id))
      .limit(10);

    const [roster] = await db.select({ n: count() }).from(doctors);

    const queueByUrgency = queue.reduce<Record<string, number>>((acc, r) => {
      acc[r.urgency] = (acc[r.urgency] ?? 0) + 1;
      return acc;
    }, {});

    return {
      appointments_confirmed: confirmed.n,
      appointments_cancelled: cancelled.n,
      roster_size: roster.n,
      triage_queue_by_urgency: queueByUrgency,
      upcoming: recent.map((r) => ({
        appointment_id: r.id,
        doctor: r.doctor,
        day: r.day,
        time: r.time,
        patient_name: r.patientName,
      })),
      triage_queue: queue.map((r) => ({
        assessment_id: r.id,
        patient_name: r.patientName,
        urgency: r.urgency,
        symptoms: r.symptoms,
      })),
    };
  },
});
