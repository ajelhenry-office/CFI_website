require('dotenv').config();
const fs = require('fs');
const { checkForNewReports } = require('./gmailWatcher');
const { parseExcel } = require('./parseExcel');
const { insertRows } = require('./supabaseClient');

async function runPipeline(targetDate, attempt = 1, maxRetries = 3) {
  try {
    console.log(`(Attempt ${attempt}/${maxRetries}) Fetching reports...`);
    
    // Set a timeout of 5 minutes (300000 ms) for the fetching process
    const fetchTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('FETCH_TIMEOUT: Fetching took too long.')), 300000)
    );

    // Race the actual fetch against the timeout
    const newFiles = await Promise.race([
      checkForNewReports(targetDate),
      fetchTimeout
    ]);

    for (const filePath of newFiles) {
      console.log(`\nProcessing file: ${filePath}`);
      
      // 1. Parse the Excel file
      const dataRows = parseExcel(filePath);
      
      // 2. Insert into Supabase
      await insertRows(dataRows);
      
      // Delete the file after successful processing to save space during testing
      fs.unlinkSync(filePath); 
    }
  } catch (error) {
    console.error(`Pipeline encountered an error on attempt ${attempt}:`, error.message || error);
    if (attempt < maxRetries) {
      console.log(`Retrying to confirm reports for ${targetDate || 'ALL UNPROCESSED'}...`);
      await runPipeline(targetDate, attempt + 1, maxRetries);
    } else {
      console.error(`Confirmed failure: Could not process reports for ${targetDate || 'ALL UNPROCESSED'} after ${maxRetries} attempts.`);
    }
  }
}

async function main() {
  const dates = process.argv.slice(2);
  
  if (dates.length > 0) {
    for (const date of dates) {
      console.log(`\n======================================================`);
      console.log(`Running pipeline immediately for date: ${date}...`);
      console.log(`======================================================\n`);
      await runPipeline(date);
    }
  } else {
    console.log(`Running pipeline immediately for date: ALL UNPROCESSED...`);
    await runPipeline();
  }
}

main();