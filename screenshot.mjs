import puppeteer from "puppeteer";

const URL = process.argv[2] || "http://localhost:3000";
const OUTPUT = process.argv[3] || "screenshot.png";
const WIDTH = parseInt(process.argv[4] || "1280", 10);
const HEIGHT = parseInt(process.argv[5] || "800", 10);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 15000 });
await page.screenshot({ path: OUTPUT, fullPage: true });
await browser.close();

console.log(`Screenshot saved to ${OUTPUT}`);
