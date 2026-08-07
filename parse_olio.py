import pandas as pd
import json

df = pd.read_excel('/Users/ajelhenry/Downloads/CT - Olio++.xlsx', sheet_name='Test Sheet')
df = df.dropna(subset=[df.columns[3]]) # column 3 is Location Ref ID

# Drop columns that aren't needed and cast everything to string
df = df[['City', 'Kitchen', 'Brand', 'Location Ref ID']]
df = df.astype(str)
records = df.to_dict(orient='records')
with open('olio_stores.json', 'w') as f:
    json.dump(records, f)
print("Dumped", len(records), "records.")
