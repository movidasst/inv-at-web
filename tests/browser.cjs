const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

(async()=>{
 const artifacts=path.resolve('test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
 const root=path.resolve('.');
 const server=http.createServer((req,res)=>{const name=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{const content=fs.readFileSync(name);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(content)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.MAC_BROWSER_CHANNEL?{channel:process.env.MAC_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*analytics.js*',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 let revoked=false,resumeCalls=0;
 const valid={ok:true,token:'a'.repeat(64),scope:'b'.repeat(64),key:'c'.repeat(64),name:'Integrante de prueba',expires_at:new Date(Date.now()+3600000).toISOString()};
 await page.route('**/rest/v1/rpc/mac_*',async route=>{const name=route.request().url().split('/').pop(),body=route.request().postDataJSON();let data={ok:false};if(name==='mac_login'&&body.p_cedula==='999000111'&&body.p_codigo==='TEST-ONLY'){revoked=false;data=valid}if(name==='mac_resume'){resumeCalls++;if(body.p_token===valid.token&&!revoked)data=valid}if(name==='mac_logout'){revoked=true;data={ok:true}}await route.fulfill({json:data})});
 const url='http://127.0.0.1:'+server.address().port;
 await page.goto(url,{waitUntil:'networkidle'});
 // A syntactically valid invented session must not open the application.
 await page.evaluate(()=>sessionStorage.setItem('movida-sst-mac-session',JSON.stringify({token:'f'.repeat(64),scope:'b'.repeat(64),expiresAt:Date.now()+3600000})));
 await page.reload({waitUntil:'networkidle'});assert.ok(resumeCalls>0);assert.ok(await page.locator('#appShell').evaluate(el=>el.hidden));
 await page.locator('#memberId').fill('999000111');await page.locator('#memberPassword').fill('TEST-ONLY');await page.locator('#loginSubmit').click();
 await page.waitForSelector('#reportPreview .printreport');await page.waitForFunction(()=>Boolean(window.XLSX?.writeFile));
 assert.ok(await page.locator('#reportPreview .report-card').count()>25);
 await page.screenshot({path:path.join(artifacts,'report.png'),fullPage:true});
 const pdfPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await(await pdfPromise).saveAs(path.join(artifacts,'demo.pdf'));
 const excelPromise=page.waitForEvent('download');await page.locator('#export').click();await(await excelPromise).saveAs(path.join(artifacts,'demo.xlsx'));
 // Import a different but internally valid graph while the old graph is alive.
 const replacement=await page.evaluate(async()=>{
  const response=await fetch('/test-artifacts/demo.xlsx'),book=XLSX.read(await response.arrayBuffer(),{type:'array'});
  const rows=XLSX.utils.sheet_to_json(book.Sheets.RELACIONES,{header:1,defval:''});rows.pop();book.Sheets.RELACIONES=XLSX.utils.aoa_to_sheet(rows);
  return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
 });
 await page.getByRole('button',{name:'Ver árbol de causas',exact:true}).click();await page.waitForSelector('#graph');
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#import').setInputFiles({name:'replacement.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(replacement)});
 await page.waitForSelector('#reportPreview');
 const afterPromise=page.waitForEvent('download');await page.locator('#export').click();await(await afterPromise).saveAs(path.join(artifacts,'after-import.xlsx'));
 const importedEdges=await page.evaluate(async()=>{const b=XLSX.read(await(await fetch('/test-artifacts/after-import.xlsx')).arrayBuffer(),{type:'array'});return XLSX.utils.sheet_to_json(b.Sheets.RELACIONES,{header:1}).length-1});assert.equal(importedEdges,2);
 // PDF pagination must retain a long company field including its last marker.
 const longBook=await page.evaluate(async()=>{const b=XLSX.read(await(await fetch('/test-artifacts/demo.xlsx')).arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(b.Sheets.GENERAL,{header:1,defval:''});rows.find(r=>r[0]==='Empresa / entidad')[1]='Empresa '+('contenido extenso '.repeat(1300))+' MARCADOR_FINAL_EMPRESA';b.Sheets.GENERAL=XLSX.utils.aoa_to_sheet(rows);return Array.from(new Uint8Array(XLSX.write(b,{type:'array',bookType:'xlsx'})))});
 await page.locator('#import').setInputFiles({name:'long.xlsx',buffer:Buffer.from(longBook),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});await page.waitForSelector('#reportPreview');
 const longPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await(await longPromise).saveAs(path.join(artifacts,'long.pdf'));
 await page.waitForFunction(()=>document.getElementById('saved').textContent.includes('Guardado cifrado'));
 const storage=await page.evaluate(()=>({disk:localStorage.getItem('mac-ve-v3-member-'+'b'.repeat(64)+':demo'),session:sessionStorage.getItem('movida-sst-mac-session')}));assert.equal(JSON.parse(storage.disk).encrypted,1);assert.ok(!storage.disk.includes('MARCADOR_FINAL'));assert.deepEqual(JSON.parse(storage.session),{token:valid.token});
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('#reportPreview');
 await page.locator('#logoutBtn').click();await page.waitForFunction(()=>document.getElementById('appShell').hidden);await page.waitForFunction(()=>document.getElementById('stage').children.length===0);assert.ok(revoked);
 assert.deepEqual(errors,[]);
 console.log('PASS browser: session validation, encrypted reload/logout, demo PDF/Excel, import while graph active, long PDF');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
