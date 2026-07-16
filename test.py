from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time

chrome_options = Options()
chrome_options.add_argument('--headless')
driver = webdriver.Chrome(options=chrome_options)

driver.get('http://localhost:8000/proxy.html')
time.sleep(1)

print("Current URL:", driver.current_url)
links = driver.find_elements(By.CLASS_NAME, 'nav-item')
for link in links:
    if link.text == 'Experience':
        print("Clicking Experience...")
        link.click()
        time.sleep(2)
        print("New URL:", driver.current_url)
        break

driver.quit()
