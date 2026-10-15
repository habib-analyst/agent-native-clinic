/**
 * clinic.test.ts — real assertions against the shared action layer.
 *
 * Runs on an isolated in-memory PGlite database (the framework's own local
 * DB engine); the same migrations the server plugin applies are applied here,
 * so tests exercise the real action code paths: validation, SQL writes, slot
 * conflicts, and the deterministic triage rules.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { clinicMigrations } from "../server/db/migrations.js";
import { appointments, triageAssessments, doctors } from "../server/db/schema.js";
import { assessTriage } from "../server/lib/triage-rules.js";

import findDoctor, { findDoctorSchema } from "../actions/find-doctor.js";
import bookAppointment, { bookAppointmentSchema } from "../actions/book-appointment.js";
import rescheduleAppointment from "../actions/reschedule-appointment.js";
import cancelAppointment from "../actions/cancel-appointment.js";
import listAppointments from "../actions/list-appointments.js";
import triageAssess, { triageAssessSchema } from "../actions/triage-assess.js";
import clinicDashboard from "../actions/clinic-dashboard.js";

async function applyMigrations() {
  const db = getDb();
  for (const m of clinicMigrations) {
    const statements = String(m.sql)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of statements) {
      await db.execute(sql.raw(s));
    }
  }
}

async function resetData() {
  const db = getDb();
  await db.execute(sql`DELETE FROM appointments`);
  await db.execute(sql`DELETE FROM triage_assessments`);
}

beforeAll(async () => {
  await applyMigrations();
}, 120000); // first PGlite WASM init takes ~11s

describe("migrations + roster seed", () => {
  it("seeds the 6-doctor roster", async () => {
    const db = getDb();
    const rows = await db.select().from(doctors);
    expect(rows).toHaveLength(6);
    const names = rows.map((r) => r.name);
    expect(names).toContain("Dr. Ayesha Khan");
  });

  it("migration is idempotent (re-apply does not duplicate the roster)", async () => {
    await applyMigrations();
    const db = getDb();
    const rows = await db.select().from(doctors);
    expect(rows).toHaveLength(6);
  });
});

describe("find-doctor", () => {
  it("finds cardiologists", async () => {
    const res = await findDoctor.run({ specialty: "Cardiology" });
    expect(res.doctors).toHaveLength(2);
    expect(res.doctors.map((d: any) => d.name).sort()).toEqual(["Dr. Ayesha Khan", "Dr. Bilal Ahmed"]);
  });

  it("filters by day", async () => {
    const res = await findDoctor.run({ specialty: "Cardiology", day: "Mon" });
    expect(res.doctors).toHaveLength(1);
    expect(res.doctors[0].name).toBe("Dr. Ayesha Khan");
  });

  it("returns empty for unknown specialty", async () => {
    const res = await findDoctor.run({ specialty: "Neurosurgery" });
    expect(res.doctors).toHaveLength(0);
  });

  it("rejects an invalid day via the zod schema", () => {
    expect(() => findDoctorSchema.parse({ specialty: "Cardiology", day: "Funday" })).toThrow();
  });
});

describe("book-appointment flow", () => {
  it("books a valid appointment and returns a write receipt", async () => {
    await resetData();
    const res: any = await bookAppointment.run({
      doctor: "Dr. Ayesha Khan",
      day: "Mon",
      time: "10:00",
      patient_name: "Test Patient",
      phone: "+92-300-1234567",
    });
    expect(res.status).toBe("confirmed");
    expect(res.appointment_id).toBeGreaterThan(0);
    expect(res._receipt.changed).toBe(true);
    expect(res._receipt.verified).toBe(true);
  });

  it("rejects double-booking the same slot", async () => {
    await resetData();
    const args = { doctor: "Dr. Ayesha Khan", day: "Mon", time: "10:00", patient_name: "P1", phone: "03001234567" };
    await bookAppointment.run(args);
    await expect(bookAppointment.run({ ...args, patient_name: "P2" })).rejects.toThrow(/already booked/);
  });

  it("rejects a day the doctor does not work", async () => {
    await resetData();
    await expect(
      bookAppointment.run({ doctor: "Dr. Ayesha Khan", day: "Tue", time: "10:00", patient_name: "P", phone: "03001234567" }),
    ).rejects.toThrow(/does not work/);
  });

  it("rejects an unknown doctor", async () => {
    await resetData();
    await expect(
      bookAppointment.run({ doctor: "Dr. Nobody", day: "Mon", time: "10:00", patient_name: "P", phone: "03001234567" }),
    ).rejects.toThrow(/Unknown doctor/);
  });

  it("rejects a malformed time via the zod schema", () => {
    expect(() =>
      bookAppointmentSchema.parse({ doctor: "Dr. Ayesha Khan", day: "Mon", time: "10am", patient_name: "P", phone: "03001234567" }),
    ).toThrow();
  });
});

describe("reschedule + cancel", () => {
  it("reschedules to a free slot and frees the old one", async () => {
    await resetData();
    const booked: any = await bookAppointment.run({
      doctor: "Dr. Sana Malik",
      day: "Mon",
      time: "09:00",
      patient_name: "Mover",
      phone: "03001112222",
    });
    const moved: any = await rescheduleAppointment.run({
      appointment_id: booked.appointment_id,
      new_day: "Tue",
      new_time: "11:00",
    });
    expect(moved.new_day).toBe("Tue");
    expect(moved.new_time).toBe("11:00");
    // old slot is free again
    const rebook: any = await bookAppointment.run({
      doctor: "Dr. Sana Malik",
      day: "Mon",
      time: "09:00",
      patient_name: "New Patient",
      phone: "03003334444",
    });
    expect(rebook.status).toBe("confirmed");
  });

  it("rejects rescheduling into a taken slot", async () => {
    await resetData();
    const a: any = await bookAppointment.run({ doctor: "Dr. Sana Malik", day: "Mon", time: "09:00", patient_name: "A", phone: "03001112222" });
    const b: any = await bookAppointment.run({ doctor: "Dr. Sana Malik", day: "Tue", time: "11:00", patient_name: "B", phone: "03003334444" });
    await expect(
      rescheduleAppointment.run({ appointment_id: b.appointment_id, new_day: "Mon", new_time: "09:00" }),
    ).rejects.toThrow(/already booked/);
    expect(a.appointment_id).toBeGreaterThan(0);
  });

  it("cancelling frees the slot for rebooking", async () => {
    await resetData();
    const booked: any = await bookAppointment.run({
      doctor: "Dr. Usman Tariq",
      day: "Wed",
      time: "14:00",
      patient_name: "Canceller",
      phone: "03005556666",
    });
    const cancelled: any = await cancelAppointment.run({ appointment_id: booked.appointment_id });
    expect(cancelled.cancelled).toBe(true);
    const rebook: any = await bookAppointment.run({
      doctor: "Dr. Usman Tariq",
      day: "Wed",
      time: "14:00",
      patient_name: "Replacement",
      phone: "03007778888",
    });
    expect(rebook.status).toBe("confirmed");
  });

  it("double-cancel fails", async () => {
    await resetData();
    const booked: any = await bookAppointment.run({
      doctor: "Dr. Usman Tariq",
      day: "Wed",
      time: "15:00",
      patient_name: "Twice",
      phone: "03009990000",
    });
    await cancelAppointment.run({ appointment_id: booked.appointment_id });
    await expect(cancelAppointment.run({ appointment_id: booked.appointment_id })).rejects.toThrow(/already cancelled/);
  });

  it("list-appointments reflects bookings", async () => {
    await resetData();
    await bookAppointment.run({ doctor: "Dr. Hira Shahid", day: "Sat", time: "12:00", patient_name: "L1", phone: "03001112222" });
    const res: any = await listAppointments.run({ day: "Sat", status: "confirmed" });
    expect(res.count).toBe(1);
    expect(res.appointments[0].patient_name).toBe("L1");
  });
});

describe("triage rules (pure)", () => {
  it("chest pain -> emergency", () => {
    const r = assessTriage(["chest pain", "shortness of breath"]);
    expect(r.urgency).toBe("emergency");
    expect(r.nextStep).toMatch(/emergency services/i);
  });

  it("high fever -> urgent", () => {
    expect(assessTriage(["high fever", "vomiting"]).urgency).toBe("urgent");
  });

  it("mild cold -> self_care", () => {
    expect(assessTriage(["mild cold", "runny nose"]).urgency).toBe("self_care");
  });

  it("unrecognized symptom defaults to routine, never downgraded silently", () => {
    const r = assessTriage(["glorphen splenitis"]);
    expect(r.urgency).toBe("routine");
    expect(r.reasons.join(" ")).toMatch(/unrecognized/i);
  });

  it("worst band wins across symptoms", () => {
    expect(assessTriage(["mild cold", "chest pain"]).urgency).toBe("emergency");
  });

  it("empty symptoms -> routine", () => {
    expect(assessTriage([]).urgency).toBe("routine");
  });
});

describe("triage-assess action", () => {
  it("assesses and persists the record", async () => {
    await resetData();
    const res: any = await triageAssess.run({ patient_name: "Triage Test", symptoms: ["severe headache sudden"] });
    expect(res.urgency).toBe("urgent");
    expect(res.assessment_id).toBeGreaterThan(0);
    expect(res.disclaimer).toMatch(/not a diagnosis/i);
    const db = getDb();
    const rows = await db.select().from(triageAssessments);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects empty symptom lists via the zod schema", () => {
    expect(() => triageAssessSchema.parse({ patient_name: "P", symptoms: [] })).toThrow();
  });
});

describe("clinic-dashboard", () => {
  it("reports counts consistent with the tables", async () => {
    await resetData();
    await bookAppointment.run({ doctor: "Dr. Kamran Ali", day: "Mon", time: "08:00", patient_name: "D1", phone: "03001112222" });
    await triageAssess.run({ patient_name: "D2", symptoms: ["mild cold"] });
    const d: any = await clinicDashboard.run({});
    expect(d.appointments_confirmed).toBe(1);
    expect(d.roster_size).toBe(6);
    expect(d.triage_queue_by_urgency.self_care).toBe(1);
    expect(d.upcoming).toHaveLength(1);
  });
});
