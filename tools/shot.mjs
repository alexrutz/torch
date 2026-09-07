// Screenshots an arbitrary page from the project, full height.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
const ROOT = process.cwd();
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{try{
  const u=decodeURIComponent(req.url.split('?')[0]);
  const fp=join(ROOT,normalize(u==='/'?'/index.html':u));
  const b=await readFile(fp);
  res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(b);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8096,r));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:+(process.argv[4]||1000),height:800}});
page.on('pageerror',e=>console.log('ERR',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
await page.goto('http://127.0.0.1:8096'+process.argv[2],{waitUntil:'networkidle'});
await page.waitForTimeout(800);
await page.screenshot({path:process.argv[3],fullPage:true});
console.log('wrote',process.argv[3]);
await browser.close(); server.close();
