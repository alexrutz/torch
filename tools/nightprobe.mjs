import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
const ROOT='/home/user/torch';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const u=decodeURIComponent(req.url.split('?')[0]);
const fp=join(ROOT,normalize(u==='/'?'/index.html':u));
const b=await readFile(fp);
res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8097,r));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1000,height:600}});
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://127.0.0.1:8097/',{waitUntil:'networkidle'});
await page.click('#btn-new'); await page.waitForTimeout(1800);
const out=await page.evaluate(async()=>{
  const g=window.game;
  g.clock.elapsed += 720*0.62;                 // deep night
  // walk the player out of the village to sample unlit wilderness
  const rows=[];
  for(const d of [0,6,12,18,24,32,45,60]){
    g.player.x += 0; 
    const tx=g.player.tx+d, ty=g.player.ty;
    g.camera.snapTo(g.player.x, g.player.y);
    rows.push({d,tx,ty});
  }
  await new Promise(r=>setTimeout(r,700));
  const lm=g.lightMap;
  return {
    ambient: g.clock.ambient().map(v=>+v.toFixed(3)),
    time: g.clock.clockText,
    gridW: lm.w, gridH: lm.h,
    samples: rows.map(r=>({d:r.d, b:+lm.brightness(r.tx,r.ty).toFixed(3)})),
    sources: g._lights.length,
    strongest: g._lights.map(l=>+l.strength.toFixed(2)).sort((a,b)=>b-a).slice(0,6),
  };
});
console.log('time',out.time,'ambient',out.ambient,'grid',out.gridW+'x'+out.gridH);
console.log('light sources in view:',out.sources,'strengths:',out.strongest.join(', '));
console.log('brightness at tiles east of spawn:');
for(const s of out.samples) console.log('  +'+String(s.d).padStart(2),'tiles:', s.b);
await browser.close(); server.close();
