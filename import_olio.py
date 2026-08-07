import pandas as pd
import psycopg2
import json

df = pd.read_excel('/Users/ajelhenry/Downloads/CT - Olio++.xlsx', sheet_name='Test Sheet')

# Filter valid rows (assuming Ref ID is in 'Location Ref ID' or similar)
# Let's see columns first
print(df.columns)
