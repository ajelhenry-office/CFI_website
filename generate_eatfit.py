import pandas as pd
import json

df = pd.read_excel('/Users/ajelhenry/Downloads/EF++ S_Z Toggle Data (1).xlsx', sheet_name='Status')

with open('eatfit_ref_ids.json', 'r') as f:
    kitchen_to_ref_ids = json.load(f)

# df columns: ['Unnamed: 0', 'City', 'Kitchen', 'Status ', 'Last Updated', 'Unnamed: 5', 'Current Status']
records = []
for index, row in df.iterrows():
    city = str(row['City']).strip()
    kitchen = str(row['Kitchen']).strip()
    
    if kitchen in kitchen_to_ref_ids:
        ref_ids = kitchen_to_ref_ids[kitchen]
        for ref_id in ref_ids:
            if ref_id and str(ref_id) != '-1' and str(ref_id) != 'nan':
                records.append({
                    "City": city,
                    "Kitchen": kitchen,
                    "Location Ref ID": str(ref_id),
                    "Brand": "Eatfit"
                })

with open('eatfit_stores_parsed.json', 'w') as f:
    json.dump(records, f)

print(f"Generated {len(records)} stores for Eatfit.")
