import {ensure,shape} from '../shared/models.mjs';
import {EVALUATION_RUBRIC} from '../shared/evaluation-rubric.mjs';
// Offline metric calculator. References must be rated independently by specialists.
export function concordance(pairs,{toleranceByCriterion,totalTolerance}={}){
 ensure(Array.isArray(pairs)&&pairs.length>1,'Se requieren pares de calibración');
 ensure(Number.isFinite(totalTolerance)&&totalTolerance>=0,'Falta tolerancia total aprobada');
 shape(toleranceByCriterion,EVALUATION_RUBRIC.map(c=>c.id));
 const delta=Object.fromEntries(EVALUATION_RUBRIC.map(c=>[c.id,[]])),totalDelta=[],groups=new Map();
 for(const pair of pairs){shape(pair,['human','automatic','group','alternative']);ensure(typeof pair.group==='string'&&typeof pair.alternative==='boolean','Estrato inválido');let h=0,a=0;
  for(const key of ['human','automatic'])shape(pair[key],EVALUATION_RUBRIC.map(c=>c.id));
  for(const c of EVALUATION_RUBRIC){ensure(Number.isFinite(toleranceByCriterion[c.id])&&toleranceByCriterion[c.id]>=0,'Tolerancia inválida');for(const key of ['human','automatic'])ensure(Number.isFinite(pair[key][c.id])&&pair[key][c.id]>=0&&pair[key][c.id]<=c.max,'Puntaje de calibración inválido');delta[c.id].push(pair.automatic[c.id]-pair.human[c.id]);h+=pair.human[c.id];a+=pair.automatic[c.id]}
  totalDelta.push(a-h);if(!groups.has(pair.group))groups.set(pair.group,[]);groups.get(pair.group).push(a-h);
 }
 const stats=(d,tolerance)=>({n:d.length,mae:d.reduce((n,x)=>n+Math.abs(x),0)/d.length,bias:d.reduce((n,x)=>n+x,0)/d.length,rmse:Math.sqrt(d.reduce((n,x)=>n+x*x,0)/d.length),withinTolerance:d.filter(x=>Math.abs(x)<=tolerance).length/d.length});
 return {criteria:Object.fromEntries(EVALUATION_RUBRIC.map(c=>[c.id,stats(delta[c.id],toleranceByCriterion[c.id])])),total:stats(totalDelta,totalTolerance),groups:Object.fromEntries([...groups].map(([g,d])=>[g,stats(d,totalTolerance)])),alternativeCases:pairs.filter(p=>p.alternative).length,approvedForPublication:false};
}
