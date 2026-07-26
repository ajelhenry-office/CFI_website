const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export async function toggleStore(location_id, action, brand, store_name) {
  const res = await fetch(`${BACKEND}/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id, action, brand, store_name })
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Toggle failed");
  }
  return data;
}

export const bulkToggleStores = async (stores, action, filterContext = "") => {
  const res = await fetch(`${BACKEND}/api/toggle/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stores, action, filterContext })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Bulk toggle failed');
  }
  return res.json();
};

export async function updateTiming(location_id, store_name, opening_time, closing_time) {
  const res = await fetch(`${BACKEND}/api/timing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id, store_name, opening_time, closing_time })
  });
  if (!res.ok) throw new Error("Timing update failed");
  return res.json();
}

export const pauseBulkJob = async (jobId) => {
  const res = await fetch(`${BACKEND}/api/toggle/bulk/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId })
  });
  if (!res.ok) throw new Error('Pause failed');
  return res.json();
};

export const resumeBulkJob = async (jobId) => {
  const res = await fetch(`${BACKEND}/api/toggle/bulk/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId })
  });
  if (!res.ok) throw new Error('Resume failed');
  return res.json();
};

export const cancelBulkJob = async (jobId) => {
  const res = await fetch(`${BACKEND}/api/toggle/bulk/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId })
  });
  if (!res.ok) throw new Error('Cancel failed');
  return res.json();
};