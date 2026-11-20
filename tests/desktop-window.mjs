// Exercise the same Chromium --app window mode used by the Windows launcher.
// This checks engine behavior, not Windows installation or Start-menu integration.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const profile=await mkdtemp(join(tmpdir(),'rentbook-desktop-window-'));
const server=createServer((request,response)=>{
  response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  response.end('<!doctype html><html lang="vi"><title>Rentbook Desktop fixture</title><h1>Rentbook Desktop</h1></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context;
try{
  const origin='http://127.0.0.1:'+server.address().port;
  context=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--app='+origin],
  });
  const page=context.pages()[0];await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>matchMedia('(display-mode: standalone)').matches),true);
  assert.equal(await page.evaluate(()=>matchMedia('(display-mode: browser)').matches),false);
  await page.goto(origin+'/?code=fixture-return');
  assert.equal(new URL(page.url()).searchParams.get('code'),'fixture-return');
  assert.equal(await page.evaluate(()=>matchMedia('(display-mode: standalone)').matches),true);
  console.log('PASS desktop app window: standalone mode, no browser-mode display, callback query preserved');
}finally{await context?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true})}
