import { C, cardStyle } from "../../theme";

export default function OpsMatrixPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...cardStyle, padding: "40px", textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Ops Matrix</h2>
        <p style={{ fontSize: 14, color: C.muted }}>This module is currently under construction.</p>
      </div>
    </div>
  );
}
