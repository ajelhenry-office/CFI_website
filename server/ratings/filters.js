import { supabase } from './supabaseClient.js';

/**
 * Fetches unique, non-null, and sorted values for a given column
 * from the outlet_master table.
 * @param {string} columnName - The name of the column to query.
 * @returns {Promise<string[]>} - A promise that resolves to an array of unique strings.
 */
async function getUniqueValues(columnName) {
  // Use select with `distinct()` for a clean and efficient query.
  const { data, error } = await supabase
    .from('outlet_master')
    .select(columnName, { distinct: true });

  if (error) {
    console.error(`Error fetching distinct ${columnName}s:`, error);
    throw new Error(`Failed to fetch ${columnName}s: ${error.message}`);
  }

  // The data comes back as [{col: val1}, {col: val2}]. We need to flatten,
  // filter out null/empty values, and sort it.
  return data.map(item => item[columnName]).filter(Boolean).sort();
}

/**
 * Main handler to fetch all filter options in a single request.
 */
async function handleFilterRequest(req, res) {
  try {
    const [brands, cities, zones, areas] = await Promise.all([
      getUniqueValues('brand_name'),
      getUniqueValues('city'),
      getUniqueValues('zone'),
      getUniqueValues('area'),
    ]);

    res.json({ brands, cities, zones, areas });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to load filter options.' });
  }
}

export { handleFilterRequest };