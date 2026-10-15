import { z } from "zod";
import { defineAction } from "@agent-native/core/action";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { appointments } from "../server/db/schema.js";

export default defineAction({
  description:
    "List clinic appointments, optionally filtered by day and/or status. Read-only; used by the dashboard and the agent to see the schedule.",
  schema: z.object({
    day: z
      .enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
      .optional()
      .describe("Optional day filter: Mon..Sun"),
    status: z
      .enum(["confirmed", "cancelled"])
      .default("confirmed")
      .describe('Status filter: "confirmed" or "cancelled"; defaults to "confirmed"'),
  }),
  http: { method: "GET" },
  run: async ({ day, status }) => {
    const db = getDb();
    const conditions = [eq(appointments.status, status)];
    if (day) conditions.push(eq(appointments.day, day));
    const rows = await db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(appointments.day, appointments.time);
    return {
      appointments: rows.map((r) => ({
        appointment_id: r.id,
        doctor: r.doctor,
        day: r.day,
        time: r.time,
        patient_name: r.patientName,
        phone: r.phone,
        status: r.status,
      })),
      count: rows.length,
    };
  },
});
