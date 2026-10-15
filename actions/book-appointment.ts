import { z } from "zod";
import { defineAction, fail } from "@agent-native/core/action";
import { eq, and } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { appointments, doctors } from "../server/db/schema.js";

const dayEnum = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

export const bookAppointmentSchema = z.object({
  doctor: z.string().describe("Doctor's full name exactly as listed by find-doctor, e.g. 'Dr. Ayesha Khan'"),
  day: dayEnum.describe("Day of the appointment: Mon..Sun; must be a day the doctor works"),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h")
    .describe("Start time in 24h HH:MM format, e.g. '10:30'"),
  patient_name: z.string().min(1).describe("Patient's full name"),
  phone: z.string().min(7).describe("Patient's phone number for confirmations"),
});

export default defineAction({
  description:
    "Book a clinic appointment with a named doctor on a given day and time. Verifies the doctor exists, works that day, and the slot is free. Returns the confirmed appointment.",
  schema: bookAppointmentSchema,
  run: async ({ doctor, day, time, patient_name, phone }) => {
    const db = getDb();

    const doc = (await db.select().from(doctors).where(eq(doctors.name, doctor)))[0];
    if (!doc) fail(`Unknown doctor "${doctor}". Call find-doctor first.`, { errorCode: "unknown_doctor", statusCode: 404 });
    if (!(doc.days ?? []).includes(day)) {
      fail(`${doctor} does not work on ${day}. Available: ${(doc.days ?? []).join(", ")}.`, {
        errorCode: "doctor_unavailable_day",
        statusCode: 409,
      });
    }

    const clash = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctor, doctor),
          eq(appointments.day, day),
          eq(appointments.time, time),
          eq(appointments.status, "confirmed"),
        ),
      );
    if (clash.length > 0) {
      fail(`Slot ${day} ${time} with ${doctor} is already booked. Pick another time.`, {
        errorCode: "slot_taken",
        statusCode: 409,
      });
    }

    const inserted = await db
      .insert(appointments)
      .values({ doctor, day, time, patientName: patient_name, phone, status: "confirmed" })
      .returning();

    const appt = inserted[0];
    return {
      appointment_id: appt.id,
      doctor: appt.doctor,
      day: appt.day,
      time: appt.time,
      patient_name: appt.patientName,
      status: appt.status,
      arrival_note: "Please arrive 15 minutes early with a photo ID.",
      _receipt: {
        changed: true,
        verified: true,
        summary: `Booked appointment ${appt.id} for ${patient_name} with ${doctor} on ${day} ${time}`,
        subject: `appointment:${appt.id}`,
        checks: [{ id: "slot-free", ok: true, detail: "no conflicting confirmed booking" }],
      },
    };
  },
});
