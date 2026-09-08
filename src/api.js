export const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

export function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) {
    // If we somehow have no token but are trying to fetch, force logout
    localStorage.removeItem('user');
    window.location.href = '/';
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

export function handleApiError(res) {
  // 401 is the token-missing case; 403 is shared by many legitimate
  // "you're logged in fine, just not allowed to do THIS" responses (e.g.
  // "Admin access required") that must NOT force a logout — only a 403
  // carrying X-Session-Invalid (an expired/invalid token, or a now-locked
  // account) means the session itself is dead and needs a fresh login.
  if (res.status === 401 || (res.status === 403 && res.headers.get('X-Session-Invalid'))) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    return true; // Indicates error was handled
  }
  return false;
}

