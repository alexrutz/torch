import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
const ROOT='/home/user/torch';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const u=decodeURIComponent(req.url.split('?')[0]);
const p=join(ROOT,normalize(u==='/'?'/index.html':u));const b=await readFile(p);
res.writeHead(200,{'Content-Type':MIME[extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8098,r));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1000,height:600}});
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://127.0.0.1:8098/',{waitUntil:'networkidle'});
await page.click('#btn-new'); await page.waitForTimeout(2000);
const out = await page.evaluate(async ()=>{
  const g=window.game;
  const {villageCaveMouth}=await import('/src/world/worldgen.js');
  const vm=villageCaveMouth(g.seed);
  g.changeDimension('cave',vm.x,vm.y);
  g.player.inventory.slots[0]={id:'torch',count:5}; g.player.inventory.selected=0;
  await new Promise(r=>setTimeout(r,900));
  const lm=g.lightMap, px=g.player.tx, py=g.player.ty;
  const profile=[];
  for(let d=0;d<=14;d++){
    const b=lm.brightness(px+d,py);
    const s=lm.sample(px+d,py);
    profile.push({d, b:+b.toFixed(3), rgb:s.map(v=>+v.toFixed(2)),
      solid: g.world.isSolid(px+d,py)});
  }
  return {
    sources: g._lights.length,
    carried: g.player.carriedLight(),
    ambient: g.lightMap.sample(px+40,py+40),
    profile,
    heldItem: g.player.inventory.held,
  };
});
console.log('light sources in view:',out.sources);
console.log('carried:',JSON.stringify(out.carried));
console.log('held:',JSON.stringify(out.heldItem));
console.log('ambient far away:',out.ambient.map(v=>+v.toFixed(3)));
console.log('\ndist | brightness | rgb                  | wall?');
for(const p of out.profile)
  console.log(String(p.d).padStart(4),'|',String(p.b).padEnd(10),'|',JSON.stringify(p.rgb).padEnd(20),'|',p.solid?'WALL':'');
await browser.close(); server.close();
