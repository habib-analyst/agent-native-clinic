/**
 * Clinic domain schema — the shared SQL state for agent-native-clinic.
 *
 * Per the Agent-Native data skill: domain tables live here (Drizzle pg-core),
 * the agent and the UI both go through actions to read/write them.
 */
import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const doctors = pgTable("doctors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  specialty: text("specialty").notNull(),
  days: text("days").array().notNull(), // e.g. {"Mon","Wed"}
});

export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    doctor: text("doctor").notNull(),
    day: text("day").notNull(), // "Mon".."Sun"
    time: text("time").notNull(), // "HH:MM" 24h
    patientName: text("patient_name").notNull(),
    phone: text("phone").notNull(),
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A slot is taken only while a confirmed booking occupies it;
    // cancelled bookings free the slot.
    uniqueIndex("appointments_slot_unique")
      .on(t.doctor, t.day, t.time)
      .where(sql`${t.status} = 'confirmed'`),
  ],
);

export const triageAssessments = pgTable("triage_assessments", {
  id: serial("id").primaryKey(),
  patientName: text("patient_name").notNull(),
  symptoms: text("symptoms").array().notNull(),
  urgency: text("urgency").notNull(), // emergency | urgent | routine | self_care
  reasons: text("reasons").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { doctors, appointments, triageAssessments };
