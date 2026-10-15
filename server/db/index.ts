/** Framework-owned DB handle for the clinic domain. Actions call getDb(). */
import { createGetDb } from "@agent-native/core/db";
import { schema } from "./schema.js";

export const getDb = createGetDb(schema);
export type ClinicDb = ReturnType<typeof getDb>;
