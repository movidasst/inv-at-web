const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');

function harness(){
 const labels=[],memory=new Map(),elements=new Map();
 const ctx=new Proxy({measureText:t=>({width:t.length*8}),fillText:t=>labels.push(t)},{get:(obj,key)=>obj[key]||(()=>{})});
 const element=()=>({textContent:'',style:{},append(){},replaceChildren(){},setAttribute(){},classList:{toggle(){},remove(){},add(){}}});
 const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:()=>({...element(),getContext:()=>ctx,toDataURL:()=>'data:image/png;base64,TEST'})};
 const localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
 const window={addEventListener(){},scrollTo(){},XLSX:{utils:{book_new:()=>({Sheets:{}}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(b,s,n)=>b.Sheets[n]=s,encode_range:()=>'',sheet_to_json:s=>s.rows}}};
 const sandbox={window,document,localStorage,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,console,alert(){},confirm:()=>true};
 const source=fs.readFileSync(require.resolve('../v2.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.audit={initial,demo,warnings,captureDiagram,buildWorkbook,workbookToState,removeRecord,isWorkInProgress,switchInvestigation,save,load,renderReportHtml,setState:v=>s=v,getState:()=>s,setCy:v=>cy=v,configure:async()=>{STORAGE="test-store";storageKey=await crypto.subtle.importKey("raw",new Uint8Array(32),"AES-GCM",false,["encrypt","decrypt"])},switchWithoutRender:(v)=>{const old=render;render=()=>{};try{switchInvestigation(v)}finally{render=old}}};})();`);
 vm.runInNewContext(source,sandbox);
 return {api:window.audit,window,labels,memory,localStorage};
}
test('demo Excel roundtrip retains facts, graph and measures',()=>{const {api}=harness();const result=api.workbookToState(api.buildWorkbook(api.demo()));assert.equal(result.facts.length,12);assert.equal(result.diagram.cytoscape.length,13);assert.equal(result.actions.length,4)});
test('replacement destroys old graph before saving imported state',async()=>{const {api}=harness();await api.configure();const incoming=api.demo();let destroyed=false;api.setCy({destroy:()=>{destroyed=true},elements:()=>({jsons:()=>[{data:{id:'OLD'}}]})});api.switchWithoutRender(incoming);await api.save();assert.ok(destroyed);assert.equal(api.getState().diagram.cytoscape[0].data.id,'H08')});
test('pending facts never get a verified tree image',()=>{const {api,labels}=harness();const data=api.demo();data.facts.forEach(f=>f.status='pendiente');api.setState(data);assert.equal(api.captureDiagram(),'');assert.equal(labels.filter(t=>t.includes('HECHO VERIFICADO')).length,0);assert.ok(api.warnings().some(w=>w.includes('Nodo sin hecho verificado')))});
test('missing final is warned and never guessed',()=>{const {api}=harness();const data=api.demo();data.diagram.final='DELETED';api.setState(data);assert.ok(api.warnings().some(w=>w.includes('no existe')));assert.equal(api.captureDiagram(),'')});
test('deleting evidence clears links and invalidates affected facts',()=>{const {api}=harness();const data=api.demo();api.setState(data);api.removeRecord(data.evidence,1);assert.equal(data.facts.find(f=>f.id==='H02').evidenceId,'');assert.equal(data.facts.find(f=>f.id==='H02').status,'pendiente');assert.doesNotThrow(()=>api.workbookToState(api.buildWorkbook(data)))});
test('Excel rejects node/edge ID collisions and invalid enum values',()=>{const {api}=harness();let book=api.buildWorkbook(api.demo());book.Sheets.RELACIONES.rows[1][0]='H01';assert.throws(()=>api.workbookToState(book),/Relación inválida/);book=api.buildWorkbook(api.demo());book.Sheets.HECHOS.rows[1][3]='inventado';assert.throws(()=>api.workbookToState(book),/Valor inválido/)});
test('Excel node labels use the canonical fact text',()=>{const {api}=harness();const book=api.buildWorkbook(api.demo());book.Sheets.NODOS_ARBOL.rows[1][1]='TEXTO DIFERENTE';const data=api.workbookToState(book);assert.equal(data.diagram.cytoscape[0].data.label,data.facts.find(f=>f.id==='H08').text)});
test('report uses stable IDs after a deletion and escapes markup',()=>{const {api}=harness();const data=api.demo();data.facts.shift();data.general.description='<img src=x onerror=alert(1)>';api.setState(data);const report=api.renderReportHtml({forPdf:true});assert.match(report,/<strong>H02<\/strong>/);assert.doesNotMatch(report,/<strong>H01<\/strong>/);assert.ok(report.includes('&lt;img'))});
test('every partial form protects against unconfirmed demo replacement',()=>{const {api}=harness();for(const field of ['company','worker','place','investigator']){const data=api.initial();data.general[field]='dato';api.setState(data);assert.ok(api.isWorkInProgress())}const data=api.initial();api.setState(data);assert.equal(api.isWorkInProgress(),false);data.legal.notes='constancia';assert.ok(api.isWorkInProgress())});
test('encrypted storage roundtrips and serializes rapid saves',async()=>{const {api,memory}=harness();await api.configure();const data=api.demo();api.setState(data);const first=api.save();data.general.worker='ÚLTIMO VALOR CONFIDENCIAL';const last=api.save();await Promise.all([first,last]);const disk=memory.get('test-store');assert.ok(!disk.includes('CONFIDENCIAL'));assert.equal(JSON.parse(disk).encrypted,1);api.setState(api.initial());await api.load();assert.equal(api.getState().general.worker,'ÚLTIMO VALOR CONFIDENCIAL')});
test('corrupt storage is preserved rather than replaced with demo',async()=>{const {api,memory}=harness();await api.configure();memory.set('test-store','{"encrypted":1,"iv":"broken","data":"broken"}');await assert.rejects(api.load());assert.match(memory.get('test-store'),/broken/)});

test('contradictory evidence keeps the fact and its conjunction out of the verified report tree',()=>{
 const {api,labels}=harness();
 const data=api.demo();api.setState(data);
 assert.ok(api.captureDiagram());assert.ok(labels.includes('CONJUNCIÓN'));
 labels.length=0;
 const fact=data.facts.find(f=>f.id==='H02');
 const evidence=data.evidence.find(e=>e.id===fact.evidenceId);
 evidence.status='contradictoria';
 assert.ok(api.warnings().some(w=>w.includes('Nodo sin hecho verificado con evidencia: H02')));
 assert.ok(api.warnings().some(w=>w.includes('Conjunción incompleta')));
 assert.ok(api.captureDiagram());
 assert.ok(!labels.some(t=>t.startsWith('H02 ·')));
 assert.ok(!labels.includes('CONJUNCIÓN'));
 assert.match(api.renderReportHtml({forPdf:true}),/Por revisar · sustento insuficiente/);
 assert.equal(fact.status,'verificado');
 evidence.status='verificada';labels.length=0;
 assert.ok(api.captureDiagram());assert.ok(labels.includes('CONJUNCIÓN'));
});

test('a conjunction with one remaining antecedent is not exported as a verified relation',()=>{
 const {api,labels}=harness();
 const data=api.demo();api.setState(data);
 const removed=data.diagram.cytoscape.find(e=>e.group==='edges'&&e.data.relacion==='conjuncion');
 data.diagram.cytoscape=data.diagram.cytoscape.filter(e=>e!==removed);
 assert.ok(api.warnings().some(w=>w.includes('Conjunción incompleta')));
 assert.ok(api.captureDiagram());
 assert.ok(!labels.includes('CONJUNCIÓN'));
});

test('the final event alone does not produce an exportable causal tree',()=>{
 const {api}=harness();
 const data=api.demo();api.setState(data);
 data.diagram.cytoscape=data.diagram.cytoscape.filter(e=>e.group!=='edges'||e.data.target!==data.diagram.final);
 assert.equal(api.captureDiagram(),'');
});
