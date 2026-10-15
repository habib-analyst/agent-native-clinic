/**
 * Clinic migrations — additive, named, applied exactly once.
 * Exported separately from the Nitro plugin so vitest can apply the same
 * DDL to an isolated in-memory PGlite database.
 */
import type { MigrationEntry } from "@agent-native/core/db";

const ROSTER: Array<[string, string, string[]]> = [
  ["Dr. Ayesha Khan", "Cardiology", ["Mon", "Wed", "Fri"]],
  ["Dr. Bilal Ahmed", "Cardiology", ["Tue", "Thu"]],
  ["Dr. Sana Malik", "Dermatology", ["Mon", "Tue", "Thu"]],
  ["Dr. Usman Tariq", "Orthopedics", ["Wed", "Fri", "Sat"]],
  ["Dr. Hira Shahid", "Pediatrics", ["Mon", "Wed", "Sat"]],
  ["Dr. Kamran Ali", "General Medicine", ["Mon", "Tue", "Wed", "Thu", "Fri"]],
];

function seedSql(): string {
  return ROSTER.map(
    ([name, specialty, days]) =>
      `INSERT INTO doctors (name, specialty, days) VALUES ('${name}', '${specialty}', ARRAY[${days
        .map((d) => `'${d}'`)
        .join(",")}]) ON CONFLICT (name) DO NOTHING;`,
  ).join("\n");
}

export const clinicMigrations: MigrationEntry[] = [
  {
    version: 1,
    name: "clinic-tables-v1",
    sql: `
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        specialty TEXT NOT NULL,
        days TEXT[] NOT NULL
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        doctor TEXT NOT NULL,
        day TEXT NOT NULL,
        time TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_unique
        ON appointments (doctor, day, time)
        WHERE status = 'confirmed';
      CREATE TABLE IF NOT EXISTS triage_assessments (
        id SERIAL PRIMARY KEY,
        patient_name TEXT NOT NULL,
        symptoms TEXT[] NOT NULL,
        urgency TEXT NOT NULL,
        reasons TEXT[] NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ${seedSql()}
    `,
  },
];
