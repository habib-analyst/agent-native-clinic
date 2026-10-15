/** Applies the clinic domain migrations at server startup. */
import { runMigrations } from "@agent-native/core/db";
import { clinicMigrations } from "../db/migrations.js";

export default runMigrations(clinicMigrations, { table: "clinic_migrations" });
