const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export async function toggleStore(location_id, action, brand) {
  const res = await fetch(`${BACKEND}/api/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id, action, brand })
  });
  if (!res.ok) throw new Error("Toggle failed");
  return res.json();
}

export async function updateTiming(location_id, store_name, opening_time, closing_time) {
  const res = await fetch(`${BACKEND}/api/timing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location_id, store_name, opening_time, closing_time })
  });
  if (!res.ok) throw new Error("Timing update failed");
  return res.json();
}