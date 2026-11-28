// Compare complete normalized answers, never individual array elements against UI text.
const atom=v=>typeof v==='string'?v.normalize('NFKC').trim().replace(/\s+/g,' '):String(v);
const normalized=v=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):atom(v);
const signature=v=>JSON.stringify(normalized(v));
// Decode quoted strings and static templates without executing release code. Interpolated
// templates are not constant values and must not be treated as whole answers.
function stringValue(raw){
 const template=raw[0]==='`';
 const body=raw.slice(1,-1).replace(/\r\n?/g,'\n');let value='';
 for(let i=0;i<body.length;i++){
  if(template&&body[i]==='$'&&body[i+1]==='{')throw Error();
  if(!template&&body[i]==='\n')throw Error();
  if(body[i]!=='\\'){value+=body[i];continue;}
  const tail=body.slice(++i),hex=/^(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2}))/.exec(tail);
  if(hex){value+=String.fromCodePoint(parseInt(hex[1]||hex[2]||hex[3],16));i+=hex[0].length-1;continue;}
  if(body[i]==='\n')continue;
  value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'})[body[i]]??body[i];
 }
 return value;
}
const htmlText=value=>value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(entity,name)=>{
 if(name[0]==='#'){
  const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):'\ufffd';
 }
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[name.toLowerCase()];
});
function htmlValues(text){
 const values=[],tags=/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
 let end=0,rawTag='';
 for(const tag of text.matchAll(tags)){
  if(rawTag){if(new RegExp('^</'+rawTag+'\\s*>$','i').test(tag[0])){rawTag='';end=tag.index+tag[0].length;}continue;}
  if(tag.index>end)values.push({value:htmlText(text.slice(end,tag.index)),at:end});
  const attrs=/[^\s=<>/]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  if(!tag[0].startsWith('<!'))for(const attr of tag[0].matchAll(attrs))values.push({value:htmlText(attr[1]??attr[2]??attr[3]),at:tag.index+attr.index});
  end=tag.index+tag[0].length;
  const raw=/^<(script|style)\b/i.exec(tag[0]);if(raw)rawTag=raw[1];
 }
 if(!rawTag&&end<text.length)values.push({value:htmlText(text.slice(end)),at:end});
 return values;
}
function literals(text){
 const values=[];const pattern=/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[\[\]{},:]|[A-Za-z_$][\w$]*/gi;
 const tokens=[...text.matchAll(pattern)].map(m=>({raw:m[0],at:m.index}));
 const scalar=raw=>{if(['`','"',"'"].includes(raw[0]))return stringValue(raw);if(/^-?\d/.test(raw))return Number(raw);if(['true','false','null'].includes(raw))return JSON.parse(raw);throw Error();};
 function object(i){const result=Object.create(null);let j=i+1;
  while(j<tokens.length){if(tokens[j].raw==='}')return {value:result,end:j};
   const key=/^[A-Za-z_$][\w$]*$/.test(tokens[j].raw)?tokens[j].raw:scalar(tokens[j].raw);
   if(typeof key!=='string'||Object.hasOwn(result,key)||tokens[++j]?.raw!==':')throw Error();
   j++;const nested=valueAt(j);result[key]=nested.value;j=nested.end+1;
   if(tokens[j]?.raw===',')j++;else if(tokens[j]?.raw!=='}')throw Error();
  }throw Error();
 }
 const valueAt=i=>tokens[i].raw==='['?array(i):tokens[i].raw==='{'?object(i):{value:scalar(tokens[i].raw),end:i};
 function array(i){const result=[];let j=i+1;while(j<tokens.length){if(tokens[j].raw===']')return {value:result,end:j};let value;
  const nested=valueAt(j);value=nested.value;j=nested.end;
  result.push(value);j++;if(tokens[j]?.raw===',')j++;else if(tokens[j]?.raw!==']')throw Error();
 }throw Error();}
 for(let i=0;i<tokens.length;i++){const {raw,at}=tokens[i];
  if(raw==='['&&/[\w$)\]\"']$/.test(text.slice(Math.max(0,at-100),at).trimEnd())&&!/\b(?:return|yield)\s*$/.test(text.slice(Math.max(0,at-100),at)))continue;
  try{const value=valueAt(i).value;values.push({value,at});
  if(typeof value==='string'&&/^\s*[\[{]/.test(value)){try{const visit=v=>{if(v&&typeof v==='object'){values.push({value:v,at});Object.values(v).forEach(visit);}};visit(JSON.parse(value));}catch{}}
 }catch{}}
 return values;
}
export function scanPrivateAnswers(text,answers){
 const arrays=new Set(),objects=new Set(),strings=new Set(),numbers=new Set();
 for(const answer of answers){if(Array.isArray(answer))arrays.add(signature(answer));else if(answer&&typeof answer==='object')objects.add(signature(answer));else if(typeof answer==='string')strings.add(atom(answer));else if(typeof answer==='number')numbers.add(atom(answer));}
 const weak=new Set();
 for(const {value,at} of [...literals(text),...htmlValues(text)]){
  const context=text.slice(Math.max(0,at-80),at),label=/(?:answer|solution|correct|答案|解答)[\w\s"':=,[\]-]*$/i.test(context);
  if(value&&typeof value==='object'&&!Array.isArray(value)&&objects.has(signature(value)))throw Error('release_private_answer_object');
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
