import { C, cardStyle, FONT } from "../../theme";

const row = (label, value) => (
  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{value}</span>
  </div>
);

import { useState, useEffect } from "react";
import { API_BASE, getAuthHeaders } from "../../api";

import { Search, Grid, List, Edit2, Key, MoreVertical, X, Mail, User } from "lucide-react";

const ROLE_STYLES = {
  admin: { label: "Business Admin", color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
  supervisor: { label: "Supervisor", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  dark_kitchen: { label: "Dark Kitchen", color: "#9333ea", bg: "#f3e8ff", border: "#e9d5ff" },
  control_tower: { label: "Control Tower", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  ratings_team: { label: "Ratings Team", color: "#0891b2", bg: "#cffafe", border: "#a5f3fc" },
  operations: { label: "Operations", color: "#ca8a04", bg: "#fef9c3", border: "#fde047" },
};

const getInitials = (name) => {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getAvatarColor = (initials) => {
  const colors = ["#dbeafe", "#dcfce7", "#fee2e2", "#f3e8ff", "#ffedd5", "#e0e7ff"];
  const textColors = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#4f46e5"];
  const index = (initials.charCodeAt(0) || 0) % colors.length;
  return { bg: colors[index], color: textColors[index] };
};

export function SettingsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("general");
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roles, setRoles] = useState([]);

  // Filter State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");
  
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = currentUser.email === "ajel.henry@curefoods.in" || (currentUser.role || "").split(',').includes("admin");

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch (err) {}
  };

  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith('@curefoods.in')) {
      alert("Only @curefoods.in email addresses are allowed.");
      return;
    }
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert("A user with this email already exists in the system.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ email, role: roles.join(",") })
      });
      const data = await res.json();
      if (data.success) {
        setEmail("");
        setFullName("");
        setRoles([]);
        setShowModal(false);
        fetchUsers();
        setTimeout(() => alert("Employee added successfully! A password has been auto-generated and emailed to them."), 100);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to add user.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLock = async (id, currentLockedStatus) => {
    if (!confirm(`Are you sure you want to ${currentLockedStatus ? "unlock" : "lock"} this user?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${id}/lock`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ is_locked: !currentLockedStatus })
      });
      const data = await res.json();
      if (data.success) fetchUsers();
      else alert(data.error);
    } catch (err) {
      alert("Failed to toggle lock status");
    }
  };

  const handleResetPassword = async (id, email) => {
    if (!confirm(`Are you sure you want to reset the password for ${email}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${id}/reset-password`, { 
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data.success) {
        alert(`Password for ${email} has been reset to: \n\n${data.newPassword}\n\nAn email has also been sent to them.`);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Failed to reset password");
    }
  };

  const handleDeleteUser = async (id, email) => {
    if (!confirm(`Are you absolutely sure you want to delete ${email}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) fetchUsers();
      else alert(data.error);
    } catch (err) {
      alert("Failed to delete user");
    }
  };

  const formatName = (email) => {
    const parts = email.split('@')[0].split('.');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  };

  const filteredUsers = users.filter(u => {
    const name = formatName(u.email).toLowerCase();
    const mail = u.email.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || mail.includes(search.toLowerCase());
    
    const userRoles = (u.role || "").split(',');
    const matchesRole = roleFilter === "All Roles" || userRoles.includes(roleFilter);
    const matchesStatus = statusFilter === "All Status" || (statusFilter === "Active" && !u.is_locked) || (statusFilter === "Locked" && u.is_locked);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: activeTab === "employees" ? 1100 : 620, fontFamily: FONT }}>
      
      {isAdmin && (
        <div style={{ display: "flex", gap: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 8 }}>
          <button 
            onClick={() => setActiveTab("general")}
            style={{ background: "none", border: "none", fontSize: 14, fontWeight: 800, color: activeTab === "general" ? C.primary : C.muted, cursor: "pointer", borderBottom: activeTab === "general" ? `2px solid ${C.primary}` : "none", paddingBottom: 4 }}
          >
            General Settings
          </button>
          <button 
            onClick={() => setActiveTab("employees")}
            style={{ background: "none", border: "none", fontSize: 14, fontWeight: 800, color: activeTab === "employees" ? C.primary : C.muted, cursor: "pointer", borderBottom: activeTab === "employees" ? `2px solid ${C.primary}` : "none", paddingBottom: 4 }}
          >
            Employees
          </button>
        </div>
      )}

      {activeTab === "general" && (
        <>
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 8 }}>User Profile</div>
            {row("Name", currentUser.email ? formatName(currentUser.email) : "Curefoods Admin")}
            {row("Email", currentUser.email || "Unknown")}
            {row("Roles", (currentUser.role || "").split(',').map(r => r === "admin" ? "Admin" : r.replace('_', ' ')).join(', '))}
          </div>
          
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 8 }}>Connected Platforms</div>
            {["Swiggy", "Zomato", "Google"].map((p) => row(p, "Connected"))}
          </div>
        </>
      )}

      {activeTab === "employees" && isAdmin && (
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: `1px solid ${C.borderSoft}`, padding: "20px" }}>
          
          {/* Top Bar: Search, Filters, View Toggles */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <Search size={16} color={C.muted} style={{ position: "absolute", left: 12, top: 11 }} />
                <input 
                  type="text" 
                  placeholder="Search by name or email..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: "10px 14px 10px 36px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, width: 220 }}
                />
              </div>
              <select 
                value={roleFilter} 
                onChange={e => setRoleFilter(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, backgroundColor: "#fff", color: C.text }}
              >
                <option value="All Roles">All Roles</option>
                {Object.keys(ROLE_STYLES).map(k => <option key={k} value={k}>{ROLE_STYLES[k].label}</option>)}
              </select>
              <select 
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, backgroundColor: "#fff", color: C.text }}
              >
                <option value="All Status">All Status</option>
                <option value="Active">Active</option>
                <option value="Locked">Locked</option>
              </select>
            </div>
            
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={() => setShowModal(true)}
                style={{ padding: "10px 20px", borderRadius: 8, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}
              >
                Add Employee
              </button>
            </div>
          </div>

          {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>{error}</div>}

          {/* List View */}
          <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.borderSoft}` }}>
            {filteredUsers.map((u) => {
              const name = formatName(u.email);
              const initials = getInitials(name);
              const avatar = getAvatarColor(initials);
              const userRoles = (u.role || "").split(',').filter(r => r);
              const displayRoles = userRoles.slice(0, 2);
              const hiddenCount = userRoles.length - 2;

              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 8px", borderBottom: `1px solid ${C.borderSoft}` }}>
                  
                  {/* Avatar & Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, width: 300 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: avatar.bg, color: avatar.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{name}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{u.email}</div>
                    </div>
                  </div>

                  {/* Roles */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    {displayRoles.map(r => {
                      const style = ROLE_STYLES[r] || { label: r, color: "#475569", bg: "#f1f5f9", border: "#e2e8f0" };
                      return (
                        <div key={r} style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}`, fontSize: 11, fontWeight: 700 }}>
                          {style.label}
                        </div>
                      );
                    })}
                    {hiddenCount > 0 && (
                      <div style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "#f1f5f9", color: "#64748b", border: `1px solid #e2e8f0`, fontSize: 11, fontWeight: 700 }}>
                        +{hiddenCount}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div style={{ width: 100, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: u.is_locked ? "#ef4444" : "#16a34a" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: u.is_locked ? "#ef4444" : "#16a34a" }} />
                    {u.is_locked ? "Locked" : "Active"}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button 
                      onClick={() => handleResetPassword(u.id, u.email)}
                      title="Reset Password"
                      style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: C.muted }}
                    >
                      <Key size={14} />
                    </button>
                    {u.email !== currentUser.email && (
                      <button 
                        onClick={() => handleToggleLock(u.id, u.is_locked)}
                        title={u.is_locked ? "Unlock User" : "Lock User"}
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: u.is_locked ? "#ef4444" : C.muted }}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {u.email !== currentUser.email && (
                      <button 
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        title="Delete Employee"
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: C.muted }}
                      >
                        <MoreVertical size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: C.muted, marginTop: 16 }}>
            Showing 1 to {filteredUsers.length} of {filteredUsers.length} employees
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 600, padding: 32, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Add New Employee</div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={20} /></button>
            </div>

            <form onSubmit={handleAddUser}>
              <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Email Address</label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} color={C.muted} style={{ position: "absolute", left: 12, top: 12 }} />
                    <input 
                      type="email" 
                      placeholder="Enter email address" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Full Name (Optional)</label>
                  <div style={{ position: "relative" }}>
                    <User size={16} color={C.muted} style={{ position: "absolute", left: 12, top: 12 }} />
                    <input 
                      type="text" 
                      placeholder="Enter full name" 
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Assign Roles</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
                {Object.keys(ROLE_STYLES).map(roleKey => {
                  const style = ROLE_STYLES[roleKey];
                  const isSelected = roles.includes(roleKey);
                  return (
                    <div 
                      key={roleKey}
                      onClick={() => {
                        if (isSelected) setRoles(roles.filter(r => r !== roleKey));
                        else setRoles([...roles, roleKey]);
                      }}
                      style={{ 
                        padding: "12px 16px", 
                        borderRadius: 8, 
                        border: `1.5px solid ${isSelected ? style.color : C.borderSoft}`, 
                        backgroundColor: isSelected ? style.bg : "#fff",
                        display: "flex", alignItems: "center", gap: 12, 
                        cursor: "pointer", transition: "all 0.2s" 
                      }}
                    >
                      <div style={{ 
                        width: 16, height: 16, 
                        borderRadius: 4, 
                        backgroundColor: isSelected ? style.color : "#fff",
                        border: `1px solid ${isSelected ? style.color : C.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? style.color : C.text }}>{style.label}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  style={{ padding: "10px 24px", borderRadius: 8, backgroundColor: "#fff", color: C.text, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading || roles.length === 0}
                  style={{ padding: "10px 24px", borderRadius: 8, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: (loading || roles.length === 0) ? "not-allowed" : "pointer", fontFamily: FONT, opacity: (loading || roles.length === 0) ? 0.6 : 1 }}
                >
                  {loading ? "Adding..." : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

