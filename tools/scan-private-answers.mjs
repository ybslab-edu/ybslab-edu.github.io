// Compare complete normalized answers, never individual array elements against UI text.
const atom=v=>typeof v==='string'?v.normalize('NFKC').trim().replace(/\s+/g,' '):String(v);
const normalized=v=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):atom(v);
const signature=v=>JSON.stringify(normalized(v));
function literals(text){
 const values=[];const pattern=/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[\[\],]|[A-Za-z_$][\w$]*/gi;
 const tokens=[...text.matchAll(pattern)].map(m=>({raw:m[0],at:m.index}));
 const scalar=raw=>{if(raw[0]==='"')return JSON.parse(raw);if(raw[0]==="'")return JSON.parse('"'+raw.slice(1,-1).replace(/\\'/g,"'").replace(/(?<!\\)"/g,'\\"')+'"');if(/^-?\d/.test(raw))return Number(raw);throw Error();};
 function array(i){const result=[];let j=i+1;while(j<tokens.length){if(tokens[j].raw===']')return {value:result,end:j};let value;
  if(tokens[j].raw==='['){const nested=array(j);value=nested.value;j=nested.end;}else value=scalar(tokens[j].raw);
  result.push(value);j++;if(tokens[j]?.raw===',')j++;else if(tokens[j]?.raw!==']')throw Error();
 }throw Error();}
 for(let i=0;i<tokens.length;i++){const {raw,at}=tokens[i];
  if(raw==='['&&/[\w$)\]\"']$/.test(text.slice(Math.max(0,at-100),at).trimEnd())&&!/\b(?:return|yield)\s*$/.test(text.slice(Math.max(0,at-100),at)))continue;
  try{const value=raw==='['?array(i).value:scalar(raw);values.push({value,at});
  if(typeof value==='string'&&/^\s*\[/.test(value)){try{const visit=v=>{if(Array.isArray(v)){values.push({value:v,at});v.forEach(visit);}};visit(JSON.parse(value));}catch{}}
 }catch{}}
 return values;
}
export function scanPrivateAnswers(text,answers){
 const arrays=new Set(),strings=new Set(),numbers=new Set();
 for(const answer of answers){if(Array.isArray(answer))arrays.add(signature(answer));else if(typeof answer==='string')strings.add(atom(answer));else if(typeof answer==='number')numbers.add(atom(answer));}
 const weak=new Set();
 for(const {value,at} of literals(text)){
  const context=text.slice(Math.max(0,at-80),at),label=/(?:answer|solution|correct|答案|解答)[\w\s"':=,[\]-]*$/i.test(context);
  if(Array.isArray(value)&&arrays.has(signature(value))){
   // Small/common numeric arrays can be layout dimensions. Require an answer label
   // or two distinct matching private arrays; longer varied arrays identify a case.
   const flat=value.flat(Infinity).map(atom);
   const indices=flat.every((v,i)=>v===String(i))||flat.every((v,i)=>v===String(i+1));
   if(!label&&indices)continue;
   if(label||flat.length>=4&&new Set(flat).size>=3)throw Error('release_private_answer_array@'+at);
   weak.add(signature(value));if(weak.size>=2)throw Error('release_private_answer_array@'+at);
  }
  if(typeof value==='string'&&strings.has(atom(value)))throw Error('release_private_text_answer');
  if(label&&!Array.isArray(value)&&numbers.has(atom(value)))throw Error('release_private_numeric_answer');
 }
}
