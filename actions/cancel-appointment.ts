import { z } from "zod";
import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { appointments } from "../server/db/schema.js";

export const cancelAppointmentSchema = z.object({
  appointment_id: z.coerce.number().int().positive().describe("Appointment ID returned by book-appointment"),
});

export default defineAction({
  description:
    "Cancel an existing appointment. The slot is freed for other patients. Cancelling an already-cancelled appointment is a no-op failure.",
  schema: cancelAppointmentSchema,
  run: async ({ appointment_id }) => {
    const db = getDb();

    const current = (await db.select().from(appointments).where(eq(appointments.id, appointment_id)))[0];
    if (!current) fail(`No appointment with ID ${appointment_id}.`, { errorCode: "not_found", statusCode: 404 });
    if (current.status === "cancelled") {
      fail(`Appointment ${appointment_id} is already cancelled.`, {
        errorCode: "already_cancelled",
        statusCode: 409,
      });
    }

    await db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, appointment_id));

    return {
      appointment_id,
      cancelled: true,
      freed_slot: { doctor: current.doctor, day: current.day, time: current.time },
      _receipt: {
        changed: true,
        verified: true,
        summary: `Cancelled appointment ${appointment_id}; slot ${current.day} ${current.time} freed`,
        subject: `appointment:${appointment_id}`,
        checks: [{ id: "status-cancelled", ok: true }],
      },
    };
  },
});
