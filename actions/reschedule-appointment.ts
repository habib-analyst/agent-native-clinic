import { z } from "zod";
import { defineAction, fail } from "@agent-native/core/action";
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { appointments, doctors } from "../server/db/schema.js";

const dayEnum = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

export const rescheduleAppointmentSchema = z.object({
  appointment_id: z.coerce.number().int().positive().describe("Appointment ID returned by book-appointment"),
  new_day: dayEnum.describe("New day: Mon..Sun; must be a day the doctor works"),
  new_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h")
    .describe("New start time in 24h HH:MM format"),
});

export default defineAction({
  description:
    "Move an existing confirmed appointment to a new day and time with the same doctor. Fails if the appointment does not exist or the new slot is taken.",
  schema: rescheduleAppointmentSchema,
  run: async ({ appointment_id, new_day, new_time }) => {
    const db = getDb();

    const current = (await db.select().from(appointments).where(eq(appointments.id, appointment_id)))[0];
    if (!current) fail(`No appointment with ID ${appointment_id}.`, { errorCode: "not_found", statusCode: 404 });
    if (current.status === "cancelled") {
      fail(`Appointment ${appointment_id} is cancelled and cannot be rescheduled.`, {
        errorCode: "already_cancelled",
        statusCode: 409,
      });
    }

    const doc = (await db.select().from(doctors).where(eq(doctors.name, current.doctor)))[0];
    if (doc && !(doc.days ?? []).includes(new_day)) {
      fail(`${current.doctor} does not work on ${new_day}.`, { errorCode: "doctor_unavailable_day", statusCode: 409 });
    }

    const clash = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctor, current.doctor),
          eq(appointments.day, new_day),
          eq(appointments.time, new_time),
          eq(appointments.status, "confirmed"),
          ne(appointments.id, appointment_id),
        ),
      );
    if (clash.length > 0) {
      fail(`Slot ${new_day} ${new_time} with ${current.doctor} is already booked.`, {
        errorCode: "slot_taken",
        statusCode: 409,
      });
    }

    await db
      .update(appointments)
      .set({ day: new_day, time: new_time })
      .where(eq(appointments.id, appointment_id));

    return {
      appointment_id,
      doctor: current.doctor,
      new_day,
      new_time,
      patient_name: current.patientName,
      _receipt: {
        changed: true,
        verified: true,
        summary: `Rescheduled appointment ${appointment_id} to ${new_day} ${new_time}`,
        subject: `appointment:${appointment_id}`,
        checks: [{ id: "slot-free", ok: true, detail: "new slot had no conflicting confirmed booking" }],
      },
    };
  },
});
