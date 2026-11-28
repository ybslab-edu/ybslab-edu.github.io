// Compare complete normalized answers, never individual array elements against UI text.
// Static scanning only: base64, concatenation, interpolation and multilayer encodings
// remain unsupported. Never execute release code or repeatedly decode text.
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
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
// Supported named entities: amp, lt, gt, quot, apos and nbsp. Decode once only.
const htmlText=value=>value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(entity,name)=>{
 if(name[0]==='#'){
  const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):'\ufffd';
 }
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[name.toLowerCase()];
});
function htmlValues(text){
 const values=[],regions=[],tags=/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
 const add=(value,at,attribute=false)=>{values.push({value,at,attribute});const decoded=htmlText(value);if(decoded!==value)values.push({value:decoded,at,attribute});};
 const content=(end,javascript=false)=>{if(end>at){regions.push({text:text.slice(at,end),at,javascript});if(!javascript)add(text.slice(at,end),at);}};
 let at=0,tag;
 while((tag=tags.exec(text))){
  content(tag.index);
  // Comments remain public source: preserve literal-answer detection within them.
  if(tag[0].startsWith('<!--'))regions.push({text:tag[0],at:tag.index,javascript:false});
  const attrs=/[^\s=<>/]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  if(!tag[0].startsWith('<!'))for(const attr of tag[0].matchAll(attrs))add(attr[1]??attr[2]??attr[3],tag.index+attr.index,true);
  at=tags.lastIndex;
  const raw=/^<(script|style)(?=[\s/>])/i.exec(tag[0]);
  if(raw){
   // HTML raw-text elements end at their closing tag, even inside a JS comment.
   // Do not parse tag-like strings or comparisons inside script/style as markup.
   const close=new RegExp('</'+raw[1]+String.raw`(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>`,'gi');close.lastIndex=at;
   const end=close.exec(text);content(end?.index??text.length,raw[1].toLowerCase()==='script');
   at=end?close.lastIndex:text.length;tags.lastIndex=at;
  }
 }
 content(text.length);
 return {values,regions};
}
// Keep regex character classes and comments out of string parsing. In particular,
// /["']/ must not consume the opening quote of a later answer literal.
function literalTokens(text,javascript=true){
 const tokens=[],pattern=/"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|`(?:\\[\s\S]|[^`\\])*`|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_$][\w$]*|\+\+|--|[^\s]/giy;
 const comments=/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//gy;
 const regexp=/\/(?:\\[^\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\]|[^/\\[\r\n])+\/[a-z]*/giy;
 const parens=[];let expression=true,previous='',control=false;
 for(let at=0;at<text.length;){
  if(/\s/.test(text[at])){at++;continue;}
  if(javascript){comments.lastIndex=at;const comment=comments.exec(text);if(comment){at=comments.lastIndex;continue;}}
  pattern.lastIndex=at;const match=pattern.exec(text);if(!match){at++;continue;}
  const raw=match[0];at=pattern.lastIndex;
  if(javascript&&raw==='/'&&expression){
   regexp.lastIndex=match.index;const regex=regexp.exec(text);
   if(regex){tokens.push({raw:'/',at:match.index});at=regexp.lastIndex;expression=false;previous='/';control=false;continue;}
  }
  tokens.push({raw,at:match.index});
  if(raw==='('){parens.push(control);expression=true;}
  else if(raw===')')expression=parens.pop()??false;
  else if(raw===']'||raw==='}'||raw==='++'||raw==='--'||/^["'`\d]/.test(raw)||/^-\d/.test(raw))expression=false;
  else if(/^[A-Za-z_$]/.test(raw))expression=previous!=='.'&&/^(?:return|throw|yield|await|case|delete|void|typeof|instanceof|in|of|else|do)$/.test(raw);
  else expression=true;
  // A keyword after property access is a name: obj.if(x) ends an expression.
  control=previous!=='.'&&/^(?:if|while|for|with|switch|catch)$/.test(raw);
  previous=raw;
 }
 return tokens;
}
function literals(text,javascript=true){
 const values=[],tokens=literalTokens(text,javascript);
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
  // Optional computed access contains a property expression, not an array value.
  // Use tokens so whitespace and comments cannot turn ?. [index] into an array.
  if(raw==='['&&tokens[i-1]?.raw==='.'&&tokens[i-2]?.raw==='?')continue;
  if(raw==='['&&/[\w$)\]\"']$/.test(text.slice(Math.max(0,at-100),at).trimEnd())&&!/\b(?:return|yield)\s*$/.test(text.slice(Math.max(0,at-100),at)))continue;
  try{const value=valueAt(i).value;values.push({value,at});
  if(typeof value==='string'&&['`','"',"'"].includes(raw[0])&&raw.slice(1,-1)!==value)values.push({value:raw.slice(1,-1),at});
  if(typeof value==='string'&&/^\s*[\[{]/.test(value)){try{const visit=v=>{if(v&&typeof v==='object'){values.push({value:v,at});Object.values(v).forEach(visit);}};visit(JSON.parse(value));}catch{}}
 }catch{}}
 return values;
}
export function privateAnswerHits(text,answers,sourceType=/^\s*</.test(text)?'html':'script'){
 const hits=[];
 const arrays=new Set(),objects=new Set(),strings=new Set(),numbers=new Set();
 for(const answer of answers){if(Array.isArray(answer))arrays.add(signature(answer));else if(answer&&typeof answer==='object')objects.add(signature(answer));else if(typeof answer==='string')strings.add(atom(answer));else if(typeof answer==='number')numbers.add(atom(answer));}
 // Release files supply their type explicitly. Source-only callers infer fragments
 // beginning with markup. HTML text/attributes never share JS comment state.
 const html=htmlValues(text),values=sourceType==='html'
  ?html.regions.flatMap(region=>literals(region.text,region.javascript).map(value=>({...value,at:value.at+region.at})))
  :literals(text);
 if(sourceType==='html')for(const {value,at,attribute} of html.values){
  // Preserve complete serialized arrays/objects in attributes. Text regions are
  // already tokenized above, so do not count their literal values a second time.
  if(attribute&&/^\s*[\[{]/.test(value))try{
   const visit=value=>{if(value&&typeof value==='object'){values.push({value,at});Object.values(value).forEach(visit);}};visit(JSON.parse(value));
  }catch{}
 }
 for(const {value,at} of [...values,...html.values]){
  const context=text.slice(Math.max(0,at-80),at),label=/(?:answer|solution|correct|答案|解答)[\w\s"':=,[\]-]*$/i.test(context);
  let type;
  if(value&&typeof value==='object'&&!Array.isArray(value)&&objects.has(signature(value)))type='answer_object';
  if(Array.isArray(value)&&arrays.has(signature(value))){
   // Even a complete array can be an unrelated public constant. Keep blocking;
   // a match without an answer label needs review, never a vendor exemption.
   type=label?'answer_array':'answer_array_pending';
  }
  if(typeof value==='string'&&strings.has(atom(value)))type='text_answer';
  if(label&&!Array.isArray(value)&&numbers.has(atom(value)))type='numeric_answer';
  if(type)hits.push({type,at,byteOffset:Buffer.byteLength(text.slice(0,at),'utf8')});
 }
 return hits;
}
const hitError=hit=>Error('release_private_'+hit.type+(/^answer_array/.test(hit.type)?'@'+hit.at:''));
export function scanPrivateAnswers(text,answers,sourceType){
 const hit=privateAnswerHits(text,answers,sourceType)[0];if(hit)throw hitError(hit);
}

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const invalid=reason=>{throw Error('release_accepted_hits_'+reason);};
const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)
 &&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...names].sort());
const uint=value=>Number.isSafeInteger(value)&&value>=0;
const groupLabels={'risk-accepted':'使用者 11/28 接受風險','public-baseline-a':'已判 A、與公開基準逐位元組相同'};

// Only public source coordinates, full public section digests and report references
// belong here. Never serialize values, signatures, lengths or shapes from answers.
export function parseAcceptedHits(bytes){
 let list;try{list=JSON.parse(bytes.toString('utf8'));}catch{invalid('format');}
 if(!keys(list,['schemaVersion','groups'])||list.schemaVersion!==1||!Array.isArray(list.groups)
  ||list.groups.length!==2)invalid('format');
 const groups=new Set(),locations=new Set();
 for(const group of list.groups){
  if(!keys(group,['id','label','entries'])||typeof group.id!=='string'||!Object.hasOwn(groupLabels,group.id)
   ||groups.has(group.id)||group.label!==groupLabels[group.id]||!Array.isArray(group.entries))invalid('format');
  groups.add(group.id);
  for(const entry of group.entries){
   if(!keys(entry,['path','type','section','hitByteOffset','expectedHits','reports'])
    ||typeof entry.path!=='string'||!/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:m?js|json|html)$/.test(entry.path)
    ||entry.type!=='answer_array_pending'||entry.expectedHits!==1||!uint(entry.hitByteOffset)
    ||!keys(entry.section,['startByte','endByte','sha256'])||!uint(entry.section.startByte)
    ||!uint(entry.section.endByte)||entry.section.endByte<=entry.section.startByte
    ||entry.hitByteOffset<entry.section.startByte||entry.hitByteOffset>=entry.section.endByte
    ||typeof entry.section.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.section.sha256)
    ||!Array.isArray(entry.reports)||!entry.reports.length)invalid('format');
   for(const report of entry.reports){
    if(!keys(report,['path','line','hit'])||!['tasks/batch-20261127-eve/scanhits.md','tasks/batch-20261127-eve/scanhits2.md'].includes(report.path)
     ||!uint(report.line)||!report.line||!uint(report.hit)||!report.hit
     ||(group.id==='risk-accepted'?report.hit>4:report.hit<5||report.hit>9)
     ||group.id==='public-baseline-a'&&report.path.endsWith('scanhits2.md'))invalid('format');
   }
   const location=entry.path+'\0'+entry.hitByteOffset;
   if(locations.has(location))invalid('duplicate_location');locations.add(location);
  }
 }
 return list;
}
export async function readAcceptedHits(file=new URL('./scan-accepted-hits.json',import.meta.url)){
 let bytes;try{if(!(await lstat(file)).isFile())invalid('unreadable');bytes=await readFile(file);}catch{invalid('unreadable');}
 parseAcceptedHits(bytes);return bytes;
}

// Ranges are [startByte,endByte), and hitByteOffset is an absolute UTF-8 byte
// offset in the public file. Hash bytes directly, without decoding/normalizing.
// The reviewed range must contain a complete public function or declaration.
// Changes outside that range are not covered by its digest and are still scanned.
export function scanPrivateAnswerFiles(files,answers,listBytes){
 const list=parseAcceptedHits(listBytes),byPath=new Map(),entries=new Map();
 for(const file of files){if(byPath.has(file.path))invalid('duplicate_file');byPath.set(file.path,file.bytes);}
 for(const group of list.groups)for(const entry of group.entries){
  const bytes=byPath.get(entry.path),{startByte,endByte}=entry.section;
  if(!Buffer.isBuffer(bytes)||endByte>bytes.length)invalid('section_missing');
  const section=bytes.subarray(startByte,endByte);
  if(sha256(section)!==entry.section.sha256)invalid('section_changed');
  if(bytes.indexOf(section)!==startByte||bytes.indexOf(section,startByte+1)!==-1)invalid('ambiguous_section');
  entries.set(entry.path+'\0'+entry.hitByteOffset,{entry,group,count:0});
 }
 let knownAcceptedHits=0;
 const counts=Object.fromEntries(list.groups.map(group=>[group.id,0]));
 for(const file of files)for(const hit of privateAnswerHits(file.bytes.toString('utf8'),answers,file.path.endsWith('.html')?'html':'script')){
  const match=entries.get(file.path+'\0'+hit.byteOffset);
  if(!match||hit.type!==match.entry.type)throw Error(hitError(hit).message+':'+file.path);
  if(++match.count>match.entry.expectedHits)invalid('duplicate_hit');
  knownAcceptedHits++;counts[match.group.id]++;
 }
 for(const {entry,count} of entries.values())if(count!==entry.expectedHits)invalid('count_mismatch');
 return {knownAcceptedHits,acceptedHitsSha256:sha256(listBytes),knownAcceptedGroups:list.groups.map(group=>({id:group.id,label:group.label,hits:counts[group.id]})),knownAcceptedStatus:'已知放行'};
}
