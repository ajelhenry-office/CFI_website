from bs4 import BeautifulSoup

with open('public/zomato_store_time/zomato_timings_dump.html', 'r') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
inputs = soup.find_all('input')
print("Total inputs:", len(inputs))
for i in inputs:
    print(i)
    
selects = soup.find_all('select')
print("\nTotal selects:", len(selects))

print("\nLooking for elements containing '10:00 AM'")
for el in soup.find_all(string=lambda text: text and "10:00 AM" in text):
    print("Found in:", el.parent.name, el.parent.attrs)
