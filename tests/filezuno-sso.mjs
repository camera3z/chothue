import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5188';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5188','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://lkwnbvervvgbbvfosohi.supabase.co',VITE_SUPABASE_ANON_KEY:'test-only-publishable-placeholder',VITE_FILEZUNO_SSO:'1'},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let authorize;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/authorize')){authorize=url;await route.fulfill({contentType:'text/html',body:'<h1>Mock Supabase authorize</h1>'});}
  else await route.fulfill({contentType:'application/json',body:'{}'});
 });
 await page.goto(base);await page.locator('#filezunoSignIn').waitFor();
 assert.equal(await page.locator('#auth-form [name=email]').count(),1);
 await page.locator('#filezunoSignIn').click();await page.waitForURL('https://*.supabase.co/**');
 assert.equal(authorize.searchParams.get('provider'),'custom:filezuno');
 assert.equal(authorize.searchParams.get('redirect_to'),base+'/');
 assert.equal(authorize.searchParams.get('scopes'),'email profile');
 assert.equal(authorize.searchParams.get('code_challenge_method'),'s256');
 assert(authorize.searchParams.get('code_challenge'));
 assert(!authorize.searchParams.has('client_secret'));
 assert.deepEqual(errors,[]);
 console.log('PASS Rentbook SSO: actual Supabase SDK custom provider redirect, exact return URL, old sign-in preserved, no client secret');
}finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}
