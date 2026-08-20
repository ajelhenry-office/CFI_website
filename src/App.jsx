import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar, { NAV_ITEMS, tabsForRoles } from "./Sidebar";
import GlobalFilters from "./GlobalFilters";
import { C, FONT } from "./theme";
import TogglePage from "./features/toggle/TogglePage";
import TimingPage from "./features/timing/TimingPage";
import ReviewsPage from "./features/reviews/ReviewsPage";
import RouteBackfillingPage from "./features/backfilling/RouteBackfillingPage";
import RatingsPage from "./features/ratings/RatingsPage";
import OpsMatrixPage from "./features/ops_matrix/OpsMatrixPage";
import { SettingsPage, ThemePage } from "./features/static/StaticPages";
import LoginPage from "./features/auth/LoginPage";
import ChatbotWidget from "./features/chat/ChatbotWidget";
import { fetchFilters } from "./features/ratings/ratingsApi";
import { API_BASE, getAuthHeaders } from "./api";

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

const DEFAULT_FILTERS = {
  brands: [],
  cities: [],
  zones: [],
  areas: [],
  dateFrom: iso(7),
  dateTo: iso(1),
  timeFrom: "",
  timeTo: "",
};

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState(() => {
    const savedUser = localStorage.getItem("user");
    let initialTab = "toggle";
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      const allowed = tabsForRoles(parsed.roles || [parsed.role]);
      initialTab = allowed[0];
    }

    const path = window.location.pathname.replace("/", "");
    if (path === "CFI-operations-dashboard") return "ops_matrix";
    if (path && NAV_ITEMS.some(n => n.key === path)) return path;

    return initialTab;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [globalFilters, setGlobalFilters] = useState(DEFAULT_FILTERS);
  const [masterData, setMasterData] = useState([]);

  useEffect(() => {
    if (!user) return;

    // Ensure activeTab is valid for the logged-in user's roles
    const allowed = tabsForRoles(user.roles || [user.role]);
    if (!allowed.includes(activeTab)) {
      setActiveTab(allowed[0]);
    }

    let alive = true;
    fetchFilters()
      .then((res) => {
        if (alive) setMasterData(res.masterData || []);
      })
      .catch(() => { });
    return () => {
      alive = false;
    };
  }, [user, activeTab]);

  // The backend now always enforces the CURRENT role on every request (a role change
  // takes effect immediately, server-side) — but the sidebar/tab list here is driven by
  // the role cached in localStorage at login, which would otherwise lag until next
  // login. Poll a lightweight "who am I" endpoint periodically so a demotion/promotion
  // shows up in the UI without needing to log out.
  useEffect(() => {
    if (!user) return;
    const syncRole = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        const data = await res.json();
        const currentRoles = user.roles || [user.role];
        const rolesChanged = data.success && (
          data.user.role !== user.role ||
          JSON.stringify([...(data.user.roles || [])].sort()) !== JSON.stringify([...currentRoles].sort())
        );
        if (rolesChanged) {
          const updated = { ...user, role: data.user.role, roles: data.user.roles };
          localStorage.setItem("user", JSON.stringify(updated));
          setUser(updated);
        }
      } catch (err) { /* offline or logged out — next request will handle it */ }
    };
    const timer = setInterval(syncRole, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(timer);
  }, [user]);

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  const allBrands = useMemo(() => [...new Set(masterData.map((r) => r.brand))].sort(), [masterData]);

  const updateFilters = useCallback((partial) => setGlobalFilters((prev) => ({ ...prev, ...partial })), []);

  const nav = NAV_ITEMS.find((n) => n.key === activeTab);
  const title = activeTab === "logout" ? "Session" : nav?.label || "Dashboard";
  const subtitle = activeTab === "logout" ? "You have signed out" : nav?.subtitle || "";

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: C.bg, color: C.text, fontFamily: FONT }}>
      <Sidebar
        active={activeTab}
        onNavigate={(tab) => {
          if (tab === "logout") {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("activeTab");
            window.history.pushState({}, "", "/");
            window.location.reload();
          } else {
            setActiveTab(tab);
            localStorage.setItem("activeTab", tab);
            window.history.pushState({}, "", `/${tab === "ops_matrix" ? "CFI-operations-dashboard" : tab}`);
          }
        }}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(true)}
        roles={user.roles || [user.role]}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            style={{
              position: "absolute",
              top: 22,
              left: 14,
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              border: `1.8px solid ${C.primary}`,
              color: C.primary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 40,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* The Reviews tab has its own full header and its own filter bar built in —
            this shared one would just be a redundant duplicate above it. */}
        {activeTab !== "reviews" && (
          <header
            style={{
              padding: collapsed ? "20px 28px 16px 58px" : "20px 28px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: C.primary, margin: 0, letterSpacing: -0.3 }}>{title}</h1>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{subtitle}</div>
              </div>
              <div id="header-actions"></div>
            </div>
            {activeTab !== "toggle" && activeTab !== "timing" && activeTab !== "settings" && activeTab !== "ops_matrix" && (
              <GlobalFilters
                filters={globalFilters}
                masterData={masterData}
                onChange={updateFilters}
                onClearAll={() => setGlobalFilters({ ...DEFAULT_FILTERS, dateFrom: "", dateTo: "" })}
              />
            )}
          </header>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: activeTab === "reviews" ? 0 : "22px 28px 60px" }}>
          {activeTab === "toggle" && <TogglePage userRole={user.role} userRoles={user.roles || [user.role]} />}
          {activeTab === "timing" && <TimingPage globalFilters={globalFilters} />}
          {activeTab === "reviews" && <ReviewsPage globalFilters={globalFilters} />}
          {activeTab === "backfilling" && <RouteBackfillingPage globalFilters={globalFilters} />}
          {activeTab === "ratings" && (
            <RatingsPage
              globalFilters={globalFilters}
              allBrands={allBrands}
              masterData={masterData}
              onUpdateFilters={updateFilters}
            />
          )}

          {/* Keep Ops Matrix mounted always so data loads in background instantly */}
          <div style={{ display: activeTab === "ops_matrix" ? "block" : "none" }}>
            <OpsMatrixPage />
          </div>

          {activeTab === "settings" && <SettingsPage />}
          {activeTab === "theme" && <ThemePage />}
        </div>
      </main>

      {/* Global AI Chatbot Widget */}
      <ChatbotWidget userRole={user.role} />
    </div>
  );
}
