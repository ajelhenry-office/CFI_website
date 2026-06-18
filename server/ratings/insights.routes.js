const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { Groq } = require("groq-sdk");
require("dotenv/config");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Secure backend service key
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TABLE = "order_reviews";

function applyFilters(query, filters) {
  if (filters.brand) query = query.eq("outlet_master.brand_name", filters.brand);
  if (filters.city) query = query.eq("outlet_master.city", filters.city);
  if (filters.zone) query = query.eq("outlet_master.zone", filters.zone);
  if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("date", filters.dateTo);
  return query;
}

async function fetchJoined(filters, columns = "*", limit = 10000) {
  let q = supabase
    .from(TABLE)
    .select(`${columns}, outlet_master!inner(brand_name, city, area, zone)`)
    .limit(limit);
  q = applyFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function groupBy(rows, keyFn, valFn) {
  const map = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(valFn(row));
  }
  const result = [];
  for (const [key, vals] of map) {
    const nums = vals.filter((v) => v != null && !isNaN(v));
    result.push({
      name: key,
      avg: nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0,
      count: vals.length,
    });
  }
  return result;
}

async function fetchLowRatingComments(filters) {
  let q = supabase
    .from(TABLE)
    .select("comments, restaurant_rating, outlet_master!inner(brand_name, city, zone)")
    .lte("restaurant_rating", 3)
    .not("comments", "is", null)
    .limit(100);
  q = applyFilters(q, filters);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => r.comments).filter(Boolean).join("\n");
}

async function callGroq(prompt) {
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "llama3-8b-8192",
    max_tokens: 400,
  });
  return completion.choices[0].message.content;
}

router.post("/:id", async (req, res) => {
  try {
    const insightId = parseInt(req.params.id);
    const filters = req.body || {};
    let data = null;

    switch (insightId) {
      case 1: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        data = groupBy(rows, r => r.outlet_master?.brand_name, r => r.restaurant_rating).sort((a, b) => b.avg - a.avg);
        break;
      }
      case 2: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        data = groupBy(rows, r => r.outlet_master?.zone, r => r.restaurant_rating).sort((a, b) => b.avg - a.avg);
        break;
      }
      case 3: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        data = groupBy(rows, r => r.outlet_master?.city, r => r.restaurant_rating).sort((a, b) => b.avg - a.avg).slice(0, 20);
        break;
      }
      case 4: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        const all = groupBy(rows, r => r.outlet_master?.area, r => r.restaurant_rating).filter(r => r.count >= 5).sort((a, b) => b.avg - a.avg);
        data = { best: all.slice(0, 10), worst: all.slice(-10).reverse() };
        break;
      }
      case 5: {
        const rows = await fetchJoined(filters, "restaurant_rating");
        const nums = rows.map(r => r.restaurant_rating).filter(v => v != null);
        const avg = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0;
        data = [{ name: "Swiggy", avg, count: nums.length }];
        break;
      }
      case 6: {
        const rows = await fetchJoined(filters, "restaurant_rating, item_name");
        data = groupBy(rows, r => r.item_name, r => r.restaurant_rating).filter(r => r.name !== 'NO_ITEM' && r.count >= 10).sort((a, b) => b.avg - a.avg).slice(0, 20);
        break;
      }
      case 7: {
        const rows = await fetchJoined(filters, "restaurant_rating, item_name");
        data = groupBy(rows, r => r.item_name, r => r.restaurant_rating).filter(r => r.name !== 'NO_ITEM' && r.count >= 10).sort((a, b) => a.avg - b.avg).slice(0, 20);
        break;
      }
      case 8: {
        const rows = await fetchJoined(filters, "item_name, restaurant_rating");
        data = groupBy(rows, r => r.item_name, r => r.restaurant_rating).filter(r => r.name !== 'NO_ITEM').sort((a, b) => b.count - a.count).slice(0, 20);
        break;
      }
      case 9: {
        const BRAND_CATEGORY = { Dessert: ["Crustos", "EatFit", "CakeZone"], Pizza: ["Olio", "Pizza"], Burger: ["PHAT", "Burger"], Indian: ["Rolls", "Biryani", "Khichdi"] };
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        const cats = { Dessert: [], Pizza: [], Burger: [], Indian: [], Other: [] };
        rows.forEach(r => {
          const brand = r.outlet_master?.brand_name || "";
          let matched = false;
          for (const [cat, keywords] of Object.entries(BRAND_CATEGORY)) {
            if (keywords.some(k => brand.toLowerCase().includes(k.toLowerCase()))) {
              cats[cat].push(r.restaurant_rating);
              matched = true; break;
            }
          }
          if (!matched) cats.Other.push(r.restaurant_rating);
        });
        data = Object.entries(cats).map(([name, vals]) => {
          const nums = vals.filter(v => v != null);
          return { name, avg: nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0, count: nums.length };
        });
        break;
      }
      case 10: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        data = groupBy(rows, r => r.outlet_master?.area, r => r.restaurant_rating).filter(r => r.count >= 50 && r.avg < 3.5).sort((a, b) => a.avg - b.avg);
        break;
      }
      case 11: {
        const rows = await fetchJoined(filters, "restaurant_rating");
        const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        rows.forEach(r => { if (r.restaurant_rating >= 1 && r.restaurant_rating <= 5) dist[r.restaurant_rating]++; });
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        data = Object.entries(dist).map(([star, count]) => ({ name: `${star}★`, star: +star, count, pct: total ? +((count / total) * 100).toFixed(1) : 0 }));
        break;
      }
      case 12: {
        const rows = await fetchJoined(filters, "restaurant_rating, date");
        const map = new Map();
        rows.forEach(r => {
          if (!r.date) return;
          const month = r.date.substring(0, 7);
          if (!map.has(month)) map.set(month, []);
          map.get(month).push(r.restaurant_rating);
        });
        data = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, vals]) => {
          const nums = vals.filter(v => v != null);
          return { name: month, avg: nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0 };
        });
        break;
      }
      case 13: {
        const rows = await fetchJoined(filters, "restaurant_rating, restaurant_id");
        data = groupBy(rows, r => r.outlet_master?.area, r => r.restaurant_rating).filter(r => r.count >= 5).map(r => ({ name: r.name, volume: r.count, rating: r.avg }));
        break;
      }
      case 14: {
        const rows = await fetchJoined(filters, "restaurant_rating, ordered_time");
        const weekend = [], weekday = [];
        rows.forEach(r => {
          if (!r.ordered_time) return;
          const day = new Date(r.ordered_time).getDay();
          (day === 0 || day === 6 ? weekend : weekday).push(r.restaurant_rating);
        });
        const calcAvg = arr => arr.length ? +(arr.filter(v => v != null).reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
        data = [
          { name: "Weekday", avg: calcAvg(weekday), count: weekday.length },
          { name: "Weekend", avg: calcAvg(weekend), count: weekend.length },
        ];
        break;
      }
      case 15: {
        const rows = await fetchJoined(filters, "restaurant_rating, ordered_time");
        const hourMap = {};
        for (let h = 0; h < 24; h++) hourMap[h] = 0;
        rows.forEach(r => {
          if (!r.ordered_time || r.restaurant_rating > 2) return;
          const h = new Date(r.ordered_time).getHours();
          hourMap[h]++;
        });
        const arr = Object.entries(hourMap).map(([h, count]) => ({ name: `${h}:00`, hour: +h, count }));
        const max3 = [...arr].sort((a, b) => b.count - a.count).slice(0, 3).map(r => r.hour);
        data = arr.sort((a, b) => a.hour - b.hour).map(r => ({ ...r, worst: max3.includes(r.hour) }));
        break;
      }
      case 16: {
        const comments = await fetchLowRatingComments(filters);
        if (!comments) { data = "No bad reviews found."; break; }
        data = await callGroq(`Here are customer complaints from a food delivery app:\n${comments}\nFind the top 5 most repeated problems.\nFormat as numbered list. Each line:\nProblem: [issue] | Frequency: [approx count] | Example: [quote]\nMax 150 words.`);
        break;
      }
      case 17: {
        const comments = await fetchLowRatingComments(filters);
        if (!comments) { data = { delivery: 0, kitchen: 0, packaging: 0, other: 0 }; break; }
        const text = await callGroq(`Classify each complaint as DELIVERY, KITCHEN, PACKAGING or OTHER.\nComplaints: ${comments}\nCount how many fall into each category.\nRespond ONLY with JSON:\n{"delivery": 45, "kitchen": 30, "packaging": 15, "other": 10}`);
        const match = text.match(/\{[\s\S]*\}/);
        data = match ? JSON.parse(match[0]) : { delivery: 0, kitchen: 0, packaging: 0, other: 0 };
        break;
      }
      case 18: {
        const comments = await fetchLowRatingComments(filters);
        if (!comments) { data = "No bad reviews found."; break; }
        data = await callGroq(`You are a restaurant ops analyst.\nThese are customer complaints this week: ${comments}\nWrite a brief with:\n1. Top 3 problems (one line each)\n2. Most affected brand or location\n3. One urgent action to take this week\nKeep under 120 words. Use bullet points.`);
        break;
      }
      case 19: {
        const comments = await fetchLowRatingComments(filters);
        if (!comments) { data = "No bad reviews found."; break; }
        data = await callGroq(`Based on these complaints: ${comments}\nGive 5 specific action items for the ops team.\nFormat each as:\nAction: [what to do]\nOwner: Kitchen / Delivery / Packaging / Management\nImpact: High / Medium / Low`);
        break;
      }
      case 20: {
        const comments = await fetchLowRatingComments(filters);
        if (!comments) { data = "No bad reviews found."; break; }
        data = await callGroq(`From these complaints identify packaging problems only:\n${comments}\nList the top packaging issues found.\nFormat: numbered list, max 5 items, one line each.`);
        break;
      }
      default:
        return res.status(400).json({ error: "Invalid insight ID" });
    }
    res.json(data);
  } catch (err) {
    console.error(`[INSIGHT ${req.params.id} ERROR]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;