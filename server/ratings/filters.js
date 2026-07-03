import { supabase } from './supabaseClient.js';

/**
 * Main handler to fetch ALL outlet master data once so the frontend can do instant cascading filtering.
 */
async function handleFilterRequest(req, res) {
  try {
    // Fetch ALL necessary columns handling pagination
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('outlet_master')
        .select('brand_name, city, zone, area')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('brand_name'); // Stabilize sort to prevent missed rows

      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    // Clean the data (spaces & trim)
    const cleanedData = allData.map(row => ({
      brand: row.brand_name ? String(row.brand_name).replace(/\s+/g, ' ').trim() : null,
      city: row.city ? String(row.city).replace(/\s+/g, ' ').trim() : null,
      zone: row.zone ? String(row.zone).replace(/\s+/g, ' ').trim() : null,
      area: row.area ? String(row.area).replace(/\s+/g, ' ').trim() : null,
    }));

    // Fetch max date from order_reviews
    const { data: maxDateData } = await supabase
      .from('order_reviews')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);
    const maxDate = (maxDateData && maxDateData[0]) ? maxDateData[0].date : null;

    res.json({ masterData: cleanedData, maxDate });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to load filter options.' });
  }
}

export { handleFilterRequest };