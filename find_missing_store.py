import pandas as pd
import json

df = pd.read_excel('/Users/ajelhenry/Downloads/EF++ S_Z Toggle Data (1).xlsx', sheet_name='Status')

with open('eatfit_ref_ids.json', 'r') as f:
    kitchen_to_ref_ids = json.load(f)

excel_kitchens = set()
for index, row in df.iterrows():
    kitchen = str(row['Kitchen']).strip()
    excel_kitchens.add(kitchen)

json_kitchens = set(kitchen_to_ref_ids.keys())

missing_in_json = excel_kitchens - json_kitchens
print("Here is the missing 115th store (Kitchen Name in Excel that has no mapping):")
for m in missing_in_json:
    print("- " + m)
