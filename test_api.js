import fetch from "node-fetch";

async function test() {
  const loginRes = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ajel.henry@curefoods.in", password: "YOUR_PASSWORD" }) // I don't know the password
  });
  console.log(await loginRes.text());
}
test();
