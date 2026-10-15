import { z } from "zod";
import { defineAction } from "@agent-native/core/action";
import { eq, ilike, and } from "drizzle-orm";
import { getDb } from "../server/db/index.js";
import { doctors } from "../server/db/schema.js";

export const findDoctorSchema = z.object({
  specialty: z.string().describe("Medical specialty to search, e.g. 'Cardiology', 'Dermatology', 'Orthopedics', 'Pediatrics', 'General Medicine'"),
  day: z
    .enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    .optional()
    .describe("Optional day filter; only doctors working that day are returned"),
});

export default defineAction({
  description:
    "Find clinic doctors by medical specialty, optionally filtered to those available on a given day. Use before booking an appointment.",
  schema: findDoctorSchema,
  http: { method: "GET" },
  run: async ({ specialty, day }) => {
    const db = getDb();
    const conditions = [ilike(doctors.specialty, `%${specialty}%`)];
    const rows = await db.select().from(doctors).where(and(...conditions));
    const filtered = day ? rows.filter((d) => (d.days ?? []).includes(day)) : rows;
    return {
      doctors: filtered.map((d) => ({
        name: d.name,
        specialty: d.specialty,
        days: d.days,
      })),
    };
  },
});
