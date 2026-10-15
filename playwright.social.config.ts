import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'e2e',testMatch:['social-agency.spec.ts','moderation.spec.ts'],workers:1,timeout:60000,
 use:{baseURL:'http://127.0.0.1:5175',browserName:'chromium',viewport:{width:1440,height:1000},headless:true,screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:'node --import tsx scripts/social-qa.ts',url:'http://127.0.0.1:5175',reuseExistingServer:false,timeout:30000}});
