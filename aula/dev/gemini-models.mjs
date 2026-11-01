import {listGeminiModels} from '../evaluation/gemini.mjs';
if(!process.env.GEMINI_API_KEY){console.log('GEMINI_API_KEY no configurada; catálogo del proyecto no consultado.');}
else try{const rows=await listGeminiModels({apiKey:process.env.GEMINI_API_KEY,signal:AbortSignal.timeout(15000)});console.log(JSON.stringify(rows,null,2));}
catch(e){console.error(`No se pudo consultar el catálogo: ${e.code||'error_sanitizado'}`);process.exitCode=1}
