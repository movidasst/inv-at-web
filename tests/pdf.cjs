const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{
 const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
 const {createCanvas}=require('@napi-rs/canvas');
 for(const name of ['demo','long']){
  const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join('test-artifacts',name+'.pdf'))),useSystemFonts:true,disableFontFace:true}).promise;
  let text='';const out=[];
  for(let i=1;i<=doc.numPages;i++){
   const page=await doc.getPage(i),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
   for(const item of content.items){text+=item.str+' ';const x=item.transform[4],y=item.transform[5];if(item.str.trim()&&(x<0||x+item.width>viewport.width+2||y<0||y>viewport.height+2))out.push({page:i,text:item.str.slice(0,80),x,y,width:item.width})}
   if(i===1||i===doc.numPages){const view=page.getViewport({scale:1.4}),canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;fs.writeFileSync(path.join('test-artifacts',name+'-'+i+'.png'),canvas.toBuffer('image/png'))}
  }
  assert.deepEqual(out,[],name+': text outside page bounds');
  assert.ok(text.includes('Accidente de trabajo'));assert.ok(text.includes('H02'));if(name==='long')assert.ok(text.includes('MARCADOR_FINAL_EMPRESA'));
  console.log('PASS PDF',name,doc.numPages,'pages, text bounds and content checked; cover/tree rendered');
 }
})().catch(error=>{console.error(error);process.exitCode=1});
