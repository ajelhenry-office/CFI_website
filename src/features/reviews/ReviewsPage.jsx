import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Flame, Pencil, Check, Sparkles, AlertTriangle, Send,
  Store, Tag, CalendarRange, Inbox, CheckCircle2, UtensilsCrossed,
  Layers, ClipboardList, Star, MessageSquareText, ThumbsUp, ThumbsDown, ChefHat,
} from "lucide-react";
import { getAuthHeaders, API_BASE } from "../../api";
import ReviewsHealthSidebar from "./ReviewsHealthSidebar";
import MultiSearchableSelect from "../toggle/MultiSearchableSelect";

// ============================================================
// TOKENS — light navy, matching the existing product UI
// ============================================================
const C = {
  bg: "#F5F6FB",
  surface: "#FFFFFF",
  surface2: "#F1F3FA",
  border: "#E1E5F2",
  borderSoft: "#EBEEF7",
  navy: "#1C2B54",
  navyDeep: "#121E3E",
  navySoft: "#EDF0FA",
  text: "#1C2B54",
  textMuted: "#6B7488",
  textFaint: "#9AA1B8",
  gold: "#E19A2E",
  goldDim: "#FCEFD8",
  chili: "#D8503A",
  chiliDim: "#FBE7E2",
  leaf: "#2E9E6D",
  leafDim: "#E3F5EC",
  grey: "#8A8FA3",
  greyDim: "#EEF0F5",
};

// ============================================================
// API HELPERS
// ============================================================
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
  return res.json();
}
async function apiSend(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method, headers: getAuthHeaders(), body: JSON.stringify(body) });
  return res.json();
}

// review.id is a full Google resource path containing "/" — must be encoded or Express's
// :id route param won't match it correctly (confirmed by testing; the pre-existing
// version of this page had this bug and none of its action buttons actually worked).
const idPath = (id) => encodeURIComponent(id);

// Explicit Asia/Kolkata rather than relying on the viewer's local system timezone —
// every store is in India, so the displayed time should always be IST regardless of
// what timezone the machine viewing this happens to be set to.
function splitDateTime(iso) {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
  };
}

// Maps our real danger_category values onto this design's escalation styling.
const CATEGORY_LABEL = {
  food_safety: "food safety",
  legal_fraud: "legal",
  harassment: "harassment",
  refund: "refund",
  toxic: "abusive language",
  reputational_threat: "reputational threat",
  unclear: "unclear",
};

// ============================================================
// SMALL PIECES
// ============================================================
function FlameStars({ stars }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Flame
          key={n}
          size={13}
          strokeWidth={2}
          style={{
            color: n <= stars ? C.gold : C.textFaint,
            fill: n <= stars ? C.gold : "transparent",
            opacity: n <= stars ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

function Perforation() {
  return (
    <div className="flex justify-between px-4" style={{ marginTop: -1 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <span
          key={i}
          style={{ width: 6, height: 6, borderRadius: 999, background: C.bg, display: "block" }}
        />
      ))}
    </div>
  );
}

function Badge({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: C.surface2, fg: C.textMuted, bd: C.border },
    navy: { bg: C.navySoft, fg: C.navy, bd: C.navy },
    chili: { bg: C.chiliDim, fg: C.chili, bd: C.chili },
    leaf: { bg: C.leafDim, fg: C.leaf, bd: C.leaf },
    amber: { bg: C.goldDim, fg: C.gold, bd: C.gold },
    grey: { bg: C.greyDim, fg: C.grey, bd: C.grey },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}33` }}
    >
      {children}
    </span>
  );
}

function stripeColor(review) {
  if (review.danger_category) return review.danger_category === "toxic" ? C.grey : C.chili;
  if (review.status === "queued") return C.gold;
  return C.leaf;
}

// ============================================================
// AUTO-REPLIED CARD (with real AI regenerate while editing)
// ============================================================
function AutoCard({ review, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.final_reply || "");
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { date, time } = splitDateTime(review.review_date);
  const repliedAt = review.replied_at ? splitDateTime(review.replied_at) : null;

  async function regenerate() {
    setRegenerating(true);
    try {
      const d = await apiSend("POST", `/api/reviews/${idPath(review.id)}/generate`, {});
      if (d.reply) setDraft(d.reply);
    } finally {
      setRegenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await apiSend("PUT", `/api/reviews/${idPath(review.id)}/reply`, { replyText: draft });
      onSave(review.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(28,43,84,0.04)" }}
    >
      <div style={{ height: 5, background: stripeColor(review) }} />
      <Perforation />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: C.textMuted }}>
              <Tag size={12} /> {review.brand}
              <span style={{ color: C.textFaint }}>·</span>
              <Store size={12} /> {review.store_name}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-semibold text-sm" style={{ color: C.text }}>{review.reviewer_name || "Anonymous"}</span>
              <FlameStars stars={review.star_rating} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-mono leading-tight" style={{ color: C.textFaint }}>{date}</div>
            <div className="text-[11px] font-mono leading-tight" style={{ color: C.textFaint }}>{time}</div>
            {repliedAt && (
              <div className="text-[10px] font-mono leading-tight mt-1" style={{ color: C.leaf }}>
                Replied {repliedAt.date} {repliedAt.time}
              </div>
            )}
            <div className="mt-1.5">
              <Badge tone="leaf"><CheckCircle2 size={11} /> {review.status === "auto_replied" ? "Auto-Replied" : "Manually Replied"}</Badge>
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed mb-4" style={{ color: C.text }}>
          {review.review_text || <span style={{ color: C.textFaint }} className="italic">No written review — rating only</span>}
        </p>

        <div className="rounded-xl p-3" style={{ background: C.surface2, border: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wide" style={{ color: C.textFaint }}>
              Your reply
            </span>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                style={{ color: C.navy }}
              >
                <Pencil size={12} /> Edit
              </button>
            ) : null}
          </div>

          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full text-sm rounded-lg p-2 outline-none resize-none"
                style={{ background: C.surface, color: C.text, border: `1px solid ${C.navy}55` }}
              />
              <div className="flex items-center justify-between gap-2 mt-2">
                <button
                  onClick={regenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 disabled:opacity-60"
                  style={{ color: C.gold, background: C.goldDim, border: `1px solid ${C.gold}44` }}
                >
                  <Sparkles size={12} className={regenerating ? "animate-spin" : ""} />
                  {regenerating ? "Regenerating…" : "Regenerate reply"}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDraft(review.final_reply || ""); setEditing(false); }}
                    className="text-xs font-semibold rounded-md px-3 py-1.5"
                    style={{ color: C.textMuted, border: `1px solid ${C.border}` }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !draft.trim()}
                    className="flex items-center gap-1 text-xs font-semibold rounded-md px-3 py-1.5 disabled:opacity-60"
                    style={{ background: C.navy, color: "#fff" }}
                  >
                    <Check size={12} /> {saving ? "Saving…" : "Save & update"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed" style={{ color: C.textMuted }}>{draft}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PENDING CARD
// ============================================================
function PendingCard({ review, onPost }) {
  const [draft, setDraft] = useState(review.ai_reply || "");
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const { date, time } = splitDateTime(review.review_date);

  const isDanger = !!review.danger_category;
  const isToxic = review.danger_category === "toxic";

  async function generateAiReply() {
    setGenerating(true);
    try {
      const d = await apiSend("POST", `/api/reviews/${idPath(review.id)}/generate`, {});
      if (d.reply) setDraft(d.reply);
    } finally {
      setGenerating(false);
    }
  }

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await apiSend("POST", `/api/reviews/queue/${idPath(review.id)}/approve`, { editedReply: draft });
      setPosted(true);
      onPost(review.id);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(28,43,84,0.04)" }}
    >
      <div style={{ height: 5, background: stripeColor(review) }} />
      <Perforation />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: C.textMuted }}>
              <Tag size={12} /> {review.brand}
              <span style={{ color: C.textFaint }}>·</span>
              <Store size={12} /> {review.store_name}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-semibold text-sm" style={{ color: C.text }}>{review.reviewer_name || "Anonymous"}</span>
              <FlameStars stars={review.star_rating} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-mono leading-tight" style={{ color: C.textFaint }}>{date}</div>
            <div className="text-[11px] font-mono leading-tight" style={{ color: C.textFaint }}>{time}</div>
            <div className="mt-1.5">
              {isToxic ? (
                <Badge tone="grey">Flagged — abusive</Badge>
              ) : isDanger ? (
                <Badge tone="chili"><AlertTriangle size={11} /> Needs escalation</Badge>
              ) : (
                <Badge tone="amber">Awaiting reply</Badge>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed mb-4" style={{ color: C.text }}>{review.review_text}</p>

        {isDanger && (
          <div className="rounded-xl p-3 mb-3 flex items-start gap-2" style={{ background: C.chiliDim, border: `1px solid ${C.chili}44` }}>
            <AlertTriangle size={15} style={{ color: C.chili, flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs leading-relaxed" style={{ color: C.text }}>
              This review was flagged as a <strong>{CATEGORY_LABEL[review.danger_category] || review.danger_category}</strong> concern.
              An AI draft is provided below, but read it carefully before sending — this needs a real judgment call, not a one-click approval.
            </p>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: C.surface2, border: `1px solid ${C.borderSoft}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wide" style={{ color: C.textFaint }}>
              Reply message
            </span>
            <button
              onClick={generateAiReply}
              disabled={generating}
              className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1 disabled:opacity-60"
              style={{ color: C.gold }}
            >
              <Sparkles size={12} className={generating ? "animate-spin" : ""} />
              {generating ? "Regenerating…" : "Regenerate reply"}
            </button>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder='Click "Regenerate reply" or type your own…'
            className="w-full text-sm rounded-lg p-2 outline-none resize-none"
            style={{ background: C.surface, color: C.text, border: `1px solid ${C.borderSoft}` }}
          />

          <div className="flex justify-end mt-2">
            {posted ? (
              <Badge tone="leaf"><CheckCircle2 size={11} /> Posted to Google</Badge>
            ) : (
              <button
                onClick={post}
                disabled={!draft.trim() || posting}
                className="flex items-center gap-1 text-xs font-semibold rounded-md px-3 py-1.5 disabled:opacity-40"
                style={{ background: C.navy, color: "#fff" }}
              >
                <Send size={12} /> {posting ? "Posting…" : "Post reply"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUDIT LOG TABLE — review + the reply that was actually sent, and who sent it
// ============================================================
// Only actions that represent a reply actually going out are shown here — QUEUED/ERROR
// entries exist in the raw log for debugging but aren't "a reply that was sent."
const SENT_ACTIONS = ["AUTO_REPLIED", "HUMAN_APPROVED_AND_POSTED", "REPLY_EDITED"];
const AUDIT_PAGE_SIZE = 50;

// Long review/reply text collapses to 2 lines with a "Show more" toggle, so the table
// stays scannable instead of every row stretching to fit a full paragraph.
function TruncatedCell({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span style={{ color: C.textFaint }}>—</span>;
  const isLong = text.length > 110;
  return (
    <div>
      <span
        style={{
          display: expanded ? "block" : "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 2,
          WebkitBoxOrient: "vertical",
          overflow: expanded ? "visible" : "hidden",
        }}
      >
        {text}
      </span>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-semibold mt-0.5"
          style={{ color: C.navy }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function AuditLogTable({ logs }) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(logs.length / AUDIT_PAGE_SIZE));
  // Clamped inline rather than reset via an effect — if the underlying log set shrinks
  // while on a later page, this just settles on the new last page instead of jumping.
  const safePage = Math.min(page, totalPages - 1);
  const pageLogs = logs.slice(safePage * AUDIT_PAGE_SIZE, (safePage + 1) * AUDIT_PAGE_SIZE);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(28,43,84,0.04)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
              {["Date", "Brand", "Store", "Review", "Reply", "Type", "Changed By"].map((h) => (
                <th key={h} className="text-left px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageLogs.map((log) => {
              const { date, time } = splitDateTime(log.created_at);
              const isAuto = !log.actor_email;
              const isDeleted = !!log.review_deleted_at;
              // Kept in the log (it's still an honest record of what was replied and
              // when) but visually muted and flagged, so a stale entry for a review
              // that's since vanished from Google is never mistaken for a live one.
              return (
                <tr key={log.id} style={{ borderBottom: `1px solid ${C.borderSoft}`, opacity: isDeleted ? 0.55 : 1 }}>
                  <td className="px-3.5 py-3 align-top text-xs font-mono whitespace-nowrap" style={{ color: C.textFaint }}>
                    {date}<br />{time}
                  </td>
                  <td className="px-3.5 py-3 align-top font-medium" style={{ color: C.text }}>{log.brand || "—"}</td>
                  <td className="px-3.5 py-3 align-top" style={{ color: C.text }}>{log.store_name || "—"}</td>
                  <td className="px-3.5 py-3 align-top" style={{ color: C.text, minWidth: 220, maxWidth: 280 }}>
                    <TruncatedCell text={log.review_text} />
                  </td>
                  <td className="px-3.5 py-3 align-top" style={{ color: C.textMuted, minWidth: 220, maxWidth: 280 }}>
                    <TruncatedCell text={log.final_reply} />
                  </td>
                  <td className="px-3.5 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {isAuto ? <Badge tone="leaf">Auto</Badge> : <Badge tone="navy">Manual</Badge>}
                      {isDeleted && <Badge tone="grey">Review Deleted</Badge>}
                    </div>
                  </td>
                  <td className="px-3.5 py-3 align-top" style={{ color: C.textMuted }}>{log.actor_email || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
          <span className="text-xs" style={{ color: C.textFaint }}>Page {safePage + 1} of {totalPages} · {logs.length} total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40"
              style={{ border: `1px solid ${C.border}`, color: C.navy }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40"
              style={{ border: `1px solid ${C.border}`, color: C.navy }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUMMARY — the default landing view: totals + positive/negative split, no card list
// ============================================================
function StatCard({ icon, label, value, sublabel, tone = "navy" }) {
  const tones = {
    navy: { bg: C.navySoft, fg: C.navy },
    gold: { bg: C.goldDim, fg: C.gold },
    leaf: { bg: C.leafDim, fg: C.leaf },
    chili: { bg: C.chiliDim, fg: C.chili },
  };
  const t = tones[tone];
  return (
    <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(28,43,84,0.04)" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="rounded-xl p-2" style={{ background: t.bg, color: t.fg }}>{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textFaint }}>{label}</span>
      </div>
      <div className="font-display text-3xl" style={{ color: C.navy, fontWeight: 800 }}>{value}</div>
      {sublabel && <div className="text-sm mt-1" style={{ color: C.textMuted }}>{sublabel}</div>}
    </div>
  );
}

function SummaryView({ stats, brandOptions, selectedBrands, onSelectBrand }) {
  if (stats === null) {
    return (
      <div className="rounded-2xl p-12 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
        <p className="font-medium" style={{ color: C.textMuted }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {brandOptions.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {brandOptions.map((b) => {
            const active = selectedBrands.length === 1 && selectedBrands[0] === b;
            return (
              <button
                key={b}
                onClick={() => onSelectBrand(active ? [] : [b])}
                className="flex items-center gap-2 rounded-2xl px-4 py-3 transition-colors"
                style={{
                  background: active ? C.navy : C.surface,
                  border: `1.5px solid ${active ? C.navy : C.border}`,
                  color: active ? "#fff" : C.text,
                }}
              >
                <ChefHat size={18} />
                <span className="font-semibold text-sm">{b}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<Star size={16} />} label="Total Ratings" value={stats.totalRatings} tone="gold" />
        <StatCard icon={<MessageSquareText size={16} />} label="Feedback Received" value={stats.totalFeedback} sublabel="reviews with written text" tone="navy" />
        <StatCard
          icon={<ThumbsUp size={16} />}
          label="Positive"
          value={`${stats.positive.percentage}%`}
          sublabel={`${stats.positive.count} review${stats.positive.count === 1 ? "" : "s"}`}
          tone="leaf"
        />
        <StatCard
          icon={<ThumbsDown size={16} />}
          label="Negative"
          value={`${stats.negative.percentage}%`}
          sublabel={`${stats.negative.count} review${stats.negative.count === 1 ? "" : "s"}`}
          tone="chili"
        />
      </div>
    </div>
  );
}

// Last 2 full days, excluding today — today's numbers are still coming in, so the
// default landing view shouldn't mix a partial day into the totals. Computed against
// the IST calendar date, not the browser's local date or UTC — every store is in
// India, so "today" means today in IST regardless of where this page happens to be
// viewed from (plain toISOString().slice(0,10) would show the wrong day during IST's
// early-morning hours, when UTC is still on the previous calendar date).
const isoDaysAgo = (offsetDays) => {
  // Round-trip through an IST-formatted string so the day subtraction below operates on
  // the IST calendar date, not whatever date the viewer's own machine happens to be on.
  const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  istNow.setDate(istNow.getDate() - offsetDays);
  return istNow.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // en-CA => YYYY-MM-DD
};
const DEFAULT_DATE_FROM = isoDaysAgo(2);
const DEFAULT_DATE_TO = isoDaysAgo(1);

// ============================================================
// MAIN DASHBOARD
// ============================================================
export default function ReviewsPage() {
  const [brands, setBrands] = useState([]);
  const [stores, setStores] = useState([]);
  const [dateFrom, setDateFrom] = useState(DEFAULT_DATE_FROM);
  const [dateTo, setDateTo] = useState(DEFAULT_DATE_TO);
  const [appliedFilters, setAppliedFilters] = useState({ brands: [], stores: [], dateFrom: DEFAULT_DATE_FROM, dateTo: DEFAULT_DATE_TO });
  const [tab, setTab] = useState("summary");

  const [brandStoreMap, setBrandStoreMap] = useState({});
  const [allReviews, setAllReviews] = useState(null); // null = loading
  const [allCount, setAllCount] = useState(0);
  const [autoReviews, setAutoReviews] = useState(null);
  const [autoCount, setAutoCount] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [auditLogs, setAuditLogs] = useState(null);
  const [summaryStats, setSummaryStats] = useState(null);

  useEffect(() => {
    apiGet("/api/reviews/filter-options").then((d) => {
      const map = {};
      (d.brands || []).forEach((b) => { map[b] = []; });
      // filter-options only returns flat brand/store lists today (single brand) — this
      // still works correctly, it just means every brand currently shows every store
      // until a second brand's locations exist to actually differentiate.
      (d.stores || []).forEach((s) => { Object.keys(map).forEach((b) => map[b].push(s)); });
      setBrandStoreMap(map);
    });
  }, []);

  const brandOptions = Object.keys(brandStoreMap);
  // Stores belonging to any currently-selected brand; every store if none selected.
  const storeOptions = brands.length
    ? [...new Set(brands.flatMap((b) => brandStoreMap[b] || []))]
    : [...new Set(Object.values(brandStoreMap).flat())];

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedFilters.brands.length) params.set("brand", appliedFilters.brands.join(","));
    if (appliedFilters.stores.length) params.set("store", appliedFilters.stores.join(","));
    if (appliedFilters.dateFrom) params.set("startDate", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("endDate", appliedFilters.dateTo);
    return params.toString();
  }, [appliedFilters]);

  const loadAll = useCallback(() => {
    apiGet(`/api/reviews?${query}`).then((d) => {
      setAllReviews(d.reviews || []);
      setAllCount(d.count ?? (d.reviews || []).length);
    });
  }, [query]);

  const loadAuto = useCallback(() => {
    apiGet(`/api/reviews/auto-replied?${query}`).then((d) => {
      setAutoReviews(d.reviews || []);
      setAutoCount(d.count ?? (d.reviews || []).length);
    });
  }, [query]);

  const loadPending = useCallback(() => {
    apiGet(`/api/reviews/pending?${query}`).then((d) => {
      setPendingReviews(d.reviews || []);
      setPendingCount(d.count ?? (d.reviews || []).length);
    });
  }, [query]);

  const loadSummary = useCallback(() => {
    apiGet(`/api/reviews/summary?${query}`).then((d) => setSummaryStats(d));
  }, [query]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadAuto(); }, [loadAuto]);
  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Periodic auto-refresh — the backend polls Google every few minutes on its own
  // (new reviews, edits, deletions), so the page needs to check back too instead of
  // only ever reflecting whatever was loaded on the last manual filter apply.
  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
      loadAuto();
      loadPending();
      loadSummary();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadAll, loadAuto, loadPending, loadSummary]);

  // Audit Log isn't filtered by the brand/store/date bar (it's a flat activity feed) —
  // fetched once, the first time that tab is actually opened.
  useEffect(() => {
    if (tab !== "audit" || auditLogs !== null) return;
    apiGet("/api/reviews/audit-log").then((d) => setAuditLogs(d.logs || []));
  }, [tab, auditLogs]);

  // Applying filters always lands on Summary — the default landing view, and the one
  // that most directly reflects "what do the numbers look like for what I just picked."
  const applyFilters = () => {
    setAppliedFilters({ brands, stores, dateFrom, dateTo });
    setTab("summary");
  };
  const clearFilters = () => {
    setBrands([]); setStores([]); setDateFrom(DEFAULT_DATE_FROM); setDateTo(DEFAULT_DATE_TO);
    setAppliedFilters({ brands: [], stores: [], dateFrom: DEFAULT_DATE_FROM, dateTo: DEFAULT_DATE_TO });
  };

  // Clicking a brand tile on the Summary view drills straight in — no separate Apply
  // click needed, since picking a brand from its own icon is meant to feel immediate.
  const selectSummaryBrand = (next) => {
    setBrands(next);
    setAppliedFilters((f) => ({ ...f, brands: next }));
  };

  function handleSaveAuto(id, newReply) {
    const patch = (rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, final_reply: newReply, status: "replied" } : r)) : rs);
    setAutoReviews(patch);
    setAllReviews(patch);
  }
  function handlePostPending(id) {
    setPendingReviews((rs) => {
      if (!rs) return rs;
      const next = rs.filter((r) => r.id !== id);
      setPendingCount(next.length);
      return next;
    });
    // The item moves from queued -> replied rather than disappearing, so it stays
    // visible in the "All" tab, now on the manually-replied side.
    setAllReviews((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, status: "replied" } : r)) : rs));
  }

  const activeList = tab === "all" ? allReviews : tab === "auto" ? autoReviews : tab === "pending" ? pendingReviews : null;
  const sentLogs = (auditLogs || []).filter((l) => SENT_ACTIONS.includes(l.action));

  return (
    <div
      className="min-h-full w-full"
      style={{
        background: `radial-gradient(circle at 50% 0%, rgba(28,43,84,0.06), transparent 55%), ${C.bg}`,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .rd-dine * { font-family: 'Inter', sans-serif; }
        .rd-dine .font-display { font-family: 'Sora', sans-serif; font-weight: 800; }
        .rd-dine select option { background: ${C.surface}; }
      `}</style>

      {/* No separate app header above this anymore (removed in App.jsx for this tab
          specifically) — pt-8 instead of py-10 so content starts close to the top
          instead of leaving a large empty gap where that header used to be. */}
      <div className="rd-dine max-w-7xl mx-auto px-6 pt-8 pb-10">

        {/* HEADER — centered, royal treatment */}
        <div className="text-center mb-10">
          <div
            className="text-[11px] font-bold uppercase mb-3"
            style={{ color: C.gold, letterSpacing: "0.35em" }}
          >
            Curefoods · Guest Feedback
          </div>
          <div className="inline-flex items-center gap-3">
            <Flame
              size={20}
              style={{ color: C.gold, filter: "drop-shadow(0 0 6px rgba(225,154,46,0.45))" }}
              fill={C.gold}
            />
            <h1
              className="font-display text-5xl"
              style={{ color: C.navy, fontWeight: 800 }}
            >
              Dine-in Reviews
            </h1>
            <Flame
              size={20}
              style={{ color: C.gold, transform: "scaleX(-1)", filter: "drop-shadow(0 0 6px rgba(225,154,46,0.45))" }}
              fill={C.gold}
            />
          </div>
          <div className="mx-auto mt-4 flex items-center justify-center gap-3" style={{ width: 260 }}>
            <span style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
            <span style={{ width: 5, height: 5, borderRadius: 999, background: C.gold, transform: "rotate(45deg)" }} />
            <span style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${C.gold})` }} />
          </div>
        </div>

        {/* FILTER BAR — Apply / Clear pinned to the corner */}
        <div
          className="relative rounded-[28px] mb-4"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            boxShadow: "0 1px 2px rgba(28,43,84,0.04)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2 p-3">
            <MultiSearchableSelect
              options={brandOptions}
              selectedValues={brands}
              onChange={(next) => { setBrands(next); setStores((cur) => cur.filter((s) => next.length === 0 || next.some((b) => (brandStoreMap[b] || []).includes(s)))); }}
              placeholder="Brand"
              width={190}
            />
            <MultiSearchableSelect
              options={storeOptions}
              selectedValues={stores}
              onChange={setStores}
              placeholder="Store"
              width={190}
            />
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: C.surface2 }}
            >
              <CalendarRange size={14} style={{ color: C.textFaint }} />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm outline-none bg-transparent font-medium" style={{ color: C.text }} />
              <span style={{ color: C.textFaint }}>–</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="text-sm outline-none bg-transparent font-medium" style={{ color: C.text }} />
            </div>

            {/* Corner controls — plain text, quiet */}
            <div className="flex items-center gap-5 ml-auto">
              <button
                onClick={clearFilters}
                className="text-sm transition-colors"
                style={{ color: C.textMuted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.navy)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
              >
                Clear
              </button>
              <button
                onClick={applyFilters}
                className="text-sm font-semibold transition-colors"
                style={{ color: C.navy }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.navy)}
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* SIDE TOGGLE — Summary / All / Auto-Reply / Pending / Audit Log */}
        <div className="flex justify-end mb-6">
          <div className="inline-flex items-center gap-1 p-1 rounded-full flex-wrap" style={{ background: C.surface2, border: `1px solid ${C.border}` }}>
            <button
              onClick={() => setTab("summary")}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={tab === "summary" ? { background: C.navy, color: "#fff" } : { color: C.textMuted }}
            >
              <Star size={13} /> Summary
            </button>
            <button
              onClick={() => setTab("all")}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={tab === "all" ? { background: C.navy, color: "#fff" } : { color: C.textMuted }}
            >
              <Layers size={13} /> All
              <span className="rounded-full px-1.5 text-[10px]" style={tab === "all" ? { background: "rgba(255,255,255,0.2)" } : { background: C.border }}>
                {allCount}
              </span>
            </button>
            <button
              onClick={() => setTab("auto")}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={tab === "auto" ? { background: C.navy, color: "#fff" } : { color: C.textMuted }}
            >
              <CheckCircle2 size={13} /> Auto-Reply
              <span className="rounded-full px-1.5 text-[10px]" style={tab === "auto" ? { background: "rgba(255,255,255,0.2)" } : { background: C.border }}>
                {autoCount}
              </span>
            </button>
            <button
              onClick={() => setTab("pending")}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={tab === "pending" ? { background: C.gold, color: "#fff" } : { color: C.textMuted }}
            >
              <Inbox size={13} /> Pending Review
              <span className="rounded-full px-1.5 text-[10px]" style={tab === "pending" ? { background: "rgba(255,255,255,0.25)" } : { background: C.border }}>
                {pendingCount}
              </span>
            </button>
            <button
              onClick={() => setTab("audit")}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={tab === "audit" ? { background: C.grey, color: "#fff" } : { color: C.textMuted }}
            >
              <ClipboardList size={13} /> Audit Log
            </button>
          </div>
        </div>

        {/* SUMMARY / CARDS / AUDIT LOG */}
        {tab === "summary" ? (
          <SummaryView stats={summaryStats} brandOptions={brandOptions} selectedBrands={brands} onSelectBrand={selectSummaryBrand} />
        ) : tab === "audit" ? (
          auditLogs === null ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
              <p className="font-medium" style={{ color: C.textMuted }}>Loading…</p>
            </div>
          ) : sentLogs.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
              <ClipboardList size={26} style={{ color: C.textFaint, margin: "0 auto 10px" }} />
              <p className="font-medium" style={{ color: C.textMuted }}>No replies sent yet.</p>
            </div>
          ) : (
            <AuditLogTable logs={sentLogs} />
          )
        ) : activeList === null ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
            <p className="font-medium" style={{ color: C.textMuted }}>Loading…</p>
          </div>
        ) : activeList.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
            <UtensilsCrossed size={26} style={{ color: C.textFaint, margin: "0 auto 10px" }} />
            <p className="font-medium" style={{ color: C.textMuted }}>
              {tab === "pending" ? "Nothing pending — all caught up." : "No reviews for these filters."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeList.map((r) => {
              const showPendingCard = tab === "pending" || (tab === "all" && r.status === "queued");
              return showPendingCard ? (
                <PendingCard key={r.id} review={r} onPost={handlePostPending} />
              ) : (
                <AutoCard key={r.id} review={r} onSave={handleSaveAuto} />
              );
            })}
          </div>
        )}
      </div>

      <ReviewsHealthSidebar />
    </div>
  );
}
