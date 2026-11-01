const {test}=require('node:test');
const assert=require('node:assert/strict');
const ready=process.env.GEMINI_LIVE_TEST==='1'&&!!process.env.GEMINI_API_KEY&&process.env.GEMINI_FREE_TIER_CONFIRMED==='1'&&process.env.GEMINI_FICTITIOUS_ONLY==='1';
test('Optional real Gemini contract smoke (fictitious data, explicit opt-in)',{skip:!ready,timeout:90000},async()=>{
 const {geminiConfiguration,listGeminiModels}=await import('../aula/evaluation/gemini.mjs');
 const {buildInput,validateModelResult}=await import('../aula/evaluation/contract.mjs');
 const {inspect}=await import('../aula/evaluation/deterministic.mjs');
 const {blankDocument}=await import('../aula/shared/models.mjs');
 const {CASE}=await import('../aula/cases/mezclador.mjs');
 const config=geminiConfiguration({...process.env,GEMINI_ENABLED:'1'});assert.ok(config.provider,'Configuración Gemini incompleta');
 const rows=await listGeminiModels({apiKey:process.env.GEMINI_API_KEY,signal:AbortSignal.timeout(15000)});
 assert.ok(rows.some(m=>m.name===`models/${config.provider.status().model}`),'Modelo configurado no disponible para esta clave');
 const document=blankDocument();document.summary='Ejercicio ficticio incompleto para verificar contrato, no para obtener nota.';
 try{const response=await config.provider.evaluate(buildInput({id:'synthetic-live-only',document},CASE,inspect(document,CASE)),{maxOutputTokens:8000});validateModelResult(response.result,document,CASE);assert.equal(response.providerId,'google-gemini');}
 catch(error){assert.fail(`La prueba real no se completó: ${error.code||'error_sanitizado'}. No se publica ninguna calificación.`)}
});
