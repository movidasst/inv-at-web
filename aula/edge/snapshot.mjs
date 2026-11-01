import {createHash} from 'node:crypto';
// Postgres jsonb reorders object keys. Array order remains semantically significant.
function ordered(value){if(Array.isArray(value))return value.map(ordered);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])]));return value}
export const academicSnapshotHash=(document,c)=>createHash('sha256').update(JSON.stringify(ordered([c.id,c.version,document]))).digest('hex');
