import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error));
  
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000); // wait for 3s to let things initialize
  
  await browser.close();
})();
