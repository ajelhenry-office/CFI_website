import { C, cardStyle, FONT } from "../../theme";

const row = (label, value) => (
  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{value}</span>
  </div>
);

import { useState, useEffect } from "react";
import { API_BASE, getAuthHeaders } from "../../api";

import { Search, Key, X, Mail, Trash2, Lock, Unlock, UserCog } from "lucide-react";

const ROLE_STYLES = {
  super_admin: { label: "Super Admin", color: "#a16207", bg: "#fef9c3", border: "#fde047" },
  admin: { label: "Admin", color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
  dark_kitchen: { label: "Dark Kitchen", color: "#9333ea", bg: "#f3e8ff", border: "#e9d5ff" },
  supervisor: { label: "Supervisor", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  control_tower: { label: "Control Tower", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
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

// A single-select role picker — replaces the old multi-checkbox grid. Access levels
// are a ladder (Super Admin > Admin > everyone else), not combinable tags, and only
// one role at a time is ever meaningful for what tabs someone can see.
function RolePicker({ options, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {options.map(roleKey => {
        const style = ROLE_STYLES[roleKey] || { label: roleKey, color: "#475569", bg: "#f1f5f9", border: "#e2e8f0" };
        const isSelected = value === roleKey;
        return (
          <div
            key={roleKey}
            onClick={() => onChange(roleKey)}
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
              borderRadius: "50%",
              backgroundColor: isSelected ? style.color : "#fff",
              border: `1px solid ${isSelected ? style.color : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {isSelected && <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#fff" }} />}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? style.color : C.text }}>{style.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsPage() {
  const [users, setUsers] = useState([]);
  const [grantableRoles, setGrantableRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("general");

  // Add modal state
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("");

  // Edit role modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const canManageEmployees = ["admin", "super_admin"].includes(currentUser.role);

  const fetchUsers = async () => {
    if (!canManageEmployees) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setGrantableRoles(data.grantableRoles || []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchUsers();
  }, [canManageEmployees]);

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
    if (!newRole) {
      setError("Select a role.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ email, role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        setEmail("");
        setNewRole("");
        setShowModal(false);
        fetchUsers();
        setTimeout(() => alert(data.message || "Employee added successfully!"), 100);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to add user.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${editingUser.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ role: editingRole })
      });
      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        setEditingUser(null);
        setEditingRole("");
        fetchUsers();
      } else alert(data.error);
    } catch (err) {
      alert("Failed to update role");
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
        alert(`Password for ${email} has been reset to: \n\n${data.newPassword}\n\n${data.message}`);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Failed to reset password");
    }
  };

  const handleToggleLock = async (id, isLocked) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${id}/lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ is_locked: !isLocked })
      });
      const data = await res.json();
      if (data.success) fetchUsers();
      else alert(data.error);
    } catch (err) {
      alert("Failed to update lock status");
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
    const matchesRole = roleFilter === "All Roles" || u.role === roleFilter;
    const matchesStatus = statusFilter === "All Status" || (statusFilter === "Active" && !u.is_locked) || (statusFilter === "Locked" && u.is_locked);
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: activeTab === "employees" ? 1100 : 620, fontFamily: FONT }}>

      {canManageEmployees && (
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
            {row("Role", ROLE_STYLES[currentUser.role]?.label || currentUser.role || "Unknown")}
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 8 }}>Connected Platforms</div>
            {["Swiggy", "Zomato", "Google"].map((p) => row(p, "Connected"))}
          </div>
        </>
      )}

      {activeTab === "employees" && canManageEmployees && (
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
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {grantableRoles.length > 0 && (
                <button
                  onClick={() => { setNewRole(""); setError(""); setShowModal(true); }}
                  style={{ padding: "10px 20px", borderRadius: 8, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}
                >
                  Add Employee
                </button>
              )}
            </div>
          </div>

          {/* List View */}
          <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.borderSoft}` }}>
            {filteredUsers.map((u) => {
              const name = formatName(u.email);
              const initials = getInitials(name);
              const avatar = getAvatarColor(initials);
              const style = ROLE_STYLES[u.role] || { label: u.role, color: "#475569", bg: "#f1f5f9", border: "#e2e8f0" };
              const isSelf = u.email === currentUser.email;
              const showActions = !isSelf && u.canManage;

              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 8px", borderBottom: `1px solid ${C.borderSoft}` }}>

                  {/* Avatar & Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, width: 300 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: avatar.bg, color: avatar.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{name}{isSelf && <span style={{ color: C.muted, fontWeight: 500 }}> (you)</span>}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{u.email}</div>
                    </div>
                  </div>

                  {/* Role */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    <div style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}`, fontSize: 11, fontWeight: 700 }}>
                      {style.label}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ width: 100, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
                    {u.is_locked && "Locked"}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {showActions && (
                      <button
                        onClick={() => {
                          setEditingUser(u);
                          setEditingRole(u.role);
                          setShowEditModal(true);
                        }}
                        title="Update Role"
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: C.muted }}
                      >
                        <UserCog size={14} />
                      </button>
                    )}
                    {(showActions || isSelf) && (
                      <button
                        onClick={() => handleResetPassword(u.id, u.email)}
                        title="Reset Password"
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: C.muted }}
                      >
                        <Key size={14} />
                      </button>
                    )}
                    {showActions && (
                      <button
                        onClick={() => handleToggleLock(u.id, u.is_locked)}
                        title={u.is_locked ? "Unlock User" : "Lock User"}
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: u.is_locked ? "#ef4444" : C.muted }}
                      >
                        {u.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                      </button>
                    )}
                    {showActions && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        title="Delete Employee"
                        style={{ background: "#fff", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, cursor: "pointer", color: "#ef4444" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    {!isSelf && !u.canManage && (
                      <span style={{ fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>No permission</span>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>No employees found.</div>
            )}
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
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Email Address</label>
                <div style={{ position: "relative" }}>
                  <Mail size={16} color={C.muted} style={{ position: "absolute", left: 12, top: 12 }} />
                  <input
                    type="email"
                    placeholder="name@curefoods.in"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: FONT, boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Assign Role</label>
              <div style={{ marginBottom: 24 }}>
                <RolePicker options={grantableRoles} value={newRole} onChange={setNewRole} />
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 24, lineHeight: 1.5 }}>
                A password will be generated automatically and emailed to them along with the login link and their role.
              </div>

              {error && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600, marginBottom: 16 }}>{error}</div>}

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
                  disabled={loading || !newRole}
                  style={{ padding: "10px 24px", borderRadius: 8, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: (loading || !newRole) ? "not-allowed" : "pointer", fontFamily: FONT, opacity: (loading || !newRole) ? 0.6 : 1 }}
                >
                  {loading ? "Adding..." : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showEditModal && editingUser && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 600, padding: 32, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Update Role for {formatName(editingUser.email)}</div>
              <button onClick={() => setShowEditModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={20} /></button>
            </div>

            <form onSubmit={handleUpdateRole}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Assign Role</label>
              <div style={{ marginBottom: 32 }}>
                <RolePicker options={grantableRoles} value={editingRole} onChange={setEditingRole} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ padding: "10px 24px", borderRadius: 8, backgroundColor: "#fff", color: C.text, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingRole}
                  style={{ padding: "10px 24px", borderRadius: 8, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: !editingRole ? "not-allowed" : "pointer", fontFamily: FONT, opacity: !editingRole ? 0.6 : 1 }}
                >
                  Save Role
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
