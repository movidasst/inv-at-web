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
 const source=fs.readFileSync(require.resolve('../v2.js'),'utf8').replace(/\}\)\(\);\s*$/,`async function withoutRender(action){const old=render;render=()=>{};try{return await action()}finally{render=old}}window.audit={initial,demo,reviewIssues,updateReviewStatus,warnings,captureDiagram,replaceSafely:(...args)=>withoutRender(()=>replaceSafely(...args)),restoreInvestigation:()=>withoutRender(restoreInvestigation),buildWorkbook,workbookToState,removeRecord,factSupported,isWorkInProgress,save,load,renderReportHtml,setState:v=>s=v,getState:()=>s,setCy:v=>cy=v,configure:async()=>{STORAGE="test-store";storageKey=await crypto.subtle.importKey("raw",new Uint8Array(32),"AES-GCM",false,["encrypt","decrypt"])},switchWithoutRender:(v)=>{const old=render;render=()=>{};try{showInvestigation(v,8);save()}finally{render=old}}};})();`);
 vm.runInNewContext(source,sandbox);
 return {api:window.audit,window,labels,memory,localStorage,elements};
}
test('demo Excel roundtrip retains facts, graph and measures',()=>{const {api}=harness();const result=api.workbookToState(api.buildWorkbook(api.demo()));assert.equal(result.facts.length,14);assert.equal(result.diagram.cytoscape.length,17);assert.equal(result.actions.length,4)});
test('replacement destroys old graph before saving imported state',async()=>{const {api}=harness();await api.configure();const incoming=api.demo();let destroyed=false;api.setCy({destroy:()=>{destroyed=true},elements:()=>({jsons:()=>[{data:{id:'OLD'}}]})});api.switchWithoutRender(incoming);await api.save();assert.ok(destroyed);assert.equal(api.getState().diagram.cytoscape[0].data.id,'H08')});
test('pending facts never get a verified tree image',()=>{const {api,labels}=harness();const data=api.demo();data.facts.forEach(f=>f.status='pendiente');api.setState(data);assert.equal(api.captureDiagram(),'');assert.equal(labels.filter(t=>t.includes('HECHO VERIFICADO')).length,0);assert.ok(api.warnings().some(w=>w.includes('Nodo sin hecho verificado')))});
test('missing final is warned and never guessed',()=>{const {api}=harness();const data=api.demo();data.diagram.final='DELETED';api.setState(data);assert.ok(api.warnings().some(w=>w.includes('no existe')));assert.equal(api.captureDiagram(),'')});
test('deleting evidence clears links and invalidates affected facts',()=>{const {api}=harness();const data=api.demo();api.setState(data);api.removeRecord(data.evidence,1);assert.equal(data.facts.find(f=>f.id==='H02').evidenceId,'');assert.equal(data.facts.find(f=>f.id==='H02').status,'pendiente');assert.doesNotThrow(()=>api.workbookToState(api.buildWorkbook(data)))});
test('Excel rejects node/edge ID collisions and invalid enum values',()=>{const {api}=harness();let book=api.buildWorkbook(api.demo());book.Sheets.RELACIONES.rows[1][0]='H01';assert.throws(()=>api.workbookToState(book),/Relación inválida/);book=api.buildWorkbook(api.demo());book.Sheets.HECHOS.rows[1][3]='inventado';assert.throws(()=>api.workbookToState(book),/Valor inválido/)});
test('Excel node labels use the canonical fact text',()=>{const {api}=harness();const book=api.buildWorkbook(api.demo());book.Sheets.NODOS_ARBOL.rows[1][1]='TEXTO DIFERENTE';const data=api.workbookToState(book);assert.equal(data.diagram.cytoscape[0].data.label,data.facts.find(f=>f.id==='H08').text)});
test('report uses stable IDs after a deletion and escapes markup',()=>{const {api}=harness();const data=api.demo();data.facts.shift();data.general.description='<img src=x onerror=alert(1)>';api.setState(data);const report=api.renderReportHtml({forPdf:true});assert.match(report,/<strong>H02<\/strong>/);assert.doesNotMatch(report,/<strong>H01<\/strong>/);assert.ok(report.includes('&lt;img'))});
test('every partial form protects against unconfirmed demo replacement',()=>{const {api}=harness();for(const field of ['company','worker','place','investigator']){const data=api.initial();data.general[field]='dato';api.setState(data);assert.ok(api.isWorkInProgress())}const data=api.initial();api.setState(data);assert.equal(api.isWorkInProgress(),false);data.legal.notes='constancia';assert.ok(api.isWorkInProgress())});
test('encrypted storage roundtrips and serializes rapid saves',async()=>{const {api,memory}=harness();await api.configure();const data=api.demo();api.setState(data);const first=api.save();data.general.worker='ÚLTIMO VALOR CONFIDENCIAL';const last=api.save();await Promise.all([first,last]);const disk=memory.get('test-store:demo');assert.ok(!disk.includes('CONFIDENCIAL'));assert.equal(JSON.parse(disk).encrypted,1);api.setState(api.initial());await api.load();assert.equal(api.getState().general.worker,'ÚLTIMO VALOR CONFIDENCIAL')});
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

test('legal review distinguishes deadlines, missing proof and invalid timestamps',()=>{
 const {api}=harness(), data=api.demo();api.setState(data);
 data.legal.inpsasel.at='2026-10-20T10:00';
 assert.ok(!api.warnings().some(w=>w.startsWith('Notificación al INPSASEL:')));
 data.legal.inpsasel.at='2026-10-20T10:01';data.legal.inpsasel.proof='   ';
 assert.ok(api.warnings().includes('Notificación al INPSASEL: Fuera de plazo.'));
 assert.ok(api.warnings().includes('Notificación al INPSASEL: sin constancia.'));
 data.legal.inpsasel.at='2026-10-20T08:59';
 assert.ok(api.warnings().includes('Notificación al INPSASEL: Fecha anterior al accidente.'));
 data.legal.inpsasel.at='2026-02-30T09:20';
 assert.ok(api.warnings().includes('Notificación al INPSASEL: Fecha de realización inválida.'));
 data.general.date='';
 assert.ok(api.warnings().includes('Declaración formal al CSSL: Sin fecha y hora válidas del accidente.'));
});

test('legal declarations roundtrip by recipient and preserve older Excel records',()=>{
 const {api}=harness(), data=api.demo();
 const roundtrip=api.workbookToState(api.buildWorkbook(data));
 assert.equal(roundtrip.legal.formalCommittee.proof,data.legal.formalCommittee.proof);
 assert.equal(roundtrip.legal.formalUnion.at,data.legal.formalUnion.at);
 const old=api.buildWorkbook(data);
 old.Sheets.ACTUACIONES.rows=old.Sheets.ACTUACIONES.rows.filter(r=>!['formalCommittee','formalUnion'].includes(r[0]));
 const imported=api.workbookToState(old);api.setState(imported);
 assert.equal(imported.legal.formal.proof,data.legal.formal.proof);
 assert.equal(imported.legal.formalCommittee.at,'');
 assert.equal(imported.legal.formalUnion.proof,'');
 assert.match(api.renderReportHtml({forPdf:true}),/Declaración formal al CSSL/);
 imported.legal.union.applies='no';
 assert.ok(!api.warnings().some(w=>/al sindicato:/.test(w)));
});

test('demo saves in a separate slot and the real investigation survives reopening',async()=>{
 const {api,memory}=harness();await api.configure();
 const real=api.initial();real.general.code='REAL-1';api.setState(real);await api.save();
 await api.replaceSafely(api.demo(),8);
 const original=memory.get('test-store');
 api.getState().general.company='Solo demo';await api.save();
 assert.equal(memory.get('test-store'),original);
 assert.ok(memory.get('test-store:demo'));
 assert.ok(!memory.has('test-store:recovery'));
 await api.load();assert.equal(api.getState().general.code,'REAL-1');
});

test('replacing a real case leaves an encrypted copy and restoring swaps the prior case',async()=>{
 const {api,memory}=harness();await api.configure();
 const before=api.initial();before.general.code='REAL-1';api.setState(before);await api.save();
 const next=api.initial();next.general.code='REAL-2';await api.replaceSafely(next,1);
 const backup=memory.get('test-store:recovery');
 assert.equal(JSON.parse(backup).encrypted,1);assert.ok(!backup.includes('REAL-1'));
 await api.restoreInvestigation();assert.equal(api.getState().general.code,'REAL-1');
 await api.restoreInvestigation();assert.equal(api.getState().general.code,'REAL-2');
});

test('a backup failure prevents replacement of the active investigation',async()=>{
 const {api,localStorage}=harness();await api.configure();
 const before=api.initial();before.general.code='REAL-1';api.setState(before);await api.save();
 const next=api.initial();next.general.code='REAL-2';
 const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k.endsWith(':recovery'))throw Error('Cuota agotada');set(k,v)};
 await assert.rejects(api.replaceSafely(next,1),/Cuota agotada/);
 assert.equal(api.getState().general.code,'REAL-1');
 await api.load();assert.equal(api.getState().general.code,'REAL-1');
});

test('review status reflects the case contents independently of the selected screen',()=>{
 const {api,elements}=harness();
 api.setState(api.initial());api.updateReviewStatus();
 assert.equal(elements.get('caseReviewStatus').textContent,'Expediente sin iniciar');
 const state=api.initial();state.general.description='Descripción parcial';
 api.setState(state);api.updateReviewStatus();
 assert.match(elements.get('caseReviewStatus').textContent,/avisos pendientes/);
});

test('report notices retain the exact stage and record needed for review',()=>{
 const {api}=harness(), data=api.demo();api.setState(data);
 data.legal.formalCommittee.proof='';
 data.facts.find(f=>f.id==='H02').evidenceId='';
 const action=data.actions[0];action.owner='';
 const issues=api.reviewIssues();
 const legal=issues.find(x=>x.text==='Declaración formal al CSSL: sin constancia.');
 assert.equal(legal.stage,2);assert.equal(legal.id,'review-legal-formalCommittee');
 assert.ok(issues.some(x=>x.stage===4&&x.id==='review-fact-H02'));
 assert.ok(issues.some(x=>x.stage===5&&x.id==='graph'&&x.element==='H02'));
 assert.ok(issues.some(x=>x.stage===7&&x.id==='review-action-'+action.id));
 const print=api.renderReportHtml({forPdf:true});
 assert.match(print,/Declaración formal al CSSL: sin constancia/);
 assert.doesNotMatch(print,/class="review-link"/);
});

test('multiple evidence links survive Excel and appear with their state in the report',()=>{
 const {api}=harness(),data=api.workbookToState(api.buildWorkbook(api.demo()));
 const fact=data.facts.find(f=>f.id==='H05');
 assert.equal(fact.evidenceId,'E04');
 assert.deepEqual(Array.from(fact.additionalEvidenceIds),['E03']);
 api.setState(data);
 const report=api.renderReportHtml({forPdf:true});
 assert.match(report,/Evidencias vinculadas[\s\S]*E04 · [^<]+ · Verificada[\s\S]*E03 · [^<]+ · Verificada/);
});
test('deleting a source keeps a verified fact if another verified source remains',()=>{
 const {api}=harness(),data=api.demo();api.setState(data);
 const fact=data.facts.find(f=>f.id==='H05');
 api.removeRecord(data.evidence,data.evidence.findIndex(e=>e.id==='E04'));
 assert.equal(fact.evidenceId,'E03');
 assert.ok(api.factSupported(fact));
 api.removeRecord(data.evidence,data.evidence.findIndex(e=>e.id==='E03'));
 assert.equal(fact.evidenceId,'');
 assert.equal(fact.status,'pendiente');
 assert.equal(api.factSupported(fact),false);
});
test('legacy workbooks remain readable and invalid supplementary evidence links are rejected',()=>{
 const {api}=harness();
 const oldBook=api.buildWorkbook(api.demo());delete oldBook.Sheets.RESPALDOS_HECHO;
 const old=api.workbookToState(oldBook);
 api.setState(old);assert.ok(api.factSupported(old.facts.find(f=>f.id==='H05')));
 for(const [row,error] of [[['H05','E04'],/duplicado/],[['H05','UNKNOWN'],/desconocida/],[['UNKNOWN','E04'],/desconocida/]]){
  const book=api.buildWorkbook(api.demo());book.Sheets.RESPALDOS_HECHO.rows.push(row);
  assert.throws(()=>api.workbookToState(book),error);
 }
});

test('disjunction roundtrips and reports both verified effects without connecting the independent fact',()=>{
 const {api,labels}=harness(),data=api.workbookToState(api.buildWorkbook(api.demo()));
 api.setState(data);
 const disjunction=data.diagram.cytoscape.filter(e=>e.data.relacion==='disyuncion');
 assert.deepEqual(Array.from(disjunction,e=>[e.data.source,e.data.target]),[['H04','H05'],['H04','H10']]);
 assert.ok(data.diagram.cytoscape.every(e=>e.data.source!=='H14'&&e.data.target!=='H14'));
 assert.match(api.renderReportHtml({forPdf:true}),/Disyunción · H04[\s\S]*Efecto H05[\s\S]*Efecto H10/);
 assert.ok(labels.includes('DISYUNCIÓN · VER DETALLE EN INFORME'));
});
test('a disjunction is pending when an effect is missing or has another recorded antecedent',()=>{
 const {api}=harness(),data=api.demo();
 api.setState(data);
 const edges=data.diagram.cytoscape;
 edges.push({group:'edges',data:{id:'EXTRA',source:'H01',target:'H10',relacion:'cadena'}});
 assert.ok(api.warnings().some(w=>w.includes('Disyunción por revisar')));
 edges.pop();
 data.diagram.cytoscape=edges.filter(e=>!(e.data.relacion==='disyuncion'&&e.data.target==='H10'));
 assert.ok(api.warnings().some(w=>w.includes('Disyunción por revisar')));
 assert.doesNotMatch(api.renderReportHtml({forPdf:true}),/Disyunciones documentadas/);
});
