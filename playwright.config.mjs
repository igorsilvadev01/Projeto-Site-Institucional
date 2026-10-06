import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const testData = process.env.PORTFOLIO_TEST_DATA_DIR || mkdtempSync(path.join(os.tmpdir(),"portfolio-browser-"));
process.env.PORTFOLIO_TEST_DATA_DIR = testData;
export default defineConfig({
  testDir:"./tests",
  testMatch:"browser.spec.mjs",
  fullyParallel:false,
  workers:1,
  timeout:60000,
  reporter:"list",
  use:{baseURL:"http://127.0.0.1:3100",viewport:{width:1440,height:1000},browserName:"chromium",channel:process.env.PLAYWRIGHT_CHANNEL || "msedge",screenshot:"only-on-failure",trace:"retain-on-failure"},
  webServer:{
    command:"node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url:"http://127.0.0.1:3100",reuseExistingServer:false,timeout:60000,
    env:{PORTFOLIO_BROWSER_TEST:"true",NEXT_PUBLIC_WHATSAPP:"5511999999999",NEXT_PUBLIC_CONTACT_EMAIL:"contato@example.com",PORTFOLIO_DATA_DIR:testData,SITE_URL:"http://127.0.0.1:3100",ALLOW_INDEXING:"false",SMTP_HOST:"",SMTP_USER:"",SMTP_PASS:"",MAIL_FROM:"",CONTACT_EMAIL:"",NODE_ENV:"development"},
  },
});
