import { C, FONT, pillButton } from "../../theme";
import { getAuthHeaders } from "../../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

async function post(path, body) {
  // Never sent an auth token at all — Pause/Resume/Cancel here were a guaranteed 401
  // for everyone, including the job's own owner.
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) alert(`Action failed: ${data.error || `HTTP ${res.status}`}`);
  return data;
}

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function BulkProgressIsland({ activeBulkJob, fetchData, currentUserEmail, isAdmin }) {
  if (!activeBulkJob || ["COMPLETED", "CANCELLED", "FAILED"].includes(activeBulkJob.status)) return null;

  const { id, action, total_stores, pending_count, status, actor_email, created_at, brands } = activeBulkJob;
  const done = total_stores - pending_count;
  const pct = total_stores > 0 ? Math.round((done / total_stores) * 100) : 0;
  const canControl = isAdmin || actor_email === currentUserEmail;

  // Rough ETA from observed throughput so far — an estimate, not a promise.
  const elapsedMin = (Date.now() - new Date(created_at).getTime()) / 60000;
  const rate = elapsedMin > 0.1 ? done / elapsedMin : 0;
  const etaMin = rate > 0 && pending_count > 0 ? Math.ceil(pending_count / rate) : null;

  const handlePause = () => post("/api/toggle/bulk/pause", { jobId: id }).then(fetchData);
  const handleResume = () => post("/api/toggle/bulk/resume", { jobId: id }).then(fetchData);
  const handleCancel = () => { if (confirm("Cancel this bulk job?")) post("/api/toggle/bulk/cancel", { jobId: id }).then(fetchData); };

  return (
    <div style={{ ...C, position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 500, backgroundColor: "#ffffff", border: `2px solid ${C.primary}`, borderRadius: 16, padding: "16px 22px", boxShadow: "0 8px 32px rgba(19,38,100,0.18)", minWidth: 360, fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>
            Bulk {action?.toUpperCase()} — Job #{id} {brands?.length ? `· ${brands.join(", ")}` : ""}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            {done} / {total_stores} stores · {status}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
            Started by {actor_email || "Unknown"} · {timeAgo(created_at)}
            {etaMin != null && ` · ~${etaMin} min left`}
          </div>
        </div>
        <span style={{ fontSize: 14, fontWeight: 900, color: C.primary }}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 6, backgroundColor: `${C.primary}1a`, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: C.primary, borderRadius: 6, transition: "width 0.4s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!canControl && (
          <span style={{ fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>Only {actor_email || "the owner"} or an Admin can control this job</span>
        )}
        {canControl && status === "RUNNING" && (
          <button style={{ ...pillButton(false), fontSize: 11, padding: "6px 14px" }} onClick={handlePause}>Pause</button>
        )}
        {canControl && status === "PAUSED" && (
          <button style={{ ...pillButton(true), fontSize: 11, padding: "6px 14px" }} onClick={handleResume}>Resume</button>
        )}
        {canControl && (
          <button style={{ ...pillButton(false), fontSize: 11, padding: "6px 14px", borderColor: "#dc3545", color: "#dc3545" }} onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
