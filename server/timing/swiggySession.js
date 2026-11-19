// Swiggy partner (VMS) session for the Timing tab.
// Logs in straight against Swiggy's GraphQL API with phone + password — the web
// login page fires an OTP SMS as soon as the number is entered, this path doesn't.
// The session is an opaque access_token (no expiry inside it), sent as an
// `access_token` header on every call.

const GRAPHQL_URL = "https://vhc-composer.swiggy.com/query";
const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/graphql-response+json, application/json",
  Referer: "https://partner.swiggy.com/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

const RESTAURANT_FIELDS = `
        rest_id
        rest_name
        enabled
        city_name
        area_name
        locality
        display_area_name`;

const LOGIN_MUTATION = `
  mutation loginMutation($input: LoginRequest!) {
    login(input: $input) {
      ID
      name
      access_token
      restaurants {${RESTAURANT_FIELDS}
      }
    }
  }
`;

const GET_USER_QUERY = `
  query GetUser($input: GetUserRequest) {
    get_user(input: $input) {
      id
      restaurants {${RESTAURANT_FIELDS}
      }
    }
  }
`;

// Swiggy accounts are numbered to match SWIGGY_PHONE_<n> / SWIGGY_PASSWORD_<n> in .env
export const SWIGGY_ACCOUNTS = [1, 2];

function credsFor(account) {
  const phone = process.env[`SWIGGY_PHONE_${account}`];
  const password = process.env[`SWIGGY_PASSWORD_${account}`];
  if (!phone || !password) throw new Error(`SWIGGY_PHONE_${account} / SWIGGY_PASSWORD_${account} not set`);
  return { phone, password };
}

async function gql(operationName, query, variables, accessToken = "null") {
  const kind = query.trim().startsWith("mutation") ? "mutation" : "query";
  const res = await fetch(`${GRAPHQL_URL}?${kind}=${operationName}`, {
    method: "POST",
    headers: { ...HEADERS, access_token: accessToken },
    body: JSON.stringify({ query, variables, operationName }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`Swiggy ${operationName}: non-JSON response (HTTP ${res.status})`); }
  if (body.errors?.length) throw new Error(`Swiggy ${operationName}: ${body.errors.map(e => e.message).join("; ")}`);
  return body.data;
}

export async function loginSwiggy(account) {
  const { phone, password } = credsFor(account);
  const data = await gql("loginMutation", LOGIN_MUTATION, {
    input: {
      username: phone,
      password,
      accept_tnc: true,
      existing_user: true,
      include_dineout: true,
      is_otp_login: false,
      source: "VMS",
    },
  });
  const login = data?.login;
  if (!login?.access_token) throw new Error("Swiggy login returned no access_token");
  return { accessToken: login.access_token, name: login.name, restaurants: login.restaurants || [] };
}

// Returns the account's outlets if the token still works; throws SESSION_EXPIRED otherwise.
export async function checkSwiggy(accessToken) {
  let data;
  try {
    data = await gql("GetUser", GET_USER_QUERY, { input: { include_dineout: true } }, accessToken);
  } catch (err) {
    throw new Error(`SESSION_EXPIRED: ${err.message}`, { cause: err });
  }
  if (!data?.get_user?.id) throw new Error("SESSION_EXPIRED: GetUser returned no user");
  return { restaurants: data.get_user.restaurants || [] };
}

// ─── Outlet timings ───────────────────────────────────────────
// Same queries the partner portal's Outlet Timings page sends. Times are HHMM numbers
// on read and zero-padded HHMM strings on write; 2360 means "until midnight".

const GET_SLOTS_QUERY = `
  query getSlots($rids: [Int64!]!) {
    getSlots(input: { restaurantIds: $rids }) {
      rId
      days {
        day
        slots {
          open_time
          close_time
        }
      }
    }
  }
`;

const UPDATE_SLOTS_MUTATION = `
  mutation updateSlots($rid: Int!, $input: [UpdateSlotRequest!]!) {
    updateSlots(restaurantId: $rid, input: $input) {
      day
      slots {
        open_time
        close_time
      }
    }
  }
`;

const SWIGGY_DAY = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
const pad4 = v => String(v).padStart(4, "0");
// "09:30" → "0930"; a closing time of "00:00" is end-of-day → "2360", like the portal.
const toSwiggyTime = (t, isClose) => (isClose && t === "00:00" ? "2360" : t.replace(":", ""));
export const fromSwiggyTime = v => { const s = pad4(v === 2360 || v === "2360" ? "0000" : v); return `${s.slice(0, 2)}:${s.slice(2)}`; };

// Session errors are re-thrown as SESSION_EXPIRED so callers can log in again and retry.
async function authed(operationName, query, variables, accessToken) {
  try {
    return await gql(operationName, query, variables, accessToken);
  } catch (err) {
    // "Invalid Outlet ID/Unauthorised" = live login, outlet not on this account;
    // "Authorisation Failed" = the token itself is dead.
    if (/invalid outlet/i.test(err.message)) throw new Error(`NOT_AUTHORISED: ${err.message}`, { cause: err });
    if (/authori[sz]ation failed/i.test(err.message)) throw new Error(`SESSION_EXPIRED: ${err.message}`, { cause: err });
    throw err;
  }
}

export async function getSwiggySlots(accessToken, rid) {
  const data = await authed("getSlots", GET_SLOTS_QUERY, { rids: [Number(rid)] }, accessToken);
  const entry = data?.getSlots?.find(r => String(r.rId) === String(rid));
  if (!entry) throw new Error(`NOT_AUTHORISED: this Swiggy account returned no timings for ${rid}`);
  return entry.days;
}

// Sets slot `slotIndex` (0 = S1, 1 = S2) to start–end on the given days (Monday-first
// names). Swiggy saves one day per call, so every other day is never sent; within a
// changed day, the other slot is sent back exactly as it is now.
export async function updateSwiggySlot(accessToken, rid, days, slotIndex, start, end) {
  const current = await getSwiggySlots(accessToken, rid);
  const changes = [];
  for (const dayName of days) {
    const code = SWIGGY_DAY[dayName];
    const day = current.find(d => d.day === code);
    const before = (day?.slots || []).map(s => ({ open_time: pad4(s.open_time), close_time: pad4(s.close_time) }));
    if (slotIndex > before.length) throw new Error(`${dayName} has no S${slotIndex} on Swiggy yet — set S${slotIndex} first`);
    const after = before.map(s => ({ ...s }));
    after[slotIndex] = { open_time: toSwiggyTime(start, false), close_time: toSwiggyTime(end, true) };

    await authed("updateSlots", UPDATE_SLOTS_MUTATION, { rid: Number(rid), input: [{ day: code, slots: after }] }, accessToken);
    const fmt = slots => slots.map(s => ({ start: fromSwiggyTime(s.open_time), end: fromSwiggyTime(s.close_time) }));
    changes.push({ day: dayName, before: fmt(before), after: fmt(after) });
  }
  return changes;
}
