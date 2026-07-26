import { C, cardStyle, FONT } from "../../theme";

const row = (label, value) => (
  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{value}</span>
  </div>
);

export function SettingsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 620 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 8 }}>User Profile</div>
        {row("Name", "Curefoods Admin")}
        {row("Role", "Operations Manager")}
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 8 }}>Connected Platforms</div>
        {["Swiggy", "Zomato", "Google"].map((p) => row(p, "Connected"))}
      </div>
    </div>
  );
}

export function ThemePage() {
  return (
    <div style={{ ...cardStyle, maxWidth: 620 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>System Theme</div>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginTop: 10 }}>
        The Partner Dashboard theme is locked to <strong style={{ color: C.primary }}>Royal Blue &amp; White</strong> to keep
        reporting screenshots, exported Excel workbooks and PDF briefs visually identical across every Curefoods team.
        There is no light/dark switch — the palette is fixed at {C.primary} on pure white.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, height: 54, borderRadius: 10, backgroundColor: C.primary }} />
        <div style={{ flex: 1, height: 54, borderRadius: 10, backgroundColor: "#ffffff", border: `1px solid ${C.border}` }} />
      </div>
    </div>
  );
}

export function LogoutPage({ onSignIn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 14, fontFamily: FONT }}>
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      <div style={{ fontSize: 20, fontWeight: 900, color: C.primary }}>Logged Out</div>
      <div style={{ fontSize: 12.5, color: C.muted }}>Your session has been closed on this device.</div>
      <button
        onClick={onSignIn}
        style={{
          marginTop: 6,
          padding: "10px 22px",
          borderRadius: 22,
          border: "none",
          backgroundColor: C.primary,
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Sign In Again
      </button>
    </div>
  );
}
