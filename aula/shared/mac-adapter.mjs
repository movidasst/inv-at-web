// Interoperability boundary with the professional v2 document, not its auth/storage.
export function toProfessionalDocument(d,c){
 return {version:2,general:{code:`AULA-${c.id}`,company:c.organization,place:'Planta simulada',date:'2026-10-14',time:'',description:d.summary,worker:'Persona ficticia',job:'',consequence:'',investigator:'Ejercicio académico',role:'',delegates:'',team:'',emergency:''},legal:{inpsasel:{at:'',proof:''},committee:{at:'',proof:''},union:{at:'',proof:'',applies:'por_confirmar'},formal:{at:'',proof:''},notes:d.obligations},
 evidence:d.evidence.map(e=>({id:e.id,type:c.sources.find(s=>s.id===e.sourceId).type,source:c.sources.find(s=>s.id===e.sourceId).title,date:'',description:e.note,status:e.classification==='comprobado'?'verificada':'pendiente'})),
 timeline:d.timeline.map(t=>({id:t.id,when:t.when,text:t.text,source:t.evidenceId})),facts:d.facts.map(f=>({...f})),
 diagram:{cytoscape:[...d.tree.nodes.map(id=>({group:'nodes',data:{id,label:d.facts.find(f=>f.id===id).text}})),...d.tree.edges.map(e=>({group:'edges',data:{id:e.id,source:e.source,target:e.target,relacion:e.type,relacionTexto:e.type==='conjuncion'?'conjunción':''}}))],seq:1,final:d.tree.final},analyses:{},
 actions:d.measures.map(m=>({id:m.id,factId:m.factId,type:m.type,description:m.description,owner:m.owner,due:m.due,verification:`${m.indicator}\nCriterio de eficacia: ${m.effectiveness}`,status:'pendiente',result:''})),conclusion:d.conclusion,limits:d.limitations,reviewDate:''};
}
