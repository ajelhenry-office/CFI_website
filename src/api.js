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
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    return true; // Indicates error was handled
  }
  return false;
}

