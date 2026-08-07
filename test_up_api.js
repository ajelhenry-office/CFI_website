import fs from 'fs';

async function testUpAPI() {
  const creds = {
    username : "biz_adm_QXJeFIgABXFq",
    apikey   : "a7d35eac21f5e6eab9d760d25d71a899c3ba2178",
    biz_id   : "60578050"
  };

  const UP_LOCATION_URL = "https://api.urbanpiper.com/hub/api/v1/location/";
  const location_id = "122211"; // From BLR_ROW_Kanakapura

  const payload = {
    location_ref_id: String(location_id),
    action: "disable", // Try to disable it (it might already be offline or online, let's see)
    platforms: ["swiggy", "zomato"],
  };

  console.log("Sending payload to", UP_LOCATION_URL, payload);

  const response = await fetch(UP_LOCATION_URL, {
    method: "POST",
    headers: {
      "Authorization": `apikey ${creds.username}:${creds.apikey}`,
      "Content-Type": "application/json",
      "x-upr-biz-id": creds.biz_id
    },
    body: JSON.stringify(payload),
  });

  const status = response.status;
  const text = await response.text();
  console.log("UP Response:", status, text);
}

testUpAPI();
