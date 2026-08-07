import pandas as pd
import json

df = pd.read_excel('/Users/ajelhenry/Downloads/EF++ S_Z Toggle Data (1).xlsx', sheet_name='Status')
print("Columns:", df.columns.tolist())
