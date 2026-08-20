import { useState } from "react";
import { getAuthHeaders } from "../../api";
import { C, FONT, pillButton } from "../../theme";
import ActivityLog from "./ActivityLog";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

async function post(path, body) {
  // Was two "headers" keys in one object literal — the second silently overwrote the
  // first, which was the one carrying the auth token. Every call here was a guaranteed
  // 401 as a result (Retry / Force Sync in the Problems panel never actually worked).
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
}

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

// data/jobs come from separate fetches (see TogglePage): `data` is the (possibly
// brand-scoped) sidebar-data response driving Health/Recent/Problems, `jobs` is always
// every brand's active bulk jobs regardless of which workspace is open — this is the
// replacement for what used to be a floating popup. Staff now check status here on
// their own, on login, instead of it interrupting them automatically.
export default function ToggleSidebar({ data, jobs, hasBrandContext, fetchData, currentUserEmail, isAdmin }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Jobs");

  // Health/Recent/Problems only mean something once a specific brand's workspace is
  // open — Jobs (any bulk job, any brand) is always available, including from Home.
  const TAB = hasBrandContext ? ["Jobs", "Health", "Recent", "Problems"] : ["Jobs"];
  // If the tab list just shrank (e.g. left a brand workspace while on "Problems"),
  // fall back to Jobs rather than rendering a blank pane for a tab that no longer exists.
  const effectiveTab = TAB.includes(activeTab) ? activeTab : "Jobs";

  const { apiHealth, recentActions = [], problemStores = [], dailyStats = {} } = data || {};
  const activeJobs = (jobs || []).filter((j) => !["COMPLETED", "CANCELLED", "FAILED"].includes(j.status));

  const resolveProblems = (id, endpoint) =>
    post(`/api/toggle/problem/${endpoint}`, { id }).then(fetchData);

  const handlePauseJob = (jobId) => post("/api/toggle/bulk/pause", { jobId }).then(fetchData);
  const handleResumeJob = (jobId) => post("/api/toggle/bulk/resume", { jobId }).then(fetchData);
  const handleCancelJob = (jobId) => { if (confirm("Cancel this bulk job?")) post("/api/toggle/bulk/cancel", { jobId }).then(fetchData); };

  return (
    <>
      {/* Floating open button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: "10px 0 0 10px",
            padding: "14px 10px",
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 800,
            writingMode: "vertical-rl",
            letterSpacing: 1,
            zIndex: 400,
            boxShadow: "-4px 0 16px rgba(19,38,100,0.15)",
          }}
        >
          {activeJobs.length > 0 ? `STATUS ▲ (${activeJobs.length} RUNNING)` : "STATUS ▲"}
        </button>
      )}

      {/* Sidebar panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : -340,
          width: 320,
          height: "100vh",
          backgroundColor: "#ffffff",
          borderLeft: `2px solid ${C.border}`,
          boxShadow: isOpen ? "-8px 0 32px rgba(19,38,100,0.12)" : "none",
          transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 450,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>System Status</div>
          <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
          {TAB.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 8,
                border: `1.5px solid ${C.primary}`,
                backgroundColor: effectiveTab === t ? C.primary : "transparent",
                color: effectiveTab === t ? "#fff" : C.primary,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              {t === "Jobs" && activeJobs.length > 0 ? `${t} (${activeJobs.length})` : t}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
          {/* Jobs tab — every currently running/paused bulk job, any brand, manual or
              automated. This is the replacement for the old floating popup. */}
          {effectiveTab === "Jobs" && (
            activeJobs.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, padding: "12px 0" }}>No bulk jobs running right now.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    currentUserEmail={currentUserEmail}
                    isAdmin={isAdmin}
                    onPause={() => handlePauseJob(job.id)}
                    onResume={() => handleResumeJob(job.id)}
                    onCancel={() => handleCancelJob(job.id)}
                  />
                ))}
              </div>
            )
          )}

          {/* Health tab */}
          {effectiveTab === "Health" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "API Status", value: apiHealth?.status ?? "—" },
                { label: "Requests / min", value: apiHealth ? `${apiHealth.requestsThisMinute} / ${apiHealth.maxLimit}` : "—" },
                { label: "Today Successes", value: dailyStats.successCount ?? "—" },
                { label: "Problem Stores", value: dailyStats.problemCount ?? "—" },
                { label: "Last Sync", value: apiHealth?.lastSyncTime ? new Date(apiHealth.lastSyncTime).toLocaleTimeString("en-IN") : "—" },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, backgroundColor: "rgba(19,38,100,0.03)", border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent tab */}
          {effectiveTab === "Recent" && <ActivityLog actions={recentActions} />}

          {/* Problems tab */}
          {effectiveTab === "Problems" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {problemStores.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted, padding: "12px 0" }}>No problem stores — all clear.</div>
              ) : problemStores.map((s) => (
                <div key={s.id} style={{ border: "1px solid rgba(220,53,69,0.2)", borderRadius: 10, padding: "10px 12px", backgroundColor: "#fff5f5" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{s.store_name || s.name}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {s.brand} · {s.store_id || s.location_id} · {s.fail_count || 1} fail(s)
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => resolveProblems(s.id, "retry")}
                      style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1.5px solid ${C.primary}`, backgroundColor: "transparent", color: C.primary, fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => resolveProblems(s.id, "force-sync")}
                      style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "none", backgroundColor: C.primary, color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}
                    >
                      Force Sync
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 440, backgroundColor: "rgba(19,38,100,0.08)" }}
        />
      )}
    </>
  );
}

function JobCard({ job, currentUserEmail, isAdmin, onPause, onResume, onCancel }) {
  const { id, action, total_stores, pending_count, status, actor_email, created_at, brands } = job;
  const done = total_stores - pending_count;
  const pct = total_stores > 0 ? Math.round((done / total_stores) * 100) : 0;
  const canControl = isAdmin || actor_email === currentUserEmail;

  // Rough ETA from observed throughput so far — an estimate, not a promise.
  const elapsedMin = (Date.now() - new Date(created_at).getTime()) / 60000;
  const rate = elapsedMin > 0.1 ? done / elapsedMin : 0;
  const etaMin = rate > 0 && pending_count > 0 ? Math.ceil(pending_count / rate) : null;

  return (
    <div style={{ border: `1.5px solid ${C.primary}`, borderRadius: 10, padding: "10px 12px", backgroundColor: "rgba(19,38,100,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.primary }}>
            Bulk {action?.toUpperCase()} — #{id} {brands?.length ? `· ${brands.join(", ")}` : ""}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {done} / {total_stores} stores · {status}
          </div>
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>
            Started by {actor_email || "Unknown"} · {timeAgo(created_at)}
            {etaMin != null && ` · ~${etaMin} min left`}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, flexShrink: 0 }}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 5, borderRadius: 6, backgroundColor: `${C.primary}1a`, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: C.primary, borderRadius: 6, transition: "width 0.4s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {!canControl && (
          <span style={{ fontSize: 9.5, color: C.muted, fontStyle: "italic" }}>Only {actor_email || "the owner"} or an Admin can control this job</span>
        )}
        {canControl && status === "RUNNING" && (
          <button style={{ ...pillButton(false), fontSize: 10, padding: "5px 12px" }} onClick={onPause}>Pause</button>
        )}
        {canControl && status === "PAUSED" && (
          <button style={{ ...pillButton(true), fontSize: 10, padding: "5px 12px" }} onClick={onResume}>Resume</button>
        )}
        {canControl && (
          <button style={{ ...pillButton(false), fontSize: 10, padding: "5px 12px", borderColor: "#dc3545", color: "#dc3545" }} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
