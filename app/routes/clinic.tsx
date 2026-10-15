/**
 * /clinic — the visual surface of agent-native-clinic.
 *
 * Every button and list on this page calls the SAME actions the agent uses
 * as tools (find-doctor, book-appointment, triage-assess, clinic-dashboard,
 * ...). One action layer, shared state, multiple surfaces: this page, the
 * agent chat, the HTTP API, the CLI, MCP and A2A.
 */
import { useState } from "react";
import { useActionQuery, useActionMutation } from "@agent-native/core/client/hooks";

interface Dashboard {
  appointments_confirmed: number;
  appointments_cancelled: number;
  roster_size: number;
  triage_queue_by_urgency: Record<string, number>;
  upcoming: Array<{
    appointment_id: number;
    doctor: string;
    day: string;
    time: string;
    patient_name: string;
  }>;
  triage_queue: Array<{
    assessment_id: number;
    patient_name: string;
    urgency: string;
    symptoms: string[];
  }>;
}

interface DoctorHit {
  name: string;
  specialty: string;
  days: string[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const card: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};

const input: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  marginRight: 8,
  marginBottom: 8,
  fontSize: 14,
};

const btn: React.CSSProperties = {
  border: "1px solid #0f766e",
  background: "#0f766e",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};

export default function ClinicPage() {
  const dashboard = useActionQuery<Dashboard>("clinic-dashboard");

  const [specialty, setSpecialty] = useState("Cardiology");
  const [doctors, setDoctors] = useState<DoctorHit[] | null>(null);

  const [form, setForm] = useState({ doctor: "", day: "Mon", time: "10:00", patient_name: "", phone: "" });
  const [bookResult, setBookResult] = useState<string | null>(null);

  const [triageName, setTriageName] = useState("");
  const [triageSymptoms, setTriageSymptoms] = useState("");
  const [triageResult, setTriageResult] = useState<string | null>(null);

  const bookMutation = useActionMutation("book-appointment");
  const triageMutation = useActionMutation("triage-assess");

  async function searchDoctors() {
    const { callAction } = await import("@agent-native/core/client/hooks");
    const res = await callAction<{ doctors: DoctorHit[] }>("find-doctor", { specialty });
    setDoctors(res.doctors);
  }

  async function book() {
    setBookResult(null);
    try {
      const res: any = await bookMutation.mutateAsync(form as any);
      setBookResult(`Booked: appointment #${res.appointment_id} with ${res.doctor} on ${res.day} at ${res.time}. ${res.arrival_note}`);
      dashboard.refetch();
    } catch (e: any) {
      setBookResult(`Booking failed: ${e?.message ?? e}`);
    }
  }

  async function triage() {
    setTriageResult(null);
    try {
      const res: any = await triageMutation.mutateAsync({
        patient_name: triageName,
        symptoms: triageSymptoms.split(",").map((s) => s.trim()).filter(Boolean),
      } as any);
      setTriageResult(
        `Urgency: ${res.urgency}. ${res.next_step} Reasons: ${res.reasons.join("; ")}. ${res.disclaimer}`,
      );
      dashboard.refetch();
    } catch (e: any) {
      setTriageResult(`Triage failed: ${e?.message ?? e}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Clinic front desk</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Reference medical app on Agent-Native. This page, the agent chat, the CLI and the HTTP API all call the same
        actions against the same SQL state.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Dashboard</h2>
        {dashboard.isLoading && <p>Loading…</p>}
        {dashboard.error && <p style={{ color: "#b91c1c" }}>Error: {(dashboard.error as Error).message}</p>}
        {dashboard.data && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div><strong>{dashboard.data.appointments_confirmed}</strong> confirmed</div>
            <div><strong>{dashboard.data.appointments_cancelled}</strong> cancelled</div>
            <div><strong>{dashboard.data.roster_size}</strong> doctors</div>
            <div>
              Triage queue:{" "}
              {Object.entries(dashboard.data.triage_queue_by_urgency)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ") || "empty"}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Find a doctor</h2>
        <input style={input} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Specialty" />
        <button style={btn} onClick={searchDoctors}>Search</button>
        {doctors && (
          <ul>
            {doctors.map((d) => (
              <li key={d.name}>
                {d.name} — {d.specialty} ({d.days.join(", ")})
              </li>
            ))}
            {doctors.length === 0 && <li>No doctors found.</li>}
          </ul>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Book an appointment</h2>
        <input style={input} placeholder="Doctor (exact name)" value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} />
        <select style={input} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
          {DAYS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <input style={input} placeholder="HH:MM" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        <input style={input} placeholder="Patient name" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
        <input style={input} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button style={btn} onClick={book} disabled={bookMutation.isPending}>
          {bookMutation.isPending ? "Booking…" : "Book"}
        </button>
        {bookResult && <p>{bookResult}</p>}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Triage assessment</h2>
        <input style={input} placeholder="Patient name" value={triageName} onChange={(e) => setTriageName(e.target.value)} />
        <input style={{ ...input, width: 320 }} placeholder="Symptoms, comma separated" value={triageSymptoms} onChange={(e) => setTriageSymptoms(e.target.value)} />
        <button style={btn} onClick={triage} disabled={triageMutation.isPending}>
          {triageMutation.isPending ? "Assessing…" : "Assess"}
        </button>
        {triageResult && <p>{triageResult}</p>}
        <p style={{ color: "#64748b", fontSize: 13 }}>Decision support only, not a diagnosis.</p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Upcoming appointments</h2>
        {dashboard.data && (
          <ul>
            {dashboard.data.upcoming.map((a) => (
              <li key={a.appointment_id}>
                #{a.appointment_id} {a.day} {a.time} — {a.patient_name} with {a.doctor}
              </li>
            ))}
            {dashboard.data.upcoming.length === 0 && <li>None.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
