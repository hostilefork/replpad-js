class Text{constructor(){}
lineAt(pos){if(pos<0||pos>this.length)
throw new RangeError(`Invalid position ${pos} in document of length ${this.length}`);return this.lineInner(pos,false,1,0);}
line(n){if(n<1||n>this.lines)
throw new RangeError(`Invalid line number ${n} in ${this.lines}-line document`);return this.lineInner(n,true,1,0);}
replace(from,to,text){let parts=[];this.decompose(0,from,parts,2);if(text.length)
text.decompose(0,text.length,parts,1|2);this.decompose(to,this.length,parts,1);return TextNode.from(parts,this.length-(to-from)+text.length);}
append(other){return this.replace(this.length,this.length,other);}
slice(from,to=this.length){let parts=[];this.decompose(from,to,parts,0);return TextNode.from(parts,to-from);}
eq(other){if(other==this)
return true;if(other.length!=this.length||other.lines!=this.lines)
return false;let start=this.scanIdentical(other,1),end=this.length-this.scanIdentical(other,-1);let a=new RawTextCursor(this),b=new RawTextCursor(other);for(let skip=start,pos=start;;){a.next(skip);b.next(skip);skip=0;if(a.lineBreak!=b.lineBreak||a.done!=b.done||a.value!=b.value)
return false;pos+=a.value.length;if(a.done||pos>=end)
return true;}}
iter(dir=1){return new RawTextCursor(this,dir);}
iterRange(from,to=this.length){return new PartialTextCursor(this,from,to);}
iterLines(from,to){let inner;if(from==null){inner=this.iter();}
else{if(to==null)
to=this.lines+1;let start=this.line(from).from;inner=this.iterRange(start,Math.max(start,to==this.lines+1?this.length:to<=1?0:this.line(to-1).to));}
return new LineCursor(inner);}
toString(){return this.sliceString(0);}
toJSON(){let lines=[];this.flatten(lines);return lines;}
static of(text){if(text.length==0)
throw new RangeError("A document must have at least one line");if(text.length==1&&!text[0])
return Text.empty;return text.length<=32?new TextLeaf(text):TextNode.from(TextLeaf.split(text,[]));}}
class TextLeaf extends Text{constructor(text,length=textLength(text)){super();this.text=text;this.length=length;}
get lines(){return this.text.length;}
get children(){return null;}
lineInner(target,isLine,line,offset){for(let i=0;;i++){let string=this.text[i],end=offset+string.length;if((isLine?line:end)>=target)
return new Line(offset,end,line,string);offset=end+1;line++;}}
decompose(from,to,target,open){let text=from<=0&&to>=this.length?this:new TextLeaf(sliceText(this.text,from,to),Math.min(to,this.length)-Math.max(0,from));if(open&1){let prev=target.pop();let joined=appendText(text.text,prev.text.slice(),0,text.length);if(joined.length<=32){target.push(new TextLeaf(joined,prev.length+text.length));}
else{let mid=joined.length>>1;target.push(new TextLeaf(joined.slice(0,mid)),new TextLeaf(joined.slice(mid)));}}
else{target.push(text);}}
replace(from,to,text){if(!(text instanceof TextLeaf))
return super.replace(from,to,text);let lines=appendText(this.text,appendText(text.text,sliceText(this.text,0,from)),to);let newLen=this.length+text.length-(to-from);if(lines.length<=32)
return new TextLeaf(lines,newLen);return TextNode.from(TextLeaf.split(lines,[]),newLen);}
sliceString(from,to=this.length,lineSep="\n"){let result="";for(let pos=0,i=0;pos<=to&&i<this.text.length;i++){let line=this.text[i],end=pos+line.length;if(pos>from&&i)
result+=lineSep;if(from<end&&to>pos)
result+=line.slice(Math.max(0,from-pos),to-pos);pos=end+1;}
return result;}
flatten(target){for(let line of this.text)
target.push(line);}
scanIdentical(){return 0;}
static split(text,target){let part=[],len=-1;for(let line of text){part.push(line);len+=line.length+1;if(part.length==32){target.push(new TextLeaf(part,len));part=[];len=-1;}}
if(len>-1)
target.push(new TextLeaf(part,len));return target;}}
class TextNode extends Text{constructor(children,length){super();this.children=children;this.length=length;this.lines=0;for(let child of children)
this.lines+=child.lines;}
lineInner(target,isLine,line,offset){for(let i=0;;i++){let child=this.children[i],end=offset+child.length,endLine=line+child.lines-1;if((isLine?endLine:end)>=target)
return child.lineInner(target,isLine,line,offset);offset=end+1;line=endLine+1;}}
decompose(from,to,target,open){for(let i=0,pos=0;pos<=to&&i<this.children.length;i++){let child=this.children[i],end=pos+child.length;if(from<=end&&to>=pos){let childOpen=open&((pos<=from?1:0)|(end>=to?2:0));if(pos>=from&&end<=to&&!childOpen)
target.push(child);else
child.decompose(from-pos,to-pos,target,childOpen);}
pos=end+1;}}
replace(from,to,text){if(text.lines<this.lines)
for(let i=0,pos=0;i<this.children.length;i++){let child=this.children[i],end=pos+child.length;if(from>=pos&&to<=end){let updated=child.replace(from-pos,to-pos,text);let totalLines=this.lines-child.lines+updated.lines;if(updated.lines<(totalLines>>(5-1))&&updated.lines>(totalLines>>(5+1))){let copy=this.children.slice();copy[i]=updated;return new TextNode(copy,this.length-(to-from)+text.length);}
return super.replace(pos,end,updated);}
pos=end+1;}
return super.replace(from,to,text);}
sliceString(from,to=this.length,lineSep="\n"){let result="";for(let i=0,pos=0;i<this.children.length&&pos<=to;i++){let child=this.children[i],end=pos+child.length;if(pos>from&&i)
result+=lineSep;if(from<end&&to>pos)
result+=child.sliceString(from-pos,to-pos,lineSep);pos=end+1;}
return result;}
flatten(target){for(let child of this.children)
child.flatten(target);}
scanIdentical(other,dir){if(!(other instanceof TextNode))
return 0;let length=0;let[iA,iB,eA,eB]=dir>0?[0,0,this.children.length,other.children.length]:[this.children.length-1,other.children.length-1,-1,-1];for(;;iA+=dir,iB+=dir){if(iA==eA||iB==eB)
return length;let chA=this.children[iA],chB=other.children[iB];if(chA!=chB)
return length+chA.scanIdentical(chB,dir);length+=chA.length+1;}}
static from(children,length=children.reduce((l,ch)=>l+ch.length+1,-1)){let lines=0;for(let ch of children)
lines+=ch.lines;if(lines<32){let flat=[];for(let ch of children)
ch.flatten(flat);return new TextLeaf(flat,length);}
let chunk=Math.max(32,lines>>5),maxChunk=chunk<<1,minChunk=chunk>>1;let chunked=[],currentLines=0,currentLen=-1,currentChunk=[];function add(child){let last;if(child.lines>maxChunk&&child instanceof TextNode){for(let node of child.children)
add(node);}
else if(child.lines>minChunk&&(currentLines>minChunk||!currentLines)){flush();chunked.push(child);}
else if(child instanceof TextLeaf&&currentLines&&(last=currentChunk[currentChunk.length-1])instanceof TextLeaf&&child.lines+last.lines<=32){currentLines+=child.lines;currentLen+=child.length+1;currentChunk[currentChunk.length-1]=new TextLeaf(last.text.concat(child.text),last.length+1+child.length);}
else{if(currentLines+child.lines>chunk)
flush();currentLines+=child.lines;currentLen+=child.length+1;currentChunk.push(child);}}
function flush(){if(currentLines==0)
return;chunked.push(currentChunk.length==1?currentChunk[0]:TextNode.from(currentChunk,currentLen));currentLen=-1;currentLines=currentChunk.length=0;}
for(let child of children)
add(child);flush();return chunked.length==1?chunked[0]:new TextNode(chunked,length);}}
Text.empty=new TextLeaf([""],0);function textLength(text){let length=-1;for(let line of text)
length+=line.length+1;return length;}
function appendText(text,target,from=0,to=1e9){for(let pos=0,i=0,first=true;i<text.length&&pos<=to;i++){let line=text[i],end=pos+line.length;if(end>=from){if(end>to)
line=line.slice(0,to-pos);if(pos<from)
line=line.slice(from-pos);if(first){target[target.length-1]+=line;first=false;}
else
target.push(line);}
pos=end+1;}
return target;}
function sliceText(text,from,to){return appendText(text,[""],from,to);}
class RawTextCursor{constructor(text,dir=1){this.dir=dir;this.done=false;this.lineBreak=false;this.value="";this.nodes=[text];this.offsets=[dir>0?1:(text instanceof TextLeaf?text.text.length:text.children.length)<<1];}
nextInner(skip,dir){this.done=this.lineBreak=false;for(;;){let last=this.nodes.length-1;let top=this.nodes[last],offsetValue=this.offsets[last],offset=offsetValue>>1;let size=top instanceof TextLeaf?top.text.length:top.children.length;if(offset==(dir>0?size:0)){if(last==0){this.done=true;this.value="";return this;}
if(dir>0)
this.offsets[last-1]++;this.nodes.pop();this.offsets.pop();}
else if((offsetValue&1)==(dir>0?0:1)){this.offsets[last]+=dir;if(skip==0){this.lineBreak=true;this.value="\n";return this;}
skip--;}
else if(top instanceof TextLeaf){let next=top.text[offset+(dir<0?-1:0)];this.offsets[last]+=dir;if(next.length>Math.max(0,skip)){this.value=skip==0?next:dir>0?next.slice(skip):next.slice(0,next.length-skip);return this;}
skip-=next.length;}
else{let next=top.children[offset+(dir<0?-1:0)];if(skip>next.length){skip-=next.length;this.offsets[last]+=dir;}
else{if(dir<0)
this.offsets[last]--;this.nodes.push(next);this.offsets.push(dir>0?1:(next instanceof TextLeaf?next.text.length:next.children.length)<<1);}}}}
next(skip=0){if(skip<0){this.nextInner(-skip,(-this.dir));skip=this.value.length;}
return this.nextInner(skip,this.dir);}}
class PartialTextCursor{constructor(text,start,end){this.value="";this.done=false;this.cursor=new RawTextCursor(text,start>end?-1:1);this.pos=start>end?text.length:0;this.from=Math.min(start,end);this.to=Math.max(start,end);}
nextInner(skip,dir){if(dir<0?this.pos<=this.from:this.pos>=this.to){this.value="";this.done=true;return this;}
skip+=Math.max(0,dir<0?this.pos-this.to:this.from-this.pos);let limit=dir<0?this.pos-this.from:this.to-this.pos;if(skip>limit)
skip=limit;limit-=skip;let{value}=this.cursor.next(skip);this.pos+=(value.length+skip)*dir;this.value=value.length<=limit?value:dir<0?value.slice(value.length-limit):value.slice(0,limit);this.done=!this.value;return this;}
next(skip=0){if(skip<0)
skip=Math.max(skip,this.from-this.pos);else if(skip>0)
skip=Math.min(skip,this.to-this.pos);return this.nextInner(skip,this.cursor.dir);}
get lineBreak(){return this.cursor.lineBreak&&this.value!="";}}
class LineCursor{constructor(inner){this.inner=inner;this.afterBreak=true;this.value="";this.done=false;}
next(skip=0){let{done,lineBreak,value}=this.inner.next(skip);if(done){this.done=true;this.value="";}
else if(lineBreak){if(this.afterBreak){this.value="";}
else{this.afterBreak=true;this.next();}}
else{this.value=value;this.afterBreak=false;}
return this;}
get lineBreak(){return false;}}
if(typeof Symbol!="undefined"){Text.prototype[Symbol.iterator]=function(){return this.iter();};RawTextCursor.prototype[Symbol.iterator]=PartialTextCursor.prototype[Symbol.iterator]=LineCursor.prototype[Symbol.iterator]=function(){return this;};}
class Line{constructor(from,to,number,text){this.from=from;this.to=to;this.number=number;this.text=text;}
get length(){return this.to-this.from;}}
let extend="lc,34,7n,7,7b,19,,,,2,,2,,,20,b,1c,l,g,,2t,7,2,6,2,2,,4,z,,u,r,2j,b,1m,9,9,,o,4,,9,,3,,5,17,3,3b,f,,w,1j,,,,4,8,4,,3,7,a,2,t,,1m,,,,2,4,8,,9,,a,2,q,,2,2,1l,,4,2,4,2,2,3,3,,u,2,3,,b,2,1l,,4,5,,2,4,,k,2,m,6,,,1m,,,2,,4,8,,7,3,a,2,u,,1n,,,,c,,9,,14,,3,,1l,3,5,3,,4,7,2,b,2,t,,1m,,2,,2,,3,,5,2,7,2,b,2,s,2,1l,2,,,2,4,8,,9,,a,2,t,,20,,4,,2,3,,,8,,29,,2,7,c,8,2q,,2,9,b,6,22,2,r,,,,,,1j,e,,5,,2,5,b,,10,9,,2u,4,,6,,2,2,2,p,2,4,3,g,4,d,,2,2,6,,f,,jj,3,qa,3,t,3,t,2,u,2,1s,2,,7,8,,2,b,9,,19,3,3b,2,y,,3a,3,4,2,9,,6,3,63,2,2,,1m,,,7,,,,,2,8,6,a,2,,1c,h,1r,4,1c,7,,,5,,14,9,c,2,w,4,2,2,,3,1k,,,2,3,,,3,1m,8,2,2,48,3,,d,,7,4,,6,,3,2,5i,1m,,5,ek,,5f,x,2da,3,3x,,2o,w,fe,6,2x,2,n9w,4,,a,w,2,28,2,7k,,3,,4,,p,2,5,,47,2,q,i,d,,12,8,p,b,1a,3,1c,,2,4,2,2,13,,1v,6,2,2,2,2,c,,8,,1b,,1f,,,3,2,2,5,2,,,16,2,8,,6m,,2,,4,,fn4,,kh,g,g,g,a6,2,gt,,6a,,45,5,1ae,3,,2,5,4,14,3,4,,4l,2,fx,4,ar,2,49,b,4w,,1i,f,1k,3,1d,4,2,2,1x,3,10,5,,8,1q,,c,2,1g,9,a,4,2,,2n,3,2,,,2,6,,4g,,3,8,l,2,1l,2,,,,,m,,e,7,3,5,5f,8,2,3,,,n,,29,,2,6,,,2,,,2,,2,6j,,2,4,6,2,,2,r,2,2d,8,2,,,2,2y,,,,2,6,,,2t,3,2,4,,5,77,9,,2,6t,,a,2,,,4,,40,4,2,2,4,,w,a,14,6,2,4,8,,9,6,2,3,1a,d,,2,ba,7,,6,,,2a,m,2,7,,2,,2,3e,6,3,,,2,,7,,,20,2,3,,,,9n,2,f0b,5,1n,7,t4,,1r,4,29,,f5k,2,43q,,,3,4,5,8,8,2,7,u,4,44,3,1iz,1j,4,1e,8,,e,,m,5,,f,11s,7,,h,2,7,,2,,5,79,7,c5,4,15s,7,31,7,240,5,gx7k,2o,3k,6o".split(",").map(s=>s?parseInt(s,36):1);for(let i=1;i<extend.length;i++)
extend[i]+=extend[i-1];function isExtendingChar(code){for(let i=1;i<extend.length;i+=2)
if(extend[i]>code)
return extend[i-1]<=code;return false;}
function isRegionalIndicator(code){return code>=0x1F1E6&&code<=0x1F1FF;}
const ZWJ=0x200d;function findClusterBreak(str,pos,forward=true,includeExtending=true){return(forward?nextClusterBreak:prevClusterBreak)(str,pos,includeExtending);}
function nextClusterBreak(str,pos,includeExtending){if(pos==str.length)
return pos;if(pos&&surrogateLow(str.charCodeAt(pos))&&surrogateHigh(str.charCodeAt(pos-1)))
pos--;let prev=codePointAt(str,pos);pos+=codePointSize(prev);while(pos<str.length){let next=codePointAt(str,pos);if(prev==ZWJ||next==ZWJ||includeExtending&&isExtendingChar(next)){pos+=codePointSize(next);prev=next;}
else if(isRegionalIndicator(next)){let countBefore=0,i=pos-2;while(i>=0&&isRegionalIndicator(codePointAt(str,i))){countBefore++;i-=2;}
if(countBefore%2==0)
break;else
pos+=2;}
else{break;}}
return pos;}
function prevClusterBreak(str,pos,includeExtending){while(pos>0){let found=nextClusterBreak(str,pos-2,includeExtending);if(found<pos)
return found;pos--;}
return 0;}
function surrogateLow(ch){return ch>=0xDC00&&ch<0xE000;}
function surrogateHigh(ch){return ch>=0xD800&&ch<0xDC00;}
function codePointAt(str,pos){let code0=str.charCodeAt(pos);if(!surrogateHigh(code0)||pos+1==str.length)
return code0;let code1=str.charCodeAt(pos+1);if(!surrogateLow(code1))
return code0;return((code0-0xd800)<<10)+(code1-0xdc00)+0x10000;}
function codePointSize(code){return code<0x10000?1:2;}
const DefaultSplit=/\r\n?|\n/;var MapMode=(function(MapMode){MapMode[MapMode["Simple"]=0]="Simple";MapMode[MapMode["TrackDel"]=1]="TrackDel";MapMode[MapMode["TrackBefore"]=2]="TrackBefore";MapMode[MapMode["TrackAfter"]=3]="TrackAfter";return MapMode})(MapMode||(MapMode={}));class ChangeDesc{constructor(sections){this.sections=sections;}
get length(){let result=0;for(let i=0;i<this.sections.length;i+=2)
result+=this.sections[i];return result;}
get newLength(){let result=0;for(let i=0;i<this.sections.length;i+=2){let ins=this.sections[i+1];result+=ins<0?this.sections[i]:ins;}
return result;}
get empty(){return this.sections.length==0||this.sections.length==2&&this.sections[1]<0;}
iterGaps(f){for(let i=0,posA=0,posB=0;i<this.sections.length;){let len=this.sections[i++],ins=this.sections[i++];if(ins<0){f(posA,posB,len);posB+=len;}
else{posB+=ins;}
posA+=len;}}
iterChangedRanges(f,individual=false){iterChanges(this,f,individual);}
get invertedDesc(){let sections=[];for(let i=0;i<this.sections.length;){let len=this.sections[i++],ins=this.sections[i++];if(ins<0)
sections.push(len,ins);else
sections.push(ins,len);}
return new ChangeDesc(sections);}
composeDesc(other){return this.empty?other:other.empty?this:composeSets(this,other);}
mapDesc(other,before=false){return other.empty?this:mapSet(this,other,before);}
mapPos(pos,assoc=-1,mode=MapMode.Simple){let posA=0,posB=0;for(let i=0;i<this.sections.length;){let len=this.sections[i++],ins=this.sections[i++],endA=posA+len;if(ins<0){if(endA>pos)
return posB+(pos-posA);posB+=len;}
else{if(mode!=MapMode.Simple&&endA>=pos&&(mode==MapMode.TrackDel&&posA<pos&&endA>pos||mode==MapMode.TrackBefore&&posA<pos||mode==MapMode.TrackAfter&&endA>pos))
return null;if(endA>pos||endA==pos&&assoc<0&&!len)
return pos==posA||assoc<0?posB:posB+ins;posB+=ins;}
posA=endA;}
if(pos>posA)
throw new RangeError(`Position ${pos} is out of range for changeset of length ${posA}`);return posB;}
touchesRange(from,to=from){for(let i=0,pos=0;i<this.sections.length&&pos<=to;){let len=this.sections[i++],ins=this.sections[i++],end=pos+len;if(ins>=0&&pos<=to&&end>=from)
return pos<from&&end>to?"cover":true;pos=end;}
return false;}
toString(){let result="";for(let i=0;i<this.sections.length;){let len=this.sections[i++],ins=this.sections[i++];result+=(result?" ":"")+len+(ins>=0?":"+ins:"");}
return result;}
toJSON(){return this.sections;}
static fromJSON(json){if(!Array.isArray(json)||json.length%2||json.some(a=>typeof a!="number"))
throw new RangeError("Invalid JSON representation of ChangeDesc");return new ChangeDesc(json);}
static create(sections){return new ChangeDesc(sections);}}
class ChangeSet extends ChangeDesc{constructor(sections,inserted){super(sections);this.inserted=inserted;}
apply(doc){if(this.length!=doc.length)
throw new RangeError("Applying change set to a document with the wrong length");iterChanges(this,(fromA,toA,fromB,_toB,text)=>doc=doc.replace(fromB,fromB+(toA-fromA),text),false);return doc;}
mapDesc(other,before=false){return mapSet(this,other,before,true);}
invert(doc){let sections=this.sections.slice(),inserted=[];for(let i=0,pos=0;i<sections.length;i+=2){let len=sections[i],ins=sections[i+1];if(ins>=0){sections[i]=ins;sections[i+1]=len;let index=i>>1;while(inserted.length<index)
inserted.push(Text.empty);inserted.push(len?doc.slice(pos,pos+len):Text.empty);}
pos+=len;}
return new ChangeSet(sections,inserted);}
compose(other){return this.empty?other:other.empty?this:composeSets(this,other,true);}
map(other,before=false){return other.empty?this:mapSet(this,other,before,true);}
iterChanges(f,individual=false){iterChanges(this,f,individual);}
get desc(){return ChangeDesc.create(this.sections);}
filter(ranges){let resultSections=[],resultInserted=[],filteredSections=[];let iter=new SectionIter(this);done:for(let i=0,pos=0;;){let next=i==ranges.length?1e9:ranges[i++];while(pos<next||pos==next&&iter.len==0){if(iter.done)
break done;let len=Math.min(iter.len,next-pos);addSection(filteredSections,len,-1);let ins=iter.ins==-1?-1:iter.off==0?iter.ins:0;addSection(resultSections,len,ins);if(ins>0)
addInsert(resultInserted,resultSections,iter.text);iter.forward(len);pos+=len;}
let end=ranges[i++];while(pos<end){if(iter.done)
break done;let len=Math.min(iter.len,end-pos);addSection(resultSections,len,-1);addSection(filteredSections,len,iter.ins==-1?-1:iter.off==0?iter.ins:0);iter.forward(len);pos+=len;}}
return{changes:new ChangeSet(resultSections,resultInserted),filtered:ChangeDesc.create(filteredSections)};}
toJSON(){let parts=[];for(let i=0;i<this.sections.length;i+=2){let len=this.sections[i],ins=this.sections[i+1];if(ins<0)
parts.push(len);else if(ins==0)
parts.push([len]);else
parts.push([len].concat(this.inserted[i>>1].toJSON()));}
return parts;}
static of(changes,length,lineSep){let sections=[],inserted=[],pos=0;let total=null;function flush(force=false){if(!force&&!sections.length)
return;if(pos<length)
addSection(sections,length-pos,-1);let set=new ChangeSet(sections,inserted);total=total?total.compose(set.map(total)):set;sections=[];inserted=[];pos=0;}
function process(spec){if(Array.isArray(spec)){for(let sub of spec)
process(sub);}
else if(spec instanceof ChangeSet){if(spec.length!=length)
throw new RangeError(`Mismatched change set length (got ${spec.length}, expected ${length})`);flush();total=total?total.compose(spec.map(total)):spec;}
else{let{from,to=from,insert}=spec;if(from>to||from<0||to>length)
throw new RangeError(`Invalid change range ${from} to ${to} (in doc of length ${length})`);let insText=!insert?Text.empty:typeof insert=="string"?Text.of(insert.split(lineSep||DefaultSplit)):insert;let insLen=insText.length;if(from==to&&insLen==0)
return;if(from<pos)
flush();if(from>pos)
addSection(sections,from-pos,-1);addSection(sections,to-from,insLen);addInsert(inserted,sections,insText);pos=to;}}
process(changes);flush(!total);return total;}
static empty(length){return new ChangeSet(length?[length,-1]:[],[]);}
static fromJSON(json){if(!Array.isArray(json))
throw new RangeError("Invalid JSON representation of ChangeSet");let sections=[],inserted=[];for(let i=0;i<json.length;i++){let part=json[i];if(typeof part=="number"){sections.push(part,-1);}
else if(!Array.isArray(part)||typeof part[0]!="number"||part.some((e,i)=>i&&typeof e!="string")){throw new RangeError("Invalid JSON representation of ChangeSet");}
else if(part.length==1){sections.push(part[0],0);}
else{while(inserted.length<i)
inserted.push(Text.empty);inserted[i]=Text.of(part.slice(1));sections.push(part[0],inserted[i].length);}}
return new ChangeSet(sections,inserted);}
static createSet(sections,inserted){return new ChangeSet(sections,inserted);}}
function addSection(sections,len,ins,forceJoin=false){if(len==0&&ins<=0)
return;let last=sections.length-2;if(last>=0&&ins<=0&&ins==sections[last+1])
sections[last]+=len;else if(len==0&&sections[last]==0)
sections[last+1]+=ins;else if(forceJoin){sections[last]+=len;sections[last+1]+=ins;}
else
sections.push(len,ins);}
function addInsert(values,sections,value){if(value.length==0)
return;let index=(sections.length-2)>>1;if(index<values.length){values[values.length-1]=values[values.length-1].append(value);}
else{while(values.length<index)
values.push(Text.empty);values.push(value);}}
function iterChanges(desc,f,individual){let inserted=desc.inserted;for(let posA=0,posB=0,i=0;i<desc.sections.length;){let len=desc.sections[i++],ins=desc.sections[i++];if(ins<0){posA+=len;posB+=len;}
else{let endA=posA,endB=posB,text=Text.empty;for(;;){endA+=len;endB+=ins;if(ins&&inserted)
text=text.append(inserted[(i-2)>>1]);if(individual||i==desc.sections.length||desc.sections[i+1]<0)
break;len=desc.sections[i++];ins=desc.sections[i++];}
f(posA,endA,posB,endB,text);posA=endA;posB=endB;}}}
function mapSet(setA,setB,before,mkSet=false){let sections=[],insert=mkSet?[]:null;let a=new SectionIter(setA),b=new SectionIter(setB);for(let posA=0,posB=0;;){if(a.ins==-1){posA+=a.len;a.next();}
else if(b.ins==-1&&posB<posA){let skip=Math.min(b.len,posA-posB);b.forward(skip);addSection(sections,skip,-1);posB+=skip;}
else if(b.ins>=0&&(a.done||posB<posA||posB==posA&&(b.len<a.len||b.len==a.len&&!before))){addSection(sections,b.ins,-1);while(posA>posB&&!a.done&&posA+a.len<posB+b.len){posA+=a.len;a.next();}
posB+=b.len;b.next();}
else if(a.ins>=0){let len=0,end=posA+a.len;for(;;){if(b.ins>=0&&posB>posA&&posB+b.len<end){len+=b.ins;posB+=b.len;b.next();}
else if(b.ins==-1&&posB<end){let skip=Math.min(b.len,end-posB);len+=skip;b.forward(skip);posB+=skip;}
else{break;}}
addSection(sections,len,a.ins);if(insert)
addInsert(insert,sections,a.text);posA=end;a.next();}
else if(a.done&&b.done){return insert?ChangeSet.createSet(sections,insert):ChangeDesc.create(sections);}
else{throw new Error("Mismatched change set lengths");}}}
function composeSets(setA,setB,mkSet=false){let sections=[];let insert=mkSet?[]:null;let a=new SectionIter(setA),b=new SectionIter(setB);for(let open=false;;){if(a.done&&b.done){return insert?ChangeSet.createSet(sections,insert):ChangeDesc.create(sections);}
else if(a.ins==0){addSection(sections,a.len,0,open);a.next();}
else if(b.len==0&&!b.done){addSection(sections,0,b.ins,open);if(insert)
addInsert(insert,sections,b.text);b.next();}
else if(a.done||b.done){throw new Error("Mismatched change set lengths");}
else{let len=Math.min(a.len2,b.len),sectionLen=sections.length;if(a.ins==-1){let insB=b.ins==-1?-1:b.off?0:b.ins;addSection(sections,len,insB,open);if(insert&&insB)
addInsert(insert,sections,b.text);}
else if(b.ins==-1){addSection(sections,a.off?0:a.len,len,open);if(insert)
addInsert(insert,sections,a.textBit(len));}
else{addSection(sections,a.off?0:a.len,b.off?0:b.ins,open);if(insert&&!b.off)
addInsert(insert,sections,b.text);}
open=(a.ins>len||b.ins>=0&&b.len>len)&&(open||sections.length>sectionLen);a.forward2(len);b.forward(len);}}}
class SectionIter{constructor(set){this.set=set;this.i=0;this.next();}
next(){let{sections}=this.set;if(this.i<sections.length){this.len=sections[this.i++];this.ins=sections[this.i++];}
else{this.len=0;this.ins=-2;}
this.off=0;}
get done(){return this.ins==-2;}
get len2(){return this.ins<0?this.len:this.ins;}
get text(){let{inserted}=this.set,index=(this.i-2)>>1;return index>=inserted.length?Text.empty:inserted[index];}
textBit(len){let{inserted}=this.set,index=(this.i-2)>>1;return index>=inserted.length&&!len?Text.empty:inserted[index].slice(this.off,len==null?undefined:this.off+len);}
forward(len){if(len==this.len)
this.next();else{this.len-=len;this.off+=len;}}
forward2(len){if(this.ins==-1)
this.forward(len);else if(len==this.ins)
this.next();else{this.ins-=len;this.off+=len;}}}
class SelectionRange{constructor(from,to,flags){this.from=from;this.to=to;this.flags=flags;}
get anchor(){return this.flags&16?this.to:this.from;}
get head(){return this.flags&16?this.from:this.to;}
get empty(){return this.from==this.to;}
get assoc(){return this.flags&4?-1:this.flags&8?1:0;}
get bidiLevel(){let level=this.flags&3;return level==3?null:level;}
get goalColumn(){let value=this.flags>>5;return value==33554431?undefined:value;}
map(change,assoc=-1){let from,to;if(this.empty){from=to=change.mapPos(this.from,assoc);}
else{from=change.mapPos(this.from,1);to=change.mapPos(this.to,-1);}
return from==this.from&&to==this.to?this:new SelectionRange(from,to,this.flags);}
extend(from,to=from){if(from<=this.anchor&&to>=this.anchor)
return EditorSelection.range(from,to);let head=Math.abs(from-this.anchor)>Math.abs(to-this.anchor)?from:to;return EditorSelection.range(this.anchor,head);}
eq(other){return this.anchor==other.anchor&&this.head==other.head;}
toJSON(){return{anchor:this.anchor,head:this.head};}
static fromJSON(json){if(!json||typeof json.anchor!="number"||typeof json.head!="number")
throw new RangeError("Invalid JSON representation for SelectionRange");return EditorSelection.range(json.anchor,json.head);}
static create(from,to,flags){return new SelectionRange(from,to,flags);}}
class EditorSelection{constructor(ranges,mainIndex){this.ranges=ranges;this.mainIndex=mainIndex;}
map(change,assoc=-1){if(change.empty)
return this;return EditorSelection.create(this.ranges.map(r=>r.map(change,assoc)),this.mainIndex);}
eq(other){if(this.ranges.length!=other.ranges.length||this.mainIndex!=other.mainIndex)
return false;for(let i=0;i<this.ranges.length;i++)
if(!this.ranges[i].eq(other.ranges[i]))
return false;return true;}
get main(){return this.ranges[this.mainIndex];}
asSingle(){return this.ranges.length==1?this:new EditorSelection([this.main],0);}
addRange(range,main=true){return EditorSelection.create([range].concat(this.ranges),main?0:this.mainIndex+1);}
replaceRange(range,which=this.mainIndex){let ranges=this.ranges.slice();ranges[which]=range;return EditorSelection.create(ranges,this.mainIndex);}
toJSON(){return{ranges:this.ranges.map(r=>r.toJSON()),main:this.mainIndex};}
static fromJSON(json){if(!json||!Array.isArray(json.ranges)||typeof json.main!="number"||json.main>=json.ranges.length)
throw new RangeError("Invalid JSON representation for EditorSelection");return new EditorSelection(json.ranges.map((r)=>SelectionRange.fromJSON(r)),json.main);}
static single(anchor,head=anchor){return new EditorSelection([EditorSelection.range(anchor,head)],0);}
static create(ranges,mainIndex=0){if(ranges.length==0)
throw new RangeError("A selection needs at least one range");for(let pos=0,i=0;i<ranges.length;i++){let range=ranges[i];if(range.empty?range.from<=pos:range.from<pos)
return EditorSelection.normalized(ranges.slice(),mainIndex);pos=range.to;}
return new EditorSelection(ranges,mainIndex);}
static cursor(pos,assoc=0,bidiLevel,goalColumn){return SelectionRange.create(pos,pos,(assoc==0?0:assoc<0?4:8)|(bidiLevel==null?3:Math.min(2,bidiLevel))|((goalColumn!==null&&goalColumn!==void 0?goalColumn:33554431)<<5));}
static range(anchor,head,goalColumn){let goal=(goalColumn!==null&&goalColumn!==void 0?goalColumn:33554431)<<5;return head<anchor?SelectionRange.create(head,anchor,16|goal|8):SelectionRange.create(anchor,head,goal|(head>anchor?4:0));}
static normalized(ranges,mainIndex=0){let main=ranges[mainIndex];ranges.sort((a,b)=>a.from-b.from);mainIndex=ranges.indexOf(main);for(let i=1;i<ranges.length;i++){let range=ranges[i],prev=ranges[i-1];if(range.empty?range.from<=prev.to:range.from<prev.to){let from=prev.from,to=Math.max(range.to,prev.to);if(i<=mainIndex)
mainIndex--;ranges.splice(--i,2,range.anchor>range.head?EditorSelection.range(to,from):EditorSelection.range(from,to));}}
return new EditorSelection(ranges,mainIndex);}}
function checkSelection(selection,docLength){for(let range of selection.ranges)
if(range.to>docLength)
throw new RangeError("Selection points outside of document");}
let nextID=0;class Facet{constructor(combine,compareInput,compare,isStatic,extensions){this.combine=combine;this.compareInput=compareInput;this.compare=compare;this.isStatic=isStatic;this.extensions=extensions;this.id=nextID++;this.default=combine([]);}
static define(config={}){return new Facet(config.combine||((a)=>a),config.compareInput||((a,b)=>a===b),config.compare||(!config.combine?sameArray$1:(a,b)=>a===b),!!config.static,config.enables);}
of(value){return new FacetProvider([],this,0,value);}
compute(deps,get){if(this.isStatic)
throw new Error("Can't compute a static facet");return new FacetProvider(deps,this,1,get);}
computeN(deps,get){if(this.isStatic)
throw new Error("Can't compute a static facet");return new FacetProvider(deps,this,2,get);}
from(field,get){if(!get)
get=x=>x;return this.compute([field],state=>get(state.field(field)));}}
function sameArray$1(a,b){return a==b||a.length==b.length&&a.every((e,i)=>e===b[i]);}
class FacetProvider{constructor(dependencies,facet,type,value){this.dependencies=dependencies;this.facet=facet;this.type=type;this.value=value;this.id=nextID++;}
dynamicSlot(addresses){var _a;let getter=this.value;let compare=this.facet.compareInput;let id=this.id,idx=addresses[id]>>1,multi=this.type==2;let depDoc=false,depSel=false,depAddrs=[];for(let dep of this.dependencies){if(dep=="doc")
depDoc=true;else if(dep=="selection")
depSel=true;else if((((_a=addresses[dep.id])!==null&&_a!==void 0?_a:1)&1)==0)
depAddrs.push(addresses[dep.id]);}
return{create(state){state.values[idx]=getter(state);return 1;},update(state,tr){if((depDoc&&tr.docChanged)||(depSel&&(tr.docChanged||tr.selection))||ensureAll(state,depAddrs)){let newVal=getter(state);if(multi?!compareArray(newVal,state.values[idx],compare):!compare(newVal,state.values[idx])){state.values[idx]=newVal;return 1;}}
return 0;},reconfigure:(state,oldState)=>{let newVal=getter(state);let oldAddr=oldState.config.address[id];if(oldAddr!=null){let oldVal=getAddr(oldState,oldAddr);if(this.dependencies.every(dep=>{return dep instanceof Facet?oldState.facet(dep)===state.facet(dep):dep instanceof StateField?oldState.field(dep,false)==state.field(dep,false):true;})||(multi?compareArray(newVal,oldVal,compare):compare(newVal,oldVal))){state.values[idx]=oldVal;return 0;}}
state.values[idx]=newVal;return 1;}};}}
function compareArray(a,b,compare){if(a.length!=b.length)
return false;for(let i=0;i<a.length;i++)
if(!compare(a[i],b[i]))
return false;return true;}
function ensureAll(state,addrs){let changed=false;for(let addr of addrs)
if(ensureAddr(state,addr)&1)
changed=true;return changed;}
function dynamicFacetSlot(addresses,facet,providers){let providerAddrs=providers.map(p=>addresses[p.id]);let providerTypes=providers.map(p=>p.type);let dynamic=providerAddrs.filter(p=>!(p&1));let idx=addresses[facet.id]>>1;function get(state){let values=[];for(let i=0;i<providerAddrs.length;i++){let value=getAddr(state,providerAddrs[i]);if(providerTypes[i]==2)
for(let val of value)
values.push(val);else
values.push(value);}
return facet.combine(values);}
return{create(state){for(let addr of providerAddrs)
ensureAddr(state,addr);state.values[idx]=get(state);return 1;},update(state,tr){if(!ensureAll(state,dynamic))
return 0;let value=get(state);if(facet.compare(value,state.values[idx]))
return 0;state.values[idx]=value;return 1;},reconfigure(state,oldState){let depChanged=ensureAll(state,providerAddrs);let oldProviders=oldState.config.facets[facet.id],oldValue=oldState.facet(facet);if(oldProviders&&!depChanged&&sameArray$1(providers,oldProviders)){state.values[idx]=oldValue;return 0;}
let value=get(state);if(facet.compare(value,oldValue)){state.values[idx]=oldValue;return 0;}
state.values[idx]=value;return 1;}};}
const initField=Facet.define({static:true});class StateField{constructor(id,createF,updateF,compareF,spec){this.id=id;this.createF=createF;this.updateF=updateF;this.compareF=compareF;this.spec=spec;this.provides=undefined;}
static define(config){let field=new StateField(nextID++,config.create,config.update,config.compare||((a,b)=>a===b),config);if(config.provide)
field.provides=config.provide(field);return field;}
create(state){let init=state.facet(initField).find(i=>i.field==this);return((init===null||init===void 0?void 0:init.create)||this.createF)(state);}
slot(addresses){let idx=addresses[this.id]>>1;return{create:(state)=>{state.values[idx]=this.create(state);return 1;},update:(state,tr)=>{let oldVal=state.values[idx];let value=this.updateF(oldVal,tr);if(this.compareF(oldVal,value))
return 0;state.values[idx]=value;return 1;},reconfigure:(state,oldState)=>{if(oldState.config.address[this.id]!=null){state.values[idx]=oldState.field(this);return 0;}
state.values[idx]=this.create(state);return 1;}};}
init(create){return[this,initField.of({field:this,create})];}
get extension(){return this;}}
const Prec_={lowest:4,low:3,default:2,high:1,highest:0};function prec(value){return(ext)=>new PrecExtension(ext,value);}
const Prec={highest:prec(Prec_.highest),high:prec(Prec_.high),default:prec(Prec_.default),low:prec(Prec_.low),lowest:prec(Prec_.lowest)};class PrecExtension{constructor(inner,prec){this.inner=inner;this.prec=prec;}}
class Compartment{of(ext){return new CompartmentInstance(this,ext);}
reconfigure(content){return Compartment.reconfigure.of({compartment:this,extension:content});}
get(state){return state.config.compartments.get(this);}}
class CompartmentInstance{constructor(compartment,inner){this.compartment=compartment;this.inner=inner;}}
class Configuration{constructor(base,compartments,dynamicSlots,address,staticValues,facets){this.base=base;this.compartments=compartments;this.dynamicSlots=dynamicSlots;this.address=address;this.staticValues=staticValues;this.facets=facets;this.statusTemplate=[];while(this.statusTemplate.length<dynamicSlots.length)
this.statusTemplate.push(0);}
staticFacet(facet){let addr=this.address[facet.id];return addr==null?facet.default:this.staticValues[addr>>1];}
static resolve(base,compartments,oldState){let fields=[];let facets=Object.create(null);let newCompartments=new Map();for(let ext of flatten(base,compartments,newCompartments)){if(ext instanceof StateField)
fields.push(ext);else
(facets[ext.facet.id]||(facets[ext.facet.id]=[])).push(ext);}
let address=Object.create(null);let staticValues=[];let dynamicSlots=[];for(let field of fields){address[field.id]=dynamicSlots.length<<1;dynamicSlots.push(a=>field.slot(a));}
let oldFacets=oldState===null||oldState===void 0?void 0:oldState.config.facets;for(let id in facets){let providers=facets[id],facet=providers[0].facet;let oldProviders=oldFacets&&oldFacets[id]||[];if(providers.every(p=>p.type==0)){address[facet.id]=(staticValues.length<<1)|1;if(sameArray$1(oldProviders,providers)){staticValues.push(oldState.facet(facet));}
else{let value=facet.combine(providers.map(p=>p.value));staticValues.push(oldState&&facet.compare(value,oldState.facet(facet))?oldState.facet(facet):value);}}
else{for(let p of providers){if(p.type==0){address[p.id]=(staticValues.length<<1)|1;staticValues.push(p.value);}
else{address[p.id]=dynamicSlots.length<<1;dynamicSlots.push(a=>p.dynamicSlot(a));}}
address[facet.id]=dynamicSlots.length<<1;dynamicSlots.push(a=>dynamicFacetSlot(a,facet,providers));}}
let dynamic=dynamicSlots.map(f=>f(address));return new Configuration(base,newCompartments,dynamic,address,staticValues,facets);}}
function flatten(extension,compartments,newCompartments){let result=[[],[],[],[],[]];let seen=new Map();function inner(ext,prec){let known=seen.get(ext);if(known!=null){if(known<=prec)
return;let found=result[known].indexOf(ext);if(found>-1)
result[known].splice(found,1);if(ext instanceof CompartmentInstance)
newCompartments.delete(ext.compartment);}
seen.set(ext,prec);if(Array.isArray(ext)){for(let e of ext)
inner(e,prec);}
else if(ext instanceof CompartmentInstance){if(newCompartments.has(ext.compartment))
throw new RangeError(`Duplicate use of compartment in extensions`);let content=compartments.get(ext.compartment)||ext.inner;newCompartments.set(ext.compartment,content);inner(content,prec);}
else if(ext instanceof PrecExtension){inner(ext.inner,ext.prec);}
else if(ext instanceof StateField){result[prec].push(ext);if(ext.provides)
inner(ext.provides,prec);}
else if(ext instanceof FacetProvider){result[prec].push(ext);if(ext.facet.extensions)
inner(ext.facet.extensions,prec);}
else{let content=ext.extension;if(!content)
throw new Error(`Unrecognized extension value in extension set (${ext}). This sometimes happens because multiple instances of @codemirror/state are loaded, breaking instanceof checks.`);inner(content,prec);}}
inner(extension,Prec_.default);return result.reduce((a,b)=>a.concat(b));}
function ensureAddr(state,addr){if(addr&1)
return 2;let idx=addr>>1;let status=state.status[idx];if(status==4)
throw new Error("Cyclic dependency between fields and/or facets");if(status&2)
return status;state.status[idx]=4;let changed=state.computeSlot(state,state.config.dynamicSlots[idx]);return state.status[idx]=2|changed;}
function getAddr(state,addr){return addr&1?state.config.staticValues[addr>>1]:state.values[addr>>1];}
const languageData=Facet.define();const allowMultipleSelections=Facet.define({combine:values=>values.some(v=>v),static:true});const lineSeparator=Facet.define({combine:values=>values.length?values[0]:undefined,static:true});const changeFilter=Facet.define();const transactionFilter=Facet.define();const transactionExtender=Facet.define();const readOnly=Facet.define({combine:values=>values.length?values[0]:false});class Annotation{constructor(type,value){this.type=type;this.value=value;}
static define(){return new AnnotationType();}}
class AnnotationType{of(value){return new Annotation(this,value);}}
class StateEffectType{constructor(map){this.map=map;}
of(value){return new StateEffect(this,value);}}
class StateEffect{constructor(type,value){this.type=type;this.value=value;}
map(mapping){let mapped=this.type.map(this.value,mapping);return mapped===undefined?undefined:mapped==this.value?this:new StateEffect(this.type,mapped);}
is(type){return this.type==type;}
static define(spec={}){return new StateEffectType(spec.map||(v=>v));}
static mapEffects(effects,mapping){if(!effects.length)
return effects;let result=[];for(let effect of effects){let mapped=effect.map(mapping);if(mapped)
result.push(mapped);}
return result;}}
StateEffect.reconfigure=StateEffect.define();StateEffect.appendConfig=StateEffect.define();class Transaction{constructor(startState,changes,selection,effects,annotations,scrollIntoView){this.startState=startState;this.changes=changes;this.selection=selection;this.effects=effects;this.annotations=annotations;this.scrollIntoView=scrollIntoView;this._doc=null;this._state=null;if(selection)
checkSelection(selection,changes.newLength);if(!annotations.some((a)=>a.type==Transaction.time))
this.annotations=annotations.concat(Transaction.time.of(Date.now()));}
static create(startState,changes,selection,effects,annotations,scrollIntoView){return new Transaction(startState,changes,selection,effects,annotations,scrollIntoView);}
get newDoc(){return this._doc||(this._doc=this.changes.apply(this.startState.doc));}
get newSelection(){return this.selection||this.startState.selection.map(this.changes);}
get state(){if(!this._state)
this.startState.applyTransaction(this);return this._state;}
annotation(type){for(let ann of this.annotations)
if(ann.type==type)
return ann.value;return undefined;}
get docChanged(){return!this.changes.empty;}
get reconfigured(){return this.startState.config!=this.state.config;}
isUserEvent(event){let e=this.annotation(Transaction.userEvent);return!!(e&&(e==event||e.length>event.length&&e.slice(0,event.length)==event&&e[event.length]=="."));}}
Transaction.time=Annotation.define();Transaction.userEvent=Annotation.define();Transaction.addToHistory=Annotation.define();Transaction.remote=Annotation.define();function joinRanges(a,b){let result=[];for(let iA=0,iB=0;;){let from,to;if(iA<a.length&&(iB==b.length||b[iB]>=a[iA])){from=a[iA++];to=a[iA++];}
else if(iB<b.length){from=b[iB++];to=b[iB++];}
else
return result;if(!result.length||result[result.length-1]<from)
result.push(from,to);else if(result[result.length-1]<to)
result[result.length-1]=to;}}
function mergeTransaction(a,b,sequential){var _a;let mapForA,mapForB,changes;if(sequential){mapForA=b.changes;mapForB=ChangeSet.empty(b.changes.length);changes=a.changes.compose(b.changes);}
else{mapForA=b.changes.map(a.changes);mapForB=a.changes.mapDesc(b.changes,true);changes=a.changes.compose(mapForA);}
return{changes,selection:b.selection?b.selection.map(mapForB):(_a=a.selection)===null||_a===void 0?void 0:_a.map(mapForA),effects:StateEffect.mapEffects(a.effects,mapForA).concat(StateEffect.mapEffects(b.effects,mapForB)),annotations:a.annotations.length?a.annotations.concat(b.annotations):b.annotations,scrollIntoView:a.scrollIntoView||b.scrollIntoView};}
function resolveTransactionInner(state,spec,docSize){let sel=spec.selection,annotations=asArray(spec.annotations);if(spec.userEvent)
annotations=annotations.concat(Transaction.userEvent.of(spec.userEvent));return{changes:spec.changes instanceof ChangeSet?spec.changes:ChangeSet.of(spec.changes||[],docSize,state.facet(lineSeparator)),selection:sel&&(sel instanceof EditorSelection?sel:EditorSelection.single(sel.anchor,sel.head)),effects:asArray(spec.effects),annotations,scrollIntoView:!!spec.scrollIntoView};}
function resolveTransaction(state,specs,filter){let s=resolveTransactionInner(state,specs.length?specs[0]:{},state.doc.length);if(specs.length&&specs[0].filter===false)
filter=false;for(let i=1;i<specs.length;i++){if(specs[i].filter===false)
filter=false;let seq=!!specs[i].sequential;s=mergeTransaction(s,resolveTransactionInner(state,specs[i],seq?s.changes.newLength:state.doc.length),seq);}
let tr=Transaction.create(state,s.changes,s.selection,s.effects,s.annotations,s.scrollIntoView);return extendTransaction(filter?filterTransaction(tr):tr);}
function filterTransaction(tr){let state=tr.startState;let result=true;for(let filter of state.facet(changeFilter)){let value=filter(tr);if(value===false){result=false;break;}
if(Array.isArray(value))
result=result===true?value:joinRanges(result,value);}
if(result!==true){let changes,back;if(result===false){back=tr.changes.invertedDesc;changes=ChangeSet.empty(state.doc.length);}
else{let filtered=tr.changes.filter(result);changes=filtered.changes;back=filtered.filtered.invertedDesc;}
tr=Transaction.create(state,changes,tr.selection&&tr.selection.map(back),StateEffect.mapEffects(tr.effects,back),tr.annotations,tr.scrollIntoView);}
let filters=state.facet(transactionFilter);for(let i=filters.length-1;i>=0;i--){let filtered=filters[i](tr);if(filtered instanceof Transaction)
tr=filtered;else if(Array.isArray(filtered)&&filtered.length==1&&filtered[0]instanceof Transaction)
tr=filtered[0];else
tr=resolveTransaction(state,asArray(filtered),false);}
return tr;}
function extendTransaction(tr){let state=tr.startState,extenders=state.facet(transactionExtender),spec=tr;for(let i=extenders.length-1;i>=0;i--){let extension=extenders[i](tr);if(extension&&Object.keys(extension).length)
spec=mergeTransaction(tr,resolveTransactionInner(state,extension,tr.changes.newLength),true);}
return spec==tr?tr:Transaction.create(state,tr.changes,tr.selection,spec.effects,spec.annotations,spec.scrollIntoView);}
const none$1=[];function asArray(value){return value==null?none$1:Array.isArray(value)?value:[value];}
var CharCategory=(function(CharCategory){CharCategory[CharCategory["Word"]=0]="Word";CharCategory[CharCategory["Space"]=1]="Space";CharCategory[CharCategory["Other"]=2]="Other";return CharCategory})(CharCategory||(CharCategory={}));const nonASCIISingleCaseWordChar=/[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;let wordChar;try{wordChar=new RegExp("[\\p{Alphabetic}\\p{Number}_]","u");}
catch(_){}
function hasWordChar(str){if(wordChar)
return wordChar.test(str);for(let i=0;i<str.length;i++){let ch=str[i];if(/\w/.test(ch)||ch>"\x80"&&(ch.toUpperCase()!=ch.toLowerCase()||nonASCIISingleCaseWordChar.test(ch)))
return true;}
return false;}
function makeCategorizer(wordChars){return(char)=>{if(!/\S/.test(char))
return CharCategory.Space;if(hasWordChar(char))
return CharCategory.Word;for(let i=0;i<wordChars.length;i++)
if(char.indexOf(wordChars[i])>-1)
return CharCategory.Word;return CharCategory.Other;};}
class EditorState{constructor(config,doc,selection,values,computeSlot,tr){this.config=config;this.doc=doc;this.selection=selection;this.values=values;this.status=config.statusTemplate.slice();this.computeSlot=computeSlot;if(tr)
tr._state=this;for(let i=0;i<this.config.dynamicSlots.length;i++)
ensureAddr(this,i<<1);this.computeSlot=null;}
field(field,require=true){let addr=this.config.address[field.id];if(addr==null){if(require)
throw new RangeError("Field is not present in this state");return undefined;}
ensureAddr(this,addr);return getAddr(this,addr);}
update(...specs){return resolveTransaction(this,specs,true);}
applyTransaction(tr){let conf=this.config,{base,compartments}=conf;for(let effect of tr.effects){if(effect.is(Compartment.reconfigure)){if(conf){compartments=new Map;conf.compartments.forEach((val,key)=>compartments.set(key,val));conf=null;}
compartments.set(effect.value.compartment,effect.value.extension);}
else if(effect.is(StateEffect.reconfigure)){conf=null;base=effect.value;}
else if(effect.is(StateEffect.appendConfig)){conf=null;base=asArray(base).concat(effect.value);}}
let startValues;if(!conf){conf=Configuration.resolve(base,compartments,this);let intermediateState=new EditorState(conf,this.doc,this.selection,conf.dynamicSlots.map(()=>null),(state,slot)=>slot.reconfigure(state,this),null);startValues=intermediateState.values;}
else{startValues=tr.startState.values.slice();}
new EditorState(conf,tr.newDoc,tr.newSelection,startValues,(state,slot)=>slot.update(state,tr),tr);}
replaceSelection(text){if(typeof text=="string")
text=this.toText(text);return this.changeByRange(range=>({changes:{from:range.from,to:range.to,insert:text},range:EditorSelection.cursor(range.from+text.length)}));}
changeByRange(f){let sel=this.selection;let result1=f(sel.ranges[0]);let changes=this.changes(result1.changes),ranges=[result1.range];let effects=asArray(result1.effects);for(let i=1;i<sel.ranges.length;i++){let result=f(sel.ranges[i]);let newChanges=this.changes(result.changes),newMapped=newChanges.map(changes);for(let j=0;j<i;j++)
ranges[j]=ranges[j].map(newMapped);let mapBy=changes.mapDesc(newChanges,true);ranges.push(result.range.map(mapBy));changes=changes.compose(newMapped);effects=StateEffect.mapEffects(effects,newMapped).concat(StateEffect.mapEffects(asArray(result.effects),mapBy));}
return{changes,selection:EditorSelection.create(ranges,sel.mainIndex),effects};}
changes(spec=[]){if(spec instanceof ChangeSet)
return spec;return ChangeSet.of(spec,this.doc.length,this.facet(EditorState.lineSeparator));}
toText(string){return Text.of(string.split(this.facet(EditorState.lineSeparator)||DefaultSplit));}
sliceDoc(from=0,to=this.doc.length){return this.doc.sliceString(from,to,this.lineBreak);}
facet(facet){let addr=this.config.address[facet.id];if(addr==null)
return facet.default;ensureAddr(this,addr);return getAddr(this,addr);}
toJSON(fields){let result={doc:this.sliceDoc(),selection:this.selection.toJSON()};if(fields)
for(let prop in fields){let value=fields[prop];if(value instanceof StateField)
result[prop]=value.spec.toJSON(this.field(fields[prop]),this);}
return result;}
static fromJSON(json,config={},fields){if(!json||typeof json.doc!="string")
throw new RangeError("Invalid JSON representation for EditorState");let fieldInit=[];if(fields)
for(let prop in fields){let field=fields[prop],value=json[prop];fieldInit.push(field.init(state=>field.spec.fromJSON(value,state)));}
return EditorState.create({doc:json.doc,selection:EditorSelection.fromJSON(json.selection),extensions:config.extensions?fieldInit.concat([config.extensions]):fieldInit});}
static create(config={}){let configuration=Configuration.resolve(config.extensions||[],new Map);let doc=config.doc instanceof Text?config.doc:Text.of((config.doc||"").split(configuration.staticFacet(EditorState.lineSeparator)||DefaultSplit));let selection=!config.selection?EditorSelection.single(0):config.selection instanceof EditorSelection?config.selection:EditorSelection.single(config.selection.anchor,config.selection.head);checkSelection(selection,doc.length);if(!configuration.staticFacet(allowMultipleSelections))
selection=selection.asSingle();return new EditorState(configuration,doc,selection,configuration.dynamicSlots.map(()=>null),(state,slot)=>slot.create(state),null);}
get tabSize(){return this.facet(EditorState.tabSize);}
get lineBreak(){return this.facet(EditorState.lineSeparator)||"\n";}
get readOnly(){return this.facet(readOnly);}
phrase(phrase,...insert){for(let map of this.facet(EditorState.phrases))
if(Object.prototype.hasOwnProperty.call(map,phrase)){phrase=map[phrase];break;}
if(insert.length)
phrase=phrase.replace(/\$(\$|\d*)/g,(m,i)=>{if(i=="$")
return "$";let n=+(i||1);return n>insert.length?m:insert[n-1];});return phrase;}
languageDataAt(name,pos,side=-1){let values=[];for(let provider of this.facet(languageData)){for(let result of provider(this,pos,side)){if(Object.prototype.hasOwnProperty.call(result,name))
values.push(result[name]);}}
return values;}
charCategorizer(at){return makeCategorizer(this.languageDataAt("wordChars",at).join(""));}
wordAt(pos){let{text,from,length}=this.doc.lineAt(pos);let cat=this.charCategorizer(pos);let start=pos-from,end=pos-from;while(start>0){let prev=findClusterBreak(text,start,false);if(cat(text.slice(prev,start))!=CharCategory.Word)
break;start=prev;}
while(end<length){let next=findClusterBreak(text,end);if(cat(text.slice(end,next))!=CharCategory.Word)
break;end=next;}
return start==end?null:EditorSelection.range(start+from,end+from);}}
EditorState.allowMultipleSelections=allowMultipleSelections;EditorState.tabSize=Facet.define({combine:values=>values.length?values[0]:4});EditorState.lineSeparator=lineSeparator;EditorState.readOnly=readOnly;EditorState.phrases=Facet.define({compare(a,b){let kA=Object.keys(a),kB=Object.keys(b);return kA.length==kB.length&&kA.every(k=>a[k]==b[k]);}});EditorState.languageData=languageData;EditorState.changeFilter=changeFilter;EditorState.transactionFilter=transactionFilter;EditorState.transactionExtender=transactionExtender;Compartment.reconfigure=StateEffect.define();function combineConfig(configs,defaults,combine={}){let result={};for(let config of configs)
for(let key of Object.keys(config)){let value=config[key],current=result[key];if(current===undefined)
result[key]=value;else if(current===value||value===undefined);else if(Object.hasOwnProperty.call(combine,key))
result[key]=combine[key](current,value);else
throw new Error("Config merge conflict for field "+key);}
for(let key in defaults)
if(result[key]===undefined)
result[key]=defaults[key];return result;}
class RangeValue{eq(other){return this==other;}
range(from,to=from){return Range$1.create(from,to,this);}}
RangeValue.prototype.startSide=RangeValue.prototype.endSide=0;RangeValue.prototype.point=false;RangeValue.prototype.mapMode=MapMode.TrackDel;class Range$1{constructor(from,to,value){this.from=from;this.to=to;this.value=value;}
static create(from,to,value){return new Range$1(from,to,value);}}
function cmpRange(a,b){return a.from-b.from||a.value.startSide-b.value.startSide;}
class Chunk{constructor(from,to,value,maxPoint){this.from=from;this.to=to;this.value=value;this.maxPoint=maxPoint;}
get length(){return this.to[this.to.length-1];}
findIndex(pos,side,end,startAt=0){let arr=end?this.to:this.from;for(let lo=startAt,hi=arr.length;;){if(lo==hi)
return lo;let mid=(lo+hi)>>1;let diff=arr[mid]-pos||(end?this.value[mid].endSide:this.value[mid].startSide)-side;if(mid==lo)
return diff>=0?lo:hi;if(diff>=0)
hi=mid;else
lo=mid+1;}}
between(offset,from,to,f){for(let i=this.findIndex(from,-1000000000,true),e=this.findIndex(to,1000000000,false,i);i<e;i++)
if(f(this.from[i]+offset,this.to[i]+offset,this.value[i])===false)
return false;}
map(offset,changes){let value=[],from=[],to=[],newPos=-1,maxPoint=-1;for(let i=0;i<this.value.length;i++){let val=this.value[i],curFrom=this.from[i]+offset,curTo=this.to[i]+offset,newFrom,newTo;if(curFrom==curTo){let mapped=changes.mapPos(curFrom,val.startSide,val.mapMode);if(mapped==null)
continue;newFrom=newTo=mapped;if(val.startSide!=val.endSide){newTo=changes.mapPos(curFrom,val.endSide);if(newTo<newFrom)
continue;}}
else{newFrom=changes.mapPos(curFrom,val.startSide);newTo=changes.mapPos(curTo,val.endSide);if(newFrom>newTo||newFrom==newTo&&val.startSide>0&&val.endSide<=0)
continue;}
if((newTo-newFrom||val.endSide-val.startSide)<0)
continue;if(newPos<0)
newPos=newFrom;if(val.point)
maxPoint=Math.max(maxPoint,newTo-newFrom);value.push(val);from.push(newFrom-newPos);to.push(newTo-newPos);}
return{mapped:value.length?new Chunk(from,to,value,maxPoint):null,pos:newPos};}}
class RangeSet{constructor(chunkPos,chunk,nextLayer,maxPoint){this.chunkPos=chunkPos;this.chunk=chunk;this.nextLayer=nextLayer;this.maxPoint=maxPoint;}
static create(chunkPos,chunk,nextLayer,maxPoint){return new RangeSet(chunkPos,chunk,nextLayer,maxPoint);}
get length(){let last=this.chunk.length-1;return last<0?0:Math.max(this.chunkEnd(last),this.nextLayer.length);}
get size(){if(this.isEmpty)
return 0;let size=this.nextLayer.size;for(let chunk of this.chunk)
size+=chunk.value.length;return size;}
chunkEnd(index){return this.chunkPos[index]+this.chunk[index].length;}
update(updateSpec){let{add=[],sort=false,filterFrom=0,filterTo=this.length}=updateSpec;let filter=updateSpec.filter;if(add.length==0&&!filter)
return this;if(sort)
add=add.slice().sort(cmpRange);if(this.isEmpty)
return add.length?RangeSet.of(add):this;let cur=new LayerCursor(this,null,-1).goto(0),i=0,spill=[];let builder=new RangeSetBuilder();while(cur.value||i<add.length){if(i<add.length&&(cur.from-add[i].from||cur.startSide-add[i].value.startSide)>=0){let range=add[i++];if(!builder.addInner(range.from,range.to,range.value))
spill.push(range);}
else if(cur.rangeIndex==1&&cur.chunkIndex<this.chunk.length&&(i==add.length||this.chunkEnd(cur.chunkIndex)<add[i].from)&&(!filter||filterFrom>this.chunkEnd(cur.chunkIndex)||filterTo<this.chunkPos[cur.chunkIndex])&&builder.addChunk(this.chunkPos[cur.chunkIndex],this.chunk[cur.chunkIndex])){cur.nextChunk();}
else{if(!filter||filterFrom>cur.to||filterTo<cur.from||filter(cur.from,cur.to,cur.value)){if(!builder.addInner(cur.from,cur.to,cur.value))
spill.push(Range$1.create(cur.from,cur.to,cur.value));}
cur.next();}}
return builder.finishInner(this.nextLayer.isEmpty&&!spill.length?RangeSet.empty:this.nextLayer.update({add:spill,filter,filterFrom,filterTo}));}
map(changes){if(changes.empty||this.isEmpty)
return this;let chunks=[],chunkPos=[],maxPoint=-1;for(let i=0;i<this.chunk.length;i++){let start=this.chunkPos[i],chunk=this.chunk[i];let touch=changes.touchesRange(start,start+chunk.length);if(touch===false){maxPoint=Math.max(maxPoint,chunk.maxPoint);chunks.push(chunk);chunkPos.push(changes.mapPos(start));}
else if(touch===true){let{mapped,pos}=chunk.map(start,changes);if(mapped){maxPoint=Math.max(maxPoint,mapped.maxPoint);chunks.push(mapped);chunkPos.push(pos);}}}
let next=this.nextLayer.map(changes);return chunks.length==0?next:new RangeSet(chunkPos,chunks,next||RangeSet.empty,maxPoint);}
between(from,to,f){if(this.isEmpty)
return;for(let i=0;i<this.chunk.length;i++){let start=this.chunkPos[i],chunk=this.chunk[i];if(to>=start&&from<=start+chunk.length&&chunk.between(start,from-start,to-start,f)===false)
return;}
this.nextLayer.between(from,to,f);}
iter(from=0){return HeapCursor.from([this]).goto(from);}
get isEmpty(){return this.nextLayer==this;}
static iter(sets,from=0){return HeapCursor.from(sets).goto(from);}
static compare(oldSets,newSets,textDiff,comparator,minPointSize=-1){let a=oldSets.filter(set=>set.maxPoint>0||!set.isEmpty&&set.maxPoint>=minPointSize);let b=newSets.filter(set=>set.maxPoint>0||!set.isEmpty&&set.maxPoint>=minPointSize);let sharedChunks=findSharedChunks(a,b,textDiff);let sideA=new SpanCursor(a,sharedChunks,minPointSize);let sideB=new SpanCursor(b,sharedChunks,minPointSize);textDiff.iterGaps((fromA,fromB,length)=>compare(sideA,fromA,sideB,fromB,length,comparator));if(textDiff.empty&&textDiff.length==0)
compare(sideA,0,sideB,0,0,comparator);}
static eq(oldSets,newSets,from=0,to){if(to==null)
to=1000000000;let a=oldSets.filter(set=>!set.isEmpty&&newSets.indexOf(set)<0);let b=newSets.filter(set=>!set.isEmpty&&oldSets.indexOf(set)<0);if(a.length!=b.length)
return false;if(!a.length)
return true;let sharedChunks=findSharedChunks(a,b);let sideA=new SpanCursor(a,sharedChunks,0).goto(from),sideB=new SpanCursor(b,sharedChunks,0).goto(from);for(;;){if(sideA.to!=sideB.to||!sameValues(sideA.active,sideB.active)||sideA.point&&(!sideB.point||!sideA.point.eq(sideB.point)))
return false;if(sideA.to>to)
return true;sideA.next();sideB.next();}}
static spans(sets,from,to,iterator,minPointSize=-1){let cursor=new SpanCursor(sets,null,minPointSize).goto(from),pos=from;let open=cursor.openStart;for(;;){let curTo=Math.min(cursor.to,to);if(cursor.point){iterator.point(pos,curTo,cursor.point,cursor.activeForPoint(cursor.to),open,cursor.pointRank);open=cursor.openEnd(curTo)+(cursor.to>curTo?1:0);}
else if(curTo>pos){iterator.span(pos,curTo,cursor.active,open);open=cursor.openEnd(curTo);}
if(cursor.to>to)
break;pos=cursor.to;cursor.next();}
return open;}
static of(ranges,sort=false){let build=new RangeSetBuilder();for(let range of ranges instanceof Range$1?[ranges]:sort?lazySort(ranges):ranges)
build.add(range.from,range.to,range.value);return build.finish();}}
RangeSet.empty=new RangeSet([],[],null,-1);function lazySort(ranges){if(ranges.length>1)
for(let prev=ranges[0],i=1;i<ranges.length;i++){let cur=ranges[i];if(cmpRange(prev,cur)>0)
return ranges.slice().sort(cmpRange);prev=cur;}
return ranges;}
RangeSet.empty.nextLayer=RangeSet.empty;class RangeSetBuilder{constructor(){this.chunks=[];this.chunkPos=[];this.chunkStart=-1;this.last=null;this.lastFrom=-1000000000;this.lastTo=-1000000000;this.from=[];this.to=[];this.value=[];this.maxPoint=-1;this.setMaxPoint=-1;this.nextLayer=null;}
finishChunk(newArrays){this.chunks.push(new Chunk(this.from,this.to,this.value,this.maxPoint));this.chunkPos.push(this.chunkStart);this.chunkStart=-1;this.setMaxPoint=Math.max(this.setMaxPoint,this.maxPoint);this.maxPoint=-1;if(newArrays){this.from=[];this.to=[];this.value=[];}}
add(from,to,value){if(!this.addInner(from,to,value))
(this.nextLayer||(this.nextLayer=new RangeSetBuilder)).add(from,to,value);}
addInner(from,to,value){let diff=from-this.lastTo||value.startSide-this.last.endSide;if(diff<=0&&(from-this.lastFrom||value.startSide-this.last.startSide)<0)
throw new Error("Ranges must be added sorted by `from` position and `startSide`");if(diff<0)
return false;if(this.from.length==250)
this.finishChunk(true);if(this.chunkStart<0)
this.chunkStart=from;this.from.push(from-this.chunkStart);this.to.push(to-this.chunkStart);this.last=value;this.lastFrom=from;this.lastTo=to;this.value.push(value);if(value.point)
this.maxPoint=Math.max(this.maxPoint,to-from);return true;}
addChunk(from,chunk){if((from-this.lastTo||chunk.value[0].startSide-this.last.endSide)<0)
return false;if(this.from.length)
this.finishChunk(true);this.setMaxPoint=Math.max(this.setMaxPoint,chunk.maxPoint);this.chunks.push(chunk);this.chunkPos.push(from);let last=chunk.value.length-1;this.last=chunk.value[last];this.lastFrom=chunk.from[last]+from;this.lastTo=chunk.to[last]+from;return true;}
finish(){return this.finishInner(RangeSet.empty);}
finishInner(next){if(this.from.length)
this.finishChunk(false);if(this.chunks.length==0)
return next;let result=RangeSet.create(this.chunkPos,this.chunks,this.nextLayer?this.nextLayer.finishInner(next):next,this.setMaxPoint);this.from=null;return result;}}
function findSharedChunks(a,b,textDiff){let inA=new Map();for(let set of a)
for(let i=0;i<set.chunk.length;i++)
if(set.chunk[i].maxPoint<=0)
inA.set(set.chunk[i],set.chunkPos[i]);let shared=new Set();for(let set of b)
for(let i=0;i<set.chunk.length;i++){let known=inA.get(set.chunk[i]);if(known!=null&&(textDiff?textDiff.mapPos(known):known)==set.chunkPos[i]&&!(textDiff===null||textDiff===void 0?void 0:textDiff.touchesRange(known,known+set.chunk[i].length)))
shared.add(set.chunk[i]);}
return shared;}
class LayerCursor{constructor(layer,skip,minPoint,rank=0){this.layer=layer;this.skip=skip;this.minPoint=minPoint;this.rank=rank;}
get startSide(){return this.value?this.value.startSide:0;}
get endSide(){return this.value?this.value.endSide:0;}
goto(pos,side=-1000000000){this.chunkIndex=this.rangeIndex=0;this.gotoInner(pos,side,false);return this;}
gotoInner(pos,side,forward){while(this.chunkIndex<this.layer.chunk.length){let next=this.layer.chunk[this.chunkIndex];if(!(this.skip&&this.skip.has(next)||this.layer.chunkEnd(this.chunkIndex)<pos||next.maxPoint<this.minPoint))
break;this.chunkIndex++;forward=false;}
if(this.chunkIndex<this.layer.chunk.length){let rangeIndex=this.layer.chunk[this.chunkIndex].findIndex(pos-this.layer.chunkPos[this.chunkIndex],side,true);if(!forward||this.rangeIndex<rangeIndex)
this.setRangeIndex(rangeIndex);}
this.next();}
forward(pos,side){if((this.to-pos||this.endSide-side)<0)
this.gotoInner(pos,side,true);}
next(){for(;;){if(this.chunkIndex==this.layer.chunk.length){this.from=this.to=1000000000;this.value=null;break;}
else{let chunkPos=this.layer.chunkPos[this.chunkIndex],chunk=this.layer.chunk[this.chunkIndex];let from=chunkPos+chunk.from[this.rangeIndex];this.from=from;this.to=chunkPos+chunk.to[this.rangeIndex];this.value=chunk.value[this.rangeIndex];this.setRangeIndex(this.rangeIndex+1);if(this.minPoint<0||this.value.point&&this.to-this.from>=this.minPoint)
break;}}}
setRangeIndex(index){if(index==this.layer.chunk[this.chunkIndex].value.length){this.chunkIndex++;if(this.skip){while(this.chunkIndex<this.layer.chunk.length&&this.skip.has(this.layer.chunk[this.chunkIndex]))
this.chunkIndex++;}
this.rangeIndex=0;}
else{this.rangeIndex=index;}}
nextChunk(){this.chunkIndex++;this.rangeIndex=0;this.next();}
compare(other){return this.from-other.from||this.startSide-other.startSide||this.rank-other.rank||this.to-other.to||this.endSide-other.endSide;}}
class HeapCursor{constructor(heap){this.heap=heap;}
static from(sets,skip=null,minPoint=-1){let heap=[];for(let i=0;i<sets.length;i++){for(let cur=sets[i];!cur.isEmpty;cur=cur.nextLayer){if(cur.maxPoint>=minPoint)
heap.push(new LayerCursor(cur,skip,minPoint,i));}}
return heap.length==1?heap[0]:new HeapCursor(heap);}
get startSide(){return this.value?this.value.startSide:0;}
goto(pos,side=-1000000000){for(let cur of this.heap)
cur.goto(pos,side);for(let i=this.heap.length>>1;i>=0;i--)
heapBubble(this.heap,i);this.next();return this;}
forward(pos,side){for(let cur of this.heap)
cur.forward(pos,side);for(let i=this.heap.length>>1;i>=0;i--)
heapBubble(this.heap,i);if((this.to-pos||this.value.endSide-side)<0)
this.next();}
next(){if(this.heap.length==0){this.from=this.to=1000000000;this.value=null;this.rank=-1;}
else{let top=this.heap[0];this.from=top.from;this.to=top.to;this.value=top.value;this.rank=top.rank;if(top.value)
top.next();heapBubble(this.heap,0);}}}
function heapBubble(heap,index){for(let cur=heap[index];;){let childIndex=(index<<1)+1;if(childIndex>=heap.length)
break;let child=heap[childIndex];if(childIndex+1<heap.length&&child.compare(heap[childIndex+1])>=0){child=heap[childIndex+1];childIndex++;}
if(cur.compare(child)<0)
break;heap[childIndex]=cur;heap[index]=child;index=childIndex;}}
class SpanCursor{constructor(sets,skip,minPoint){this.minPoint=minPoint;this.active=[];this.activeTo=[];this.activeRank=[];this.minActive=-1;this.point=null;this.pointFrom=0;this.pointRank=0;this.to=-1000000000;this.endSide=0;this.openStart=-1;this.cursor=HeapCursor.from(sets,skip,minPoint);}
goto(pos,side=-1000000000){this.cursor.goto(pos,side);this.active.length=this.activeTo.length=this.activeRank.length=0;this.minActive=-1;this.to=pos;this.endSide=side;this.openStart=-1;this.next();return this;}
forward(pos,side){while(this.minActive>-1&&(this.activeTo[this.minActive]-pos||this.active[this.minActive].endSide-side)<0)
this.removeActive(this.minActive);this.cursor.forward(pos,side);}
removeActive(index){remove(this.active,index);remove(this.activeTo,index);remove(this.activeRank,index);this.minActive=findMinIndex(this.active,this.activeTo);}
addActive(trackOpen){let i=0,{value,to,rank}=this.cursor;while(i<this.activeRank.length&&this.activeRank[i]<=rank)
i++;insert(this.active,i,value);insert(this.activeTo,i,to);insert(this.activeRank,i,rank);if(trackOpen)
insert(trackOpen,i,this.cursor.from);this.minActive=findMinIndex(this.active,this.activeTo);}
next(){let from=this.to,wasPoint=this.point;this.point=null;let trackOpen=this.openStart<0?[]:null,trackExtra=0;for(;;){let a=this.minActive;if(a>-1&&(this.activeTo[a]-this.cursor.from||this.active[a].endSide-this.cursor.startSide)<0){if(this.activeTo[a]>from){this.to=this.activeTo[a];this.endSide=this.active[a].endSide;break;}
this.removeActive(a);if(trackOpen)
remove(trackOpen,a);}
else if(!this.cursor.value){this.to=this.endSide=1000000000;break;}
else if(this.cursor.from>from){this.to=this.cursor.from;this.endSide=this.cursor.startSide;break;}
else{let nextVal=this.cursor.value;if(!nextVal.point){this.addActive(trackOpen);this.cursor.next();}
else if(wasPoint&&this.cursor.to==this.to&&this.cursor.from<this.cursor.to){this.cursor.next();}
else{this.point=nextVal;this.pointFrom=this.cursor.from;this.pointRank=this.cursor.rank;this.to=this.cursor.to;this.endSide=nextVal.endSide;if(this.cursor.from<from)
trackExtra=1;this.cursor.next();this.forward(this.to,this.endSide);break;}}}
if(trackOpen){let openStart=0;while(openStart<trackOpen.length&&trackOpen[openStart]<from)
openStart++;this.openStart=openStart+trackExtra;}}
activeForPoint(to){if(!this.active.length)
return this.active;let active=[];for(let i=this.active.length-1;i>=0;i--){if(this.activeRank[i]<this.pointRank)
break;if(this.activeTo[i]>to||this.activeTo[i]==to&&this.active[i].endSide>=this.point.endSide)
active.push(this.active[i]);}
return active.reverse();}
openEnd(to){let open=0;for(let i=this.activeTo.length-1;i>=0&&this.activeTo[i]>to;i--)
open++;return open;}}
function compare(a,startA,b,startB,length,comparator){a.goto(startA);b.goto(startB);let endB=startB+length;let pos=startB,dPos=startB-startA;for(;;){let diff=(a.to+dPos)-b.to||a.endSide-b.endSide;let end=diff<0?a.to+dPos:b.to,clipEnd=Math.min(end,endB);if(a.point||b.point){if(!(a.point&&b.point&&(a.point==b.point||a.point.eq(b.point))&&sameValues(a.activeForPoint(a.to+dPos),b.activeForPoint(b.to))))
comparator.comparePoint(pos,clipEnd,a.point,b.point);}
else{if(clipEnd>pos&&!sameValues(a.active,b.active))
comparator.compareRange(pos,clipEnd,a.active,b.active);}
if(end>endB)
break;pos=end;if(diff<=0)
a.next();if(diff>=0)
b.next();}}
function sameValues(a,b){if(a.length!=b.length)
return false;for(let i=0;i<a.length;i++)
if(a[i]!=b[i]&&!a[i].eq(b[i]))
return false;return true;}
function remove(array,index){for(let i=index,e=array.length-1;i<e;i++)
array[i]=array[i+1];array.pop();}
function insert(array,index,value){for(let i=array.length-1;i>=index;i--)
array[i+1]=array[i];array[index]=value;}
function findMinIndex(value,array){let found=-1,foundPos=1000000000;for(let i=0;i<array.length;i++)
if((array[i]-foundPos||value[i].endSide-value[found].endSide)<0){found=i;foundPos=array[i];}
return found;}
function countColumn(string,tabSize,to=string.length){let n=0;for(let i=0;i<to;){if(string.charCodeAt(i)==9){n+=tabSize-(n%tabSize);i++;}
else{n++;i=findClusterBreak(string,i);}}
return n;}
function findColumn(string,col,tabSize,strict){for(let i=0,n=0;;){if(n>=col)
return i;if(i==string.length)
break;n+=string.charCodeAt(i)==9?tabSize-(n%tabSize):1;i=findClusterBreak(string,i);}
return strict===true?-1:string.length;}
const C="\u037c";const COUNT=typeof Symbol=="undefined"?"__"+C:Symbol.for(C);const SET=typeof Symbol=="undefined"?"__styleSet"+Math.floor(Math.random()*1e8):Symbol("styleSet");const top=typeof globalThis!="undefined"?globalThis:typeof window!="undefined"?window:{};class StyleModule{constructor(spec,options){this.rules=[];let{finish}=options||{};function splitSelector(selector){return /^@/.test(selector)?[selector]:selector.split(/,\s*/)}
function render(selectors,spec,target,isKeyframes){let local=[],isAt=/^@(\w+)\b/.exec(selectors[0]),keyframes=isAt&&isAt[1]=="keyframes";if(isAt&&spec==null)return target.push(selectors[0]+";")
for(let prop in spec){let value=spec[prop];if(/&/.test(prop)){render(prop.split(/,\s*/).map(part=>selectors.map(sel=>part.replace(/&/,sel))).reduce((a,b)=>a.concat(b)),value,target);}else if(value&&typeof value=="object"){if(!isAt)throw new RangeError("The value of a property ("+prop+") should be a primitive value.")
render(splitSelector(prop),value,local,keyframes);}else if(value!=null){local.push(prop.replace(/_.*/,"").replace(/[A-Z]/g,l=>"-"+l.toLowerCase())+": "+value+";");}}
if(local.length||keyframes){target.push((finish&&!isAt&&!isKeyframes?selectors.map(finish):selectors).join(", ")+
" {"+local.join(" ")+"}");}}
for(let prop in spec)render(splitSelector(prop),spec[prop],this.rules);}
getRules(){return this.rules.join("\n")}
static newName(){let id=top[COUNT]||1;top[COUNT]=id+1;return C+id.toString(36)}
static mount(root,modules){(root[SET]||new StyleSet(root)).mount(Array.isArray(modules)?modules:[modules]);}}
let adoptedSet=null;class StyleSet{constructor(root){if(!root.head&&root.adoptedStyleSheets&&typeof CSSStyleSheet!="undefined"){if(adoptedSet){root.adoptedStyleSheets=[adoptedSet.sheet].concat(root.adoptedStyleSheets);return root[SET]=adoptedSet}
this.sheet=new CSSStyleSheet;root.adoptedStyleSheets=[this.sheet].concat(root.adoptedStyleSheets);adoptedSet=this;}else{this.styleTag=(root.ownerDocument||root).createElement("style");let target=root.head||root;target.insertBefore(this.styleTag,target.firstChild);}
this.modules=[];root[SET]=this;}
mount(modules){let sheet=this.sheet;let pos=0,j=0;for(let i=0;i<modules.length;i++){let mod=modules[i],index=this.modules.indexOf(mod);if(index<j&&index>-1){this.modules.splice(index,1);j--;index=-1;}
if(index==-1){this.modules.splice(j++,0,mod);if(sheet)for(let k=0;k<mod.rules.length;k++)
sheet.insertRule(mod.rules[k],pos++);}else{while(j<index)pos+=this.modules[j++].rules.length;pos+=mod.rules.length;j++;}}
if(!sheet){let text="";for(let i=0;i<this.modules.length;i++)
text+=this.modules[i].getRules()+"\n";this.styleTag.textContent=text;}}}
var base={8:"Backspace",9:"Tab",10:"Enter",12:"NumLock",13:"Enter",16:"Shift",17:"Control",18:"Alt",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",44:"PrintScreen",45:"Insert",46:"Delete",59:";",61:"=",91:"Meta",92:"Meta",106:"*",107:"+",108:",",109:"-",110:".",111:"/",144:"NumLock",145:"ScrollLock",160:"Shift",161:"Shift",162:"Control",163:"Control",164:"Alt",165:"Alt",173:"-",186:";",187:"=",188:",",189:"-",190:".",191:"/",192:"`",219:"[",220:"\\",221:"]",222:"'",229:"q"};var shift={48:")",49:"!",50:"@",51:"#",52:"$",53:"%",54:"^",55:"&",56:"*",57:"(",59:":",61:"+",173:"_",186:":",187:"+",188:"<",189:"_",190:">",191:"?",192:"~",219:"{",220:"|",221:"}",222:"\"",229:"Q"};var chrome$1=typeof navigator!="undefined"&&/Chrome\/(\d+)/.exec(navigator.userAgent);typeof navigator!="undefined"&&/Apple Computer/.test(navigator.vendor);var gecko$1=typeof navigator!="undefined"&&/Gecko\/\d+/.test(navigator.userAgent);var mac=typeof navigator!="undefined"&&/Mac/.test(navigator.platform);typeof navigator!="undefined"&&/MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);chrome$1&&(mac||+chrome$1[1]<57)||gecko$1&&mac;for(var i=0;i<10;i++)base[48+i]=base[96+i]=String(i);for(var i=1;i<=24;i++)base[i+111]="F"+i;for(var i=65;i<=90;i++){base[i]=String.fromCharCode(i+32);shift[i]=String.fromCharCode(i);}
for(var code in base)if(!shift.hasOwnProperty(code))shift[code]=base[code];function getSelection(root){let target;if(root.nodeType==11){target=root.getSelection?root:root.ownerDocument;}
else{target=root;}
return target.getSelection();}
function contains(dom,node){return node?dom==node||dom.contains(node.nodeType!=1?node.parentNode:node):false;}
function deepActiveElement(){let elt=document.activeElement;while(elt&&elt.shadowRoot)
elt=elt.shadowRoot.activeElement;return elt;}
function hasSelection(dom,selection){if(!selection.anchorNode)
return false;try{return contains(dom,selection.anchorNode);}
catch(_){return false;}}
function clientRectsFor(dom){if(dom.nodeType==3)
return textRange(dom,0,dom.nodeValue.length).getClientRects();else if(dom.nodeType==1)
return dom.getClientRects();else
return[];}
function isEquivalentPosition(node,off,targetNode,targetOff){return targetNode?(scanFor(node,off,targetNode,targetOff,-1)||scanFor(node,off,targetNode,targetOff,1)):false;}
function domIndex(node){for(var index=0;;index++){node=node.previousSibling;if(!node)
return index;}}
function scanFor(node,off,targetNode,targetOff,dir){for(;;){if(node==targetNode&&off==targetOff)
return true;if(off==(dir<0?0:maxOffset(node))){if(node.nodeName=="DIV")
return false;let parent=node.parentNode;if(!parent||parent.nodeType!=1)
return false;off=domIndex(node)+(dir<0?0:1);node=parent;}
else if(node.nodeType==1){node=node.childNodes[off+(dir<0?-1:0)];if(node.nodeType==1&&node.contentEditable=="false")
return false;off=dir<0?maxOffset(node):0;}
else{return false;}}}
function maxOffset(node){return node.nodeType==3?node.nodeValue.length:node.childNodes.length;}
const Rect0={left:0,right:0,top:0,bottom:0};function flattenRect(rect,left){let x=left?rect.left:rect.right;return{left:x,right:x,top:rect.top,bottom:rect.bottom};}
function windowRect(win){return{left:0,right:win.innerWidth,top:0,bottom:win.innerHeight};}
function scrollRectIntoView(dom,rect,side,x,y,xMargin,yMargin,ltr){let doc=dom.ownerDocument,win=doc.defaultView;for(let cur=dom;cur;){if(cur.nodeType==1){let bounding,top=cur==doc.body;if(top){bounding=windowRect(win);}
else{if(cur.scrollHeight<=cur.clientHeight&&cur.scrollWidth<=cur.clientWidth){cur=cur.parentNode;continue;}
let rect=cur.getBoundingClientRect();bounding={left:rect.left,right:rect.left+cur.clientWidth,top:rect.top,bottom:rect.top+cur.clientHeight};}
let moveX=0,moveY=0;if(y=="nearest"){if(rect.top<bounding.top){moveY=-(bounding.top-rect.top+yMargin);if(side>0&&rect.bottom>bounding.bottom+moveY)
moveY=rect.bottom-bounding.bottom+moveY+yMargin;}
else if(rect.bottom>bounding.bottom){moveY=rect.bottom-bounding.bottom+yMargin;if(side<0&&(rect.top-moveY)<bounding.top)
moveY=-(bounding.top+moveY-rect.top+yMargin);}}
else{let rectHeight=rect.bottom-rect.top,boundingHeight=bounding.bottom-bounding.top;let targetTop=y=="center"&&rectHeight<=boundingHeight?rect.top+rectHeight/2-boundingHeight/2:y=="start"||y=="center"&&side<0?rect.top-yMargin:rect.bottom-boundingHeight+yMargin;moveY=targetTop-bounding.top;}
if(x=="nearest"){if(rect.left<bounding.left){moveX=-(bounding.left-rect.left+xMargin);if(side>0&&rect.right>bounding.right+moveX)
moveX=rect.right-bounding.right+moveX+xMargin;}
else if(rect.right>bounding.right){moveX=rect.right-bounding.right+xMargin;if(side<0&&rect.left<bounding.left+moveX)
moveX=-(bounding.left+moveX-rect.left+xMargin);}}
else{let targetLeft=x=="center"?rect.left+(rect.right-rect.left)/2-(bounding.right-bounding.left)/2:(x=="start")==ltr?rect.left-xMargin:rect.right-(bounding.right-bounding.left)+xMargin;moveX=targetLeft-bounding.left;}
if(moveX||moveY){if(top){win.scrollBy(moveX,moveY);}
else{if(moveY){let start=cur.scrollTop;cur.scrollTop+=moveY;moveY=cur.scrollTop-start;}
if(moveX){let start=cur.scrollLeft;cur.scrollLeft+=moveX;moveX=cur.scrollLeft-start;}
rect={left:rect.left-moveX,top:rect.top-moveY,right:rect.right-moveX,bottom:rect.bottom-moveY};}}
if(top)
break;cur=cur.assignedSlot||cur.parentNode;x=y="nearest";}
else if(cur.nodeType==11){cur=cur.host;}
else{break;}}}
class DOMSelectionState{constructor(){this.anchorNode=null;this.anchorOffset=0;this.focusNode=null;this.focusOffset=0;}
eq(domSel){return this.anchorNode==domSel.anchorNode&&this.anchorOffset==domSel.anchorOffset&&this.focusNode==domSel.focusNode&&this.focusOffset==domSel.focusOffset;}
setRange(range){this.set(range.anchorNode,range.anchorOffset,range.focusNode,range.focusOffset);}
set(anchorNode,anchorOffset,focusNode,focusOffset){this.anchorNode=anchorNode;this.anchorOffset=anchorOffset;this.focusNode=focusNode;this.focusOffset=focusOffset;}}
let preventScrollSupported=null;function focusPreventScroll(dom){if(dom.setActive)
return dom.setActive();if(preventScrollSupported)
return dom.focus(preventScrollSupported);let stack=[];for(let cur=dom;cur;cur=cur.parentNode){stack.push(cur,cur.scrollTop,cur.scrollLeft);if(cur==cur.ownerDocument)
break;}
dom.focus(preventScrollSupported==null?{get preventScroll(){preventScrollSupported={preventScroll:true};return true;}}:undefined);if(!preventScrollSupported){preventScrollSupported=false;for(let i=0;i<stack.length;){let elt=stack[i++],top=stack[i++],left=stack[i++];if(elt.scrollTop!=top)
elt.scrollTop=top;if(elt.scrollLeft!=left)
elt.scrollLeft=left;}}}
let scratchRange;function textRange(node,from,to=from){let range=scratchRange||(scratchRange=document.createRange());range.setEnd(node,to);range.setStart(node,from);return range;}
function dispatchKey(elt,name,code){let options={key:name,code:name,keyCode:code,which:code,cancelable:true};let down=new KeyboardEvent("keydown",options);down.synthetic=true;elt.dispatchEvent(down);let up=new KeyboardEvent("keyup",options);up.synthetic=true;elt.dispatchEvent(up);return down.defaultPrevented||up.defaultPrevented;}
function getRoot(node){while(node){if(node&&(node.nodeType==9||node.nodeType==11&&node.host))
return node;node=node.assignedSlot||node.parentNode;}
return null;}
function clearAttributes(node){while(node.attributes.length)
node.removeAttributeNode(node.attributes[0]);}
class DOMPos{constructor(node,offset,precise=true){this.node=node;this.offset=offset;this.precise=precise;}
static before(dom,precise){return new DOMPos(dom.parentNode,domIndex(dom),precise);}
static after(dom,precise){return new DOMPos(dom.parentNode,domIndex(dom)+1,precise);}}
const noChildren=[];class ContentView{constructor(){this.parent=null;this.dom=null;this.dirty=2;}
get editorView(){if(!this.parent)
throw new Error("Accessing view in orphan content view");return this.parent.editorView;}
get overrideDOMText(){return null;}
get posAtStart(){return this.parent?this.parent.posBefore(this):0;}
get posAtEnd(){return this.posAtStart+this.length;}
posBefore(view){let pos=this.posAtStart;for(let child of this.children){if(child==view)
return pos;pos+=child.length+child.breakAfter;}
throw new RangeError("Invalid child in posBefore");}
posAfter(view){return this.posBefore(view)+view.length;}
coordsAt(_pos,_side){return null;}
sync(track){if(this.dirty&2){let parent=this.dom;let prev=null,next;for(let child of this.children){if(child.dirty){if(!child.dom&&(next=prev?prev.nextSibling:parent.firstChild)){let contentView=ContentView.get(next);if(!contentView||!contentView.parent&&contentView.constructor==child.constructor)
child.reuseDOM(next);}
child.sync(track);child.dirty=0;}
next=prev?prev.nextSibling:parent.firstChild;if(track&&!track.written&&track.node==parent&&next!=child.dom)
track.written=true;if(child.dom.parentNode==parent){while(next&&next!=child.dom)
next=rm$1(next);}
else{parent.insertBefore(child.dom,next);}
prev=child.dom;}
next=prev?prev.nextSibling:parent.firstChild;if(next&&track&&track.node==parent)
track.written=true;while(next)
next=rm$1(next);}
else if(this.dirty&1){for(let child of this.children)
if(child.dirty){child.sync(track);child.dirty=0;}}}
reuseDOM(_dom){}
localPosFromDOM(node,offset){let after;if(node==this.dom){after=this.dom.childNodes[offset];}
else{let bias=maxOffset(node)==0?0:offset==0?-1:1;for(;;){let parent=node.parentNode;if(parent==this.dom)
break;if(bias==0&&parent.firstChild!=parent.lastChild){if(node==parent.firstChild)
bias=-1;else
bias=1;}
node=parent;}
if(bias<0)
after=node;else
after=node.nextSibling;}
if(after==this.dom.firstChild)
return 0;while(after&&!ContentView.get(after))
after=after.nextSibling;if(!after)
return this.length;for(let i=0,pos=0;;i++){let child=this.children[i];if(child.dom==after)
return pos;pos+=child.length+child.breakAfter;}}
domBoundsAround(from,to,offset=0){let fromI=-1,fromStart=-1,toI=-1,toEnd=-1;for(let i=0,pos=offset,prevEnd=offset;i<this.children.length;i++){let child=this.children[i],end=pos+child.length;if(pos<from&&end>to)
return child.domBoundsAround(from,to,pos);if(end>=from&&fromI==-1){fromI=i;fromStart=pos;}
if(pos>to&&child.dom.parentNode==this.dom){toI=i;toEnd=prevEnd;break;}
prevEnd=end;pos=end+child.breakAfter;}
return{from:fromStart,to:toEnd<0?offset+this.length:toEnd,startDOM:(fromI?this.children[fromI-1].dom.nextSibling:null)||this.dom.firstChild,endDOM:toI<this.children.length&&toI>=0?this.children[toI].dom:null};}
markDirty(andParent=false){this.dirty|=2;this.markParentsDirty(andParent);}
markParentsDirty(childList){for(let parent=this.parent;parent;parent=parent.parent){if(childList)
parent.dirty|=2;if(parent.dirty&1)
return;parent.dirty|=1;childList=false;}}
setParent(parent){if(this.parent!=parent){this.parent=parent;if(this.dirty)
this.markParentsDirty(true);}}
setDOM(dom){if(this.dom)
this.dom.cmView=null;this.dom=dom;dom.cmView=this;}
get rootView(){for(let v=this;;){let parent=v.parent;if(!parent)
return v;v=parent;}}
replaceChildren(from,to,children=noChildren){this.markDirty();for(let i=from;i<to;i++){let child=this.children[i];if(child.parent==this)
child.destroy();}
this.children.splice(from,to-from,...children);for(let i=0;i<children.length;i++)
children[i].setParent(this);}
ignoreMutation(_rec){return false;}
ignoreEvent(_event){return false;}
childCursor(pos=this.length){return new ChildCursor(this.children,pos,this.children.length);}
childPos(pos,bias=1){return this.childCursor().findPos(pos,bias);}
toString(){let name=this.constructor.name.replace("View","");return name+(this.children.length?"("+this.children.join()+")":this.length?"["+(name=="Text"?this.text:this.length)+"]":"")+
(this.breakAfter?"#":"");}
static get(node){return node.cmView;}
get isEditable(){return true;}
merge(from,to,source,hasStart,openStart,openEnd){return false;}
become(other){return false;}
getSide(){return 0;}
destroy(){this.parent=null;}}
ContentView.prototype.breakAfter=0;function rm$1(dom){let next=dom.nextSibling;dom.parentNode.removeChild(dom);return next;}
class ChildCursor{constructor(children,pos,i){this.children=children;this.pos=pos;this.i=i;this.off=0;}
findPos(pos,bias=1){for(;;){if(pos>this.pos||pos==this.pos&&(bias>0||this.i==0||this.children[this.i-1].breakAfter)){this.off=pos-this.pos;return this;}
let next=this.children[--this.i];this.pos-=next.length+next.breakAfter;}}}
function replaceRange(parent,fromI,fromOff,toI,toOff,insert,breakAtStart,openStart,openEnd){let{children}=parent;let before=children.length?children[fromI]:null;let last=insert.length?insert[insert.length-1]:null;let breakAtEnd=last?last.breakAfter:breakAtStart;if(fromI==toI&&before&&!breakAtStart&&!breakAtEnd&&insert.length<2&&before.merge(fromOff,toOff,insert.length?last:null,fromOff==0,openStart,openEnd))
return;if(toI<children.length){let after=children[toI];if(after&&toOff<after.length){if(fromI==toI){after=after.split(toOff);toOff=0;}
if(!breakAtEnd&&last&&after.merge(0,toOff,last,true,0,openEnd)){insert[insert.length-1]=after;}
else{if(toOff)
after.merge(0,toOff,null,false,0,openEnd);insert.push(after);}}
else if(after===null||after===void 0?void 0:after.breakAfter){if(last)
last.breakAfter=1;else
breakAtStart=1;}
toI++;}
if(before){before.breakAfter=breakAtStart;if(fromOff>0){if(!breakAtStart&&insert.length&&before.merge(fromOff,before.length,insert[0],false,openStart,0)){before.breakAfter=insert.shift().breakAfter;}
else if(fromOff<before.length||before.children.length&&before.children[before.children.length-1].length==0){before.merge(fromOff,before.length,null,false,openStart,0);}
fromI++;}}
while(fromI<toI&&insert.length){if(children[toI-1].become(insert[insert.length-1])){toI--;insert.pop();openEnd=insert.length?0:openStart;}
else if(children[fromI].become(insert[0])){fromI++;insert.shift();openStart=insert.length?0:openEnd;}
else{break;}}
if(!insert.length&&fromI&&toI<children.length&&!children[fromI-1].breakAfter&&children[toI].merge(0,0,children[fromI-1],false,openStart,openEnd))
fromI--;if(fromI<toI||insert.length)
parent.replaceChildren(fromI,toI,insert);}
function mergeChildrenInto(parent,from,to,insert,openStart,openEnd){let cur=parent.childCursor();let{i:toI,off:toOff}=cur.findPos(to,1);let{i:fromI,off:fromOff}=cur.findPos(from,-1);let dLen=from-to;for(let view of insert)
dLen+=view.length;parent.length+=dLen;replaceRange(parent,fromI,fromOff,toI,toOff,insert,0,openStart,openEnd);}
let nav=typeof navigator!="undefined"?navigator:{userAgent:"",vendor:"",platform:""};let doc=typeof document!="undefined"?document:{documentElement:{style:{}}};const ie_edge=/Edge\/(\d+)/.exec(nav.userAgent);const ie_upto10=/MSIE \d/.test(nav.userAgent);const ie_11up=/Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(nav.userAgent);const ie=!!(ie_upto10||ie_11up||ie_edge);const gecko=!ie&&/gecko\/(\d+)/i.test(nav.userAgent);const chrome=!ie&&/Chrome\/(\d+)/.exec(nav.userAgent);const webkit="webkitFontSmoothing"in doc.documentElement.style;const safari=!ie&&/Apple Computer/.test(nav.vendor);const ios=safari&&(/Mobile\/\w+/.test(nav.userAgent)||nav.maxTouchPoints>2);var browser={mac:ios||/Mac/.test(nav.platform),windows:/Win/.test(nav.platform),linux:/Linux|X11/.test(nav.platform),ie,ie_version:ie_upto10?doc.documentMode||6:ie_11up?+ie_11up[1]:ie_edge?+ie_edge[1]:0,gecko,gecko_version:gecko?+(/Firefox\/(\d+)/.exec(nav.userAgent)||[0,0])[1]:0,chrome:!!chrome,chrome_version:chrome?+chrome[1]:0,ios,android:/Android\b/.test(nav.userAgent),webkit,safari,webkit_version:webkit?+(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent)||[0,0])[1]:0,tabSize:doc.documentElement.style.tabSize!=null?"tab-size":"-moz-tab-size"};const MaxJoinLen=256;class TextView extends ContentView{constructor(text){super();this.text=text;}
get length(){return this.text.length;}
createDOM(textDOM){this.setDOM(textDOM||document.createTextNode(this.text));}
sync(track){if(!this.dom)
this.createDOM();if(this.dom.nodeValue!=this.text){if(track&&track.node==this.dom)
track.written=true;this.dom.nodeValue=this.text;}}
reuseDOM(dom){if(dom.nodeType==3)
this.createDOM(dom);}
merge(from,to,source){if(source&&(!(source instanceof TextView)||this.length-(to-from)+source.length>MaxJoinLen))
return false;this.text=this.text.slice(0,from)+(source?source.text:"")+this.text.slice(to);this.markDirty();return true;}
split(from){let result=new TextView(this.text.slice(from));this.text=this.text.slice(0,from);this.markDirty();return result;}
localPosFromDOM(node,offset){return node==this.dom?offset:offset?this.text.length:0;}
domAtPos(pos){return new DOMPos(this.dom,pos);}
domBoundsAround(_from,_to,offset){return{from:offset,to:offset+this.length,startDOM:this.dom,endDOM:this.dom.nextSibling};}
coordsAt(pos,side){return textCoords(this.dom,pos,side);}}
class MarkView extends ContentView{constructor(mark,children=[],length=0){super();this.mark=mark;this.children=children;this.length=length;for(let ch of children)
ch.setParent(this);}
setAttrs(dom){clearAttributes(dom);if(this.mark.class)
dom.className=this.mark.class;if(this.mark.attrs)
for(let name in this.mark.attrs)
dom.setAttribute(name,this.mark.attrs[name]);return dom;}
reuseDOM(node){if(node.nodeName==this.mark.tagName.toUpperCase()){this.setDOM(node);this.dirty|=4|2;}}
sync(track){if(!this.dom)
this.setDOM(this.setAttrs(document.createElement(this.mark.tagName)));else if(this.dirty&4)
this.setAttrs(this.dom);super.sync(track);}
merge(from,to,source,_hasStart,openStart,openEnd){if(source&&(!(source instanceof MarkView&&source.mark.eq(this.mark))||(from&&openStart<=0)||(to<this.length&&openEnd<=0)))
return false;mergeChildrenInto(this,from,to,source?source.children:[],openStart-1,openEnd-1);this.markDirty();return true;}
split(from){let result=[],off=0,detachFrom=-1,i=0;for(let elt of this.children){let end=off+elt.length;if(end>from)
result.push(off<from?elt.split(from-off):elt);if(detachFrom<0&&off>=from)
detachFrom=i;off=end;i++;}
let length=this.length-from;this.length=from;if(detachFrom>-1){this.children.length=detachFrom;this.markDirty();}
return new MarkView(this.mark,result,length);}
domAtPos(pos){return inlineDOMAtPos(this.dom,this.children,pos);}
coordsAt(pos,side){return coordsInChildren(this,pos,side);}}
function textCoords(text,pos,side){let length=text.nodeValue.length;if(pos>length)
pos=length;let from=pos,to=pos,flatten=0;if(pos==0&&side<0||pos==length&&side>=0){if(!(browser.chrome||browser.gecko)){if(pos){from--;flatten=1;}
else if(to<length){to++;flatten=-1;}}}
else{if(side<0)
from--;else if(to<length)
to++;}
let rects=textRange(text,from,to).getClientRects();if(!rects.length)
return Rect0;let rect=rects[(flatten?flatten<0:side>=0)?0:rects.length-1];if(browser.safari&&!flatten&&rect.width==0)
rect=Array.prototype.find.call(rects,r=>r.width)||rect;return flatten?flattenRect(rect,flatten<0):rect||null;}
class WidgetView extends ContentView{constructor(widget,length,side){super();this.widget=widget;this.length=length;this.side=side;this.prevWidget=null;}
static create(widget,length,side){return new(widget.customView||WidgetView)(widget,length,side);}
split(from){let result=WidgetView.create(this.widget,this.length-from,this.side);this.length-=from;return result;}
sync(){if(!this.dom||!this.widget.updateDOM(this.dom)){if(this.dom&&this.prevWidget)
this.prevWidget.destroy(this.dom);this.prevWidget=null;this.setDOM(this.widget.toDOM(this.editorView));this.dom.contentEditable="false";}}
getSide(){return this.side;}
merge(from,to,source,hasStart,openStart,openEnd){if(source&&(!(source instanceof WidgetView)||!this.widget.compare(source.widget)||from>0&&openStart<=0||to<this.length&&openEnd<=0))
return false;this.length=from+(source?source.length:0)+(this.length-to);return true;}
become(other){if(other.length==this.length&&other instanceof WidgetView&&other.side==this.side){if(this.widget.constructor==other.widget.constructor){if(!this.widget.eq(other.widget))
this.markDirty(true);if(this.dom&&!this.prevWidget)
this.prevWidget=this.widget;this.widget=other.widget;return true;}}
return false;}
ignoreMutation(){return true;}
ignoreEvent(event){return this.widget.ignoreEvent(event);}
get overrideDOMText(){if(this.length==0)
return Text.empty;let top=this;while(top.parent)
top=top.parent;let view=top.editorView,text=view&&view.state.doc,start=this.posAtStart;return text?text.slice(start,start+this.length):Text.empty;}
domAtPos(pos){return pos==0?DOMPos.before(this.dom):DOMPos.after(this.dom,pos==this.length);}
domBoundsAround(){return null;}
coordsAt(pos,side){let rects=this.dom.getClientRects(),rect=null;if(!rects.length)
return Rect0;for(let i=pos>0?rects.length-1:0;;i+=(pos>0?-1:1)){rect=rects[i];if(pos>0?i==0:i==rects.length-1||rect.top<rect.bottom)
break;}
return(pos==0&&side>0||pos==this.length&&side<=0)?rect:flattenRect(rect,pos==0);}
get isEditable(){return false;}
destroy(){super.destroy();if(this.dom)
this.widget.destroy(this.dom);}}
class CompositionView extends WidgetView{domAtPos(pos){let{topView,text}=this.widget;if(!topView)
return new DOMPos(text,Math.min(pos,text.nodeValue.length));return scanCompositionTree(pos,0,topView,text,(v,p)=>v.domAtPos(p),p=>new DOMPos(text,Math.min(p,text.nodeValue.length)));}
sync(){this.setDOM(this.widget.toDOM());}
localPosFromDOM(node,offset){let{topView,text}=this.widget;if(!topView)
return Math.min(offset,this.length);return posFromDOMInCompositionTree(node,offset,topView,text);}
ignoreMutation(){return false;}
get overrideDOMText(){return null;}
coordsAt(pos,side){let{topView,text}=this.widget;if(!topView)
return textCoords(text,pos,side);return scanCompositionTree(pos,side,topView,text,(v,pos,side)=>v.coordsAt(pos,side),(pos,side)=>textCoords(text,pos,side));}
destroy(){var _a;super.destroy();(_a=this.widget.topView)===null||_a===void 0?void 0:_a.destroy();}
get isEditable(){return true;}}
function scanCompositionTree(pos,side,view,text,enterView,fromText){if(view instanceof MarkView){for(let child of view.children){let hasComp=contains(child.dom,text);let len=hasComp?text.nodeValue.length:child.length;if(pos<len||pos==len&&child.getSide()<=0)
return hasComp?scanCompositionTree(pos,side,child,text,enterView,fromText):enterView(child,pos,side);pos-=len;}
return enterView(view,view.length,-1);}
else if(view.dom==text){return fromText(pos,side);}
else{return enterView(view,pos,side);}}
function posFromDOMInCompositionTree(node,offset,view,text){if(view instanceof MarkView){for(let child of view.children){let pos=0,hasComp=contains(child.dom,text);if(contains(child.dom,node))
return pos+(hasComp?posFromDOMInCompositionTree(node,offset,child,text):child.localPosFromDOM(node,offset));pos+=hasComp?text.nodeValue.length:child.length;}}
else if(view.dom==text){return Math.min(offset,text.nodeValue.length);}
return view.localPosFromDOM(node,offset);}
class WidgetBufferView extends ContentView{constructor(side){super();this.side=side;}
get length(){return 0;}
merge(){return false;}
become(other){return other instanceof WidgetBufferView&&other.side==this.side;}
split(){return new WidgetBufferView(this.side);}
sync(){if(!this.dom){let dom=document.createElement("img");dom.className="cm-widgetBuffer";dom.setAttribute("aria-hidden","true");this.setDOM(dom);}}
getSide(){return this.side;}
domAtPos(pos){return DOMPos.before(this.dom);}
localPosFromDOM(){return 0;}
domBoundsAround(){return null;}
coordsAt(pos){let imgRect=this.dom.getBoundingClientRect();let siblingRect=inlineSiblingRect(this,this.side>0?-1:1);return siblingRect&&siblingRect.top<imgRect.bottom&&siblingRect.bottom>imgRect.top?{left:imgRect.left,right:imgRect.right,top:siblingRect.top,bottom:siblingRect.bottom}:imgRect;}
get overrideDOMText(){return Text.empty;}}
TextView.prototype.children=WidgetView.prototype.children=WidgetBufferView.prototype.children=noChildren;function inlineSiblingRect(view,side){let parent=view.parent,index=parent?parent.children.indexOf(view):-1;while(parent&&index>=0){if(side<0?index>0:index<parent.children.length){let next=parent.children[index+side];if(next instanceof TextView){let nextRect=next.coordsAt(side<0?next.length:0,side);if(nextRect)
return nextRect;}
index+=side;}
else if(parent instanceof MarkView&&parent.parent){index=parent.parent.children.indexOf(parent)+(side<0?0:1);parent=parent.parent;}
else{let last=parent.dom.lastChild;if(last&&last.nodeName=="BR")
return last.getClientRects()[0];break;}}
return undefined;}
function inlineDOMAtPos(dom,children,pos){let i=0;for(let off=0;i<children.length;i++){let child=children[i],end=off+child.length;if(end==off&&child.getSide()<=0)
continue;if(pos>off&&pos<end&&child.dom.parentNode==dom)
return child.domAtPos(pos-off);if(pos<=off)
break;off=end;}
for(;i>0;i--){let before=children[i-1].dom;if(before.parentNode==dom)
return DOMPos.after(before);}
return new DOMPos(dom,0);}
function joinInlineInto(parent,view,open){let last,{children}=parent;if(open>0&&view instanceof MarkView&&children.length&&(last=children[children.length-1])instanceof MarkView&&last.mark.eq(view.mark)){joinInlineInto(last,view.children[0],open-1);}
else{children.push(view);view.setParent(parent);}
parent.length+=view.length;}
function coordsInChildren(view,pos,side){for(let off=0,i=0;i<view.children.length;i++){let child=view.children[i],end=off+child.length,next;if((side<=0||end==view.length||child.getSide()>0?end>=pos:end>pos)&&(pos<end||i+1==view.children.length||(next=view.children[i+1]).length||next.getSide()>0)){let flatten=0;if(end==off){if(child.getSide()<=0)
continue;flatten=side=-child.getSide();}
let rect=child.coordsAt(Math.max(0,pos-off),side);return flatten&&rect?flattenRect(rect,side<0):rect;}
off=end;}
let last=view.dom.lastChild;if(!last)
return view.dom.getBoundingClientRect();let rects=clientRectsFor(last);return rects[rects.length-1]||null;}
function combineAttrs(source,target){for(let name in source){if(name=="class"&&target.class)
target.class+=" "+source.class;else if(name=="style"&&target.style)
target.style+=";"+source.style;else
target[name]=source[name];}
return target;}
function attrsEq(a,b){if(a==b)
return true;if(!a||!b)
return false;let keysA=Object.keys(a),keysB=Object.keys(b);if(keysA.length!=keysB.length)
return false;for(let key of keysA){if(keysB.indexOf(key)==-1||a[key]!==b[key])
return false;}
return true;}
function updateAttrs(dom,prev,attrs){let changed=null;if(prev)
for(let name in prev)
if(!(attrs&&name in attrs))
dom.removeAttribute(changed=name);if(attrs)
for(let name in attrs)
if(!(prev&&prev[name]==attrs[name]))
dom.setAttribute(changed=name,attrs[name]);return!!changed;}
class WidgetType{eq(widget){return false;}
updateDOM(dom){return false;}
compare(other){return this==other||this.constructor==other.constructor&&this.eq(other);}
get estimatedHeight(){return-1;}
ignoreEvent(event){return true;}
get customView(){return null;}
destroy(dom){}}
var BlockType=(function(BlockType){BlockType[BlockType["Text"]=0]="Text";BlockType[BlockType["WidgetBefore"]=1]="WidgetBefore";BlockType[BlockType["WidgetAfter"]=2]="WidgetAfter";BlockType[BlockType["WidgetRange"]=3]="WidgetRange";return BlockType})(BlockType||(BlockType={}));class Decoration extends RangeValue{constructor(startSide,endSide,widget,spec){super();this.startSide=startSide;this.endSide=endSide;this.widget=widget;this.spec=spec;}
get heightRelevant(){return false;}
static mark(spec){return new MarkDecoration(spec);}
static widget(spec){let side=spec.side||0,block=!!spec.block;side+=block?(side>0?300000000:-400000000):(side>0?100000000:-100000000);return new PointDecoration(spec,side,side,block,spec.widget||null,false);}
static replace(spec){let block=!!spec.block,startSide,endSide;if(spec.isBlockGap){startSide=-500000000;endSide=400000000;}
else{let{start,end}=getInclusive(spec,block);startSide=(start?(block?-300000000:-1):500000000)-1;endSide=(end?(block?200000000:1):-600000000)+1;}
return new PointDecoration(spec,startSide,endSide,block,spec.widget||null,true);}
static line(spec){return new LineDecoration(spec);}
static set(of,sort=false){return RangeSet.of(of,sort);}
hasHeight(){return this.widget?this.widget.estimatedHeight>-1:false;}}
Decoration.none=RangeSet.empty;class MarkDecoration extends Decoration{constructor(spec){let{start,end}=getInclusive(spec);super(start?-1:500000000,end?1:-600000000,null,spec);this.tagName=spec.tagName||"span";this.class=spec.class||"";this.attrs=spec.attributes||null;}
eq(other){return this==other||other instanceof MarkDecoration&&this.tagName==other.tagName&&this.class==other.class&&attrsEq(this.attrs,other.attrs);}
range(from,to=from){if(from>=to)
throw new RangeError("Mark decorations may not be empty");return super.range(from,to);}}
MarkDecoration.prototype.point=false;class LineDecoration extends Decoration{constructor(spec){super(-200000000,-200000000,null,spec);}
eq(other){return other instanceof LineDecoration&&attrsEq(this.spec.attributes,other.spec.attributes);}
range(from,to=from){if(to!=from)
throw new RangeError("Line decoration ranges must be zero-length");return super.range(from,to);}}
LineDecoration.prototype.mapMode=MapMode.TrackBefore;LineDecoration.prototype.point=true;class PointDecoration extends Decoration{constructor(spec,startSide,endSide,block,widget,isReplace){super(startSide,endSide,widget,spec);this.block=block;this.isReplace=isReplace;this.mapMode=!block?MapMode.TrackDel:startSide<=0?MapMode.TrackBefore:MapMode.TrackAfter;}
get type(){return this.startSide<this.endSide?BlockType.WidgetRange:this.startSide<=0?BlockType.WidgetBefore:BlockType.WidgetAfter;}
get heightRelevant(){return this.block||!!this.widget&&this.widget.estimatedHeight>=5;}
eq(other){return other instanceof PointDecoration&&widgetsEq(this.widget,other.widget)&&this.block==other.block&&this.startSide==other.startSide&&this.endSide==other.endSide;}
range(from,to=from){if(this.isReplace&&(from>to||(from==to&&this.startSide>0&&this.endSide<=0)))
throw new RangeError("Invalid range for replacement decoration");if(!this.isReplace&&to!=from)
throw new RangeError("Widget decorations can only have zero-length ranges");return super.range(from,to);}}
PointDecoration.prototype.point=true;function getInclusive(spec,block=false){let{inclusiveStart:start,inclusiveEnd:end}=spec;if(start==null)
start=spec.inclusive;if(end==null)
end=spec.inclusive;return{start:start!==null&&start!==void 0?start:block,end:end!==null&&end!==void 0?end:block};}
function widgetsEq(a,b){return a==b||!!(a&&b&&a.compare(b));}
function addRange(from,to,ranges,margin=0){let last=ranges.length-1;if(last>=0&&ranges[last]+margin>=from)
ranges[last]=Math.max(ranges[last],to);else
ranges.push(from,to);}
class LineView extends ContentView{constructor(){super(...arguments);this.children=[];this.length=0;this.prevAttrs=undefined;this.attrs=null;this.breakAfter=0;}
merge(from,to,source,hasStart,openStart,openEnd){if(source){if(!(source instanceof LineView))
return false;if(!this.dom)
source.transferDOM(this);}
if(hasStart)
this.setDeco(source?source.attrs:null);mergeChildrenInto(this,from,to,source?source.children:[],openStart,openEnd);return true;}
split(at){let end=new LineView;end.breakAfter=this.breakAfter;if(this.length==0)
return end;let{i,off}=this.childPos(at);if(off){end.append(this.children[i].split(off),0);this.children[i].merge(off,this.children[i].length,null,false,0,0);i++;}
for(let j=i;j<this.children.length;j++)
end.append(this.children[j],0);while(i>0&&this.children[i-1].length==0)
this.children[--i].destroy();this.children.length=i;this.markDirty();this.length=at;return end;}
transferDOM(other){if(!this.dom)
return;this.markDirty();other.setDOM(this.dom);other.prevAttrs=this.prevAttrs===undefined?this.attrs:this.prevAttrs;this.prevAttrs=undefined;this.dom=null;}
setDeco(attrs){if(!attrsEq(this.attrs,attrs)){if(this.dom){this.prevAttrs=this.attrs;this.markDirty();}
this.attrs=attrs;}}
append(child,openStart){joinInlineInto(this,child,openStart);}
addLineDeco(deco){let attrs=deco.spec.attributes,cls=deco.spec.class;if(attrs)
this.attrs=combineAttrs(attrs,this.attrs||{});if(cls)
this.attrs=combineAttrs({class:cls},this.attrs||{});}
domAtPos(pos){return inlineDOMAtPos(this.dom,this.children,pos);}
reuseDOM(node){if(node.nodeName=="DIV"){this.setDOM(node);this.dirty|=4|2;}}
sync(track){var _a;if(!this.dom){this.setDOM(document.createElement("div"));this.dom.className="cm-line";this.prevAttrs=this.attrs?null:undefined;}
else if(this.dirty&4){clearAttributes(this.dom);this.dom.className="cm-line";this.prevAttrs=this.attrs?null:undefined;}
if(this.prevAttrs!==undefined){updateAttrs(this.dom,this.prevAttrs,this.attrs);this.dom.classList.add("cm-line");this.prevAttrs=undefined;}
super.sync(track);let last=this.dom.lastChild;while(last&&ContentView.get(last)instanceof MarkView)
last=last.lastChild;if(!last||!this.length||last.nodeName!="BR"&&((_a=ContentView.get(last))===null||_a===void 0?void 0:_a.isEditable)==false&&(!browser.ios||!this.children.some(ch=>ch instanceof TextView))){let hack=document.createElement("BR");hack.cmIgnore=true;this.dom.appendChild(hack);}}
measureTextSize(){if(this.children.length==0||this.length>20)
return null;let totalWidth=0;for(let child of this.children){if(!(child instanceof TextView))
return null;let rects=clientRectsFor(child.dom);if(rects.length!=1)
return null;totalWidth+=rects[0].width;}
return{lineHeight:this.dom.getBoundingClientRect().height,charWidth:totalWidth/this.length};}
coordsAt(pos,side){return coordsInChildren(this,pos,side);}
become(_other){return false;}
get type(){return BlockType.Text;}
static find(docView,pos){for(let i=0,off=0;i<docView.children.length;i++){let block=docView.children[i],end=off+block.length;if(end>=pos){if(block instanceof LineView)
return block;if(end>pos)
break;}
off=end+block.breakAfter;}
return null;}}
class BlockWidgetView extends ContentView{constructor(widget,length,type){super();this.widget=widget;this.length=length;this.type=type;this.breakAfter=0;this.prevWidget=null;}
merge(from,to,source,_takeDeco,openStart,openEnd){if(source&&(!(source instanceof BlockWidgetView)||!this.widget.compare(source.widget)||from>0&&openStart<=0||to<this.length&&openEnd<=0))
return false;this.length=from+(source?source.length:0)+(this.length-to);return true;}
domAtPos(pos){return pos==0?DOMPos.before(this.dom):DOMPos.after(this.dom,pos==this.length);}
split(at){let len=this.length-at;this.length=at;let end=new BlockWidgetView(this.widget,len,this.type);end.breakAfter=this.breakAfter;return end;}
get children(){return noChildren;}
sync(){if(!this.dom||!this.widget.updateDOM(this.dom)){if(this.dom&&this.prevWidget)
this.prevWidget.destroy(this.dom);this.prevWidget=null;this.setDOM(this.widget.toDOM(this.editorView));this.dom.contentEditable="false";}}
get overrideDOMText(){return this.parent?this.parent.view.state.doc.slice(this.posAtStart,this.posAtEnd):Text.empty;}
domBoundsAround(){return null;}
become(other){if(other instanceof BlockWidgetView&&other.type==this.type&&other.widget.constructor==this.widget.constructor){if(!other.widget.eq(this.widget))
this.markDirty(true);if(this.dom&&!this.prevWidget)
this.prevWidget=this.widget;this.widget=other.widget;this.length=other.length;this.breakAfter=other.breakAfter;return true;}
return false;}
ignoreMutation(){return true;}
ignoreEvent(event){return this.widget.ignoreEvent(event);}
destroy(){super.destroy();if(this.dom)
this.widget.destroy(this.dom);}}
class ContentBuilder{constructor(doc,pos,end,disallowBlockEffectsFor){this.doc=doc;this.pos=pos;this.end=end;this.disallowBlockEffectsFor=disallowBlockEffectsFor;this.content=[];this.curLine=null;this.breakAtStart=0;this.pendingBuffer=0;this.atCursorPos=true;this.openStart=-1;this.openEnd=-1;this.text="";this.textOff=0;this.cursor=doc.iter();this.skip=pos;}
posCovered(){if(this.content.length==0)
return!this.breakAtStart&&this.doc.lineAt(this.pos).from!=this.pos;let last=this.content[this.content.length-1];return!last.breakAfter&&!(last instanceof BlockWidgetView&&last.type==BlockType.WidgetBefore);}
getLine(){if(!this.curLine){this.content.push(this.curLine=new LineView);this.atCursorPos=true;}
return this.curLine;}
flushBuffer(active){if(this.pendingBuffer){this.curLine.append(wrapMarks(new WidgetBufferView(-1),active),active.length);this.pendingBuffer=0;}}
addBlockWidget(view){this.flushBuffer([]);this.curLine=null;this.content.push(view);}
finish(openEnd){if(!openEnd)
this.flushBuffer([]);else
this.pendingBuffer=0;if(!this.posCovered())
this.getLine();}
buildText(length,active,openStart){while(length>0){if(this.textOff==this.text.length){let{value,lineBreak,done}=this.cursor.next(this.skip);this.skip=0;if(done)
throw new Error("Ran out of text content when drawing inline views");if(lineBreak){if(!this.posCovered())
this.getLine();if(this.content.length)
this.content[this.content.length-1].breakAfter=1;else
this.breakAtStart=1;this.flushBuffer([]);this.curLine=null;length--;continue;}
else{this.text=value;this.textOff=0;}}
let take=Math.min(this.text.length-this.textOff,length,512);this.flushBuffer(active.slice(0,openStart));this.getLine().append(wrapMarks(new TextView(this.text.slice(this.textOff,this.textOff+take)),active),openStart);this.atCursorPos=true;this.textOff+=take;length-=take;openStart=0;}}
span(from,to,active,openStart){this.buildText(to-from,active,openStart);this.pos=to;if(this.openStart<0)
this.openStart=openStart;}
point(from,to,deco,active,openStart,index){if(this.disallowBlockEffectsFor[index]&&deco instanceof PointDecoration){if(deco.block)
throw new RangeError("Block decorations may not be specified via plugins");if(to>this.doc.lineAt(this.pos).to)
throw new RangeError("Decorations that replace line breaks may not be specified via plugins");}
let len=to-from;if(deco instanceof PointDecoration){if(deco.block){let{type}=deco;if(type==BlockType.WidgetAfter&&!this.posCovered())
this.getLine();this.addBlockWidget(new BlockWidgetView(deco.widget||new NullWidget("div"),len,type));}
else{let view=WidgetView.create(deco.widget||new NullWidget("span"),len,deco.startSide);let cursorBefore=this.atCursorPos&&!view.isEditable&&openStart<=active.length&&(from<to||deco.startSide>0);let cursorAfter=!view.isEditable&&(from<to||deco.startSide<=0);let line=this.getLine();if(this.pendingBuffer==2&&!cursorBefore)
this.pendingBuffer=0;this.flushBuffer(active);if(cursorBefore){line.append(wrapMarks(new WidgetBufferView(1),active),openStart);openStart=active.length+Math.max(0,openStart-active.length);}
line.append(wrapMarks(view,active),openStart);this.atCursorPos=cursorAfter;this.pendingBuffer=!cursorAfter?0:from<to?1:2;}}
else if(this.doc.lineAt(this.pos).from==this.pos){this.getLine().addLineDeco(deco);}
if(len){if(this.textOff+len<=this.text.length){this.textOff+=len;}
else{this.skip+=len-(this.text.length-this.textOff);this.text="";this.textOff=0;}
this.pos=to;}
if(this.openStart<0)
this.openStart=openStart;}
static build(text,from,to,decorations,dynamicDecorationMap){let builder=new ContentBuilder(text,from,to,dynamicDecorationMap);builder.openEnd=RangeSet.spans(decorations,from,to,builder);if(builder.openStart<0)
builder.openStart=builder.openEnd;builder.finish(builder.openEnd);return builder;}}
function wrapMarks(view,active){for(let mark of active)
view=new MarkView(mark,[view],view.length);return view;}
class NullWidget extends WidgetType{constructor(tag){super();this.tag=tag;}
eq(other){return other.tag==this.tag;}
toDOM(){return document.createElement(this.tag);}
updateDOM(elt){return elt.nodeName.toLowerCase()==this.tag;}}
const clickAddsSelectionRange=Facet.define();const dragMovesSelection$1=Facet.define();const mouseSelectionStyle=Facet.define();const exceptionSink=Facet.define();const updateListener=Facet.define();const inputHandler=Facet.define();const perLineTextDirection=Facet.define({combine:values=>values.some(x=>x)});class ScrollTarget{constructor(range,y="nearest",x="nearest",yMargin=5,xMargin=5){this.range=range;this.y=y;this.x=x;this.yMargin=yMargin;this.xMargin=xMargin;}
map(changes){return changes.empty?this:new ScrollTarget(this.range.map(changes),this.y,this.x,this.yMargin,this.xMargin);}}
const scrollIntoView=StateEffect.define({map:(t,ch)=>t.map(ch)});function logException(state,exception,context){let handler=state.facet(exceptionSink);if(handler.length)
handler[0](exception);else if(window.onerror)
window.onerror(String(exception),context,undefined,undefined,exception);else if(context)
console.error(context+":",exception);else
console.error(exception);}
const editable=Facet.define({combine:values=>values.length?values[0]:true});let nextPluginID=0;const viewPlugin=Facet.define();class ViewPlugin{constructor(id,create,domEventHandlers,buildExtensions){this.id=id;this.create=create;this.domEventHandlers=domEventHandlers;this.extension=buildExtensions(this);}
static define(create,spec){const{eventHandlers,provide,decorations:deco}=spec||{};return new ViewPlugin(nextPluginID++,create,eventHandlers,plugin=>{let ext=[viewPlugin.of(plugin)];if(deco)
ext.push(decorations.of(view=>{let pluginInst=view.plugin(plugin);return pluginInst?deco(pluginInst):Decoration.none;}));if(provide)
ext.push(provide(plugin));return ext;});}
static fromClass(cls,spec){return ViewPlugin.define(view=>new cls(view),spec);}}
class PluginInstance{constructor(spec){this.spec=spec;this.mustUpdate=null;this.value=null;}
update(view){if(!this.value){if(this.spec){try{this.value=this.spec.create(view);}
catch(e){logException(view.state,e,"CodeMirror plugin crashed");this.deactivate();}}}
else if(this.mustUpdate){let update=this.mustUpdate;this.mustUpdate=null;if(this.value.update){try{this.value.update(update);}
catch(e){logException(update.state,e,"CodeMirror plugin crashed");if(this.value.destroy)
try{this.value.destroy();}
catch(_){}
this.deactivate();}}}
return this;}
destroy(view){var _a;if((_a=this.value)===null||_a===void 0?void 0:_a.destroy){try{this.value.destroy();}
catch(e){logException(view.state,e,"CodeMirror plugin crashed");}}}
deactivate(){this.spec=this.value=null;}}
const editorAttributes=Facet.define();const contentAttributes=Facet.define();const decorations=Facet.define();const atomicRanges=Facet.define();const scrollMargins=Facet.define();const styleModule=Facet.define();class ChangedRange{constructor(fromA,toA,fromB,toB){this.fromA=fromA;this.toA=toA;this.fromB=fromB;this.toB=toB;}
join(other){return new ChangedRange(Math.min(this.fromA,other.fromA),Math.max(this.toA,other.toA),Math.min(this.fromB,other.fromB),Math.max(this.toB,other.toB));}
addToSet(set){let i=set.length,me=this;for(;i>0;i--){let range=set[i-1];if(range.fromA>me.toA)
continue;if(range.toA<me.fromA)
break;me=me.join(range);set.splice(i-1,1);}
set.splice(i,0,me);return set;}
static extendWithRanges(diff,ranges){if(ranges.length==0)
return diff;let result=[];for(let dI=0,rI=0,posA=0,posB=0;;dI++){let next=dI==diff.length?null:diff[dI],off=posA-posB;let end=next?next.fromB:1e9;while(rI<ranges.length&&ranges[rI]<end){let from=ranges[rI],to=ranges[rI+1];let fromB=Math.max(posB,from),toB=Math.min(end,to);if(fromB<=toB)
new ChangedRange(fromB+off,toB+off,fromB,toB).addToSet(result);if(to>end)
break;else
rI+=2;}
if(!next)
return result;new ChangedRange(next.fromA,next.toA,next.fromB,next.toB).addToSet(result);posA=next.toA;posB=next.toB;}}}
class ViewUpdate{constructor(view,state,transactions){this.view=view;this.state=state;this.transactions=transactions;this.flags=0;this.startState=view.state;this.changes=ChangeSet.empty(this.startState.doc.length);for(let tr of transactions)
this.changes=this.changes.compose(tr.changes);let changedRanges=[];this.changes.iterChangedRanges((fromA,toA,fromB,toB)=>changedRanges.push(new ChangedRange(fromA,toA,fromB,toB)));this.changedRanges=changedRanges;let focus=view.hasFocus;if(focus!=view.inputState.notifiedFocused){view.inputState.notifiedFocused=focus;this.flags|=1;}}
static create(view,state,transactions){return new ViewUpdate(view,state,transactions);}
get viewportChanged(){return(this.flags&4)>0;}
get heightChanged(){return(this.flags&2)>0;}
get geometryChanged(){return this.docChanged||(this.flags&(8|2))>0;}
get focusChanged(){return(this.flags&1)>0;}
get docChanged(){return!this.changes.empty;}
get selectionSet(){return this.transactions.some(tr=>tr.selection);}
get empty(){return this.flags==0&&this.transactions.length==0;}}
var Direction=(function(Direction){Direction[Direction["LTR"]=0]="LTR";Direction[Direction["RTL"]=1]="RTL";return Direction})(Direction||(Direction={}));const LTR=Direction.LTR,RTL=Direction.RTL;function dec(str){let result=[];for(let i=0;i<str.length;i++)
result.push(1<<+str[i]);return result;}
const LowTypes=dec("88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008");const ArabicTypes=dec("4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333");const Brackets=Object.create(null),BracketStack=[];for(let p of["()","[]","{}"]){let l=p.charCodeAt(0),r=p.charCodeAt(1);Brackets[l]=r;Brackets[r]=-l;}
function charType(ch){return ch<=0xf7?LowTypes[ch]:0x590<=ch&&ch<=0x5f4?2:0x600<=ch&&ch<=0x6f9?ArabicTypes[ch-0x600]:0x6ee<=ch&&ch<=0x8ac?4:0x2000<=ch&&ch<=0x200b?256:ch==0x200c?256:1;}
const BidiRE=/[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;class BidiSpan{constructor(from,to,level){this.from=from;this.to=to;this.level=level;}
get dir(){return this.level%2?RTL:LTR;}
side(end,dir){return(this.dir==dir)==end?this.to:this.from;}
static find(order,index,level,assoc){let maybe=-1;for(let i=0;i<order.length;i++){let span=order[i];if(span.from<=index&&span.to>=index){if(span.level==level)
return i;if(maybe<0||(assoc!=0?(assoc<0?span.from<index:span.to>index):order[maybe].level>span.level))
maybe=i;}}
if(maybe<0)
throw new RangeError("Index out of range");return maybe;}}
const types=[];function computeOrder(line,direction){let len=line.length,outerType=direction==LTR?1:2,oppositeType=direction==LTR?2:1;if(!line||outerType==1&&!BidiRE.test(line))
return trivialOrder(len);for(let i=0,prev=outerType,prevStrong=outerType;i<len;i++){let type=charType(line.charCodeAt(i));if(type==512)
type=prev;else if(type==8&&prevStrong==4)
type=16;types[i]=type==4?2:type;if(type&7)
prevStrong=type;prev=type;}
for(let i=0,prev=outerType,prevStrong=outerType;i<len;i++){let type=types[i];if(type==128){if(i<len-1&&prev==types[i+1]&&(prev&24))
type=types[i]=prev;else
types[i]=256;}
else if(type==64){let end=i+1;while(end<len&&types[end]==64)
end++;let replace=(i&&prev==8)||(end<len&&types[end]==8)?(prevStrong==1?1:8):256;for(let j=i;j<end;j++)
types[j]=replace;i=end-1;}
else if(type==8&&prevStrong==1){types[i]=1;}
prev=type;if(type&7)
prevStrong=type;}
for(let i=0,sI=0,context=0,ch,br,type;i<len;i++){if(br=Brackets[ch=line.charCodeAt(i)]){if(br<0){for(let sJ=sI-3;sJ>=0;sJ-=3){if(BracketStack[sJ+1]==-br){let flags=BracketStack[sJ+2];let type=(flags&2)?outerType:!(flags&4)?0:(flags&1)?oppositeType:outerType;if(type)
types[i]=types[BracketStack[sJ]]=type;sI=sJ;break;}}}
else if(BracketStack.length==189){break;}
else{BracketStack[sI++]=i;BracketStack[sI++]=ch;BracketStack[sI++]=context;}}
else if((type=types[i])==2||type==1){let embed=type==outerType;context=embed?0:1;for(let sJ=sI-3;sJ>=0;sJ-=3){let cur=BracketStack[sJ+2];if(cur&2)
break;if(embed){BracketStack[sJ+2]|=2;}
else{if(cur&4)
break;BracketStack[sJ+2]|=4;}}}}
for(let i=0;i<len;i++){if(types[i]==256){let end=i+1;while(end<len&&types[end]==256)
end++;let beforeL=(i?types[i-1]:outerType)==1;let afterL=(end<len?types[end]:outerType)==1;let replace=beforeL==afterL?(beforeL?1:2):outerType;for(let j=i;j<end;j++)
types[j]=replace;i=end-1;}}
let order=[];if(outerType==1){for(let i=0;i<len;){let start=i,rtl=types[i++]!=1;while(i<len&&rtl==(types[i]!=1))
i++;if(rtl){for(let j=i;j>start;){let end=j,l=types[--j]!=2;while(j>start&&l==(types[j-1]!=2))
j--;order.push(new BidiSpan(j,end,l?2:1));}}
else{order.push(new BidiSpan(start,i,0));}}}
else{for(let i=0;i<len;){let start=i,rtl=types[i++]==2;while(i<len&&rtl==(types[i]==2))
i++;order.push(new BidiSpan(start,i,rtl?1:2));}}
return order;}
function trivialOrder(length){return[new BidiSpan(0,length,0)];}
let movedOver="";function moveVisually(line,order,dir,start,forward){var _a;let startIndex=start.head-line.from,spanI=-1;if(startIndex==0){if(!forward||!line.length)
return null;if(order[0].level!=dir){startIndex=order[0].side(false,dir);spanI=0;}}
else if(startIndex==line.length){if(forward)
return null;let last=order[order.length-1];if(last.level!=dir){startIndex=last.side(true,dir);spanI=order.length-1;}}
if(spanI<0)
spanI=BidiSpan.find(order,startIndex,(_a=start.bidiLevel)!==null&&_a!==void 0?_a:-1,start.assoc);let span=order[spanI];if(startIndex==span.side(forward,dir)){span=order[spanI+=forward?1:-1];startIndex=span.side(!forward,dir);}
let indexForward=forward==(span.dir==dir);let nextIndex=findClusterBreak(line.text,startIndex,indexForward);movedOver=line.text.slice(Math.min(startIndex,nextIndex),Math.max(startIndex,nextIndex));if(nextIndex!=span.side(forward,dir))
return EditorSelection.cursor(nextIndex+line.from,indexForward?-1:1,span.level);let nextSpan=spanI==(forward?order.length-1:0)?null:order[spanI+(forward?1:-1)];if(!nextSpan&&span.level!=dir)
return EditorSelection.cursor(forward?line.to:line.from,forward?-1:1,dir);if(nextSpan&&nextSpan.level<span.level)
return EditorSelection.cursor(nextSpan.side(!forward,dir)+line.from,forward?1:-1,nextSpan.level);return EditorSelection.cursor(nextIndex+line.from,forward?-1:1,span.level);}
const LineBreakPlaceholder="\uffff";class DOMReader{constructor(points,state){this.points=points;this.text="";this.lineSeparator=state.facet(EditorState.lineSeparator);}
append(text){this.text+=text;}
lineBreak(){this.text+=LineBreakPlaceholder;}
readRange(start,end){if(!start)
return this;let parent=start.parentNode;for(let cur=start;;){this.findPointBefore(parent,cur);this.readNode(cur);let next=cur.nextSibling;if(next==end)
break;let view=ContentView.get(cur),nextView=ContentView.get(next);if(view&&nextView?view.breakAfter:(view?view.breakAfter:isBlockElement(cur))||(isBlockElement(next)&&(cur.nodeName!="BR"||cur.cmIgnore)))
this.lineBreak();cur=next;}
this.findPointBefore(parent,end);return this;}
readTextNode(node){let text=node.nodeValue;for(let point of this.points)
if(point.node==node)
point.pos=this.text.length+Math.min(point.offset,text.length);for(let off=0,re=this.lineSeparator?null:/\r\n?|\n/g;;){let nextBreak=-1,breakSize=1,m;if(this.lineSeparator){nextBreak=text.indexOf(this.lineSeparator,off);breakSize=this.lineSeparator.length;}
else if(m=re.exec(text)){nextBreak=m.index;breakSize=m[0].length;}
this.append(text.slice(off,nextBreak<0?text.length:nextBreak));if(nextBreak<0)
break;this.lineBreak();if(breakSize>1)
for(let point of this.points)
if(point.node==node&&point.pos>this.text.length)
point.pos-=breakSize-1;off=nextBreak+breakSize;}}
readNode(node){if(node.cmIgnore)
return;let view=ContentView.get(node);let fromView=view&&view.overrideDOMText;if(fromView!=null){this.findPointInside(node,fromView.length);for(let i=fromView.iter();!i.next().done;){if(i.lineBreak)
this.lineBreak();else
this.append(i.value);}}
else if(node.nodeType==3){this.readTextNode(node);}
else if(node.nodeName=="BR"){if(node.nextSibling)
this.lineBreak();}
else if(node.nodeType==1){this.readRange(node.firstChild,null);}}
findPointBefore(node,next){for(let point of this.points)
if(point.node==node&&node.childNodes[point.offset]==next)
point.pos=this.text.length;}
findPointInside(node,maxLen){for(let point of this.points)
if(node.nodeType==3?point.node==node:node.contains(point.node))
point.pos=this.text.length+Math.min(maxLen,point.offset);}}
function isBlockElement(node){return node.nodeType==1&&/^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(node.nodeName);}
class DOMPoint{constructor(node,offset){this.node=node;this.offset=offset;this.pos=-1;}}
class DocView extends ContentView{constructor(view){super();this.view=view;this.compositionDeco=Decoration.none;this.decorations=[];this.dynamicDecorationMap=[];this.minWidth=0;this.minWidthFrom=0;this.minWidthTo=0;this.impreciseAnchor=null;this.impreciseHead=null;this.forceSelection=false;this.lastUpdate=Date.now();this.setDOM(view.contentDOM);this.children=[new LineView];this.children[0].setParent(this);this.updateDeco();this.updateInner([new ChangedRange(0,0,0,view.state.doc.length)],0);}
get root(){return this.view.root;}
get editorView(){return this.view;}
get length(){return this.view.state.doc.length;}
update(update){let changedRanges=update.changedRanges;if(this.minWidth>0&&changedRanges.length){if(!changedRanges.every(({fromA,toA})=>toA<this.minWidthFrom||fromA>this.minWidthTo)){this.minWidth=this.minWidthFrom=this.minWidthTo=0;}
else{this.minWidthFrom=update.changes.mapPos(this.minWidthFrom,1);this.minWidthTo=update.changes.mapPos(this.minWidthTo,1);}}
if(this.view.inputState.composing<0)
this.compositionDeco=Decoration.none;else if(update.transactions.length||this.dirty)
this.compositionDeco=computeCompositionDeco(this.view,update.changes);if((browser.ie||browser.chrome)&&!this.compositionDeco.size&&update&&update.state.doc.lines!=update.startState.doc.lines)
this.forceSelection=true;let prevDeco=this.decorations,deco=this.updateDeco();let decoDiff=findChangedDeco(prevDeco,deco,update.changes);changedRanges=ChangedRange.extendWithRanges(changedRanges,decoDiff);if(this.dirty==0&&changedRanges.length==0){return false;}
else{this.updateInner(changedRanges,update.startState.doc.length);if(update.transactions.length)
this.lastUpdate=Date.now();return true;}}
updateInner(changes,oldLength){this.view.viewState.mustMeasureContent=true;this.updateChildren(changes,oldLength);let{observer}=this.view;observer.ignore(()=>{this.dom.style.height=this.view.viewState.contentHeight+"px";this.dom.style.flexBasis=this.minWidth?this.minWidth+"px":"";let track=browser.chrome||browser.ios?{node:observer.selectionRange.focusNode,written:false}:undefined;this.sync(track);this.dirty=0;if(track&&(track.written||observer.selectionRange.focusNode!=track.node))
this.forceSelection=true;this.dom.style.height="";});let gaps=[];if(this.view.viewport.from||this.view.viewport.to<this.view.state.doc.length)
for(let child of this.children)
if(child instanceof BlockWidgetView&&child.widget instanceof BlockGapWidget)
gaps.push(child.dom);observer.updateGaps(gaps);}
updateChildren(changes,oldLength){let cursor=this.childCursor(oldLength);for(let i=changes.length-1;;i--){let next=i>=0?changes[i]:null;if(!next)
break;let{fromA,toA,fromB,toB}=next;let{content,breakAtStart,openStart,openEnd}=ContentBuilder.build(this.view.state.doc,fromB,toB,this.decorations,this.dynamicDecorationMap);let{i:toI,off:toOff}=cursor.findPos(toA,1);let{i:fromI,off:fromOff}=cursor.findPos(fromA,-1);replaceRange(this,fromI,fromOff,toI,toOff,content,breakAtStart,openStart,openEnd);}}
updateSelection(mustRead=false,fromPointer=false){if(mustRead)
this.view.observer.readSelectionRange();if(!(fromPointer||this.mayControlSelection())||browser.ios&&this.view.inputState.rapidCompositionStart)
return;let force=this.forceSelection;this.forceSelection=false;let main=this.view.state.selection.main;let anchor=this.domAtPos(main.anchor);let head=main.empty?anchor:this.domAtPos(main.head);if(browser.gecko&&main.empty&&betweenUneditable(anchor)){let dummy=document.createTextNode("");this.view.observer.ignore(()=>anchor.node.insertBefore(dummy,anchor.node.childNodes[anchor.offset]||null));anchor=head=new DOMPos(dummy,0);force=true;}
let domSel=this.view.observer.selectionRange;if(force||!domSel.focusNode||!isEquivalentPosition(anchor.node,anchor.offset,domSel.anchorNode,domSel.anchorOffset)||!isEquivalentPosition(head.node,head.offset,domSel.focusNode,domSel.focusOffset)){this.view.observer.ignore(()=>{if(browser.android&&browser.chrome&&this.dom.contains(domSel.focusNode)&&inUneditable(domSel.focusNode,this.dom)){this.dom.blur();this.dom.focus({preventScroll:true});}
let rawSel=getSelection(this.root);if(main.empty){if(browser.gecko){let nextTo=nextToUneditable(anchor.node,anchor.offset);if(nextTo&&nextTo!=(1|2)){let text=nearbyTextNode(anchor.node,anchor.offset,nextTo==1?1:-1);if(text)
anchor=new DOMPos(text,nextTo==1?0:text.nodeValue.length);}}
rawSel.collapse(anchor.node,anchor.offset);if(main.bidiLevel!=null&&domSel.cursorBidiLevel!=null)
domSel.cursorBidiLevel=main.bidiLevel;}
else if(rawSel.extend){rawSel.collapse(anchor.node,anchor.offset);rawSel.extend(head.node,head.offset);}
else{let range=document.createRange();if(main.anchor>main.head)
[anchor,head]=[head,anchor];range.setEnd(head.node,head.offset);range.setStart(anchor.node,anchor.offset);rawSel.removeAllRanges();rawSel.addRange(range);}});this.view.observer.setSelectionRange(anchor,head);}
this.impreciseAnchor=anchor.precise?null:new DOMPos(domSel.anchorNode,domSel.anchorOffset);this.impreciseHead=head.precise?null:new DOMPos(domSel.focusNode,domSel.focusOffset);}
enforceCursorAssoc(){if(this.compositionDeco.size)
return;let cursor=this.view.state.selection.main;let sel=getSelection(this.root);if(!cursor.empty||!cursor.assoc||!sel.modify)
return;let line=LineView.find(this,cursor.head);if(!line)
return;let lineStart=line.posAtStart;if(cursor.head==lineStart||cursor.head==lineStart+line.length)
return;let before=this.coordsAt(cursor.head,-1),after=this.coordsAt(cursor.head,1);if(!before||!after||before.bottom>after.top)
return;let dom=this.domAtPos(cursor.head+cursor.assoc);sel.collapse(dom.node,dom.offset);sel.modify("move",cursor.assoc<0?"forward":"backward","lineboundary");}
mayControlSelection(){return this.view.state.facet(editable)?this.root.activeElement==this.dom:hasSelection(this.dom,this.view.observer.selectionRange);}
nearest(dom){for(let cur=dom;cur;){let domView=ContentView.get(cur);if(domView&&domView.rootView==this)
return domView;cur=cur.parentNode;}
return null;}
posFromDOM(node,offset){let view=this.nearest(node);if(!view)
throw new RangeError("Trying to find position for a DOM position outside of the document");return view.localPosFromDOM(node,offset)+view.posAtStart;}
domAtPos(pos){let{i,off}=this.childCursor().findPos(pos,-1);for(;i<this.children.length-1;){let child=this.children[i];if(off<child.length||child instanceof LineView)
break;i++;off=0;}
return this.children[i].domAtPos(off);}
coordsAt(pos,side){for(let off=this.length,i=this.children.length-1;;i--){let child=this.children[i],start=off-child.breakAfter-child.length;if(pos>start||(pos==start&&child.type!=BlockType.WidgetBefore&&child.type!=BlockType.WidgetAfter&&(!i||side==2||this.children[i-1].breakAfter||(this.children[i-1].type==BlockType.WidgetBefore&&side>-2))))
return child.coordsAt(pos-start,side);off=start;}}
measureVisibleLineHeights(viewport){let result=[],{from,to}=viewport;let contentWidth=this.view.contentDOM.clientWidth;let isWider=contentWidth>Math.max(this.view.scrollDOM.clientWidth,this.minWidth)+1;let widest=-1,ltr=this.view.textDirection==Direction.LTR;for(let pos=0,i=0;i<this.children.length;i++){let child=this.children[i],end=pos+child.length;if(end>to)
break;if(pos>=from){let childRect=child.dom.getBoundingClientRect();result.push(childRect.height);if(isWider){let last=child.dom.lastChild;let rects=last?clientRectsFor(last):[];if(rects.length){let rect=rects[rects.length-1];let width=ltr?rect.right-childRect.left:childRect.right-rect.left;if(width>widest){widest=width;this.minWidth=contentWidth;this.minWidthFrom=pos;this.minWidthTo=end;}}}}
pos=end+child.breakAfter;}
return result;}
textDirectionAt(pos){let{i}=this.childPos(pos,1);return getComputedStyle(this.children[i].dom).direction=="rtl"?Direction.RTL:Direction.LTR;}
measureTextSize(){for(let child of this.children){if(child instanceof LineView){let measure=child.measureTextSize();if(measure)
return measure;}}
let dummy=document.createElement("div"),lineHeight,charWidth;dummy.className="cm-line";dummy.textContent="abc def ghi jkl mno pqr stu";this.view.observer.ignore(()=>{this.dom.appendChild(dummy);let rect=clientRectsFor(dummy.firstChild)[0];lineHeight=dummy.getBoundingClientRect().height;charWidth=rect?rect.width/27:7;dummy.remove();});return{lineHeight,charWidth};}
childCursor(pos=this.length){let i=this.children.length;if(i)
pos-=this.children[--i].length;return new ChildCursor(this.children,pos,i);}
computeBlockGapDeco(){let deco=[],vs=this.view.viewState;for(let pos=0,i=0;;i++){let next=i==vs.viewports.length?null:vs.viewports[i];let end=next?next.from-1:this.length;if(end>pos){let height=vs.lineBlockAt(end).bottom-vs.lineBlockAt(pos).top;deco.push(Decoration.replace({widget:new BlockGapWidget(height),block:true,inclusive:true,isBlockGap:true,}).range(pos,end));}
if(!next)
break;pos=next.to+1;}
return Decoration.set(deco);}
updateDeco(){let allDeco=this.view.state.facet(decorations).map((d,i)=>{let dynamic=this.dynamicDecorationMap[i]=typeof d=="function";return dynamic?d(this.view):d;});for(let i=allDeco.length;i<allDeco.length+3;i++)
this.dynamicDecorationMap[i]=false;return this.decorations=[...allDeco,this.compositionDeco,this.computeBlockGapDeco(),this.view.viewState.lineGapDeco];}
scrollIntoView(target){let{range}=target;let rect=this.coordsAt(range.head,range.empty?range.assoc:range.head>range.anchor?-1:1),other;if(!rect)
return;if(!range.empty&&(other=this.coordsAt(range.anchor,range.anchor>range.head?-1:1)))
rect={left:Math.min(rect.left,other.left),top:Math.min(rect.top,other.top),right:Math.max(rect.right,other.right),bottom:Math.max(rect.bottom,other.bottom)};let mLeft=0,mRight=0,mTop=0,mBottom=0;for(let margins of this.view.state.facet(scrollMargins).map(f=>f(this.view)))
if(margins){let{left,right,top,bottom}=margins;if(left!=null)
mLeft=Math.max(mLeft,left);if(right!=null)
mRight=Math.max(mRight,right);if(top!=null)
mTop=Math.max(mTop,top);if(bottom!=null)
mBottom=Math.max(mBottom,bottom);}
let targetRect={left:rect.left-mLeft,top:rect.top-mTop,right:rect.right+mRight,bottom:rect.bottom+mBottom};scrollRectIntoView(this.view.scrollDOM,targetRect,range.head<range.anchor?-1:1,target.x,target.y,target.xMargin,target.yMargin,this.view.textDirection==Direction.LTR);}}
function betweenUneditable(pos){return pos.node.nodeType==1&&pos.node.firstChild&&(pos.offset==0||pos.node.childNodes[pos.offset-1].contentEditable=="false")&&(pos.offset==pos.node.childNodes.length||pos.node.childNodes[pos.offset].contentEditable=="false");}
class BlockGapWidget extends WidgetType{constructor(height){super();this.height=height;}
toDOM(){let elt=document.createElement("div");this.updateDOM(elt);return elt;}
eq(other){return other.height==this.height;}
updateDOM(elt){elt.style.height=this.height+"px";return true;}
get estimatedHeight(){return this.height;}}
function compositionSurroundingNode(view){let sel=view.observer.selectionRange;let textNode=sel.focusNode&&nearbyTextNode(sel.focusNode,sel.focusOffset,0);if(!textNode)
return null;let cView=view.docView.nearest(textNode);if(!cView)
return null;if(cView instanceof LineView){let topNode=textNode;while(topNode.parentNode!=cView.dom)
topNode=topNode.parentNode;let prev=topNode.previousSibling;while(prev&&!ContentView.get(prev))
prev=prev.previousSibling;let pos=prev?ContentView.get(prev).posAtEnd:cView.posAtStart;return{from:pos,to:pos,node:topNode,text:textNode};}
else{for(;;){let{parent}=cView;if(!parent)
return null;if(parent instanceof LineView)
break;cView=parent;}
let from=cView.posAtStart;return{from,to:from+cView.length,node:cView.dom,text:textNode};}}
function computeCompositionDeco(view,changes){let surrounding=compositionSurroundingNode(view);if(!surrounding)
return Decoration.none;let{from,to,node,text:textNode}=surrounding;let newFrom=changes.mapPos(from,1),newTo=Math.max(newFrom,changes.mapPos(to,-1));let{state}=view,text=node.nodeType==3?node.nodeValue:new DOMReader([],state).readRange(node.firstChild,null).text;if(newTo-newFrom<text.length){if(state.doc.sliceString(newFrom,Math.min(state.doc.length,newFrom+text.length),LineBreakPlaceholder)==text)
newTo=newFrom+text.length;else if(state.doc.sliceString(Math.max(0,newTo-text.length),newTo,LineBreakPlaceholder)==text)
newFrom=newTo-text.length;else
return Decoration.none;}
else if(state.doc.sliceString(newFrom,newTo,LineBreakPlaceholder)!=text){return Decoration.none;}
let topView=ContentView.get(node);if(topView instanceof CompositionView)
topView=topView.widget.topView;else if(topView)
topView.parent=null;return Decoration.set(Decoration.replace({widget:new CompositionWidget(node,textNode,topView),inclusive:true}).range(newFrom,newTo));}
class CompositionWidget extends WidgetType{constructor(top,text,topView){super();this.top=top;this.text=text;this.topView=topView;}
eq(other){return this.top==other.top&&this.text==other.text;}
toDOM(){return this.top;}
ignoreEvent(){return false;}
get customView(){return CompositionView;}}
function nearbyTextNode(node,offset,side){for(;;){if(node.nodeType==3)
return node;if(node.nodeType==1&&offset>0&&side<=0){node=node.childNodes[offset-1];offset=maxOffset(node);}
else if(node.nodeType==1&&offset<node.childNodes.length&&side>=0){node=node.childNodes[offset];offset=0;}
else{return null;}}}
function nextToUneditable(node,offset){if(node.nodeType!=1)
return 0;return(offset&&node.childNodes[offset-1].contentEditable=="false"?1:0)|(offset<node.childNodes.length&&node.childNodes[offset].contentEditable=="false"?2:0);}
class DecorationComparator$1{constructor(){this.changes=[];}
compareRange(from,to){addRange(from,to,this.changes);}
comparePoint(from,to){addRange(from,to,this.changes);}}
function findChangedDeco(a,b,diff){let comp=new DecorationComparator$1;RangeSet.compare(a,b,diff,comp);return comp.changes;}
function inUneditable(node,inside){for(let cur=node;cur&&cur!=inside;cur=cur.assignedSlot||cur.parentNode){if(cur.nodeType==1&&cur.contentEditable=='false'){return true;}}
return false;}
function groupAt(state,pos,bias=1){let categorize=state.charCategorizer(pos);let line=state.doc.lineAt(pos),linePos=pos-line.from;if(line.length==0)
return EditorSelection.cursor(pos);if(linePos==0)
bias=1;else if(linePos==line.length)
bias=-1;let from=linePos,to=linePos;if(bias<0)
from=findClusterBreak(line.text,linePos,false);else
to=findClusterBreak(line.text,linePos);let cat=categorize(line.text.slice(from,to));while(from>0){let prev=findClusterBreak(line.text,from,false);if(categorize(line.text.slice(prev,from))!=cat)
break;from=prev;}
while(to<line.length){let next=findClusterBreak(line.text,to);if(categorize(line.text.slice(to,next))!=cat)
break;to=next;}
return EditorSelection.range(from+line.from,to+line.from);}
function getdx(x,rect){return rect.left>x?rect.left-x:Math.max(0,x-rect.right);}
function getdy(y,rect){return rect.top>y?rect.top-y:Math.max(0,y-rect.bottom);}
function yOverlap(a,b){return a.top<b.bottom-1&&a.bottom>b.top+1;}
function upTop(rect,top){return top<rect.top?{top,left:rect.left,right:rect.right,bottom:rect.bottom}:rect;}
function upBot(rect,bottom){return bottom>rect.bottom?{top:rect.top,left:rect.left,right:rect.right,bottom}:rect;}
function domPosAtCoords(parent,x,y){let closest,closestRect,closestX,closestY;let above,below,aboveRect,belowRect;for(let child=parent.firstChild;child;child=child.nextSibling){let rects=clientRectsFor(child);for(let i=0;i<rects.length;i++){let rect=rects[i];if(closestRect&&yOverlap(closestRect,rect))
rect=upTop(upBot(rect,closestRect.bottom),closestRect.top);let dx=getdx(x,rect),dy=getdy(y,rect);if(dx==0&&dy==0)
return child.nodeType==3?domPosInText(child,x,y):domPosAtCoords(child,x,y);if(!closest||closestY>dy||closestY==dy&&closestX>dx){closest=child;closestRect=rect;closestX=dx;closestY=dy;}
if(dx==0){if(y>rect.bottom&&(!aboveRect||aboveRect.bottom<rect.bottom)){above=child;aboveRect=rect;}
else if(y<rect.top&&(!belowRect||belowRect.top>rect.top)){below=child;belowRect=rect;}}
else if(aboveRect&&yOverlap(aboveRect,rect)){aboveRect=upBot(aboveRect,rect.bottom);}
else if(belowRect&&yOverlap(belowRect,rect)){belowRect=upTop(belowRect,rect.top);}}}
if(aboveRect&&aboveRect.bottom>=y){closest=above;closestRect=aboveRect;}
else if(belowRect&&belowRect.top<=y){closest=below;closestRect=belowRect;}
if(!closest)
return{node:parent,offset:0};let clipX=Math.max(closestRect.left,Math.min(closestRect.right,x));if(closest.nodeType==3)
return domPosInText(closest,clipX,y);if(!closestX&&closest.contentEditable=="true")
return domPosAtCoords(closest,clipX,y);let offset=Array.prototype.indexOf.call(parent.childNodes,closest)+
(x>=(closestRect.left+closestRect.right)/2?1:0);return{node:parent,offset};}
function domPosInText(node,x,y){let len=node.nodeValue.length;let closestOffset=-1,closestDY=1e9,generalSide=0;for(let i=0;i<len;i++){let rects=textRange(node,i,i+1).getClientRects();for(let j=0;j<rects.length;j++){let rect=rects[j];if(rect.top==rect.bottom)
continue;if(!generalSide)
generalSide=x-rect.left;let dy=(rect.top>y?rect.top-y:y-rect.bottom)-1;if(rect.left-1<=x&&rect.right+1>=x&&dy<closestDY){let right=x>=(rect.left+rect.right)/2,after=right;if(browser.chrome||browser.gecko){let rectBefore=textRange(node,i).getBoundingClientRect();if(rectBefore.left==rect.right)
after=!right;}
if(dy<=0)
return{node,offset:i+(after?1:0)};closestOffset=i+(after?1:0);closestDY=dy;}}}
return{node,offset:closestOffset>-1?closestOffset:generalSide>0?node.nodeValue.length:0};}
function posAtCoords(view,{x,y},precise,bias=-1){var _a;let content=view.contentDOM.getBoundingClientRect(),docTop=content.top+view.viewState.paddingTop;let block,{docHeight}=view.viewState;let yOffset=y-docTop;if(yOffset<0)
return 0;if(yOffset>docHeight)
return view.state.doc.length;for(let halfLine=view.defaultLineHeight/2,bounced=false;;){block=view.elementAtHeight(yOffset);if(block.type==BlockType.Text)
break;for(;;){yOffset=bias>0?block.bottom+halfLine:block.top-halfLine;if(yOffset>=0&&yOffset<=docHeight)
break;if(bounced)
return precise?null:0;bounced=true;bias=-bias;}}
y=docTop+yOffset;let lineStart=block.from;if(lineStart<view.viewport.from)
return view.viewport.from==0?0:precise?null:posAtCoordsImprecise(view,content,block,x,y);if(lineStart>view.viewport.to)
return view.viewport.to==view.state.doc.length?view.state.doc.length:precise?null:posAtCoordsImprecise(view,content,block,x,y);let doc=view.dom.ownerDocument;let root=view.root.elementFromPoint?view.root:doc;let element=root.elementFromPoint(x,y);if(element&&!view.contentDOM.contains(element))
element=null;if(!element){x=Math.max(content.left+1,Math.min(content.right-1,x));element=root.elementFromPoint(x,y);if(element&&!view.contentDOM.contains(element))
element=null;}
let node,offset=-1;if(element&&((_a=view.docView.nearest(element))===null||_a===void 0?void 0:_a.isEditable)!=false){if(doc.caretPositionFromPoint){let pos=doc.caretPositionFromPoint(x,y);if(pos)
({offsetNode:node,offset}=pos);}
else if(doc.caretRangeFromPoint){let range=doc.caretRangeFromPoint(x,y);if(range){({startContainer:node,startOffset:offset}=range);if(browser.safari&&isSuspiciousCaretResult(node,offset,x))
node=undefined;}}}
if(!node||!view.docView.dom.contains(node)){let line=LineView.find(view.docView,lineStart);if(!line)
return yOffset>block.top+block.height/2?block.to:block.from;({node,offset}=domPosAtCoords(line.dom,x,y));}
return view.docView.posFromDOM(node,offset);}
function posAtCoordsImprecise(view,contentRect,block,x,y){let into=Math.round((x-contentRect.left)*view.defaultCharacterWidth);if(view.lineWrapping&&block.height>view.defaultLineHeight*1.5){let line=Math.floor((y-block.top)/view.defaultLineHeight);into+=line*view.viewState.heightOracle.lineLength;}
let content=view.state.sliceDoc(block.from,block.to);return block.from+findColumn(content,into,view.state.tabSize);}
function isSuspiciousCaretResult(node,offset,x){let len;if(node.nodeType!=3||offset!=(len=node.nodeValue.length))
return false;for(let next=node.nextSibling;next;next=next.nextSibling)
if(next.nodeType!=1||next.nodeName!="BR")
return false;return textRange(node,len-1,len).getBoundingClientRect().left>x;}
function moveToLineBoundary(view,start,forward,includeWrap){let line=view.state.doc.lineAt(start.head);let coords=!includeWrap||!view.lineWrapping?null:view.coordsAtPos(start.assoc<0&&start.head>line.from?start.head-1:start.head);if(coords){let editorRect=view.dom.getBoundingClientRect();let direction=view.textDirectionAt(line.from);let pos=view.posAtCoords({x:forward==(direction==Direction.LTR)?editorRect.right-1:editorRect.left+1,y:(coords.top+coords.bottom)/2});if(pos!=null)
return EditorSelection.cursor(pos,forward?-1:1);}
let lineView=LineView.find(view.docView,start.head);let end=lineView?(forward?lineView.posAtEnd:lineView.posAtStart):(forward?line.to:line.from);return EditorSelection.cursor(end,forward?-1:1);}
function moveByChar(view,start,forward,by){let line=view.state.doc.lineAt(start.head),spans=view.bidiSpans(line);let direction=view.textDirectionAt(line.from);for(let cur=start,check=null;;){let next=moveVisually(line,spans,direction,cur,forward),char=movedOver;if(!next){if(line.number==(forward?view.state.doc.lines:1))
return cur;char="\n";line=view.state.doc.line(line.number+(forward?1:-1));spans=view.bidiSpans(line);next=EditorSelection.cursor(forward?line.from:line.to);}
if(!check){if(!by)
return next;check=by(char);}
else if(!check(char)){return cur;}
cur=next;}}
function byGroup(view,pos,start){let categorize=view.state.charCategorizer(pos);let cat=categorize(start);return(next)=>{let nextCat=categorize(next);if(cat==CharCategory.Space)
cat=nextCat;return cat==nextCat;};}
function moveVertically(view,start,forward,distance){let startPos=start.head,dir=forward?1:-1;if(startPos==(forward?view.state.doc.length:0))
return EditorSelection.cursor(startPos,start.assoc);let goal=start.goalColumn,startY;let rect=view.contentDOM.getBoundingClientRect();let startCoords=view.coordsAtPos(startPos),docTop=view.documentTop;if(startCoords){if(goal==null)
goal=startCoords.left-rect.left;startY=dir<0?startCoords.top:startCoords.bottom;}
else{let line=view.viewState.lineBlockAt(startPos);if(goal==null)
goal=Math.min(rect.right-rect.left,view.defaultCharacterWidth*(startPos-line.from));startY=(dir<0?line.top:line.bottom)+docTop;}
let resolvedGoal=rect.left+goal;let dist=distance!==null&&distance!==void 0?distance:(view.defaultLineHeight>>1);for(let extra=0;;extra+=10){let curY=startY+(dist+extra)*dir;let pos=posAtCoords(view,{x:resolvedGoal,y:curY},false,dir);if(curY<rect.top||curY>rect.bottom||(dir<0?pos<startPos:pos>startPos))
return EditorSelection.cursor(pos,start.assoc,undefined,goal);}}
function skipAtoms(view,oldPos,pos){let atoms=view.state.facet(atomicRanges).map(f=>f(view));for(;;){let moved=false;for(let set of atoms){set.between(pos.from-1,pos.from+1,(from,to,value)=>{if(pos.from>from&&pos.from<to){pos=oldPos.from>pos.from?EditorSelection.cursor(from,1):EditorSelection.cursor(to,-1);moved=true;}});}
if(!moved)
return pos;}}
class InputState{constructor(view){this.lastKeyCode=0;this.lastKeyTime=0;this.chromeScrollHack=-1;this.pendingIOSKey=undefined;this.lastSelectionOrigin=null;this.lastSelectionTime=0;this.lastEscPress=0;this.lastContextMenu=0;this.scrollHandlers=[];this.registeredEvents=[];this.customHandlers=[];this.composing=-1;this.compositionFirstChange=null;this.compositionEndedAt=0;this.rapidCompositionStart=false;this.mouseSelection=null;for(let type in handlers){let handler=handlers[type];view.contentDOM.addEventListener(type,(event)=>{if(!eventBelongsToEditor(view,event)||this.ignoreDuringComposition(event))
return;if(type=="keydown"&&this.keydown(view,event))
return;if(this.mustFlushObserver(event))
view.observer.forceFlush();if(this.runCustomHandlers(type,view,event))
event.preventDefault();else
handler(view,event);});this.registeredEvents.push(type);}
if(browser.chrome&&browser.chrome_version>=102){view.scrollDOM.addEventListener("wheel",()=>{if(this.chromeScrollHack<0)
view.contentDOM.style.pointerEvents="none";else
window.clearTimeout(this.chromeScrollHack);this.chromeScrollHack=setTimeout(()=>{this.chromeScrollHack=-1;view.contentDOM.style.pointerEvents="";},100);},{passive:true});}
this.notifiedFocused=view.hasFocus;if(browser.safari)
view.contentDOM.addEventListener("input",()=>null);}
setSelectionOrigin(origin){this.lastSelectionOrigin=origin;this.lastSelectionTime=Date.now();}
ensureHandlers(view,plugins){var _a;let handlers;this.customHandlers=[];for(let plugin of plugins)
if(handlers=(_a=plugin.update(view).spec)===null||_a===void 0?void 0:_a.domEventHandlers){this.customHandlers.push({plugin:plugin.value,handlers});for(let type in handlers)
if(this.registeredEvents.indexOf(type)<0&&type!="scroll"){this.registeredEvents.push(type);view.contentDOM.addEventListener(type,(event)=>{if(!eventBelongsToEditor(view,event))
return;if(this.runCustomHandlers(type,view,event))
event.preventDefault();});}}}
runCustomHandlers(type,view,event){for(let set of this.customHandlers){let handler=set.handlers[type];if(handler){try{if(handler.call(set.plugin,event,view)||event.defaultPrevented)
return true;}
catch(e){logException(view.state,e);}}}
return false;}
runScrollHandlers(view,event){for(let set of this.customHandlers){let handler=set.handlers.scroll;if(handler){try{handler.call(set.plugin,event,view);}
catch(e){logException(view.state,e);}}}}
keydown(view,event){this.lastKeyCode=event.keyCode;this.lastKeyTime=Date.now();if(event.keyCode==9&&Date.now()<this.lastEscPress+2000)
return true;if(browser.android&&browser.chrome&&!event.synthetic&&(event.keyCode==13||event.keyCode==8)){view.observer.delayAndroidKey(event.key,event.keyCode);return true;}
let pending;if(browser.ios&&(pending=PendingKeys.find(key=>key.keyCode==event.keyCode))&&!(event.ctrlKey||event.altKey||event.metaKey)&&!event.synthetic){this.pendingIOSKey=pending;setTimeout(()=>this.flushIOSKey(view),250);return true;}
return false;}
flushIOSKey(view){let key=this.pendingIOSKey;if(!key)
return false;this.pendingIOSKey=undefined;return dispatchKey(view.contentDOM,key.key,key.keyCode);}
ignoreDuringComposition(event){if(!/^key/.test(event.type))
return false;if(this.composing>0)
return true;if(browser.safari&&Date.now()-this.compositionEndedAt<100){this.compositionEndedAt=0;return true;}
return false;}
mustFlushObserver(event){return(event.type=="keydown"&&event.keyCode!=229)||event.type=="compositionend"&&!browser.ios;}
startMouseSelection(mouseSelection){if(this.mouseSelection)
this.mouseSelection.destroy();this.mouseSelection=mouseSelection;}
update(update){if(this.mouseSelection)
this.mouseSelection.update(update);if(update.transactions.length)
this.lastKeyCode=this.lastSelectionTime=0;}
destroy(){if(this.mouseSelection)
this.mouseSelection.destroy();}}
const PendingKeys=[{key:"Backspace",keyCode:8,inputType:"deleteContentBackward"},{key:"Enter",keyCode:13,inputType:"insertParagraph"},{key:"Delete",keyCode:46,inputType:"deleteContentForward"}];const modifierCodes=[16,17,18,20,91,92,224,225];class MouseSelection{constructor(view,startEvent,style,mustSelect){this.view=view;this.style=style;this.mustSelect=mustSelect;this.lastEvent=startEvent;let doc=view.contentDOM.ownerDocument;doc.addEventListener("mousemove",this.move=this.move.bind(this));doc.addEventListener("mouseup",this.up=this.up.bind(this));this.extend=startEvent.shiftKey;this.multiple=view.state.facet(EditorState.allowMultipleSelections)&&addsSelectionRange(view,startEvent);this.dragMove=dragMovesSelection(view,startEvent);this.dragging=isInPrimarySelection(view,startEvent)&&getClickType(startEvent)==1?null:false;if(this.dragging===false){startEvent.preventDefault();this.select(startEvent);}}
move(event){if(event.buttons==0)
return this.destroy();if(this.dragging!==false)
return;this.select(this.lastEvent=event);}
up(event){if(this.dragging==null)
this.select(this.lastEvent);if(!this.dragging)
event.preventDefault();this.destroy();}
destroy(){let doc=this.view.contentDOM.ownerDocument;doc.removeEventListener("mousemove",this.move);doc.removeEventListener("mouseup",this.up);this.view.inputState.mouseSelection=null;}
select(event){let selection=this.style.get(event,this.extend,this.multiple);if(this.mustSelect||!selection.eq(this.view.state.selection)||selection.main.assoc!=this.view.state.selection.main.assoc)
this.view.dispatch({selection,userEvent:"select.pointer",scrollIntoView:true});this.mustSelect=false;}
update(update){if(update.docChanged&&this.dragging)
this.dragging=this.dragging.map(update.changes);if(this.style.update(update))
setTimeout(()=>this.select(this.lastEvent),20);}}
function addsSelectionRange(view,event){let facet=view.state.facet(clickAddsSelectionRange);return facet.length?facet[0](event):browser.mac?event.metaKey:event.ctrlKey;}
function dragMovesSelection(view,event){let facet=view.state.facet(dragMovesSelection$1);return facet.length?facet[0](event):browser.mac?!event.altKey:!event.ctrlKey;}
function isInPrimarySelection(view,event){let{main}=view.state.selection;if(main.empty)
return false;let sel=getSelection(view.root);if(sel.rangeCount==0)
return true;let rects=sel.getRangeAt(0).getClientRects();for(let i=0;i<rects.length;i++){let rect=rects[i];if(rect.left<=event.clientX&&rect.right>=event.clientX&&rect.top<=event.clientY&&rect.bottom>=event.clientY)
return true;}
return false;}
function eventBelongsToEditor(view,event){if(!event.bubbles)
return true;if(event.defaultPrevented)
return false;for(let node=event.target,cView;node!=view.contentDOM;node=node.parentNode)
if(!node||node.nodeType==11||((cView=ContentView.get(node))&&cView.ignoreEvent(event)))
return false;return true;}
const handlers=Object.create(null);const brokenClipboardAPI=(browser.ie&&browser.ie_version<15)||(browser.ios&&browser.webkit_version<604);function capturePaste(view){let parent=view.dom.parentNode;if(!parent)
return;let target=parent.appendChild(document.createElement("textarea"));target.style.cssText="position: fixed; left: -10000px; top: 10px";target.focus();setTimeout(()=>{view.focus();target.remove();doPaste(view,target.value);},50);}
function doPaste(view,input){let{state}=view,changes,i=1,text=state.toText(input);let byLine=text.lines==state.selection.ranges.length;let linewise=lastLinewiseCopy!=null&&state.selection.ranges.every(r=>r.empty)&&lastLinewiseCopy==text.toString();if(linewise){let lastLine=-1;changes=state.changeByRange(range=>{let line=state.doc.lineAt(range.from);if(line.from==lastLine)
return{range};lastLine=line.from;let insert=state.toText((byLine?text.line(i++).text:input)+state.lineBreak);return{changes:{from:line.from,insert},range:EditorSelection.cursor(range.from+insert.length)};});}
else if(byLine){changes=state.changeByRange(range=>{let line=text.line(i++);return{changes:{from:range.from,to:range.to,insert:line.text},range:EditorSelection.cursor(range.from+line.length)};});}
else{changes=state.replaceSelection(text);}
view.dispatch(changes,{userEvent:"input.paste",scrollIntoView:true});}
handlers.keydown=(view,event)=>{view.inputState.setSelectionOrigin("select");if(event.keyCode==27)
view.inputState.lastEscPress=Date.now();else if(modifierCodes.indexOf(event.keyCode)<0)
view.inputState.lastEscPress=0;};let lastTouch=0;handlers.touchstart=(view,e)=>{lastTouch=Date.now();view.inputState.setSelectionOrigin("select.pointer");};handlers.touchmove=view=>{view.inputState.setSelectionOrigin("select.pointer");};handlers.mousedown=(view,event)=>{view.observer.flush();if(lastTouch>Date.now()-2000&&getClickType(event)==1)
return;let style=null;for(let makeStyle of view.state.facet(mouseSelectionStyle)){style=makeStyle(view,event);if(style)
break;}
if(!style&&event.button==0)
style=basicMouseSelection(view,event);if(style){let mustFocus=view.root.activeElement!=view.contentDOM;if(mustFocus)
view.observer.ignore(()=>focusPreventScroll(view.contentDOM));view.inputState.startMouseSelection(new MouseSelection(view,event,style,mustFocus));}};function rangeForClick(view,pos,bias,type){if(type==1){return EditorSelection.cursor(pos,bias);}
else if(type==2){return groupAt(view.state,pos,bias);}
else{let visual=LineView.find(view.docView,pos),line=view.state.doc.lineAt(visual?visual.posAtEnd:pos);let from=visual?visual.posAtStart:line.from,to=visual?visual.posAtEnd:line.to;if(to<view.state.doc.length&&to==line.to)
to++;return EditorSelection.range(from,to);}}
let insideY=(y,rect)=>y>=rect.top&&y<=rect.bottom;let inside=(x,y,rect)=>insideY(y,rect)&&x>=rect.left&&x<=rect.right;function findPositionSide(view,pos,x,y){let line=LineView.find(view.docView,pos);if(!line)
return 1;let off=pos-line.posAtStart;if(off==0)
return 1;if(off==line.length)
return-1;let before=line.coordsAt(off,-1);if(before&&inside(x,y,before))
return-1;let after=line.coordsAt(off,1);if(after&&inside(x,y,after))
return 1;return before&&insideY(y,before)?-1:1;}
function queryPos(view,event){let pos=view.posAtCoords({x:event.clientX,y:event.clientY},false);return{pos,bias:findPositionSide(view,pos,event.clientX,event.clientY)};}
const BadMouseDetail=browser.ie&&browser.ie_version<=11;let lastMouseDown=null,lastMouseDownCount=0,lastMouseDownTime=0;function getClickType(event){if(!BadMouseDetail)
return event.detail;let last=lastMouseDown,lastTime=lastMouseDownTime;lastMouseDown=event;lastMouseDownTime=Date.now();return lastMouseDownCount=!last||(lastTime>Date.now()-400&&Math.abs(last.clientX-event.clientX)<2&&Math.abs(last.clientY-event.clientY)<2)?(lastMouseDownCount+1)%3:1;}
function basicMouseSelection(view,event){let start=queryPos(view,event),type=getClickType(event);let startSel=view.state.selection;let last=start,lastEvent=event;return{update(update){if(update.docChanged){if(start)
start.pos=update.changes.mapPos(start.pos);startSel=startSel.map(update.changes);lastEvent=null;}},get(event,extend,multiple){let cur;if(lastEvent&&event.clientX==lastEvent.clientX&&event.clientY==lastEvent.clientY)
cur=last;else{cur=last=queryPos(view,event);lastEvent=event;}
if(!cur||!start)
return startSel;let range=rangeForClick(view,cur.pos,cur.bias,type);if(start.pos!=cur.pos&&!extend){let startRange=rangeForClick(view,start.pos,start.bias,type);let from=Math.min(startRange.from,range.from),to=Math.max(startRange.to,range.to);range=from<range.from?EditorSelection.range(from,to):EditorSelection.range(to,from);}
if(extend)
return startSel.replaceRange(startSel.main.extend(range.from,range.to));else if(multiple)
return startSel.addRange(range);else
return EditorSelection.create([range]);}};}
handlers.dragstart=(view,event)=>{let{selection:{main}}=view.state;let{mouseSelection}=view.inputState;if(mouseSelection)
mouseSelection.dragging=main;if(event.dataTransfer){event.dataTransfer.setData("Text",view.state.sliceDoc(main.from,main.to));event.dataTransfer.effectAllowed="copyMove";}};function dropText(view,event,text,direct){if(!text)
return;let dropPos=view.posAtCoords({x:event.clientX,y:event.clientY},false);event.preventDefault();let{mouseSelection}=view.inputState;let del=direct&&mouseSelection&&mouseSelection.dragging&&mouseSelection.dragMove?{from:mouseSelection.dragging.from,to:mouseSelection.dragging.to}:null;let ins={from:dropPos,insert:text};let changes=view.state.changes(del?[del,ins]:ins);view.focus();view.dispatch({changes,selection:{anchor:changes.mapPos(dropPos,-1),head:changes.mapPos(dropPos,1)},userEvent:del?"move.drop":"input.drop"});}
handlers.drop=(view,event)=>{if(!event.dataTransfer)
return;if(view.state.readOnly)
return event.preventDefault();let files=event.dataTransfer.files;if(files&&files.length){event.preventDefault();let text=Array(files.length),read=0;let finishFile=()=>{if(++read==files.length)
dropText(view,event,text.filter(s=>s!=null).join(view.state.lineBreak),false);};for(let i=0;i<files.length;i++){let reader=new FileReader;reader.onerror=finishFile;reader.onload=()=>{if(!/[\x00-\x08\x0e-\x1f]{2}/.test(reader.result))
text[i]=reader.result;finishFile();};reader.readAsText(files[i]);}}
else{dropText(view,event,event.dataTransfer.getData("Text"),true);}};handlers.paste=(view,event)=>{if(view.state.readOnly)
return event.preventDefault();view.observer.flush();let data=brokenClipboardAPI?null:event.clipboardData;if(data){doPaste(view,data.getData("text/plain"));event.preventDefault();}
else{capturePaste(view);}};function captureCopy(view,text){let parent=view.dom.parentNode;if(!parent)
return;let target=parent.appendChild(document.createElement("textarea"));target.style.cssText="position: fixed; left: -10000px; top: 10px";target.value=text;target.focus();target.selectionEnd=text.length;target.selectionStart=0;setTimeout(()=>{target.remove();view.focus();},50);}
function copiedRange(state){let content=[],ranges=[],linewise=false;for(let range of state.selection.ranges)
if(!range.empty){content.push(state.sliceDoc(range.from,range.to));ranges.push(range);}
if(!content.length){let upto=-1;for(let{from}of state.selection.ranges){let line=state.doc.lineAt(from);if(line.number>upto){content.push(line.text);ranges.push({from:line.from,to:Math.min(state.doc.length,line.to+1)});}
upto=line.number;}
linewise=true;}
return{text:content.join(state.lineBreak),ranges,linewise};}
let lastLinewiseCopy=null;handlers.copy=handlers.cut=(view,event)=>{let{text,ranges,linewise}=copiedRange(view.state);if(!text&&!linewise)
return;lastLinewiseCopy=linewise?text:null;let data=brokenClipboardAPI?null:event.clipboardData;if(data){event.preventDefault();data.clearData();data.setData("text/plain",text);}
else{captureCopy(view,text);}
if(event.type=="cut"&&!view.state.readOnly)
view.dispatch({changes:ranges,scrollIntoView:true,userEvent:"delete.cut"});};function updateForFocusChange(view){setTimeout(()=>{if(view.hasFocus!=view.inputState.notifiedFocused)
view.update([]);},10);}
handlers.focus=updateForFocusChange;handlers.blur=view=>{view.observer.clearSelectionRange();updateForFocusChange(view);};function forceClearComposition(view,rapid){if(view.docView.compositionDeco.size){view.inputState.rapidCompositionStart=rapid;try{view.update([]);}
finally{view.inputState.rapidCompositionStart=false;}}}
handlers.compositionstart=handlers.compositionupdate=view=>{if(view.inputState.compositionFirstChange==null)
view.inputState.compositionFirstChange=true;if(view.inputState.composing<0){view.inputState.composing=0;if(view.docView.compositionDeco.size){view.observer.flush();forceClearComposition(view,true);}}};handlers.compositionend=view=>{view.inputState.composing=-1;view.inputState.compositionEndedAt=Date.now();view.inputState.compositionFirstChange=null;setTimeout(()=>{if(view.inputState.composing<0)
forceClearComposition(view,false);},50);};handlers.contextmenu=view=>{view.inputState.lastContextMenu=Date.now();};handlers.beforeinput=(view,event)=>{var _a;let pending;if(browser.chrome&&browser.android&&(pending=PendingKeys.find(key=>key.inputType==event.inputType))){view.observer.delayAndroidKey(pending.key,pending.keyCode);if(pending.key=="Backspace"||pending.key=="Delete"){let startViewHeight=((_a=window.visualViewport)===null||_a===void 0?void 0:_a.height)||0;setTimeout(()=>{var _a;if((((_a=window.visualViewport)===null||_a===void 0?void 0:_a.height)||0)>startViewHeight+10&&view.hasFocus){view.contentDOM.blur();view.focus();}},100);}}};const wrappingWhiteSpace=["pre-wrap","normal","pre-line","break-spaces"];class HeightOracle{constructor(){this.doc=Text.empty;this.lineWrapping=false;this.heightSamples={};this.lineHeight=14;this.charWidth=7;this.lineLength=30;this.heightChanged=false;}
heightForGap(from,to){let lines=this.doc.lineAt(to).number-this.doc.lineAt(from).number+1;if(this.lineWrapping)
lines+=Math.ceil(((to-from)-(lines*this.lineLength*0.5))/this.lineLength);return this.lineHeight*lines;}
heightForLine(length){if(!this.lineWrapping)
return this.lineHeight;let lines=1+Math.max(0,Math.ceil((length-this.lineLength)/(this.lineLength-5)));return lines*this.lineHeight;}
setDoc(doc){this.doc=doc;return this;}
mustRefreshForWrapping(whiteSpace){return(wrappingWhiteSpace.indexOf(whiteSpace)>-1)!=this.lineWrapping;}
mustRefreshForHeights(lineHeights){let newHeight=false;for(let i=0;i<lineHeights.length;i++){let h=lineHeights[i];if(h<0){i++;}
else if(!this.heightSamples[Math.floor(h*10)]){newHeight=true;this.heightSamples[Math.floor(h*10)]=true;}}
return newHeight;}
refresh(whiteSpace,lineHeight,charWidth,lineLength,knownHeights){let lineWrapping=wrappingWhiteSpace.indexOf(whiteSpace)>-1;let changed=Math.round(lineHeight)!=Math.round(this.lineHeight)||this.lineWrapping!=lineWrapping;this.lineWrapping=lineWrapping;this.lineHeight=lineHeight;this.charWidth=charWidth;this.lineLength=lineLength;if(changed){this.heightSamples={};for(let i=0;i<knownHeights.length;i++){let h=knownHeights[i];if(h<0)
i++;else
this.heightSamples[Math.floor(h*10)]=true;}}
return changed;}}
class MeasuredHeights{constructor(from,heights){this.from=from;this.heights=heights;this.index=0;}
get more(){return this.index<this.heights.length;}}
class BlockInfo{constructor(from,length,top,height,type){this.from=from;this.length=length;this.top=top;this.height=height;this.type=type;}
get to(){return this.from+this.length;}
get bottom(){return this.top+this.height;}
join(other){let detail=(Array.isArray(this.type)?this.type:[this]).concat(Array.isArray(other.type)?other.type:[other]);return new BlockInfo(this.from,this.length+other.length,this.top,this.height+other.height,detail);}}
var QueryType=(function(QueryType){QueryType[QueryType["ByPos"]=0]="ByPos";QueryType[QueryType["ByHeight"]=1]="ByHeight";QueryType[QueryType["ByPosNoHeight"]=2]="ByPosNoHeight";return QueryType})(QueryType||(QueryType={}));const Epsilon=1e-3;class HeightMap{constructor(length,height,flags=2){this.length=length;this.height=height;this.flags=flags;}
get outdated(){return(this.flags&2)>0;}
set outdated(value){this.flags=(value?2:0)|(this.flags&~2);}
setHeight(oracle,height){if(this.height!=height){if(Math.abs(this.height-height)>Epsilon)
oracle.heightChanged=true;this.height=height;}}
replace(_from,_to,nodes){return HeightMap.of(nodes);}
decomposeLeft(_to,result){result.push(this);}
decomposeRight(_from,result){result.push(this);}
applyChanges(decorations,oldDoc,oracle,changes){let me=this;for(let i=changes.length-1;i>=0;i--){let{fromA,toA,fromB,toB}=changes[i];let start=me.lineAt(fromA,QueryType.ByPosNoHeight,oldDoc,0,0);let end=start.to>=toA?start:me.lineAt(toA,QueryType.ByPosNoHeight,oldDoc,0,0);toB+=end.to-toA;toA=end.to;while(i>0&&start.from<=changes[i-1].toA){fromA=changes[i-1].fromA;fromB=changes[i-1].fromB;i--;if(fromA<start.from)
start=me.lineAt(fromA,QueryType.ByPosNoHeight,oldDoc,0,0);}
fromB+=start.from-fromA;fromA=start.from;let nodes=NodeBuilder.build(oracle,decorations,fromB,toB);me=me.replace(fromA,toA,nodes);}
return me.updateHeight(oracle,0);}
static empty(){return new HeightMapText(0,0);}
static of(nodes){if(nodes.length==1)
return nodes[0];let i=0,j=nodes.length,before=0,after=0;for(;;){if(i==j){if(before>after*2){let split=nodes[i-1];if(split.break)
nodes.splice(--i,1,split.left,null,split.right);else
nodes.splice(--i,1,split.left,split.right);j+=1+split.break;before-=split.size;}
else if(after>before*2){let split=nodes[j];if(split.break)
nodes.splice(j,1,split.left,null,split.right);else
nodes.splice(j,1,split.left,split.right);j+=2+split.break;after-=split.size;}
else{break;}}
else if(before<after){let next=nodes[i++];if(next)
before+=next.size;}
else{let next=nodes[--j];if(next)
after+=next.size;}}
let brk=0;if(nodes[i-1]==null){brk=1;i--;}
else if(nodes[i]==null){brk=1;j++;}
return new HeightMapBranch(HeightMap.of(nodes.slice(0,i)),brk,HeightMap.of(nodes.slice(j)));}}
HeightMap.prototype.size=1;class HeightMapBlock extends HeightMap{constructor(length,height,type){super(length,height);this.type=type;}
blockAt(_height,_doc,top,offset){return new BlockInfo(offset,this.length,top,this.height,this.type);}
lineAt(_value,_type,doc,top,offset){return this.blockAt(0,doc,top,offset);}
forEachLine(from,to,doc,top,offset,f){if(from<=offset+this.length&&to>=offset)
f(this.blockAt(0,doc,top,offset));}
updateHeight(oracle,offset=0,_force=false,measured){if(measured&&measured.from<=offset&&measured.more)
this.setHeight(oracle,measured.heights[measured.index++]);this.outdated=false;return this;}
toString(){return `block(${this.length})`;}}
class HeightMapText extends HeightMapBlock{constructor(length,height){super(length,height,BlockType.Text);this.collapsed=0;this.widgetHeight=0;}
replace(_from,_to,nodes){let node=nodes[0];if(nodes.length==1&&(node instanceof HeightMapText||node instanceof HeightMapGap&&(node.flags&4))&&Math.abs(this.length-node.length)<10){if(node instanceof HeightMapGap)
node=new HeightMapText(node.length,this.height);else
node.height=this.height;if(!this.outdated)
node.outdated=false;return node;}
else{return HeightMap.of(nodes);}}
updateHeight(oracle,offset=0,force=false,measured){if(measured&&measured.from<=offset&&measured.more)
this.setHeight(oracle,measured.heights[measured.index++]);else if(force||this.outdated)
this.setHeight(oracle,Math.max(this.widgetHeight,oracle.heightForLine(this.length-this.collapsed)));this.outdated=false;return this;}
toString(){return `line(${this.length}${this.collapsed?-this.collapsed:""}${this.widgetHeight?":"+this.widgetHeight:""})`;}}
class HeightMapGap extends HeightMap{constructor(length){super(length,0);}
lines(doc,offset){let firstLine=doc.lineAt(offset).number,lastLine=doc.lineAt(offset+this.length).number;return{firstLine,lastLine,lineHeight:this.height/(lastLine-firstLine+1)};}
blockAt(height,doc,top,offset){let{firstLine,lastLine,lineHeight}=this.lines(doc,offset);let line=Math.max(0,Math.min(lastLine-firstLine,Math.floor((height-top)/lineHeight)));let{from,length}=doc.line(firstLine+line);return new BlockInfo(from,length,top+lineHeight*line,lineHeight,BlockType.Text);}
lineAt(value,type,doc,top,offset){if(type==QueryType.ByHeight)
return this.blockAt(value,doc,top,offset);if(type==QueryType.ByPosNoHeight){let{from,to}=doc.lineAt(value);return new BlockInfo(from,to-from,0,0,BlockType.Text);}
let{firstLine,lineHeight}=this.lines(doc,offset);let{from,length,number}=doc.lineAt(value);return new BlockInfo(from,length,top+lineHeight*(number-firstLine),lineHeight,BlockType.Text);}
forEachLine(from,to,doc,top,offset,f){let{firstLine,lineHeight}=this.lines(doc,offset);for(let pos=Math.max(from,offset),end=Math.min(offset+this.length,to);pos<=end;){let line=doc.lineAt(pos);if(pos==from)
top+=lineHeight*(line.number-firstLine);f(new BlockInfo(line.from,line.length,top,lineHeight,BlockType.Text));top+=lineHeight;pos=line.to+1;}}
replace(from,to,nodes){let after=this.length-to;if(after>0){let last=nodes[nodes.length-1];if(last instanceof HeightMapGap)
nodes[nodes.length-1]=new HeightMapGap(last.length+after);else
nodes.push(null,new HeightMapGap(after-1));}
if(from>0){let first=nodes[0];if(first instanceof HeightMapGap)
nodes[0]=new HeightMapGap(from+first.length);else
nodes.unshift(new HeightMapGap(from-1),null);}
return HeightMap.of(nodes);}
decomposeLeft(to,result){result.push(new HeightMapGap(to-1),null);}
decomposeRight(from,result){result.push(null,new HeightMapGap(this.length-from-1));}
updateHeight(oracle,offset=0,force=false,measured){let end=offset+this.length;if(measured&&measured.from<=offset+this.length&&measured.more){let nodes=[],pos=Math.max(offset,measured.from),singleHeight=-1;let wasChanged=oracle.heightChanged;if(measured.from>offset)
nodes.push(new HeightMapGap(measured.from-offset-1).updateHeight(oracle,offset));while(pos<=end&&measured.more){let len=oracle.doc.lineAt(pos).length;if(nodes.length)
nodes.push(null);let height=measured.heights[measured.index++];if(singleHeight==-1)
singleHeight=height;else if(Math.abs(height-singleHeight)>=Epsilon)
singleHeight=-2;let line=new HeightMapText(len,height);line.outdated=false;nodes.push(line);pos+=len+1;}
if(pos<=end)
nodes.push(null,new HeightMapGap(end-pos).updateHeight(oracle,pos));let result=HeightMap.of(nodes);oracle.heightChanged=wasChanged||singleHeight<0||Math.abs(result.height-this.height)>=Epsilon||Math.abs(singleHeight-this.lines(oracle.doc,offset).lineHeight)>=Epsilon;return result;}
else if(force||this.outdated){this.setHeight(oracle,oracle.heightForGap(offset,offset+this.length));this.outdated=false;}
return this;}
toString(){return `gap(${this.length})`;}}
class HeightMapBranch extends HeightMap{constructor(left,brk,right){super(left.length+brk+right.length,left.height+right.height,brk|(left.outdated||right.outdated?2:0));this.left=left;this.right=right;this.size=left.size+right.size;}
get break(){return this.flags&1;}
blockAt(height,doc,top,offset){let mid=top+this.left.height;return height<mid?this.left.blockAt(height,doc,top,offset):this.right.blockAt(height,doc,mid,offset+this.left.length+this.break);}
lineAt(value,type,doc,top,offset){let rightTop=top+this.left.height,rightOffset=offset+this.left.length+this.break;let left=type==QueryType.ByHeight?value<rightTop:value<rightOffset;let base=left?this.left.lineAt(value,type,doc,top,offset):this.right.lineAt(value,type,doc,rightTop,rightOffset);if(this.break||(left?base.to<rightOffset:base.from>rightOffset))
return base;let subQuery=type==QueryType.ByPosNoHeight?QueryType.ByPosNoHeight:QueryType.ByPos;if(left)
return base.join(this.right.lineAt(rightOffset,subQuery,doc,rightTop,rightOffset));else
return this.left.lineAt(rightOffset,subQuery,doc,top,offset).join(base);}
forEachLine(from,to,doc,top,offset,f){let rightTop=top+this.left.height,rightOffset=offset+this.left.length+this.break;if(this.break){if(from<rightOffset)
this.left.forEachLine(from,to,doc,top,offset,f);if(to>=rightOffset)
this.right.forEachLine(from,to,doc,rightTop,rightOffset,f);}
else{let mid=this.lineAt(rightOffset,QueryType.ByPos,doc,top,offset);if(from<mid.from)
this.left.forEachLine(from,mid.from-1,doc,top,offset,f);if(mid.to>=from&&mid.from<=to)
f(mid);if(to>mid.to)
this.right.forEachLine(mid.to+1,to,doc,rightTop,rightOffset,f);}}
replace(from,to,nodes){let rightStart=this.left.length+this.break;if(to<rightStart)
return this.balanced(this.left.replace(from,to,nodes),this.right);if(from>this.left.length)
return this.balanced(this.left,this.right.replace(from-rightStart,to-rightStart,nodes));let result=[];if(from>0)
this.decomposeLeft(from,result);let left=result.length;for(let node of nodes)
result.push(node);if(from>0)
mergeGaps(result,left-1);if(to<this.length){let right=result.length;this.decomposeRight(to,result);mergeGaps(result,right);}
return HeightMap.of(result);}
decomposeLeft(to,result){let left=this.left.length;if(to<=left)
return this.left.decomposeLeft(to,result);result.push(this.left);if(this.break){left++;if(to>=left)
result.push(null);}
if(to>left)
this.right.decomposeLeft(to-left,result);}
decomposeRight(from,result){let left=this.left.length,right=left+this.break;if(from>=right)
return this.right.decomposeRight(from-right,result);if(from<left)
this.left.decomposeRight(from,result);if(this.break&&from<right)
result.push(null);result.push(this.right);}
balanced(left,right){if(left.size>2*right.size||right.size>2*left.size)
return HeightMap.of(this.break?[left,null,right]:[left,right]);this.left=left;this.right=right;this.height=left.height+right.height;this.outdated=left.outdated||right.outdated;this.size=left.size+right.size;this.length=left.length+this.break+right.length;return this;}
updateHeight(oracle,offset=0,force=false,measured){let{left,right}=this,rightStart=offset+left.length+this.break,rebalance=null;if(measured&&measured.from<=offset+left.length&&measured.more)
rebalance=left=left.updateHeight(oracle,offset,force,measured);else
left.updateHeight(oracle,offset,force);if(measured&&measured.from<=rightStart+right.length&&measured.more)
rebalance=right=right.updateHeight(oracle,rightStart,force,measured);else
right.updateHeight(oracle,rightStart,force);if(rebalance)
return this.balanced(left,right);this.height=this.left.height+this.right.height;this.outdated=false;return this;}
toString(){return this.left+(this.break?" ":"-")+this.right;}}
function mergeGaps(nodes,around){let before,after;if(nodes[around]==null&&(before=nodes[around-1])instanceof HeightMapGap&&(after=nodes[around+1])instanceof HeightMapGap)
nodes.splice(around-1,3,new HeightMapGap(before.length+1+after.length));}
const relevantWidgetHeight=5;class NodeBuilder{constructor(pos,oracle){this.pos=pos;this.oracle=oracle;this.nodes=[];this.lineStart=-1;this.lineEnd=-1;this.covering=null;this.writtenTo=pos;}
get isCovered(){return this.covering&&this.nodes[this.nodes.length-1]==this.covering;}
span(_from,to){if(this.lineStart>-1){let end=Math.min(to,this.lineEnd),last=this.nodes[this.nodes.length-1];if(last instanceof HeightMapText)
last.length+=end-this.pos;else if(end>this.pos||!this.isCovered)
this.nodes.push(new HeightMapText(end-this.pos,-1));this.writtenTo=end;if(to>end){this.nodes.push(null);this.writtenTo++;this.lineStart=-1;}}
this.pos=to;}
point(from,to,deco){if(from<to||deco.heightRelevant){let height=deco.widget?deco.widget.estimatedHeight:0;if(height<0)
height=this.oracle.lineHeight;let len=to-from;if(deco.block){this.addBlock(new HeightMapBlock(len,height,deco.type));}
else if(len||height>=relevantWidgetHeight){this.addLineDeco(height,len);}}
else if(to>from){this.span(from,to);}
if(this.lineEnd>-1&&this.lineEnd<this.pos)
this.lineEnd=this.oracle.doc.lineAt(this.pos).to;}
enterLine(){if(this.lineStart>-1)
return;let{from,to}=this.oracle.doc.lineAt(this.pos);this.lineStart=from;this.lineEnd=to;if(this.writtenTo<from){if(this.writtenTo<from-1||this.nodes[this.nodes.length-1]==null)
this.nodes.push(this.blankContent(this.writtenTo,from-1));this.nodes.push(null);}
if(this.pos>from)
this.nodes.push(new HeightMapText(this.pos-from,-1));this.writtenTo=this.pos;}
blankContent(from,to){let gap=new HeightMapGap(to-from);if(this.oracle.doc.lineAt(from).to==to)
gap.flags|=4;return gap;}
ensureLine(){this.enterLine();let last=this.nodes.length?this.nodes[this.nodes.length-1]:null;if(last instanceof HeightMapText)
return last;let line=new HeightMapText(0,-1);this.nodes.push(line);return line;}
addBlock(block){this.enterLine();if(block.type==BlockType.WidgetAfter&&!this.isCovered)
this.ensureLine();this.nodes.push(block);this.writtenTo=this.pos=this.pos+block.length;if(block.type!=BlockType.WidgetBefore)
this.covering=block;}
addLineDeco(height,length){let line=this.ensureLine();line.length+=length;line.collapsed+=length;line.widgetHeight=Math.max(line.widgetHeight,height);this.writtenTo=this.pos=this.pos+length;}
finish(from){let last=this.nodes.length==0?null:this.nodes[this.nodes.length-1];if(this.lineStart>-1&&!(last instanceof HeightMapText)&&!this.isCovered)
this.nodes.push(new HeightMapText(0,-1));else if(this.writtenTo<this.pos||last==null)
this.nodes.push(this.blankContent(this.writtenTo,this.pos));let pos=from;for(let node of this.nodes){if(node instanceof HeightMapText)
node.updateHeight(this.oracle,pos);pos+=node?node.length:1;}
return this.nodes;}
static build(oracle,decorations,from,to){let builder=new NodeBuilder(from,oracle);RangeSet.spans(decorations,from,to,builder,0);return builder.finish(from);}}
function heightRelevantDecoChanges(a,b,diff){let comp=new DecorationComparator;RangeSet.compare(a,b,diff,comp,0);return comp.changes;}
class DecorationComparator{constructor(){this.changes=[];}
compareRange(){}
comparePoint(from,to,a,b){if(from<to||a&&a.heightRelevant||b&&b.heightRelevant)
addRange(from,to,this.changes,5);}}
function visiblePixelRange(dom,paddingTop){let rect=dom.getBoundingClientRect();let left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right);let top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);let body=dom.ownerDocument.body;for(let parent=dom.parentNode;parent&&parent!=body;){if(parent.nodeType==1){let elt=parent;let style=window.getComputedStyle(elt);if((elt.scrollHeight>elt.clientHeight||elt.scrollWidth>elt.clientWidth)&&style.overflow!="visible"){let parentRect=elt.getBoundingClientRect();left=Math.max(left,parentRect.left);right=Math.min(right,parentRect.right);top=Math.max(top,parentRect.top);bottom=Math.min(bottom,parentRect.bottom);}
parent=style.position=="absolute"||style.position=="fixed"?elt.offsetParent:elt.parentNode;}
else if(parent.nodeType==11){parent=parent.host;}
else{break;}}
return{left:left-rect.left,right:Math.max(left,right)-rect.left,top:top-(rect.top+paddingTop),bottom:Math.max(top,bottom)-(rect.top+paddingTop)};}
function fullPixelRange(dom,paddingTop){let rect=dom.getBoundingClientRect();return{left:0,right:rect.right-rect.left,top:paddingTop,bottom:rect.bottom-(rect.top+paddingTop)};}
class LineGap{constructor(from,to,size){this.from=from;this.to=to;this.size=size;}
static same(a,b){if(a.length!=b.length)
return false;for(let i=0;i<a.length;i++){let gA=a[i],gB=b[i];if(gA.from!=gB.from||gA.to!=gB.to||gA.size!=gB.size)
return false;}
return true;}
draw(wrapping){return Decoration.replace({widget:new LineGapWidget(this.size,wrapping)}).range(this.from,this.to);}}
class LineGapWidget extends WidgetType{constructor(size,vertical){super();this.size=size;this.vertical=vertical;}
eq(other){return other.size==this.size&&other.vertical==this.vertical;}
toDOM(){let elt=document.createElement("div");if(this.vertical){elt.style.height=this.size+"px";}
else{elt.style.width=this.size+"px";elt.style.height="2px";elt.style.display="inline-block";}
return elt;}
get estimatedHeight(){return this.vertical?this.size:-1;}}
class ViewState{constructor(state){this.state=state;this.pixelViewport={left:0,right:window.innerWidth,top:0,bottom:0};this.inView=true;this.paddingTop=0;this.paddingBottom=0;this.contentDOMWidth=0;this.contentDOMHeight=0;this.editorHeight=0;this.editorWidth=0;this.heightOracle=new HeightOracle;this.scaler=IdScaler;this.scrollTarget=null;this.printing=false;this.mustMeasureContent=true;this.defaultTextDirection=Direction.RTL;this.visibleRanges=[];this.mustEnforceCursorAssoc=false;this.stateDeco=state.facet(decorations).filter(d=>typeof d!="function");this.heightMap=HeightMap.empty().applyChanges(this.stateDeco,Text.empty,this.heightOracle.setDoc(state.doc),[new ChangedRange(0,0,0,state.doc.length)]);this.viewport=this.getViewport(0,null);this.updateViewportLines();this.updateForViewport();this.lineGaps=this.ensureLineGaps([]);this.lineGapDeco=Decoration.set(this.lineGaps.map(gap=>gap.draw(false)));this.computeVisibleRanges();}
updateForViewport(){let viewports=[this.viewport],{main}=this.state.selection;for(let i=0;i<=1;i++){let pos=i?main.head:main.anchor;if(!viewports.some(({from,to})=>pos>=from&&pos<=to)){let{from,to}=this.lineBlockAt(pos);viewports.push(new Viewport(from,to));}}
this.viewports=viewports.sort((a,b)=>a.from-b.from);this.scaler=this.heightMap.height<=7000000?IdScaler:new BigScaler(this.heightOracle.doc,this.heightMap,this.viewports);}
updateViewportLines(){this.viewportLines=[];this.heightMap.forEachLine(this.viewport.from,this.viewport.to,this.state.doc,0,0,block=>{this.viewportLines.push(this.scaler.scale==1?block:scaleBlock(block,this.scaler));});}
update(update,scrollTarget=null){this.state=update.state;let prevDeco=this.stateDeco;this.stateDeco=this.state.facet(decorations).filter(d=>typeof d!="function");let contentChanges=update.changedRanges;let heightChanges=ChangedRange.extendWithRanges(contentChanges,heightRelevantDecoChanges(prevDeco,this.stateDeco,update?update.changes:ChangeSet.empty(this.state.doc.length)));let prevHeight=this.heightMap.height;this.heightMap=this.heightMap.applyChanges(this.stateDeco,update.startState.doc,this.heightOracle.setDoc(this.state.doc),heightChanges);if(this.heightMap.height!=prevHeight)
update.flags|=2;let viewport=heightChanges.length?this.mapViewport(this.viewport,update.changes):this.viewport;if(scrollTarget&&(scrollTarget.range.head<viewport.from||scrollTarget.range.head>viewport.to)||!this.viewportIsAppropriate(viewport))
viewport=this.getViewport(0,scrollTarget);let updateLines=!update.changes.empty||(update.flags&2)||viewport.from!=this.viewport.from||viewport.to!=this.viewport.to;this.viewport=viewport;this.updateForViewport();if(updateLines)
this.updateViewportLines();if(this.lineGaps.length||this.viewport.to-this.viewport.from>4000)
this.updateLineGaps(this.ensureLineGaps(this.mapLineGaps(this.lineGaps,update.changes)));update.flags|=this.computeVisibleRanges();if(scrollTarget)
this.scrollTarget=scrollTarget;if(!this.mustEnforceCursorAssoc&&update.selectionSet&&update.view.lineWrapping&&update.state.selection.main.empty&&update.state.selection.main.assoc)
this.mustEnforceCursorAssoc=true;}
measure(view){let dom=view.contentDOM,style=window.getComputedStyle(dom);let oracle=this.heightOracle;let whiteSpace=style.whiteSpace;this.defaultTextDirection=style.direction=="rtl"?Direction.RTL:Direction.LTR;let refresh=this.heightOracle.mustRefreshForWrapping(whiteSpace);let measureContent=refresh||this.mustMeasureContent||this.contentDOMHeight!=dom.clientHeight;this.contentDOMHeight=dom.clientHeight;this.mustMeasureContent=false;let result=0,bias=0;let paddingTop=parseInt(style.paddingTop)||0,paddingBottom=parseInt(style.paddingBottom)||0;if(this.paddingTop!=paddingTop||this.paddingBottom!=paddingBottom){this.paddingTop=paddingTop;this.paddingBottom=paddingBottom;result|=8|2;}
if(this.editorWidth!=view.scrollDOM.clientWidth){if(oracle.lineWrapping)
measureContent=true;this.editorWidth=view.scrollDOM.clientWidth;result|=8;}
let pixelViewport=(this.printing?fullPixelRange:visiblePixelRange)(dom,this.paddingTop);let dTop=pixelViewport.top-this.pixelViewport.top,dBottom=pixelViewport.bottom-this.pixelViewport.bottom;this.pixelViewport=pixelViewport;let inView=this.pixelViewport.bottom>this.pixelViewport.top&&this.pixelViewport.right>this.pixelViewport.left;if(inView!=this.inView){this.inView=inView;if(inView)
measureContent=true;}
if(!this.inView)
return 0;let contentWidth=dom.clientWidth;if(this.contentDOMWidth!=contentWidth||this.editorHeight!=view.scrollDOM.clientHeight){this.contentDOMWidth=contentWidth;this.editorHeight=view.scrollDOM.clientHeight;result|=8;}
if(measureContent){let lineHeights=view.docView.measureVisibleLineHeights(this.viewport);if(oracle.mustRefreshForHeights(lineHeights))
refresh=true;if(refresh||oracle.lineWrapping&&Math.abs(contentWidth-this.contentDOMWidth)>oracle.charWidth){let{lineHeight,charWidth}=view.docView.measureTextSize();refresh=oracle.refresh(whiteSpace,lineHeight,charWidth,contentWidth/charWidth,lineHeights);if(refresh){view.docView.minWidth=0;result|=8;}}
if(dTop>0&&dBottom>0)
bias=Math.max(dTop,dBottom);else if(dTop<0&&dBottom<0)
bias=Math.min(dTop,dBottom);oracle.heightChanged=false;for(let vp of this.viewports){let heights=vp.from==this.viewport.from?lineHeights:view.docView.measureVisibleLineHeights(vp);this.heightMap=this.heightMap.updateHeight(oracle,0,refresh,new MeasuredHeights(vp.from,heights));}
if(oracle.heightChanged)
result|=2;}
let viewportChange=!this.viewportIsAppropriate(this.viewport,bias)||this.scrollTarget&&(this.scrollTarget.range.head<this.viewport.from||this.scrollTarget.range.head>this.viewport.to);if(viewportChange)
this.viewport=this.getViewport(bias,this.scrollTarget);this.updateForViewport();if((result&2)||viewportChange)
this.updateViewportLines();if(this.lineGaps.length||this.viewport.to-this.viewport.from>4000)
this.updateLineGaps(this.ensureLineGaps(refresh?[]:this.lineGaps));result|=this.computeVisibleRanges();if(this.mustEnforceCursorAssoc){this.mustEnforceCursorAssoc=false;view.docView.enforceCursorAssoc();}
return result;}
get visibleTop(){return this.scaler.fromDOM(this.pixelViewport.top);}
get visibleBottom(){return this.scaler.fromDOM(this.pixelViewport.bottom);}
getViewport(bias,scrollTarget){let marginTop=0.5-Math.max(-0.5,Math.min(0.5,bias/1000/2));let map=this.heightMap,doc=this.state.doc,{visibleTop,visibleBottom}=this;let viewport=new Viewport(map.lineAt(visibleTop-marginTop*1000,QueryType.ByHeight,doc,0,0).from,map.lineAt(visibleBottom+(1-marginTop)*1000,QueryType.ByHeight,doc,0,0).to);if(scrollTarget){let{head}=scrollTarget.range;if(head<viewport.from||head>viewport.to){let viewHeight=Math.min(this.editorHeight,this.pixelViewport.bottom-this.pixelViewport.top);let block=map.lineAt(head,QueryType.ByPos,doc,0,0),topPos;if(scrollTarget.y=="center")
topPos=(block.top+block.bottom)/2-viewHeight/2;else if(scrollTarget.y=="start"||scrollTarget.y=="nearest"&&head<viewport.from)
topPos=block.top;else
topPos=block.bottom-viewHeight;viewport=new Viewport(map.lineAt(topPos-1000/2,QueryType.ByHeight,doc,0,0).from,map.lineAt(topPos+viewHeight+1000/2,QueryType.ByHeight,doc,0,0).to);}}
return viewport;}
mapViewport(viewport,changes){let from=changes.mapPos(viewport.from,-1),to=changes.mapPos(viewport.to,1);return new Viewport(this.heightMap.lineAt(from,QueryType.ByPos,this.state.doc,0,0).from,this.heightMap.lineAt(to,QueryType.ByPos,this.state.doc,0,0).to);}
viewportIsAppropriate({from,to},bias=0){if(!this.inView)
return true;let{top}=this.heightMap.lineAt(from,QueryType.ByPos,this.state.doc,0,0);let{bottom}=this.heightMap.lineAt(to,QueryType.ByPos,this.state.doc,0,0);let{visibleTop,visibleBottom}=this;return(from==0||top<=visibleTop-Math.max(10,Math.min(-bias,250)))&&(to==this.state.doc.length||bottom>=visibleBottom+Math.max(10,Math.min(bias,250)))&&(top>visibleTop-2*1000&&bottom<visibleBottom+2*1000);}
mapLineGaps(gaps,changes){if(!gaps.length||changes.empty)
return gaps;let mapped=[];for(let gap of gaps)
if(!changes.touchesRange(gap.from,gap.to))
mapped.push(new LineGap(changes.mapPos(gap.from),changes.mapPos(gap.to),gap.size));return mapped;}
ensureLineGaps(current){let gaps=[];if(this.defaultTextDirection!=Direction.LTR)
return gaps;for(let line of this.viewportLines){if(line.length<4000)
continue;let structure=lineStructure(line.from,line.to,this.stateDeco);if(structure.total<4000)
continue;let viewFrom,viewTo;if(this.heightOracle.lineWrapping){let marginHeight=(2000/this.heightOracle.lineLength)*this.heightOracle.lineHeight;viewFrom=findPosition(structure,(this.visibleTop-line.top-marginHeight)/line.height);viewTo=findPosition(structure,(this.visibleBottom-line.top+marginHeight)/line.height);}
else{let totalWidth=structure.total*this.heightOracle.charWidth;let marginWidth=2000*this.heightOracle.charWidth;viewFrom=findPosition(structure,(this.pixelViewport.left-marginWidth)/totalWidth);viewTo=findPosition(structure,(this.pixelViewport.right+marginWidth)/totalWidth);}
let outside=[];if(viewFrom>line.from)
outside.push({from:line.from,to:viewFrom});if(viewTo<line.to)
outside.push({from:viewTo,to:line.to});let sel=this.state.selection.main;if(sel.from>=line.from&&sel.from<=line.to)
cutRange(outside,sel.from-10,sel.from+10);if(!sel.empty&&sel.to>=line.from&&sel.to<=line.to)
cutRange(outside,sel.to-10,sel.to+10);for(let{from,to}of outside)
if(to-from>1000){gaps.push(find(current,gap=>gap.from>=line.from&&gap.to<=line.to&&Math.abs(gap.from-from)<1000&&Math.abs(gap.to-to)<1000)||new LineGap(from,to,this.gapSize(line,from,to,structure)));}}
return gaps;}
gapSize(line,from,to,structure){let fraction=findFraction(structure,to)-findFraction(structure,from);if(this.heightOracle.lineWrapping){return line.height*fraction;}
else{return structure.total*this.heightOracle.charWidth*fraction;}}
updateLineGaps(gaps){if(!LineGap.same(gaps,this.lineGaps)){this.lineGaps=gaps;this.lineGapDeco=Decoration.set(gaps.map(gap=>gap.draw(this.heightOracle.lineWrapping)));}}
computeVisibleRanges(){let deco=this.stateDeco;if(this.lineGaps.length)
deco=deco.concat(this.lineGapDeco);let ranges=[];RangeSet.spans(deco,this.viewport.from,this.viewport.to,{span(from,to){ranges.push({from,to});},point(){}},20);let changed=ranges.length!=this.visibleRanges.length||this.visibleRanges.some((r,i)=>r.from!=ranges[i].from||r.to!=ranges[i].to);this.visibleRanges=ranges;return changed?4:0;}
lineBlockAt(pos){return(pos>=this.viewport.from&&pos<=this.viewport.to&&this.viewportLines.find(b=>b.from<=pos&&b.to>=pos))||scaleBlock(this.heightMap.lineAt(pos,QueryType.ByPos,this.state.doc,0,0),this.scaler);}
lineBlockAtHeight(height){return scaleBlock(this.heightMap.lineAt(this.scaler.fromDOM(height),QueryType.ByHeight,this.state.doc,0,0),this.scaler);}
elementAtHeight(height){return scaleBlock(this.heightMap.blockAt(this.scaler.fromDOM(height),this.state.doc,0,0),this.scaler);}
get docHeight(){return this.scaler.toDOM(this.heightMap.height);}
get contentHeight(){return this.docHeight+this.paddingTop+this.paddingBottom;}}
class Viewport{constructor(from,to){this.from=from;this.to=to;}}
function lineStructure(from,to,stateDeco){let ranges=[],pos=from,total=0;RangeSet.spans(stateDeco,from,to,{span(){},point(from,to){if(from>pos){ranges.push({from:pos,to:from});total+=from-pos;}
pos=to;}},20);if(pos<to){ranges.push({from:pos,to});total+=to-pos;}
return{total,ranges};}
function findPosition({total,ranges},ratio){if(ratio<=0)
return ranges[0].from;if(ratio>=1)
return ranges[ranges.length-1].to;let dist=Math.floor(total*ratio);for(let i=0;;i++){let{from,to}=ranges[i],size=to-from;if(dist<=size)
return from+dist;dist-=size;}}
function findFraction(structure,pos){let counted=0;for(let{from,to}of structure.ranges){if(pos<=to){counted+=pos-from;break;}
counted+=to-from;}
return counted/structure.total;}
function cutRange(ranges,from,to){for(let i=0;i<ranges.length;i++){let r=ranges[i];if(r.from<to&&r.to>from){let pieces=[];if(r.from<from)
pieces.push({from:r.from,to:from});if(r.to>to)
pieces.push({from:to,to:r.to});ranges.splice(i,1,...pieces);i+=pieces.length-1;}}}
function find(array,f){for(let val of array)
if(f(val))
return val;return undefined;}
const IdScaler={toDOM(n){return n;},fromDOM(n){return n;},scale:1};class BigScaler{constructor(doc,heightMap,viewports){let vpHeight=0,base=0,domBase=0;this.viewports=viewports.map(({from,to})=>{let top=heightMap.lineAt(from,QueryType.ByPos,doc,0,0).top;let bottom=heightMap.lineAt(to,QueryType.ByPos,doc,0,0).bottom;vpHeight+=bottom-top;return{from,to,top,bottom,domTop:0,domBottom:0};});this.scale=(7000000-vpHeight)/(heightMap.height-vpHeight);for(let obj of this.viewports){obj.domTop=domBase+(obj.top-base)*this.scale;domBase=obj.domBottom=obj.domTop+(obj.bottom-obj.top);base=obj.bottom;}}
toDOM(n){for(let i=0,base=0,domBase=0;;i++){let vp=i<this.viewports.length?this.viewports[i]:null;if(!vp||n<vp.top)
return domBase+(n-base)*this.scale;if(n<=vp.bottom)
return vp.domTop+(n-vp.top);base=vp.bottom;domBase=vp.domBottom;}}
fromDOM(n){for(let i=0,base=0,domBase=0;;i++){let vp=i<this.viewports.length?this.viewports[i]:null;if(!vp||n<vp.domTop)
return base+(n-domBase)/this.scale;if(n<=vp.domBottom)
return vp.top+(n-vp.domTop);base=vp.bottom;domBase=vp.domBottom;}}}
function scaleBlock(block,scaler){if(scaler.scale==1)
return block;let bTop=scaler.toDOM(block.top),bBottom=scaler.toDOM(block.bottom);return new BlockInfo(block.from,block.length,bTop,bBottom-bTop,Array.isArray(block.type)?block.type.map(b=>scaleBlock(b,scaler)):block.type);}
const theme=Facet.define({combine:strs=>strs.join(" ")});const darkTheme=Facet.define({combine:values=>values.indexOf(true)>-1});const baseThemeID=StyleModule.newName(),baseLightID=StyleModule.newName(),baseDarkID=StyleModule.newName();const lightDarkIDs={"&light":"."+baseLightID,"&dark":"."+baseDarkID};function buildTheme(main,spec,scopes){return new StyleModule(spec,{finish(sel){return /&/.test(sel)?sel.replace(/&\w*/,m=>{if(m=="&")
return main;if(!scopes||!scopes[m])
throw new RangeError(`Unsupported selector: ${m}`);return scopes[m];}):main+" "+sel;}});}
const baseTheme$1=buildTheme("."+baseThemeID,{"&.cm-editor":{position:"relative !important",boxSizing:"border-box","&.cm-focused":{outline:"1px dotted #212121"},display:"flex !important",flexDirection:"column"},".cm-scroller":{display:"flex !important",alignItems:"flex-start !important",fontFamily:"monospace",lineHeight:1.4,height:"100%",overflowX:"auto",position:"relative",zIndex:0},".cm-content":{margin:0,flexGrow:2,minHeight:"100%",display:"block",whiteSpace:"pre",wordWrap:"normal",boxSizing:"border-box",padding:"4px 0",outline:"none","&[contenteditable=true]":{WebkitUserModify:"read-write-plaintext-only",}},".cm-lineWrapping":{whiteSpace_fallback:"pre-wrap",whiteSpace:"break-spaces",wordBreak:"break-word",overflowWrap:"anywhere"},"&light .cm-content":{caretColor:"black"},"&dark .cm-content":{caretColor:"white"},".cm-line":{display:"block",padding:"0 2px 0 4px"},".cm-selectionLayer":{zIndex:-1,contain:"size style"},".cm-selectionBackground":{position:"absolute",},"&light .cm-selectionBackground":{background:"#d9d9d9"},"&dark .cm-selectionBackground":{background:"#222"},"&light.cm-focused .cm-selectionBackground":{background:"#d7d4f0"},"&dark.cm-focused .cm-selectionBackground":{background:"#233"},".cm-cursorLayer":{zIndex:100,contain:"size style",pointerEvents:"none"},"&.cm-focused .cm-cursorLayer":{animation:"steps(1) cm-blink 1.2s infinite"},"@keyframes cm-blink":{"0%":{},"50%":{visibility:"hidden"},"100%":{}},"@keyframes cm-blink2":{"0%":{},"50%":{visibility:"hidden"},"100%":{}},".cm-cursor, .cm-dropCursor":{position:"absolute",borderLeft:"1.2px solid black",marginLeft:"-0.6px",pointerEvents:"none",},".cm-cursor":{display:"none"},"&dark .cm-cursor":{borderLeftColor:"#444"},"&.cm-focused .cm-cursor":{display:"block"},"&light .cm-activeLine":{backgroundColor:"#f3f9ff"},"&dark .cm-activeLine":{backgroundColor:"#223039"},"&light .cm-specialChar":{color:"red"},"&dark .cm-specialChar":{color:"#f78"},".cm-gutters":{display:"flex",height:"100%",boxSizing:"border-box",left:0,zIndex:200},"&light .cm-gutters":{backgroundColor:"#f5f5f5",color:"#6c6c6c",borderRight:"1px solid #ddd"},"&dark .cm-gutters":{backgroundColor:"#333338",color:"#ccc"},".cm-gutter":{display:"flex !important",flexDirection:"column",flexShrink:0,boxSizing:"border-box",minHeight:"100%",overflow:"hidden"},".cm-gutterElement":{boxSizing:"border-box"},".cm-lineNumbers .cm-gutterElement":{padding:"0 3px 0 5px",minWidth:"20px",textAlign:"right",whiteSpace:"nowrap"},"&light .cm-activeLineGutter":{backgroundColor:"#e2f2ff"},"&dark .cm-activeLineGutter":{backgroundColor:"#222227"},".cm-panels":{boxSizing:"border-box",position:"sticky",left:0,right:0},"&light .cm-panels":{backgroundColor:"#f5f5f5",color:"black"},"&light .cm-panels-top":{borderBottom:"1px solid #ddd"},"&light .cm-panels-bottom":{borderTop:"1px solid #ddd"},"&dark .cm-panels":{backgroundColor:"#333338",color:"white"},".cm-tab":{display:"inline-block",overflow:"hidden",verticalAlign:"bottom"},".cm-widgetBuffer":{verticalAlign:"text-top",height:"1em",display:"inline"},".cm-placeholder":{color:"#888",display:"inline-block",verticalAlign:"top",},".cm-button":{verticalAlign:"middle",color:"inherit",fontSize:"70%",padding:".2em 1em",borderRadius:"1px"},"&light .cm-button":{backgroundImage:"linear-gradient(#eff1f5, #d9d9df)",border:"1px solid #888","&:active":{backgroundImage:"linear-gradient(#b4b4b4, #d0d3d6)"}},"&dark .cm-button":{backgroundImage:"linear-gradient(#393939, #111)",border:"1px solid #888","&:active":{backgroundImage:"linear-gradient(#111, #333)"}},".cm-textfield":{verticalAlign:"middle",color:"inherit",fontSize:"70%",border:"1px solid silver",padding:".2em .5em"},"&light .cm-textfield":{backgroundColor:"white"},"&dark .cm-textfield":{border:"1px solid #555",backgroundColor:"inherit"}},lightDarkIDs);const observeOptions={childList:true,characterData:true,subtree:true,attributes:true,characterDataOldValue:true};const useCharData=browser.ie&&browser.ie_version<=11;class DOMObserver{constructor(view,onChange,onScrollChanged){this.view=view;this.onChange=onChange;this.onScrollChanged=onScrollChanged;this.active=false;this.selectionRange=new DOMSelectionState;this.selectionChanged=false;this.delayedFlush=-1;this.resizeTimeout=-1;this.queue=[];this.delayedAndroidKey=null;this.scrollTargets=[];this.intersection=null;this.resize=null;this.intersecting=false;this.gapIntersection=null;this.gaps=[];this.parentCheck=-1;this.dom=view.contentDOM;this.observer=new MutationObserver(mutations=>{for(let mut of mutations)
this.queue.push(mut);if((browser.ie&&browser.ie_version<=11||browser.ios&&view.composing)&&mutations.some(m=>m.type=="childList"&&m.removedNodes.length||m.type=="characterData"&&m.oldValue.length>m.target.nodeValue.length))
this.flushSoon();else
this.flush();});if(useCharData)
this.onCharData=(event)=>{this.queue.push({target:event.target,type:"characterData",oldValue:event.prevValue});this.flushSoon();};this.onSelectionChange=this.onSelectionChange.bind(this);window.addEventListener("resize",this.onResize=this.onResize.bind(this));if(typeof ResizeObserver=="function"){this.resize=new ResizeObserver(()=>{if(this.view.docView.lastUpdate<Date.now()-75)
this.onResize();});this.resize.observe(view.scrollDOM);}
window.addEventListener("beforeprint",this.onPrint=this.onPrint.bind(this));this.start();window.addEventListener("scroll",this.onScroll=this.onScroll.bind(this));if(typeof IntersectionObserver=="function"){this.intersection=new IntersectionObserver(entries=>{if(this.parentCheck<0)
this.parentCheck=setTimeout(this.listenForScroll.bind(this),1000);if(entries.length>0&&(entries[entries.length-1].intersectionRatio>0)!=this.intersecting){this.intersecting=!this.intersecting;if(this.intersecting!=this.view.inView)
this.onScrollChanged(document.createEvent("Event"));}},{});this.intersection.observe(this.dom);this.gapIntersection=new IntersectionObserver(entries=>{if(entries.length>0&&entries[entries.length-1].intersectionRatio>0)
this.onScrollChanged(document.createEvent("Event"));},{});}
this.listenForScroll();this.readSelectionRange();this.dom.ownerDocument.addEventListener("selectionchange",this.onSelectionChange);}
onScroll(e){if(this.intersecting)
this.flush(false);this.onScrollChanged(e);}
onResize(){if(this.resizeTimeout<0)
this.resizeTimeout=setTimeout(()=>{this.resizeTimeout=-1;this.view.requestMeasure();},50);}
onPrint(){this.view.viewState.printing=true;this.view.measure();setTimeout(()=>{this.view.viewState.printing=false;this.view.requestMeasure();},500);}
updateGaps(gaps){if(this.gapIntersection&&(gaps.length!=this.gaps.length||this.gaps.some((g,i)=>g!=gaps[i]))){this.gapIntersection.disconnect();for(let gap of gaps)
this.gapIntersection.observe(gap);this.gaps=gaps;}}
onSelectionChange(event){if(!this.readSelectionRange()||this.delayedAndroidKey)
return;let{view}=this,sel=this.selectionRange;if(view.state.facet(editable)?view.root.activeElement!=this.dom:!hasSelection(view.dom,sel))
return;let context=sel.anchorNode&&view.docView.nearest(sel.anchorNode);if(context&&context.ignoreEvent(event))
return;if((browser.ie&&browser.ie_version<=11||browser.android&&browser.chrome)&&!view.state.selection.main.empty&&sel.focusNode&&isEquivalentPosition(sel.focusNode,sel.focusOffset,sel.anchorNode,sel.anchorOffset))
this.flushSoon();else
this.flush(false);}
readSelectionRange(){let{root}=this.view,domSel=getSelection(root);let range=browser.safari&&root.nodeType==11&&deepActiveElement()==this.view.contentDOM&&safariSelectionRangeHack(this.view)||domSel;if(this.selectionRange.eq(range))
return false;this.selectionRange.setRange(range);return this.selectionChanged=true;}
setSelectionRange(anchor,head){this.selectionRange.set(anchor.node,anchor.offset,head.node,head.offset);this.selectionChanged=false;}
clearSelectionRange(){this.selectionRange.set(null,0,null,0);}
listenForScroll(){this.parentCheck=-1;let i=0,changed=null;for(let dom=this.dom;dom;){if(dom.nodeType==1){if(!changed&&i<this.scrollTargets.length&&this.scrollTargets[i]==dom)
i++;else if(!changed)
changed=this.scrollTargets.slice(0,i);if(changed)
changed.push(dom);dom=dom.assignedSlot||dom.parentNode;}
else if(dom.nodeType==11){dom=dom.host;}
else{break;}}
if(i<this.scrollTargets.length&&!changed)
changed=this.scrollTargets.slice(0,i);if(changed){for(let dom of this.scrollTargets)
dom.removeEventListener("scroll",this.onScroll);for(let dom of this.scrollTargets=changed)
dom.addEventListener("scroll",this.onScroll);}}
ignore(f){if(!this.active)
return f();try{this.stop();return f();}
finally{this.start();this.clear();}}
start(){if(this.active)
return;this.observer.observe(this.dom,observeOptions);if(useCharData)
this.dom.addEventListener("DOMCharacterDataModified",this.onCharData);this.active=true;}
stop(){if(!this.active)
return;this.active=false;this.observer.disconnect();if(useCharData)
this.dom.removeEventListener("DOMCharacterDataModified",this.onCharData);}
clear(){this.processRecords();this.queue.length=0;this.selectionChanged=false;}
delayAndroidKey(key,keyCode){if(!this.delayedAndroidKey)
requestAnimationFrame(()=>{let key=this.delayedAndroidKey;this.delayedAndroidKey=null;this.delayedFlush=-1;if(!this.flush())
dispatchKey(this.view.contentDOM,key.key,key.keyCode);});if(!this.delayedAndroidKey||key=="Enter")
this.delayedAndroidKey={key,keyCode};}
flushSoon(){if(this.delayedFlush<0)
this.delayedFlush=window.setTimeout(()=>{this.delayedFlush=-1;this.flush();},20);}
forceFlush(){if(this.delayedFlush>=0){window.clearTimeout(this.delayedFlush);this.delayedFlush=-1;this.flush();}}
processRecords(){let records=this.queue;for(let mut of this.observer.takeRecords())
records.push(mut);if(records.length)
this.queue=[];let from=-1,to=-1,typeOver=false;for(let record of records){let range=this.readMutation(record);if(!range)
continue;if(range.typeOver)
typeOver=true;if(from==-1){({from,to}=range);}
else{from=Math.min(range.from,from);to=Math.max(range.to,to);}}
return{from,to,typeOver};}
flush(readSelection=true){if(this.delayedFlush>=0||this.delayedAndroidKey)
return;if(readSelection)
this.readSelectionRange();let{from,to,typeOver}=this.processRecords();let newSel=this.selectionChanged&&hasSelection(this.dom,this.selectionRange);if(from<0&&!newSel)
return;this.selectionChanged=false;let startState=this.view.state;let handled=this.onChange(from,to,typeOver);if(this.view.state==startState)
this.view.update([]);return handled;}
readMutation(rec){let cView=this.view.docView.nearest(rec.target);if(!cView||cView.ignoreMutation(rec))
return null;cView.markDirty(rec.type=="attributes");if(rec.type=="attributes")
cView.dirty|=4;if(rec.type=="childList"){let childBefore=findChild(cView,rec.previousSibling||rec.target.previousSibling,-1);let childAfter=findChild(cView,rec.nextSibling||rec.target.nextSibling,1);return{from:childBefore?cView.posAfter(childBefore):cView.posAtStart,to:childAfter?cView.posBefore(childAfter):cView.posAtEnd,typeOver:false};}
else if(rec.type=="characterData"){return{from:cView.posAtStart,to:cView.posAtEnd,typeOver:rec.target.nodeValue==rec.oldValue};}
else{return null;}}
destroy(){var _a,_b,_c;this.stop();(_a=this.intersection)===null||_a===void 0?void 0:_a.disconnect();(_b=this.gapIntersection)===null||_b===void 0?void 0:_b.disconnect();(_c=this.resize)===null||_c===void 0?void 0:_c.disconnect();for(let dom of this.scrollTargets)
dom.removeEventListener("scroll",this.onScroll);window.removeEventListener("scroll",this.onScroll);window.removeEventListener("resize",this.onResize);window.removeEventListener("beforeprint",this.onPrint);this.dom.ownerDocument.removeEventListener("selectionchange",this.onSelectionChange);clearTimeout(this.parentCheck);clearTimeout(this.resizeTimeout);}}
function findChild(cView,dom,dir){while(dom){let curView=ContentView.get(dom);if(curView&&curView.parent==cView)
return curView;let parent=dom.parentNode;dom=parent!=cView.dom?parent:dir>0?dom.nextSibling:dom.previousSibling;}
return null;}
function safariSelectionRangeHack(view){let found=null;function read(event){event.preventDefault();event.stopImmediatePropagation();found=event.getTargetRanges()[0];}
view.contentDOM.addEventListener("beforeinput",read,true);document.execCommand("indent");view.contentDOM.removeEventListener("beforeinput",read,true);if(!found)
return null;let anchorNode=found.startContainer,anchorOffset=found.startOffset;let focusNode=found.endContainer,focusOffset=found.endOffset;let curAnchor=view.docView.domAtPos(view.state.selection.main.anchor);if(isEquivalentPosition(curAnchor.node,curAnchor.offset,focusNode,focusOffset))
[anchorNode,anchorOffset,focusNode,focusOffset]=[focusNode,focusOffset,anchorNode,anchorOffset];return{anchorNode,anchorOffset,focusNode,focusOffset};}
function applyDOMChange(view,start,end,typeOver){let change,newSel;let sel=view.state.selection.main;if(start>-1){let bounds=view.docView.domBoundsAround(start,end,0);if(!bounds||view.state.readOnly)
return false;let{from,to}=bounds;let selPoints=view.docView.impreciseHead||view.docView.impreciseAnchor?[]:selectionPoints(view);let reader=new DOMReader(selPoints,view.state);reader.readRange(bounds.startDOM,bounds.endDOM);let preferredPos=sel.from,preferredSide=null;if(view.inputState.lastKeyCode===8&&view.inputState.lastKeyTime>Date.now()-100||browser.android&&reader.text.length<to-from){preferredPos=sel.to;preferredSide="end";}
let diff=findDiff(view.state.doc.sliceString(from,to,LineBreakPlaceholder),reader.text,preferredPos-from,preferredSide);if(diff){if(browser.chrome&&view.inputState.lastKeyCode==13&&diff.toB==diff.from+2&&reader.text.slice(diff.from,diff.toB)==LineBreakPlaceholder+LineBreakPlaceholder)
diff.toB--;change={from:from+diff.from,to:from+diff.toA,insert:Text.of(reader.text.slice(diff.from,diff.toB).split(LineBreakPlaceholder))};}
newSel=selectionFromPoints(selPoints,from);}
else if(view.hasFocus||!view.state.facet(editable)){let domSel=view.observer.selectionRange;let{impreciseHead:iHead,impreciseAnchor:iAnchor}=view.docView;let head=iHead&&iHead.node==domSel.focusNode&&iHead.offset==domSel.focusOffset||!contains(view.contentDOM,domSel.focusNode)?view.state.selection.main.head:view.docView.posFromDOM(domSel.focusNode,domSel.focusOffset);let anchor=iAnchor&&iAnchor.node==domSel.anchorNode&&iAnchor.offset==domSel.anchorOffset||!contains(view.contentDOM,domSel.anchorNode)?view.state.selection.main.anchor:view.docView.posFromDOM(domSel.anchorNode,domSel.anchorOffset);if(head!=sel.head||anchor!=sel.anchor)
newSel=EditorSelection.single(anchor,head);}
if(!change&&!newSel)
return false;if(!change&&typeOver&&!sel.empty&&newSel&&newSel.main.empty)
change={from:sel.from,to:sel.to,insert:view.state.doc.slice(sel.from,sel.to)};else if(change&&change.from>=sel.from&&change.to<=sel.to&&(change.from!=sel.from||change.to!=sel.to)&&(sel.to-sel.from)-(change.to-change.from)<=4)
change={from:sel.from,to:sel.to,insert:view.state.doc.slice(sel.from,change.from).append(change.insert).append(view.state.doc.slice(change.to,sel.to))};else if((browser.mac||browser.android)&&change&&change.from==change.to&&change.from==sel.head-1&&change.insert.toString()==".")
change={from:sel.from,to:sel.to,insert:Text.of([" "])};if(change){let startState=view.state;if(browser.ios&&view.inputState.flushIOSKey(view))
return true;if(browser.android&&((change.from==sel.from&&change.to==sel.to&&change.insert.length==1&&change.insert.lines==2&&dispatchKey(view.contentDOM,"Enter",13))||(change.from==sel.from-1&&change.to==sel.to&&change.insert.length==0&&dispatchKey(view.contentDOM,"Backspace",8))||(change.from==sel.from&&change.to==sel.to+1&&change.insert.length==0&&dispatchKey(view.contentDOM,"Delete",46))))
return true;let text=change.insert.toString();if(view.state.facet(inputHandler).some(h=>h(view,change.from,change.to,text)))
return true;if(view.inputState.composing>=0)
view.inputState.composing++;let tr;if(change.from>=sel.from&&change.to<=sel.to&&change.to-change.from>=(sel.to-sel.from)/3&&(!newSel||newSel.main.empty&&newSel.main.from==change.from+change.insert.length)&&view.inputState.composing<0){let before=sel.from<change.from?startState.sliceDoc(sel.from,change.from):"";let after=sel.to>change.to?startState.sliceDoc(change.to,sel.to):"";tr=startState.replaceSelection(view.state.toText(before+change.insert.sliceString(0,undefined,view.state.lineBreak)+after));}
else{let changes=startState.changes(change);let mainSel=newSel&&!startState.selection.main.eq(newSel.main)&&newSel.main.to<=changes.newLength?newSel.main:undefined;if(startState.selection.ranges.length>1&&view.inputState.composing>=0&&change.to<=sel.to&&change.to>=sel.to-10){let replaced=view.state.sliceDoc(change.from,change.to);let compositionRange=compositionSurroundingNode(view)||view.state.doc.lineAt(sel.head);let offset=sel.to-change.to,size=sel.to-sel.from;tr=startState.changeByRange(range=>{if(range.from==sel.from&&range.to==sel.to)
return{changes,range:mainSel||range.map(changes)};let to=range.to-offset,from=to-replaced.length;if(range.to-range.from!=size||view.state.sliceDoc(from,to)!=replaced||compositionRange&&range.to>=compositionRange.from&&range.from<=compositionRange.to)
return{range};let rangeChanges=startState.changes({from,to,insert:change.insert}),selOff=range.to-sel.to;return{changes:rangeChanges,range:!mainSel?range.map(rangeChanges):EditorSelection.range(Math.max(0,mainSel.anchor+selOff),Math.max(0,mainSel.head+selOff))};});}
else{tr={changes,selection:mainSel&&startState.selection.replaceRange(mainSel)};}}
let userEvent="input.type";if(view.composing){userEvent+=".compose";if(view.inputState.compositionFirstChange){userEvent+=".start";view.inputState.compositionFirstChange=false;}}
view.dispatch(tr,{scrollIntoView:true,userEvent});return true;}
else if(newSel&&!newSel.main.eq(sel)){let scrollIntoView=false,userEvent="select";if(view.inputState.lastSelectionTime>Date.now()-50){if(view.inputState.lastSelectionOrigin=="select")
scrollIntoView=true;userEvent=view.inputState.lastSelectionOrigin;}
view.dispatch({selection:newSel,scrollIntoView,userEvent});return true;}
else{return false;}}
function findDiff(a,b,preferredPos,preferredSide){let minLen=Math.min(a.length,b.length);let from=0;while(from<minLen&&a.charCodeAt(from)==b.charCodeAt(from))
from++;if(from==minLen&&a.length==b.length)
return null;let toA=a.length,toB=b.length;while(toA>0&&toB>0&&a.charCodeAt(toA-1)==b.charCodeAt(toB-1)){toA--;toB--;}
if(preferredSide=="end"){let adjust=Math.max(0,from-Math.min(toA,toB));preferredPos-=toA+adjust-from;}
if(toA<from&&a.length<b.length){let move=preferredPos<=from&&preferredPos>=toA?from-preferredPos:0;from-=move;toB=from+(toB-toA);toA=from;}
else if(toB<from){let move=preferredPos<=from&&preferredPos>=toB?from-preferredPos:0;from-=move;toA=from+(toA-toB);toB=from;}
return{from,toA,toB};}
function selectionPoints(view){let result=[];if(view.root.activeElement!=view.contentDOM)
return result;let{anchorNode,anchorOffset,focusNode,focusOffset}=view.observer.selectionRange;if(anchorNode){result.push(new DOMPoint(anchorNode,anchorOffset));if(focusNode!=anchorNode||focusOffset!=anchorOffset)
result.push(new DOMPoint(focusNode,focusOffset));}
return result;}
function selectionFromPoints(points,base){if(points.length==0)
return null;let anchor=points[0].pos,head=points.length==2?points[1].pos:anchor;return anchor>-1&&head>-1?EditorSelection.single(anchor+base,head+base):null;}
class EditorView{constructor(config={}){this.plugins=[];this.pluginMap=new Map;this.editorAttrs={};this.contentAttrs={};this.bidiCache=[];this.destroyed=false;this.updateState=2;this.measureScheduled=-1;this.measureRequests=[];this.contentDOM=document.createElement("div");this.scrollDOM=document.createElement("div");this.scrollDOM.tabIndex=-1;this.scrollDOM.className="cm-scroller";this.scrollDOM.appendChild(this.contentDOM);this.announceDOM=document.createElement("div");this.announceDOM.style.cssText="position: absolute; top: -10000px";this.announceDOM.setAttribute("aria-live","polite");this.dom=document.createElement("div");this.dom.appendChild(this.announceDOM);this.dom.appendChild(this.scrollDOM);this._dispatch=config.dispatch||((tr)=>this.update([tr]));this.dispatch=this.dispatch.bind(this);this.root=(config.root||getRoot(config.parent)||document);this.viewState=new ViewState(config.state||EditorState.create());this.plugins=this.state.facet(viewPlugin).map(spec=>new PluginInstance(spec));for(let plugin of this.plugins)
plugin.update(this);this.observer=new DOMObserver(this,(from,to,typeOver)=>{return applyDOMChange(this,from,to,typeOver);},event=>{this.inputState.runScrollHandlers(this,event);if(this.observer.intersecting)
this.measure();});this.inputState=new InputState(this);this.inputState.ensureHandlers(this,this.plugins);this.docView=new DocView(this);this.mountStyles();this.updateAttrs();this.updateState=0;this.requestMeasure();if(config.parent)
config.parent.appendChild(this.dom);}
get state(){return this.viewState.state;}
get viewport(){return this.viewState.viewport;}
get visibleRanges(){return this.viewState.visibleRanges;}
get inView(){return this.viewState.inView;}
get composing(){return this.inputState.composing>0;}
get compositionStarted(){return this.inputState.composing>=0;}
dispatch(...input){this._dispatch(input.length==1&&input[0]instanceof Transaction?input[0]:this.state.update(...input));}
update(transactions){if(this.updateState!=0)
throw new Error("Calls to EditorView.update are not allowed while an update is in progress");let redrawn=false,attrsChanged=false,update;let state=this.state;for(let tr of transactions){if(tr.startState!=state)
throw new RangeError("Trying to update state with a transaction that doesn't start from the previous state.");state=tr.state;}
if(this.destroyed){this.viewState.state=state;return;}
this.observer.clear();if(state.facet(EditorState.phrases)!=this.state.facet(EditorState.phrases))
return this.setState(state);update=ViewUpdate.create(this,state,transactions);let scrollTarget=this.viewState.scrollTarget;try{this.updateState=2;for(let tr of transactions){if(scrollTarget)
scrollTarget=scrollTarget.map(tr.changes);if(tr.scrollIntoView){let{main}=tr.state.selection;scrollTarget=new ScrollTarget(main.empty?main:EditorSelection.cursor(main.head,main.head>main.anchor?-1:1));}
for(let e of tr.effects)
if(e.is(scrollIntoView))
scrollTarget=e.value;}
this.viewState.update(update,scrollTarget);this.bidiCache=CachedOrder.update(this.bidiCache,update.changes);if(!update.empty){this.updatePlugins(update);this.inputState.update(update);}
redrawn=this.docView.update(update);if(this.state.facet(styleModule)!=this.styleModules)
this.mountStyles();attrsChanged=this.updateAttrs();this.showAnnouncements(transactions);this.docView.updateSelection(redrawn,transactions.some(tr=>tr.isUserEvent("select.pointer")));}
finally{this.updateState=0;}
if(update.startState.facet(theme)!=update.state.facet(theme))
this.viewState.mustMeasureContent=true;if(redrawn||attrsChanged||scrollTarget||this.viewState.mustEnforceCursorAssoc||this.viewState.mustMeasureContent)
this.requestMeasure();if(!update.empty)
for(let listener of this.state.facet(updateListener))
listener(update);}
setState(newState){if(this.updateState!=0)
throw new Error("Calls to EditorView.setState are not allowed while an update is in progress");if(this.destroyed){this.viewState.state=newState;return;}
this.updateState=2;let hadFocus=this.hasFocus;try{for(let plugin of this.plugins)
plugin.destroy(this);this.viewState=new ViewState(newState);this.plugins=newState.facet(viewPlugin).map(spec=>new PluginInstance(spec));this.pluginMap.clear();for(let plugin of this.plugins)
plugin.update(this);this.docView=new DocView(this);this.inputState.ensureHandlers(this,this.plugins);this.mountStyles();this.updateAttrs();this.bidiCache=[];}
finally{this.updateState=0;}
if(hadFocus)
this.focus();this.requestMeasure();}
updatePlugins(update){let prevSpecs=update.startState.facet(viewPlugin),specs=update.state.facet(viewPlugin);if(prevSpecs!=specs){let newPlugins=[];for(let spec of specs){let found=prevSpecs.indexOf(spec);if(found<0){newPlugins.push(new PluginInstance(spec));}
else{let plugin=this.plugins[found];plugin.mustUpdate=update;newPlugins.push(plugin);}}
for(let plugin of this.plugins)
if(plugin.mustUpdate!=update)
plugin.destroy(this);this.plugins=newPlugins;this.pluginMap.clear();this.inputState.ensureHandlers(this,this.plugins);}
else{for(let p of this.plugins)
p.mustUpdate=update;}
for(let i=0;i<this.plugins.length;i++)
this.plugins[i].update(this);}
measure(flush=true){if(this.destroyed)
return;if(this.measureScheduled>-1)
cancelAnimationFrame(this.measureScheduled);this.measureScheduled=0;if(flush)
this.observer.flush();let updated=null;try{for(let i=0;;i++){this.updateState=1;let oldViewport=this.viewport;let changed=this.viewState.measure(this);if(!changed&&!this.measureRequests.length&&this.viewState.scrollTarget==null)
break;if(i>5){console.warn(this.measureRequests.length?"Measure loop restarted more than 5 times":"Viewport failed to stabilize");break;}
let measuring=[];if(!(changed&4))
[this.measureRequests,measuring]=[measuring,this.measureRequests];let measured=measuring.map(m=>{try{return m.read(this);}
catch(e){logException(this.state,e);return BadMeasure;}});let update=ViewUpdate.create(this,this.state,[]),redrawn=false,scrolled=false;update.flags|=changed;if(!updated)
updated=update;else
updated.flags|=changed;this.updateState=2;if(!update.empty){this.updatePlugins(update);this.inputState.update(update);this.updateAttrs();redrawn=this.docView.update(update);}
for(let i=0;i<measuring.length;i++)
if(measured[i]!=BadMeasure){try{let m=measuring[i];if(m.write)
m.write(measured[i],this);}
catch(e){logException(this.state,e);}}
if(this.viewState.scrollTarget){this.docView.scrollIntoView(this.viewState.scrollTarget);this.viewState.scrollTarget=null;scrolled=true;}
if(redrawn)
this.docView.updateSelection(true);if(this.viewport.from==oldViewport.from&&this.viewport.to==oldViewport.to&&!scrolled&&this.measureRequests.length==0)
break;}}
finally{this.updateState=0;this.measureScheduled=-1;}
if(updated&&!updated.empty)
for(let listener of this.state.facet(updateListener))
listener(updated);}
get themeClasses(){return baseThemeID+" "+
(this.state.facet(darkTheme)?baseDarkID:baseLightID)+" "+
this.state.facet(theme);}
updateAttrs(){let editorAttrs=attrsFromFacet(this,editorAttributes,{class:"cm-editor"+(this.hasFocus?" cm-focused ":" ")+this.themeClasses});let contentAttrs={spellcheck:"false",autocorrect:"off",autocapitalize:"off",translate:"no",contenteditable:!this.state.facet(editable)?"false":"true",class:"cm-content",style:`${browser.tabSize}: ${this.state.tabSize}`,role:"textbox","aria-multiline":"true"};if(this.state.readOnly)
contentAttrs["aria-readonly"]="true";attrsFromFacet(this,contentAttributes,contentAttrs);let changed=this.observer.ignore(()=>{let changedContent=updateAttrs(this.contentDOM,this.contentAttrs,contentAttrs);let changedEditor=updateAttrs(this.dom,this.editorAttrs,editorAttrs);return changedContent||changedEditor;});this.editorAttrs=editorAttrs;this.contentAttrs=contentAttrs;return changed;}
showAnnouncements(trs){let first=true;for(let tr of trs)
for(let effect of tr.effects)
if(effect.is(EditorView.announce)){if(first)
this.announceDOM.textContent="";first=false;let div=this.announceDOM.appendChild(document.createElement("div"));div.textContent=effect.value;}}
mountStyles(){this.styleModules=this.state.facet(styleModule);StyleModule.mount(this.root,this.styleModules.concat(baseTheme$1).reverse());}
readMeasured(){if(this.updateState==2)
throw new Error("Reading the editor layout isn't allowed during an update");if(this.updateState==0&&this.measureScheduled>-1)
this.measure(false);}
requestMeasure(request){if(this.measureScheduled<0)
this.measureScheduled=requestAnimationFrame(()=>this.measure());if(request){if(request.key!=null)
for(let i=0;i<this.measureRequests.length;i++){if(this.measureRequests[i].key===request.key){this.measureRequests[i]=request;return;}}
this.measureRequests.push(request);}}
plugin(plugin){let known=this.pluginMap.get(plugin);if(known===undefined||known&&known.spec!=plugin)
this.pluginMap.set(plugin,known=this.plugins.find(p=>p.spec==plugin)||null);return known&&known.update(this).value;}
get documentTop(){return this.contentDOM.getBoundingClientRect().top+this.viewState.paddingTop;}
get documentPadding(){return{top:this.viewState.paddingTop,bottom:this.viewState.paddingBottom};}
elementAtHeight(height){this.readMeasured();return this.viewState.elementAtHeight(height);}
lineBlockAtHeight(height){this.readMeasured();return this.viewState.lineBlockAtHeight(height);}
get viewportLineBlocks(){return this.viewState.viewportLines;}
lineBlockAt(pos){return this.viewState.lineBlockAt(pos);}
get contentHeight(){return this.viewState.contentHeight;}
moveByChar(start,forward,by){return skipAtoms(this,start,moveByChar(this,start,forward,by));}
moveByGroup(start,forward){return skipAtoms(this,start,moveByChar(this,start,forward,initial=>byGroup(this,start.head,initial)));}
moveToLineBoundary(start,forward,includeWrap=true){return moveToLineBoundary(this,start,forward,includeWrap);}
moveVertically(start,forward,distance){return skipAtoms(this,start,moveVertically(this,start,forward,distance));}
domAtPos(pos){return this.docView.domAtPos(pos);}
posAtDOM(node,offset=0){return this.docView.posFromDOM(node,offset);}
posAtCoords(coords,precise=true){this.readMeasured();return posAtCoords(this,coords,precise);}
coordsAtPos(pos,side=1){this.readMeasured();let rect=this.docView.coordsAt(pos,side);if(!rect||rect.left==rect.right)
return rect;let line=this.state.doc.lineAt(pos),order=this.bidiSpans(line);let span=order[BidiSpan.find(order,pos-line.from,-1,side)];return flattenRect(rect,(span.dir==Direction.LTR)==(side>0));}
get defaultCharacterWidth(){return this.viewState.heightOracle.charWidth;}
get defaultLineHeight(){return this.viewState.heightOracle.lineHeight;}
get textDirection(){return this.viewState.defaultTextDirection;}
textDirectionAt(pos){let perLine=this.state.facet(perLineTextDirection);if(!perLine||pos<this.viewport.from||pos>this.viewport.to)
return this.textDirection;this.readMeasured();return this.docView.textDirectionAt(pos);}
get lineWrapping(){return this.viewState.heightOracle.lineWrapping;}
bidiSpans(line){if(line.length>MaxBidiLine)
return trivialOrder(line.length);let dir=this.textDirectionAt(line.from);for(let entry of this.bidiCache)
if(entry.from==line.from&&entry.dir==dir)
return entry.order;let order=computeOrder(line.text,dir);this.bidiCache.push(new CachedOrder(line.from,line.to,dir,order));return order;}
get hasFocus(){var _a;return(document.hasFocus()||browser.safari&&((_a=this.inputState)===null||_a===void 0?void 0:_a.lastContextMenu)>Date.now()-3e4)&&this.root.activeElement==this.contentDOM;}
focus(){this.observer.ignore(()=>{focusPreventScroll(this.contentDOM);this.docView.updateSelection();});}
destroy(){for(let plugin of this.plugins)
plugin.destroy(this);this.plugins=[];this.inputState.destroy();this.dom.remove();this.observer.destroy();if(this.measureScheduled>-1)
cancelAnimationFrame(this.measureScheduled);this.destroyed=true;}
static scrollIntoView(pos,options={}){return scrollIntoView.of(new ScrollTarget(typeof pos=="number"?EditorSelection.cursor(pos):pos,options.y,options.x,options.yMargin,options.xMargin));}
static domEventHandlers(handlers){return ViewPlugin.define(()=>({}),{eventHandlers:handlers});}
static theme(spec,options){let prefix=StyleModule.newName();let result=[theme.of(prefix),styleModule.of(buildTheme(`.${prefix}`,spec))];if(options&&options.dark)
result.push(darkTheme.of(true));return result;}
static baseTheme(spec){return Prec.lowest(styleModule.of(buildTheme("."+baseThemeID,spec,lightDarkIDs)));}
static findFromDOM(dom){var _a;let content=dom.querySelector(".cm-content");let cView=content&&ContentView.get(content)||ContentView.get(dom);return((_a=cView===null||cView===void 0?void 0:cView.rootView)===null||_a===void 0?void 0:_a.view)||null;}}
EditorView.styleModule=styleModule;EditorView.inputHandler=inputHandler;EditorView.perLineTextDirection=perLineTextDirection;EditorView.exceptionSink=exceptionSink;EditorView.updateListener=updateListener;EditorView.editable=editable;EditorView.mouseSelectionStyle=mouseSelectionStyle;EditorView.dragMovesSelection=dragMovesSelection$1;EditorView.clickAddsSelectionRange=clickAddsSelectionRange;EditorView.decorations=decorations;EditorView.atomicRanges=atomicRanges;EditorView.scrollMargins=scrollMargins;EditorView.darkTheme=darkTheme;EditorView.contentAttributes=contentAttributes;EditorView.editorAttributes=editorAttributes;EditorView.lineWrapping=EditorView.contentAttributes.of({"class":"cm-lineWrapping"});EditorView.announce=StateEffect.define();const MaxBidiLine=4096;const BadMeasure={};class CachedOrder{constructor(from,to,dir,order){this.from=from;this.to=to;this.dir=dir;this.order=order;}
static update(cache,changes){if(changes.empty)
return cache;let result=[],lastDir=cache.length?cache[cache.length-1].dir:Direction.LTR;for(let i=Math.max(0,cache.length-10);i<cache.length;i++){let entry=cache[i];if(entry.dir==lastDir&&!changes.touchesRange(entry.from,entry.to))
result.push(new CachedOrder(changes.mapPos(entry.from,1),changes.mapPos(entry.to,-1),entry.dir,entry.order));}
return result;}}
function attrsFromFacet(view,facet,base){for(let sources=view.state.facet(facet),i=sources.length-1;i>=0;i--){let source=sources[i],value=typeof source=="function"?source(view):source;if(value)
combineAttrs(value,base);}
return base;}
const CanHidePrimary=!browser.ios;const themeSpec={".cm-line":{"& ::selection":{backgroundColor:"transparent !important"},"&::selection":{backgroundColor:"transparent !important"}}};if(CanHidePrimary)
themeSpec[".cm-line"].caretColor="transparent !important";class GutterMarker extends RangeValue{compare(other){return this==other||this.constructor==other.constructor&&this.eq(other);}
eq(other){return false;}
destroy(dom){}}
GutterMarker.prototype.elementClass="";GutterMarker.prototype.toDOM=undefined;GutterMarker.prototype.mapMode=MapMode.TrackBefore;GutterMarker.prototype.startSide=GutterMarker.prototype.endSide=-1;GutterMarker.prototype.point=true;const DefaultBufferLength=1024;let nextPropID=0;class Range{constructor(from,to){this.from=from;this.to=to;}}
class NodeProp{constructor(config={}){this.id=nextPropID++;this.perNode=!!config.perNode;this.deserialize=config.deserialize||(()=>{throw new Error("This node type doesn't define a deserialize function");});}
add(match){if(this.perNode)
throw new RangeError("Can't add per-node props to node types");if(typeof match!="function")
match=NodeType.match(match);return(type)=>{let result=match(type);return result===undefined?null:[this,result];};}}
NodeProp.closedBy=new NodeProp({deserialize:str=>str.split(" ")});NodeProp.openedBy=new NodeProp({deserialize:str=>str.split(" ")});NodeProp.group=new NodeProp({deserialize:str=>str.split(" ")});NodeProp.contextHash=new NodeProp({perNode:true});NodeProp.lookAhead=new NodeProp({perNode:true});NodeProp.mounted=new NodeProp({perNode:true});const noProps=Object.create(null);class NodeType{constructor(name,props,id,flags=0){this.name=name;this.props=props;this.id=id;this.flags=flags;}
static define(spec){let props=spec.props&&spec.props.length?Object.create(null):noProps;let flags=(spec.top?1:0)|(spec.skipped?2:0)|(spec.error?4:0)|(spec.name==null?8:0);let type=new NodeType(spec.name||"",props,spec.id,flags);if(spec.props)
for(let src of spec.props){if(!Array.isArray(src))
src=src(type);if(src){if(src[0].perNode)
throw new RangeError("Can't store a per-node prop on a node type");props[src[0].id]=src[1];}}
return type;}
prop(prop){return this.props[prop.id];}
get isTop(){return(this.flags&1)>0;}
get isSkipped(){return(this.flags&2)>0;}
get isError(){return(this.flags&4)>0;}
get isAnonymous(){return(this.flags&8)>0;}
is(name){if(typeof name=='string'){if(this.name==name)
return true;let group=this.prop(NodeProp.group);return group?group.indexOf(name)>-1:false;}
return this.id==name;}
static match(map){let direct=Object.create(null);for(let prop in map)
for(let name of prop.split(" "))
direct[name]=map[prop];return(node)=>{for(let groups=node.prop(NodeProp.group),i=-1;i<(groups?groups.length:0);i++){let found=direct[i<0?node.name:groups[i]];if(found)
return found;}};}}
NodeType.none=new NodeType("",Object.create(null),0,8);const CachedNode=new WeakMap(),CachedInnerNode=new WeakMap();var IterMode;(function(IterMode){IterMode[IterMode["ExcludeBuffers"]=1]="ExcludeBuffers";IterMode[IterMode["IncludeAnonymous"]=2]="IncludeAnonymous";IterMode[IterMode["IgnoreMounts"]=4]="IgnoreMounts";IterMode[IterMode["IgnoreOverlays"]=8]="IgnoreOverlays";})(IterMode||(IterMode={}));class Tree{constructor(type,children,positions,length,props){this.type=type;this.children=children;this.positions=positions;this.length=length;this.props=null;if(props&&props.length){this.props=Object.create(null);for(let[prop,value]of props)
this.props[typeof prop=="number"?prop:prop.id]=value;}}
toString(){let mounted=this.prop(NodeProp.mounted);if(mounted&&!mounted.overlay)
return mounted.tree.toString();let children="";for(let ch of this.children){let str=ch.toString();if(str){if(children)
children+=",";children+=str;}}
return!this.type.name?children:(/\W/.test(this.type.name)&&!this.type.isError?JSON.stringify(this.type.name):this.type.name)+
(children.length?"("+children+")":"");}
cursor(mode=0){return new TreeCursor(this.topNode,mode);}
cursorAt(pos,side=0,mode=0){let scope=CachedNode.get(this)||this.topNode;let cursor=new TreeCursor(scope);cursor.moveTo(pos,side);CachedNode.set(this,cursor._tree);return cursor;}
get topNode(){return new TreeNode(this,0,0,null);}
resolve(pos,side=0){let node=resolveNode(CachedNode.get(this)||this.topNode,pos,side,false);CachedNode.set(this,node);return node;}
resolveInner(pos,side=0){let node=resolveNode(CachedInnerNode.get(this)||this.topNode,pos,side,true);CachedInnerNode.set(this,node);return node;}
iterate(spec){let{enter,leave,from=0,to=this.length}=spec;for(let c=this.cursor((spec.mode||0)|IterMode.IncludeAnonymous);;){let entered=false;if(c.from<=to&&c.to>=from&&(c.type.isAnonymous||enter(c)!==false)){if(c.firstChild())
continue;entered=true;}
for(;;){if(entered&&leave&&!c.type.isAnonymous)
leave(c);if(c.nextSibling())
break;if(!c.parent())
return;entered=true;}}}
prop(prop){return!prop.perNode?this.type.prop(prop):this.props?this.props[prop.id]:undefined;}
get propValues(){let result=[];if(this.props)
for(let id in this.props)
result.push([+id,this.props[id]]);return result;}
balance(config={}){return this.children.length<=8?this:balanceRange(NodeType.none,this.children,this.positions,0,this.children.length,0,this.length,(children,positions,length)=>new Tree(this.type,children,positions,length,this.propValues),config.makeTree||((children,positions,length)=>new Tree(NodeType.none,children,positions,length)));}
static build(data){return buildTree(data);}}
Tree.empty=new Tree(NodeType.none,[],[],0);class FlatBufferCursor{constructor(buffer,index){this.buffer=buffer;this.index=index;}
get id(){return this.buffer[this.index-4];}
get start(){return this.buffer[this.index-3];}
get end(){return this.buffer[this.index-2];}
get size(){return this.buffer[this.index-1];}
get pos(){return this.index;}
next(){this.index-=4;}
fork(){return new FlatBufferCursor(this.buffer,this.index);}}
class TreeBuffer{constructor(buffer,length,set){this.buffer=buffer;this.length=length;this.set=set;}
get type(){return NodeType.none;}
toString(){let result=[];for(let index=0;index<this.buffer.length;){result.push(this.childString(index));index=this.buffer[index+3];}
return result.join(",");}
childString(index){let id=this.buffer[index],endIndex=this.buffer[index+3];let type=this.set.types[id],result=type.name;if(/\W/.test(result)&&!type.isError)
result=JSON.stringify(result);index+=4;if(endIndex==index)
return result;let children=[];while(index<endIndex){children.push(this.childString(index));index=this.buffer[index+3];}
return result+"("+children.join(",")+")";}
findChild(startIndex,endIndex,dir,pos,side){let{buffer}=this,pick=-1;for(let i=startIndex;i!=endIndex;i=buffer[i+3]){if(checkSide(side,pos,buffer[i+1],buffer[i+2])){pick=i;if(dir>0)
break;}}
return pick;}
slice(startI,endI,from,to){let b=this.buffer;let copy=new Uint16Array(endI-startI);for(let i=startI,j=0;i<endI;){copy[j++]=b[i++];copy[j++]=b[i++]-from;copy[j++]=b[i++]-from;copy[j++]=b[i++]-startI;}
return new TreeBuffer(copy,to-from,this.set);}}
function checkSide(side,pos,from,to){switch(side){case-2:return from<pos;case-1:return to>=pos&&from<pos;case 0:return from<pos&&to>pos;case 1:return from<=pos&&to>pos;case 2:return to>pos;case 4:return true;}}
function enterUnfinishedNodesBefore(node,pos){let scan=node.childBefore(pos);while(scan){let last=scan.lastChild;if(!last||last.to!=scan.to)
break;if(last.type.isError&&last.from==last.to){node=scan;scan=last.prevSibling;}
else{scan=last;}}
return node;}
function resolveNode(node,pos,side,overlays){var _a;while(node.from==node.to||(side<1?node.from>=pos:node.from>pos)||(side>-1?node.to<=pos:node.to<pos)){let parent=!overlays&&node instanceof TreeNode&&node.index<0?null:node.parent;if(!parent)
return node;node=parent;}
let mode=overlays?0:IterMode.IgnoreOverlays;if(overlays)
for(let scan=node,parent=scan.parent;parent;scan=parent,parent=scan.parent){if(scan instanceof TreeNode&&scan.index<0&&((_a=parent.enter(pos,side,mode))===null||_a===void 0?void 0:_a.from)!=scan.from)
node=parent;}
for(;;){let inner=node.enter(pos,side,mode);if(!inner)
return node;node=inner;}}
class TreeNode{constructor(_tree,from,index,_parent){this._tree=_tree;this.from=from;this.index=index;this._parent=_parent;}
get type(){return this._tree.type;}
get name(){return this._tree.type.name;}
get to(){return this.from+this._tree.length;}
nextChild(i,dir,pos,side,mode=0){for(let parent=this;;){for(let{children,positions}=parent._tree,e=dir>0?children.length:-1;i!=e;i+=dir){let next=children[i],start=positions[i]+parent.from;if(!checkSide(side,pos,start,start+next.length))
continue;if(next instanceof TreeBuffer){if(mode&IterMode.ExcludeBuffers)
continue;let index=next.findChild(0,next.buffer.length,dir,pos-start,side);if(index>-1)
return new BufferNode(new BufferContext(parent,next,i,start),null,index);}
else if((mode&IterMode.IncludeAnonymous)||(!next.type.isAnonymous||hasChild(next))){let mounted;if(!(mode&IterMode.IgnoreMounts)&&next.props&&(mounted=next.prop(NodeProp.mounted))&&!mounted.overlay)
return new TreeNode(mounted.tree,start,i,parent);let inner=new TreeNode(next,start,i,parent);return(mode&IterMode.IncludeAnonymous)||!inner.type.isAnonymous?inner:inner.nextChild(dir<0?next.children.length-1:0,dir,pos,side);}}
if((mode&IterMode.IncludeAnonymous)||!parent.type.isAnonymous)
return null;if(parent.index>=0)
i=parent.index+dir;else
i=dir<0?-1:parent._parent._tree.children.length;parent=parent._parent;if(!parent)
return null;}}
get firstChild(){return this.nextChild(0,1,0,4);}
get lastChild(){return this.nextChild(this._tree.children.length-1,-1,0,4);}
childAfter(pos){return this.nextChild(0,1,pos,2);}
childBefore(pos){return this.nextChild(this._tree.children.length-1,-1,pos,-2);}
enter(pos,side,mode=0){let mounted;if(!(mode&IterMode.IgnoreOverlays)&&(mounted=this._tree.prop(NodeProp.mounted))&&mounted.overlay){let rPos=pos-this.from;for(let{from,to}of mounted.overlay){if((side>0?from<=rPos:from<rPos)&&(side<0?to>=rPos:to>rPos))
return new TreeNode(mounted.tree,mounted.overlay[0].from+this.from,-1,this);}}
return this.nextChild(0,1,pos,side,mode);}
nextSignificantParent(){let val=this;while(val.type.isAnonymous&&val._parent)
val=val._parent;return val;}
get parent(){return this._parent?this._parent.nextSignificantParent():null;}
get nextSibling(){return this._parent&&this.index>=0?this._parent.nextChild(this.index+1,1,0,4):null;}
get prevSibling(){return this._parent&&this.index>=0?this._parent.nextChild(this.index-1,-1,0,4):null;}
cursor(mode=0){return new TreeCursor(this,mode);}
get tree(){return this._tree;}
toTree(){return this._tree;}
resolve(pos,side=0){return resolveNode(this,pos,side,false);}
resolveInner(pos,side=0){return resolveNode(this,pos,side,true);}
enterUnfinishedNodesBefore(pos){return enterUnfinishedNodesBefore(this,pos);}
getChild(type,before=null,after=null){let r=getChildren(this,type,before,after);return r.length?r[0]:null;}
getChildren(type,before=null,after=null){return getChildren(this,type,before,after);}
toString(){return this._tree.toString();}
get node(){return this;}
matchContext(context){return matchNodeContext(this,context);}}
function getChildren(node,type,before,after){let cur=node.cursor(),result=[];if(!cur.firstChild())
return result;if(before!=null)
while(!cur.type.is(before))
if(!cur.nextSibling())
return result;for(;;){if(after!=null&&cur.type.is(after))
return result;if(cur.type.is(type))
result.push(cur.node);if(!cur.nextSibling())
return after==null?result:[];}}
function matchNodeContext(node,context,i=context.length-1){for(let p=node.parent;i>=0;p=p.parent){if(!p)
return false;if(!p.type.isAnonymous){if(context[i]&&context[i]!=p.name)
return false;i--;}}
return true;}
class BufferContext{constructor(parent,buffer,index,start){this.parent=parent;this.buffer=buffer;this.index=index;this.start=start;}}
class BufferNode{constructor(context,_parent,index){this.context=context;this._parent=_parent;this.index=index;this.type=context.buffer.set.types[context.buffer.buffer[index]];}
get name(){return this.type.name;}
get from(){return this.context.start+this.context.buffer.buffer[this.index+1];}
get to(){return this.context.start+this.context.buffer.buffer[this.index+2];}
child(dir,pos,side){let{buffer}=this.context;let index=buffer.findChild(this.index+4,buffer.buffer[this.index+3],dir,pos-this.context.start,side);return index<0?null:new BufferNode(this.context,this,index);}
get firstChild(){return this.child(1,0,4);}
get lastChild(){return this.child(-1,0,4);}
childAfter(pos){return this.child(1,pos,2);}
childBefore(pos){return this.child(-1,pos,-2);}
enter(pos,side,mode=0){if(mode&IterMode.ExcludeBuffers)
return null;let{buffer}=this.context;let index=buffer.findChild(this.index+4,buffer.buffer[this.index+3],side>0?1:-1,pos-this.context.start,side);return index<0?null:new BufferNode(this.context,this,index);}
get parent(){return this._parent||this.context.parent.nextSignificantParent();}
externalSibling(dir){return this._parent?null:this.context.parent.nextChild(this.context.index+dir,dir,0,4);}
get nextSibling(){let{buffer}=this.context;let after=buffer.buffer[this.index+3];if(after<(this._parent?buffer.buffer[this._parent.index+3]:buffer.buffer.length))
return new BufferNode(this.context,this._parent,after);return this.externalSibling(1);}
get prevSibling(){let{buffer}=this.context;let parentStart=this._parent?this._parent.index+4:0;if(this.index==parentStart)
return this.externalSibling(-1);return new BufferNode(this.context,this._parent,buffer.findChild(parentStart,this.index,-1,0,4));}
cursor(mode=0){return new TreeCursor(this,mode);}
get tree(){return null;}
toTree(){let children=[],positions=[];let{buffer}=this.context;let startI=this.index+4,endI=buffer.buffer[this.index+3];if(endI>startI){let from=buffer.buffer[this.index+1],to=buffer.buffer[this.index+2];children.push(buffer.slice(startI,endI,from,to));positions.push(0);}
return new Tree(this.type,children,positions,this.to-this.from);}
resolve(pos,side=0){return resolveNode(this,pos,side,false);}
resolveInner(pos,side=0){return resolveNode(this,pos,side,true);}
enterUnfinishedNodesBefore(pos){return enterUnfinishedNodesBefore(this,pos);}
toString(){return this.context.buffer.childString(this.index);}
getChild(type,before=null,after=null){let r=getChildren(this,type,before,after);return r.length?r[0]:null;}
getChildren(type,before=null,after=null){return getChildren(this,type,before,after);}
get node(){return this;}
matchContext(context){return matchNodeContext(this,context);}}
class TreeCursor{constructor(node,mode=0){this.mode=mode;this.buffer=null;this.stack=[];this.index=0;this.bufferNode=null;if(node instanceof TreeNode){this.yieldNode(node);}
else{this._tree=node.context.parent;this.buffer=node.context;for(let n=node._parent;n;n=n._parent)
this.stack.unshift(n.index);this.bufferNode=node;this.yieldBuf(node.index);}}
get name(){return this.type.name;}
yieldNode(node){if(!node)
return false;this._tree=node;this.type=node.type;this.from=node.from;this.to=node.to;return true;}
yieldBuf(index,type){this.index=index;let{start,buffer}=this.buffer;this.type=type||buffer.set.types[buffer.buffer[index]];this.from=start+buffer.buffer[index+1];this.to=start+buffer.buffer[index+2];return true;}
yield(node){if(!node)
return false;if(node instanceof TreeNode){this.buffer=null;return this.yieldNode(node);}
this.buffer=node.context;return this.yieldBuf(node.index,node.type);}
toString(){return this.buffer?this.buffer.buffer.childString(this.index):this._tree.toString();}
enterChild(dir,pos,side){if(!this.buffer)
return this.yield(this._tree.nextChild(dir<0?this._tree._tree.children.length-1:0,dir,pos,side,this.mode));let{buffer}=this.buffer;let index=buffer.findChild(this.index+4,buffer.buffer[this.index+3],dir,pos-this.buffer.start,side);if(index<0)
return false;this.stack.push(this.index);return this.yieldBuf(index);}
firstChild(){return this.enterChild(1,0,4);}
lastChild(){return this.enterChild(-1,0,4);}
childAfter(pos){return this.enterChild(1,pos,2);}
childBefore(pos){return this.enterChild(-1,pos,-2);}
enter(pos,side,mode=this.mode){if(!this.buffer)
return this.yield(this._tree.enter(pos,side,mode));return mode&IterMode.ExcludeBuffers?false:this.enterChild(1,pos,side);}
parent(){if(!this.buffer)
return this.yieldNode((this.mode&IterMode.IncludeAnonymous)?this._tree._parent:this._tree.parent);if(this.stack.length)
return this.yieldBuf(this.stack.pop());let parent=(this.mode&IterMode.IncludeAnonymous)?this.buffer.parent:this.buffer.parent.nextSignificantParent();this.buffer=null;return this.yieldNode(parent);}
sibling(dir){if(!this.buffer)
return!this._tree._parent?false:this.yield(this._tree.index<0?null:this._tree._parent.nextChild(this._tree.index+dir,dir,0,4,this.mode));let{buffer}=this.buffer,d=this.stack.length-1;if(dir<0){let parentStart=d<0?0:this.stack[d]+4;if(this.index!=parentStart)
return this.yieldBuf(buffer.findChild(parentStart,this.index,-1,0,4));}
else{let after=buffer.buffer[this.index+3];if(after<(d<0?buffer.buffer.length:buffer.buffer[this.stack[d]+3]))
return this.yieldBuf(after);}
return d<0?this.yield(this.buffer.parent.nextChild(this.buffer.index+dir,dir,0,4,this.mode)):false;}
nextSibling(){return this.sibling(1);}
prevSibling(){return this.sibling(-1);}
atLastNode(dir){let index,parent,{buffer}=this;if(buffer){if(dir>0){if(this.index<buffer.buffer.buffer.length)
return false;}
else{for(let i=0;i<this.index;i++)
if(buffer.buffer.buffer[i+3]<this.index)
return false;}
({index,parent}=buffer);}
else{({index,_parent:parent}=this._tree);}
for(;parent;{index,_parent:parent}=parent){if(index>-1)
for(let i=index+dir,e=dir<0?-1:parent._tree.children.length;i!=e;i+=dir){let child=parent._tree.children[i];if((this.mode&IterMode.IncludeAnonymous)||child instanceof TreeBuffer||!child.type.isAnonymous||hasChild(child))
return false;}}
return true;}
move(dir,enter){if(enter&&this.enterChild(dir,0,4))
return true;for(;;){if(this.sibling(dir))
return true;if(this.atLastNode(dir)||!this.parent())
return false;}}
next(enter=true){return this.move(1,enter);}
prev(enter=true){return this.move(-1,enter);}
moveTo(pos,side=0){while(this.from==this.to||(side<1?this.from>=pos:this.from>pos)||(side>-1?this.to<=pos:this.to<pos))
if(!this.parent())
break;while(this.enterChild(1,pos,side)){}
return this;}
get node(){if(!this.buffer)
return this._tree;let cache=this.bufferNode,result=null,depth=0;if(cache&&cache.context==this.buffer){scan:for(let index=this.index,d=this.stack.length;d>=0;){for(let c=cache;c;c=c._parent)
if(c.index==index){if(index==this.index)
return c;result=c;depth=d+1;break scan;}
index=this.stack[--d];}}
for(let i=depth;i<this.stack.length;i++)
result=new BufferNode(this.buffer,result,this.stack[i]);return this.bufferNode=new BufferNode(this.buffer,result,this.index);}
get tree(){return this.buffer?null:this._tree._tree;}
iterate(enter,leave){for(let depth=0;;){let mustLeave=false;if(this.type.isAnonymous||enter(this)!==false){if(this.firstChild()){depth++;continue;}
if(!this.type.isAnonymous)
mustLeave=true;}
for(;;){if(mustLeave&&leave)
leave(this);mustLeave=this.type.isAnonymous;if(this.nextSibling())
break;if(!depth)
return;this.parent();depth--;mustLeave=true;}}}
matchContext(context){if(!this.buffer)
return matchNodeContext(this.node,context);let{buffer}=this.buffer,{types}=buffer.set;for(let i=context.length-1,d=this.stack.length-1;i>=0;d--){if(d<0)
return matchNodeContext(this.node,context,i);let type=types[buffer.buffer[this.stack[d]]];if(!type.isAnonymous){if(context[i]&&context[i]!=type.name)
return false;i--;}}
return true;}}
function hasChild(tree){return tree.children.some(ch=>ch instanceof TreeBuffer||!ch.type.isAnonymous||hasChild(ch));}
function buildTree(data){var _a;let{buffer,nodeSet,maxBufferLength=DefaultBufferLength,reused=[],minRepeatType=nodeSet.types.length}=data;let cursor=Array.isArray(buffer)?new FlatBufferCursor(buffer,buffer.length):buffer;let types=nodeSet.types;let contextHash=0,lookAhead=0;function takeNode(parentStart,minPos,children,positions,inRepeat){let{id,start,end,size}=cursor;let lookAheadAtStart=lookAhead;while(size<0){cursor.next();if(size==-1){let node=reused[id];children.push(node);positions.push(start-parentStart);return;}
else if(size==-3){contextHash=id;return;}
else if(size==-4){lookAhead=id;return;}
else{throw new RangeError(`Unrecognized record size: ${size}`);}}
let type=types[id],node,buffer;let startPos=start-parentStart;if(end-start<=maxBufferLength&&(buffer=findBufferSize(cursor.pos-minPos,inRepeat))){let data=new Uint16Array(buffer.size-buffer.skip);let endPos=cursor.pos-buffer.size,index=data.length;while(cursor.pos>endPos)
index=copyToBuffer(buffer.start,data,index);node=new TreeBuffer(data,end-buffer.start,nodeSet);startPos=buffer.start-parentStart;}
else{let endPos=cursor.pos-size;cursor.next();let localChildren=[],localPositions=[];let localInRepeat=id>=minRepeatType?id:-1;let lastGroup=0,lastEnd=end;while(cursor.pos>endPos){if(localInRepeat>=0&&cursor.id==localInRepeat&&cursor.size>=0){if(cursor.end<=lastEnd-maxBufferLength){makeRepeatLeaf(localChildren,localPositions,start,lastGroup,cursor.end,lastEnd,localInRepeat,lookAheadAtStart);lastGroup=localChildren.length;lastEnd=cursor.end;}
cursor.next();}
else{takeNode(start,endPos,localChildren,localPositions,localInRepeat);}}
if(localInRepeat>=0&&lastGroup>0&&lastGroup<localChildren.length)
makeRepeatLeaf(localChildren,localPositions,start,lastGroup,start,lastEnd,localInRepeat,lookAheadAtStart);localChildren.reverse();localPositions.reverse();if(localInRepeat>-1&&lastGroup>0){let make=makeBalanced(type);node=balanceRange(type,localChildren,localPositions,0,localChildren.length,0,end-start,make,make);}
else{node=makeTree(type,localChildren,localPositions,end-start,lookAheadAtStart-end);}}
children.push(node);positions.push(startPos);}
function makeBalanced(type){return(children,positions,length)=>{let lookAhead=0,lastI=children.length-1,last,lookAheadProp;if(lastI>=0&&(last=children[lastI])instanceof Tree){if(!lastI&&last.type==type&&last.length==length)
return last;if(lookAheadProp=last.prop(NodeProp.lookAhead))
lookAhead=positions[lastI]+last.length+lookAheadProp;}
return makeTree(type,children,positions,length,lookAhead);};}
function makeRepeatLeaf(children,positions,base,i,from,to,type,lookAhead){let localChildren=[],localPositions=[];while(children.length>i){localChildren.push(children.pop());localPositions.push(positions.pop()+base-from);}
children.push(makeTree(nodeSet.types[type],localChildren,localPositions,to-from,lookAhead-to));positions.push(from-base);}
function makeTree(type,children,positions,length,lookAhead=0,props){if(contextHash){let pair=[NodeProp.contextHash,contextHash];props=props?[pair].concat(props):[pair];}
if(lookAhead>25){let pair=[NodeProp.lookAhead,lookAhead];props=props?[pair].concat(props):[pair];}
return new Tree(type,children,positions,length,props);}
function findBufferSize(maxSize,inRepeat){let fork=cursor.fork();let size=0,start=0,skip=0,minStart=fork.end-maxBufferLength;let result={size:0,start:0,skip:0};scan:for(let minPos=fork.pos-maxSize;fork.pos>minPos;){let nodeSize=fork.size;if(fork.id==inRepeat&&nodeSize>=0){result.size=size;result.start=start;result.skip=skip;skip+=4;size+=4;fork.next();continue;}
let startPos=fork.pos-nodeSize;if(nodeSize<0||startPos<minPos||fork.start<minStart)
break;let localSkipped=fork.id>=minRepeatType?4:0;let nodeStart=fork.start;fork.next();while(fork.pos>startPos){if(fork.size<0){if(fork.size==-3)
localSkipped+=4;else
break scan;}
else if(fork.id>=minRepeatType){localSkipped+=4;}
fork.next();}
start=nodeStart;size+=nodeSize;skip+=localSkipped;}
if(inRepeat<0||size==maxSize){result.size=size;result.start=start;result.skip=skip;}
return result.size>4?result:undefined;}
function copyToBuffer(bufferStart,buffer,index){let{id,start,end,size}=cursor;cursor.next();if(size>=0&&id<minRepeatType){let startIndex=index;if(size>4){let endPos=cursor.pos-(size-4);while(cursor.pos>endPos)
index=copyToBuffer(bufferStart,buffer,index);}
buffer[--index]=startIndex;buffer[--index]=end-bufferStart;buffer[--index]=start-bufferStart;buffer[--index]=id;}
else if(size==-3){contextHash=id;}
else if(size==-4){lookAhead=id;}
return index;}
let children=[],positions=[];while(cursor.pos>0)
takeNode(data.start||0,data.bufferStart||0,children,positions,-1);let length=(_a=data.length)!==null&&_a!==void 0?_a:(children.length?positions[0]+children[0].length:0);return new Tree(types[data.topID],children.reverse(),positions.reverse(),length);}
const nodeSizeCache=new WeakMap;function nodeSize(balanceType,node){if(!balanceType.isAnonymous||node instanceof TreeBuffer||node.type!=balanceType)
return 1;let size=nodeSizeCache.get(node);if(size==null){size=1;for(let child of node.children){if(child.type!=balanceType||!(child instanceof Tree)){size=1;break;}
size+=nodeSize(balanceType,child);}
nodeSizeCache.set(node,size);}
return size;}
function balanceRange(balanceType,children,positions,from,to,start,length,mkTop,mkTree){let total=0;for(let i=from;i<to;i++)
total+=nodeSize(balanceType,children[i]);let maxChild=Math.ceil((total*1.5)/8);let localChildren=[],localPositions=[];function divide(children,positions,from,to,offset){for(let i=from;i<to;){let groupFrom=i,groupStart=positions[i],groupSize=nodeSize(balanceType,children[i]);i++;for(;i<to;i++){let nextSize=nodeSize(balanceType,children[i]);if(groupSize+nextSize>=maxChild)
break;groupSize+=nextSize;}
if(i==groupFrom+1){if(groupSize>maxChild){let only=children[groupFrom];divide(only.children,only.positions,0,only.children.length,positions[groupFrom]+offset);continue;}
localChildren.push(children[groupFrom]);}
else{let length=positions[i-1]+children[i-1].length-groupStart;localChildren.push(balanceRange(balanceType,children,positions,groupFrom,i,groupStart,length,null,mkTree));}
localPositions.push(groupStart+offset-start);}}
divide(children,positions,from,to,0);return(mkTop||mkTree)(localChildren,localPositions,length);}
class TreeFragment{constructor(from,to,tree,offset,openStart=false,openEnd=false){this.from=from;this.to=to;this.tree=tree;this.offset=offset;this.open=(openStart?1:0)|(openEnd?2:0);}
get openStart(){return(this.open&1)>0;}
get openEnd(){return(this.open&2)>0;}
static addTree(tree,fragments=[],partial=false){let result=[new TreeFragment(0,tree.length,tree,0,false,partial)];for(let f of fragments)
if(f.to>tree.length)
result.push(f);return result;}
static applyChanges(fragments,changes,minGap=128){if(!changes.length)
return fragments;let result=[];let fI=1,nextF=fragments.length?fragments[0]:null;for(let cI=0,pos=0,off=0;;cI++){let nextC=cI<changes.length?changes[cI]:null;let nextPos=nextC?nextC.fromA:1e9;if(nextPos-pos>=minGap)
while(nextF&&nextF.from<nextPos){let cut=nextF;if(pos>=cut.from||nextPos<=cut.to||off){let fFrom=Math.max(cut.from,pos)-off,fTo=Math.min(cut.to,nextPos)-off;cut=fFrom>=fTo?null:new TreeFragment(fFrom,fTo,cut.tree,cut.offset+off,cI>0,!!nextC);}
if(cut)
result.push(cut);if(nextF.to>nextPos)
break;nextF=fI<fragments.length?fragments[fI++]:null;}
if(!nextC)
break;pos=nextC.toA;off=nextC.toA-nextC.toB;}
return result;}}
class Parser{startParse(input,fragments,ranges){if(typeof input=="string")
input=new StringInput(input);ranges=!ranges?[new Range(0,input.length)]:ranges.length?ranges.map(r=>new Range(r.from,r.to)):[new Range(0,0)];return this.createParse(input,fragments||[],ranges);}
parse(input,fragments,ranges){let parse=this.startParse(input,fragments,ranges);for(;;){let done=parse.advance();if(done)
return done;}}}
class StringInput{constructor(string){this.string=string;}
get length(){return this.string.length;}
chunk(from){return this.string.slice(from);}
get lineChunks(){return false;}
read(from,to){return this.string.slice(from,to);}}
new NodeProp({perNode:true});let nextTagID=0;class Tag{constructor(set,base,modified){this.set=set;this.base=base;this.modified=modified;this.id=nextTagID++;}
static define(parent){if(parent===null||parent===void 0?void 0:parent.base)
throw new Error("Can not derive from a modified tag");let tag=new Tag([],null,[]);tag.set.push(tag);if(parent)
for(let t of parent.set)
tag.set.push(t);return tag;}
static defineModifier(){let mod=new Modifier;return(tag)=>{if(tag.modified.indexOf(mod)>-1)
return tag;return Modifier.get(tag.base||tag,tag.modified.concat(mod).sort((a,b)=>a.id-b.id));};}}
let nextModifierID=0;class Modifier{constructor(){this.instances=[];this.id=nextModifierID++;}
static get(base,mods){if(!mods.length)
return base;let exists=mods[0].instances.find(t=>t.base==base&&sameArray(mods,t.modified));if(exists)
return exists;let set=[],tag=new Tag(set,base,mods);for(let m of mods)
m.instances.push(tag);let configs=permute(mods);for(let parent of base.set)
for(let config of configs)
set.push(Modifier.get(parent,config));return tag;}}
function sameArray(a,b){return a.length==b.length&&a.every((x,i)=>x==b[i]);}
function permute(array){let result=[array];for(let i=0;i<array.length;i++){for(let a of permute(array.slice(0,i).concat(array.slice(i+1))))
result.push(a);}
return result;}
function styleTags(spec){let byName=Object.create(null);for(let prop in spec){let tags=spec[prop];if(!Array.isArray(tags))
tags=[tags];for(let part of prop.split(" "))
if(part){let pieces=[],mode=2,rest=part;for(let pos=0;;){if(rest=="..."&&pos>0&&pos+3==part.length){mode=1;break;}
let m=/^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(rest);if(!m)
throw new RangeError("Invalid path: "+part);pieces.push(m[0]=="*"?"":m[0][0]=='"'?JSON.parse(m[0]):m[0]);pos+=m[0].length;if(pos==part.length)
break;let next=part[pos++];if(pos==part.length&&next=="!"){mode=0;break;}
if(next!="/")
throw new RangeError("Invalid path: "+part);rest=part.slice(pos);}
let last=pieces.length-1,inner=pieces[last];if(!inner)
throw new RangeError("Invalid path: "+part);let rule=new Rule(tags,mode,last>0?pieces.slice(0,last):null);byName[inner]=rule.sort(byName[inner]);}}
return ruleNodeProp.add(byName);}
const ruleNodeProp=new NodeProp();class Rule{constructor(tags,mode,context,next){this.tags=tags;this.mode=mode;this.context=context;this.next=next;}
sort(other){if(!other||other.depth<this.depth){this.next=other;return this;}
other.next=this.sort(other.next);return other;}
get depth(){return this.context?this.context.length:0;}}
function tagHighlighter(tags,options){let map=Object.create(null);for(let style of tags){if(!Array.isArray(style.tag))
map[style.tag.id]=style.class;else
for(let tag of style.tag)
map[tag.id]=style.class;}
let{scope,all=null}=options||{};return{style:(tags)=>{let cls=all;for(let tag of tags){for(let sub of tag.set){let tagClass=map[sub.id];if(tagClass){cls=cls?cls+" "+tagClass:tagClass;break;}}}
return cls;},scope:scope};}
const t=Tag.define;const comment=t(),name=t(),typeName=t(name),propertyName=t(name),literal=t(),string=t(literal),number=t(literal),content=t(),heading=t(content),keyword=t(),operator=t(),punctuation=t(),bracket=t(punctuation),meta=t();const tags={comment,lineComment:t(comment),blockComment:t(comment),docComment:t(comment),name,variableName:t(name),typeName:typeName,tagName:t(typeName),propertyName:propertyName,attributeName:t(propertyName),className:t(name),labelName:t(name),namespace:t(name),macroName:t(name),literal,string,docString:t(string),character:t(string),attributeValue:t(string),number,integer:t(number),float:t(number),bool:t(literal),regexp:t(literal),escape:t(literal),color:t(literal),url:t(literal),keyword,self:t(keyword),null:t(keyword),atom:t(keyword),unit:t(keyword),modifier:t(keyword),operatorKeyword:t(keyword),controlKeyword:t(keyword),definitionKeyword:t(keyword),moduleKeyword:t(keyword),operator,derefOperator:t(operator),arithmeticOperator:t(operator),logicOperator:t(operator),bitwiseOperator:t(operator),compareOperator:t(operator),updateOperator:t(operator),definitionOperator:t(operator),typeOperator:t(operator),controlOperator:t(operator),punctuation,separator:t(punctuation),bracket,angleBracket:t(bracket),squareBracket:t(bracket),paren:t(bracket),brace:t(bracket),content,heading,heading1:t(heading),heading2:t(heading),heading3:t(heading),heading4:t(heading),heading5:t(heading),heading6:t(heading),contentSeparator:t(content),list:t(content),quote:t(content),emphasis:t(content),strong:t(content),link:t(content),monospace:t(content),strikethrough:t(content),inserted:t(),deleted:t(),changed:t(),invalid:t(),meta,documentMeta:t(meta),annotation:t(meta),processingInstruction:t(meta),definition:Tag.defineModifier(),constant:Tag.defineModifier(),function:Tag.defineModifier(),standard:Tag.defineModifier(),local:Tag.defineModifier(),special:Tag.defineModifier()};tagHighlighter([{tag:tags.link,class:"tok-link"},{tag:tags.heading,class:"tok-heading"},{tag:tags.emphasis,class:"tok-emphasis"},{tag:tags.strong,class:"tok-strong"},{tag:tags.keyword,class:"tok-keyword"},{tag:tags.atom,class:"tok-atom"},{tag:tags.bool,class:"tok-bool"},{tag:tags.url,class:"tok-url"},{tag:tags.labelName,class:"tok-labelName"},{tag:tags.inserted,class:"tok-inserted"},{tag:tags.deleted,class:"tok-deleted"},{tag:tags.literal,class:"tok-literal"},{tag:tags.string,class:"tok-string"},{tag:tags.number,class:"tok-number"},{tag:[tags.regexp,tags.escape,tags.special(tags.string)],class:"tok-string2"},{tag:tags.variableName,class:"tok-variableName"},{tag:tags.local(tags.variableName),class:"tok-variableName tok-local"},{tag:tags.definition(tags.variableName),class:"tok-variableName tok-definition"},{tag:tags.special(tags.variableName),class:"tok-variableName2"},{tag:tags.definition(tags.propertyName),class:"tok-propertyName tok-definition"},{tag:tags.typeName,class:"tok-typeName"},{tag:tags.namespace,class:"tok-namespace"},{tag:tags.className,class:"tok-className"},{tag:tags.macroName,class:"tok-macroName"},{tag:tags.propertyName,class:"tok-propertyName"},{tag:tags.operator,class:"tok-operator"},{tag:tags.comment,class:"tok-comment"},{tag:tags.meta,class:"tok-meta"},{tag:tags.invalid,class:"tok-invalid"},{tag:tags.punctuation,class:"tok-punctuation"}]);var _a;const languageDataProp=new NodeProp();class Language{constructor(data,parser,extraExtensions=[]){this.data=data;if(!EditorState.prototype.hasOwnProperty("tree"))
Object.defineProperty(EditorState.prototype,"tree",{get(){return syntaxTree(this);}});this.parser=parser;this.extension=[language.of(this),EditorState.languageData.of((state,pos,side)=>state.facet(languageDataFacetAt(state,pos,side)))].concat(extraExtensions);}
isActiveAt(state,pos,side=-1){return languageDataFacetAt(state,pos,side)==this.data;}
findRegions(state){let lang=state.facet(language);if((lang===null||lang===void 0?void 0:lang.data)==this.data)
return[{from:0,to:state.doc.length}];if(!lang||!lang.allowsNesting)
return[];let result=[];let explore=(tree,from)=>{if(tree.prop(languageDataProp)==this.data){result.push({from,to:from+tree.length});return;}
let mount=tree.prop(NodeProp.mounted);if(mount){if(mount.tree.prop(languageDataProp)==this.data){if(mount.overlay)
for(let r of mount.overlay)
result.push({from:r.from+from,to:r.to+from});else
result.push({from:from,to:from+tree.length});return;}
else if(mount.overlay){let size=result.length;explore(mount.tree,mount.overlay[0].from+from);if(result.length>size)
return;}}
for(let i=0;i<tree.children.length;i++){let ch=tree.children[i];if(ch instanceof Tree)
explore(ch,tree.positions[i]+from);}};explore(syntaxTree(state),0);return result;}
get allowsNesting(){return true;}}
Language.setState=StateEffect.define();function languageDataFacetAt(state,pos,side){let topLang=state.facet(language);if(!topLang)
return null;let facet=topLang.data;if(topLang.allowsNesting){for(let node=syntaxTree(state).topNode;node;node=node.enter(pos,side,IterMode.ExcludeBuffers))
facet=node.type.prop(languageDataProp)||facet;}
return facet;}
function syntaxTree(state){let field=state.field(Language.state,false);return field?field.tree:Tree.empty;}
class DocInput{constructor(doc,length=doc.length){this.doc=doc;this.length=length;this.cursorPos=0;this.string="";this.cursor=doc.iter();}
syncTo(pos){this.string=this.cursor.next(pos-this.cursorPos).value;this.cursorPos=pos+this.string.length;return this.cursorPos-this.string.length;}
chunk(pos){this.syncTo(pos);return this.string;}
get lineChunks(){return true;}
read(from,to){let stringStart=this.cursorPos-this.string.length;if(from<stringStart||to>=this.cursorPos)
return this.doc.sliceString(from,to);else
return this.string.slice(from-stringStart,to-stringStart);}}
let currentContext=null;class ParseContext{constructor(parser,state,fragments=[],tree,treeLen,viewport,skipped,scheduleOn){this.parser=parser;this.state=state;this.fragments=fragments;this.tree=tree;this.treeLen=treeLen;this.viewport=viewport;this.skipped=skipped;this.scheduleOn=scheduleOn;this.parse=null;this.tempSkipped=[];}
static create(parser,state,viewport){return new ParseContext(parser,state,[],Tree.empty,0,viewport,[],null);}
startParse(){return this.parser.startParse(new DocInput(this.state.doc),this.fragments);}
work(until,upto){if(upto!=null&&upto>=this.state.doc.length)
upto=undefined;if(this.tree!=Tree.empty&&this.isDone(upto!==null&&upto!==void 0?upto:this.state.doc.length)){this.takeTree();return true;}
return this.withContext(()=>{var _a;if(typeof until=="number"){let endTime=Date.now()+until;until=()=>Date.now()>endTime;}
if(!this.parse)
this.parse=this.startParse();if(upto!=null&&(this.parse.stoppedAt==null||this.parse.stoppedAt>upto)&&upto<this.state.doc.length)
this.parse.stopAt(upto);for(;;){let done=this.parse.advance();if(done){this.fragments=this.withoutTempSkipped(TreeFragment.addTree(done,this.fragments,this.parse.stoppedAt!=null));this.treeLen=(_a=this.parse.stoppedAt)!==null&&_a!==void 0?_a:this.state.doc.length;this.tree=done;this.parse=null;if(this.treeLen<(upto!==null&&upto!==void 0?upto:this.state.doc.length))
this.parse=this.startParse();else
return true;}
if(until())
return false;}});}
takeTree(){let pos,tree;if(this.parse&&(pos=this.parse.parsedPos)>=this.treeLen){if(this.parse.stoppedAt==null||this.parse.stoppedAt>pos)
this.parse.stopAt(pos);this.withContext(()=>{while(!(tree=this.parse.advance())){}});this.treeLen=pos;this.tree=tree;this.fragments=this.withoutTempSkipped(TreeFragment.addTree(this.tree,this.fragments,true));this.parse=null;}}
withContext(f){let prev=currentContext;currentContext=this;try{return f();}
finally{currentContext=prev;}}
withoutTempSkipped(fragments){for(let r;r=this.tempSkipped.pop();)
fragments=cutFragments(fragments,r.from,r.to);return fragments;}
changes(changes,newState){let{fragments,tree,treeLen,viewport,skipped}=this;this.takeTree();if(!changes.empty){let ranges=[];changes.iterChangedRanges((fromA,toA,fromB,toB)=>ranges.push({fromA,toA,fromB,toB}));fragments=TreeFragment.applyChanges(fragments,ranges);tree=Tree.empty;treeLen=0;viewport={from:changes.mapPos(viewport.from,-1),to:changes.mapPos(viewport.to,1)};if(this.skipped.length){skipped=[];for(let r of this.skipped){let from=changes.mapPos(r.from,1),to=changes.mapPos(r.to,-1);if(from<to)
skipped.push({from,to});}}}
return new ParseContext(this.parser,newState,fragments,tree,treeLen,viewport,skipped,this.scheduleOn);}
updateViewport(viewport){if(this.viewport.from==viewport.from&&this.viewport.to==viewport.to)
return false;this.viewport=viewport;let startLen=this.skipped.length;for(let i=0;i<this.skipped.length;i++){let{from,to}=this.skipped[i];if(from<viewport.to&&to>viewport.from){this.fragments=cutFragments(this.fragments,from,to);this.skipped.splice(i--,1);}}
if(this.skipped.length>=startLen)
return false;this.reset();return true;}
reset(){if(this.parse){this.takeTree();this.parse=null;}}
skipUntilInView(from,to){this.skipped.push({from,to});}
static getSkippingParser(until){return new class extends Parser{createParse(input,fragments,ranges){let from=ranges[0].from,to=ranges[ranges.length-1].to;let parser={parsedPos:from,advance(){let cx=currentContext;if(cx){for(let r of ranges)
cx.tempSkipped.push(r);if(until)
cx.scheduleOn=cx.scheduleOn?Promise.all([cx.scheduleOn,until]):until;}
this.parsedPos=to;return new Tree(NodeType.none,[],[],to-from);},stoppedAt:null,stopAt(){}};return parser;}};}
isDone(upto){upto=Math.min(upto,this.state.doc.length);let frags=this.fragments;return this.treeLen>=upto&&frags.length&&frags[0].from==0&&frags[0].to>=upto;}
static get(){return currentContext;}}
function cutFragments(fragments,from,to){return TreeFragment.applyChanges(fragments,[{fromA:from,toA:to,fromB:from,toB:to}]);}
class LanguageState{constructor(context){this.context=context;this.tree=context.tree;}
apply(tr){if(!tr.docChanged&&this.tree==this.context.tree)
return this;let newCx=this.context.changes(tr.changes,tr.state);let upto=this.context.treeLen==tr.startState.doc.length?undefined:Math.max(tr.changes.mapPos(this.context.treeLen),newCx.viewport.to);if(!newCx.work(20,upto))
newCx.takeTree();return new LanguageState(newCx);}
static init(state){let vpTo=Math.min(3000,state.doc.length);let parseState=ParseContext.create(state.facet(language).parser,state,{from:0,to:vpTo});if(!parseState.work(20,vpTo))
parseState.takeTree();return new LanguageState(parseState);}}
Language.state=StateField.define({create:LanguageState.init,update(value,tr){for(let e of tr.effects)
if(e.is(Language.setState))
return e.value;if(tr.startState.facet(language)!=tr.state.facet(language))
return LanguageState.init(tr.state);return value.apply(tr);}});let requestIdle=(callback)=>{let timeout=setTimeout(()=>callback(),500);return()=>clearTimeout(timeout);};if(typeof requestIdleCallback!="undefined")
requestIdle=(callback)=>{let idle=-1,timeout=setTimeout(()=>{idle=requestIdleCallback(callback,{timeout:500-100});},100);return()=>idle<0?clearTimeout(timeout):cancelIdleCallback(idle);};const isInputPending=typeof navigator!="undefined"&&((_a=navigator.scheduling)===null||_a===void 0?void 0:_a.isInputPending)?()=>navigator.scheduling.isInputPending():null;const parseWorker=ViewPlugin.fromClass(class ParseWorker{constructor(view){this.view=view;this.working=null;this.workScheduled=0;this.chunkEnd=-1;this.chunkBudget=-1;this.work=this.work.bind(this);this.scheduleWork();}
update(update){let cx=this.view.state.field(Language.state).context;if(cx.updateViewport(update.view.viewport)||this.view.viewport.to>cx.treeLen)
this.scheduleWork();if(update.docChanged){if(this.view.hasFocus)
this.chunkBudget+=50;this.scheduleWork();}
this.checkAsyncSchedule(cx);}
scheduleWork(){if(this.working)
return;let{state}=this.view,field=state.field(Language.state);if(field.tree!=field.context.tree||!field.context.isDone(state.doc.length))
this.working=requestIdle(this.work);}
work(deadline){this.working=null;let now=Date.now();if(this.chunkEnd<now&&(this.chunkEnd<0||this.view.hasFocus)){this.chunkEnd=now+30000;this.chunkBudget=3000;}
if(this.chunkBudget<=0)
return;let{state,viewport:{to:vpTo}}=this.view,field=state.field(Language.state);if(field.tree==field.context.tree&&field.context.isDone(vpTo+100000))
return;let endTime=Date.now()+Math.min(this.chunkBudget,100,deadline&&!isInputPending?Math.max(25,deadline.timeRemaining()-5):1e9);let viewportFirst=field.context.treeLen<vpTo&&state.doc.length>vpTo+1000;let done=field.context.work(()=>{return isInputPending&&isInputPending()||Date.now()>endTime;},vpTo+(viewportFirst?0:100000));this.chunkBudget-=Date.now()-now;if(done||this.chunkBudget<=0){field.context.takeTree();this.view.dispatch({effects:Language.setState.of(new LanguageState(field.context))});}
if(this.chunkBudget>0&&!(done&&!viewportFirst))
this.scheduleWork();this.checkAsyncSchedule(field.context);}
checkAsyncSchedule(cx){if(cx.scheduleOn){this.workScheduled++;cx.scheduleOn.then(()=>this.scheduleWork()).catch(err=>logException(this.view.state,err)).then(()=>this.workScheduled--);cx.scheduleOn=null;}}
destroy(){if(this.working)
this.working();}
isWorking(){return!!(this.working||this.workScheduled>0);}},{eventHandlers:{focus(){this.scheduleWork();}}});const language=Facet.define({combine(languages){return languages.length?languages[0]:null;},enables:[Language.state,parseWorker]});const indentService=Facet.define();const indentUnit=Facet.define({combine:values=>{if(!values.length)
return "  ";if(!/^(?: +|\t+)$/.test(values[0]))
throw new Error("Invalid indent unit: "+JSON.stringify(values[0]));return values[0];}});function getIndentUnit(state){let unit=state.facet(indentUnit);return unit.charCodeAt(0)==9?state.tabSize*unit.length:unit.length;}
function indentString(state,cols){let result="",ts=state.tabSize;if(state.facet(indentUnit).charCodeAt(0)==9)
while(cols>=ts){result+="\t";cols-=ts;}
for(let i=0;i<cols;i++)
result+=" ";return result;}
function getIndentation(context,pos){if(context instanceof EditorState)
context=new IndentContext(context);for(let service of context.state.facet(indentService)){let result=service(context,pos);if(result!=null)
return result;}
let tree=syntaxTree(context.state);return tree?syntaxIndentation(context,tree,pos):null;}
class IndentContext{constructor(state,options={}){this.state=state;this.options=options;this.unit=getIndentUnit(state);}
lineAt(pos,bias=1){let line=this.state.doc.lineAt(pos);let{simulateBreak,simulateDoubleBreak}=this.options;if(simulateBreak!=null&&simulateBreak>=line.from&&simulateBreak<=line.to){if(simulateDoubleBreak&&simulateBreak==pos)
return{text:"",from:pos};else if(bias<0?simulateBreak<pos:simulateBreak<=pos)
return{text:line.text.slice(simulateBreak-line.from),from:simulateBreak};else
return{text:line.text.slice(0,simulateBreak-line.from),from:line.from};}
return line;}
textAfterPos(pos,bias=1){if(this.options.simulateDoubleBreak&&pos==this.options.simulateBreak)
return "";let{text,from}=this.lineAt(pos,bias);return text.slice(pos-from,Math.min(text.length,pos+100-from));}
column(pos,bias=1){let{text,from}=this.lineAt(pos,bias);let result=this.countColumn(text,pos-from);let override=this.options.overrideIndentation?this.options.overrideIndentation(from):-1;if(override>-1)
result+=override-this.countColumn(text,text.search(/\S|$/));return result;}
countColumn(line,pos=line.length){return countColumn(line,this.state.tabSize,pos);}
lineIndent(pos,bias=1){let{text,from}=this.lineAt(pos,bias);let override=this.options.overrideIndentation;if(override){let overriden=override(from);if(overriden>-1)
return overriden;}
return this.countColumn(text,text.search(/\S|$/));}
get simulatedBreak(){return this.options.simulateBreak||null;}}
const indentNodeProp=new NodeProp();function syntaxIndentation(cx,ast,pos){return indentFrom(ast.resolveInner(pos).enterUnfinishedNodesBefore(pos),pos,cx);}
function ignoreClosed(cx){return cx.pos==cx.options.simulateBreak&&cx.options.simulateDoubleBreak;}
function indentStrategy(tree){let strategy=tree.type.prop(indentNodeProp);if(strategy)
return strategy;let first=tree.firstChild,close;if(first&&(close=first.type.prop(NodeProp.closedBy))){let last=tree.lastChild,closed=last&&close.indexOf(last.name)>-1;return cx=>delimitedStrategy(cx,true,1,undefined,closed&&!ignoreClosed(cx)?last.from:undefined);}
return tree.parent==null?topIndent:null;}
function indentFrom(node,pos,base){for(;node;node=node.parent){let strategy=indentStrategy(node);if(strategy)
return strategy(TreeIndentContext.create(base,pos,node));}
return null;}
function topIndent(){return 0;}
class TreeIndentContext extends IndentContext{constructor(base,pos,node){super(base.state,base.options);this.base=base;this.pos=pos;this.node=node;}
static create(base,pos,node){return new TreeIndentContext(base,pos,node);}
get textAfter(){return this.textAfterPos(this.pos);}
get baseIndent(){let line=this.state.doc.lineAt(this.node.from);for(;;){let atBreak=this.node.resolve(line.from);while(atBreak.parent&&atBreak.parent.from==atBreak.from)
atBreak=atBreak.parent;if(isParent(atBreak,this.node))
break;line=this.state.doc.lineAt(atBreak.from);}
return this.lineIndent(line.from);}
continue(){let parent=this.node.parent;return parent?indentFrom(parent,this.pos,this.base):0;}}
function isParent(parent,of){for(let cur=of;cur;cur=cur.parent)
if(parent==cur)
return true;return false;}
function bracketedAligned(context){let tree=context.node;let openToken=tree.childAfter(tree.from),last=tree.lastChild;if(!openToken)
return null;let sim=context.options.simulateBreak;let openLine=context.state.doc.lineAt(openToken.from);let lineEnd=sim==null||sim<=openLine.from?openLine.to:Math.min(openLine.to,sim);for(let pos=openToken.to;;){let next=tree.childAfter(pos);if(!next||next==last)
return null;if(!next.type.isSkipped)
return next.from<lineEnd?openToken:null;pos=next.to;}}
function delimitedStrategy(context,align,units,closing,closedAt){let after=context.textAfter,space=after.match(/^\s*/)[0].length;let closed=closing&&after.slice(space,space+closing.length)==closing||closedAt==context.pos+space;let aligned=align?bracketedAligned(context):null;if(aligned)
return closed?context.column(aligned.from):context.column(aligned.to);return context.baseIndent+(closed?0:context.unit*units);}
const DefaultScanDist=10000,DefaultBrackets="()[]{}";function matchingNodes(node,dir,brackets){let byProp=node.prop(dir<0?NodeProp.openedBy:NodeProp.closedBy);if(byProp)
return byProp;if(node.name.length==1){let index=brackets.indexOf(node.name);if(index>-1&&index%2==(dir<0?1:0))
return[brackets[index+dir]];}
return null;}
function matchBrackets(state,pos,dir,config={}){let maxScanDistance=config.maxScanDistance||DefaultScanDist,brackets=config.brackets||DefaultBrackets;let tree=syntaxTree(state),node=tree.resolveInner(pos,dir);for(let cur=node;cur;cur=cur.parent){let matches=matchingNodes(cur.type,dir,brackets);if(matches&&cur.from<cur.to)
return matchMarkedBrackets(state,pos,dir,cur,matches,brackets);}
return matchPlainBrackets(state,pos,dir,tree,node.type,maxScanDistance,brackets);}
function matchMarkedBrackets(_state,_pos,dir,token,matching,brackets){let parent=token.parent,firstToken={from:token.from,to:token.to};let depth=0,cursor=parent===null||parent===void 0?void 0:parent.cursor();if(cursor&&(dir<0?cursor.childBefore(token.from):cursor.childAfter(token.to)))
do{if(dir<0?cursor.to<=token.from:cursor.from>=token.to){if(depth==0&&matching.indexOf(cursor.type.name)>-1&&cursor.from<cursor.to){return{start:firstToken,end:{from:cursor.from,to:cursor.to},matched:true};}
else if(matchingNodes(cursor.type,dir,brackets)){depth++;}
else if(matchingNodes(cursor.type,-dir,brackets)){depth--;if(depth==0)
return{start:firstToken,end:cursor.from==cursor.to?undefined:{from:cursor.from,to:cursor.to},matched:false};}}}while(dir<0?cursor.prevSibling():cursor.nextSibling());return{start:firstToken,matched:false};}
function matchPlainBrackets(state,pos,dir,tree,tokenType,maxScanDistance,brackets){let startCh=dir<0?state.sliceDoc(pos-1,pos):state.sliceDoc(pos,pos+1);let bracket=brackets.indexOf(startCh);if(bracket<0||(bracket%2==0)!=(dir>0))
return null;let startToken={from:dir<0?pos-1:pos,to:dir>0?pos+1:pos};let iter=state.doc.iterRange(pos,dir>0?state.doc.length:0),depth=0;for(let distance=0;!(iter.next()).done&&distance<=maxScanDistance;){let text=iter.value;if(dir<0)
distance+=text.length;let basePos=pos+distance*dir;for(let pos=dir>0?0:text.length-1,end=dir>0?text.length:-1;pos!=end;pos+=dir){let found=brackets.indexOf(text[pos]);if(found<0||tree.resolve(basePos+pos,1).type!=tokenType)
continue;if((found%2==0)==(dir>0)){depth++;}
else if(depth==1){return{start:startToken,end:{from:basePos+pos,to:basePos+pos+1},matched:(found>>1)==(bracket>>1)};}
else{depth--;}}
if(dir>0)
distance+=text.length;}
return iter.done?{start:startToken,matched:false}:null;}
const noTokens=Object.create(null);const typeArray=[NodeType.none];const warned=[];const defaultTable=Object.create(null);for(let[legacyName,name]of[["variable","variableName"],["variable-2","variableName.special"],["string-2","string.special"],["def","variableName.definition"],["tag","typeName"],["attribute","propertyName"],["type","typeName"],["builtin","variableName.standard"],["qualifier","modifier"],["error","invalid"],["header","heading"],["property","propertyName"]])
defaultTable[legacyName]=createTokenType(noTokens,name);function warnForPart(part,msg){if(warned.indexOf(part)>-1)
return;warned.push(part);console.warn(msg);}
function createTokenType(extra,tagStr){let tag=null;for(let part of tagStr.split(".")){let value=(extra[part]||tags[part]);if(!value){warnForPart(part,`Unknown highlighting tag ${part}`);}
else if(typeof value=="function"){if(!tag)
warnForPart(part,`Modifier ${part} used at start of tag`);else
tag=value(tag);}
else{if(tag)
warnForPart(part,`Tag ${part} used as modifier`);else
tag=value;}}
if(!tag)
return 0;let name=tagStr.replace(/ /g,"_"),type=NodeType.define({id:typeArray.length,name,props:[styleTags({[name]:tag})]});typeArray.push(type);return type.id;}
const toggleComment=target=>{let config=getConfig(target.state);return config.line?toggleLineComment(target):config.block?toggleBlockCommentByLine(target):false;};function command(f,option){return({state,dispatch})=>{if(state.readOnly)
return false;let tr=f(option,state);if(!tr)
return false;dispatch(state.update(tr));return true;};}
const toggleLineComment=command(changeLineComment,0);const lineComment=command(changeLineComment,1);const lineUncomment=command(changeLineComment,2);const toggleBlockComment=command(changeBlockComment,0);const blockComment=command(changeBlockComment,1);const blockUncomment=command(changeBlockComment,2);const toggleBlockCommentByLine=command((o,s)=>changeBlockComment(o,s,selectedLineRanges(s)),0);function getConfig(state,pos=state.selection.main.head){let data=state.languageDataAt("commentTokens",pos);return data.length?data[0]:{};}
const SearchMargin=50;function findBlockComment(state,{open,close},from,to){let textBefore=state.sliceDoc(from-SearchMargin,from);let textAfter=state.sliceDoc(to,to+SearchMargin);let spaceBefore=/\s*$/.exec(textBefore)[0].length,spaceAfter=/^\s*/.exec(textAfter)[0].length;let beforeOff=textBefore.length-spaceBefore;if(textBefore.slice(beforeOff-open.length,beforeOff)==open&&textAfter.slice(spaceAfter,spaceAfter+close.length)==close){return{open:{pos:from-spaceBefore,margin:spaceBefore&&1},close:{pos:to+spaceAfter,margin:spaceAfter&&1}};}
let startText,endText;if(to-from<=2*SearchMargin){startText=endText=state.sliceDoc(from,to);}
else{startText=state.sliceDoc(from,from+SearchMargin);endText=state.sliceDoc(to-SearchMargin,to);}
let startSpace=/^\s*/.exec(startText)[0].length,endSpace=/\s*$/.exec(endText)[0].length;let endOff=endText.length-endSpace-close.length;if(startText.slice(startSpace,startSpace+open.length)==open&&endText.slice(endOff,endOff+close.length)==close){return{open:{pos:from+startSpace+open.length,margin:/\s/.test(startText.charAt(startSpace+open.length))?1:0},close:{pos:to-endSpace-close.length,margin:/\s/.test(endText.charAt(endOff-1))?1:0}};}
return null;}
function selectedLineRanges(state){let ranges=[];for(let r of state.selection.ranges){let fromLine=state.doc.lineAt(r.from);let toLine=r.to<=fromLine.to?fromLine:state.doc.lineAt(r.to);let last=ranges.length-1;if(last>=0&&ranges[last].to>fromLine.from)
ranges[last].to=toLine.to;else
ranges.push({from:fromLine.from,to:toLine.to});}
return ranges;}
function changeBlockComment(option,state,ranges=state.selection.ranges){let tokens=ranges.map(r=>getConfig(state,r.from).block);if(!tokens.every(c=>c))
return null;let comments=ranges.map((r,i)=>findBlockComment(state,tokens[i],r.from,r.to));if(option!=2&&!comments.every(c=>c)){return{changes:state.changes(ranges.map((range,i)=>{if(comments[i])
return[];return[{from:range.from,insert:tokens[i].open+" "},{from:range.to,insert:" "+tokens[i].close}];}))};}
else if(option!=1&&comments.some(c=>c)){let changes=[];for(let i=0,comment;i<comments.length;i++)
if(comment=comments[i]){let token=tokens[i],{open,close}=comment;changes.push({from:open.pos-token.open.length,to:open.pos+open.margin},{from:close.pos-close.margin,to:close.pos+token.close.length});}
return{changes};}
return null;}
function changeLineComment(option,state,ranges=state.selection.ranges){let lines=[];let prevLine=-1;for(let{from,to}of ranges){let startI=lines.length,minIndent=1e9;for(let pos=from;pos<=to;){let line=state.doc.lineAt(pos);if(line.from>prevLine&&(from==to||to>line.from)){prevLine=line.from;let token=getConfig(state,pos).line;if(!token)
continue;let indent=/^\s*/.exec(line.text)[0].length;let empty=indent==line.length;let comment=line.text.slice(indent,indent+token.length)==token?indent:-1;if(indent<line.text.length&&indent<minIndent)
minIndent=indent;lines.push({line,comment,token,indent,empty,single:false});}
pos=line.to+1;}
if(minIndent<1e9)
for(let i=startI;i<lines.length;i++)
if(lines[i].indent<lines[i].line.text.length)
lines[i].indent=minIndent;if(lines.length==startI+1)
lines[startI].single=true;}
if(option!=2&&lines.some(l=>l.comment<0&&(!l.empty||l.single))){let changes=[];for(let{line,token,indent,empty,single}of lines)
if(single||!empty)
changes.push({from:line.from+indent,insert:token+" "});let changeSet=state.changes(changes);return{changes:changeSet,selection:state.selection.map(changeSet,1)};}
else if(option!=1&&lines.some(l=>l.comment>=0)){let changes=[];for(let{line,comment,token}of lines)
if(comment>=0){let from=line.from+comment,to=from+token.length;if(line.text[to-line.from]==" ")
to++;changes.push({from,to});}
return{changes};}
return null;}
const fromHistory=Annotation.define();const isolateHistory=Annotation.define();const invertedEffects=Facet.define();const historyConfig=Facet.define({combine(configs){return combineConfig(configs,{minDepth:100,newGroupDelay:500},{minDepth:Math.max,newGroupDelay:Math.min});}});function changeEnd(changes){let end=0;changes.iterChangedRanges((_,to)=>end=to);return end;}
const historyField_=StateField.define({create(){return HistoryState.empty;},update(state,tr){let config=tr.state.facet(historyConfig);let fromHist=tr.annotation(fromHistory);if(fromHist){let selection=tr.docChanged?EditorSelection.single(changeEnd(tr.changes)):undefined;let item=HistEvent.fromTransaction(tr,selection),from=fromHist.side;let other=from==0?state.undone:state.done;if(item)
other=updateBranch(other,other.length,config.minDepth,item);else
other=addSelection(other,tr.startState.selection);return new HistoryState(from==0?fromHist.rest:other,from==0?other:fromHist.rest);}
let isolate=tr.annotation(isolateHistory);if(isolate=="full"||isolate=="before")
state=state.isolate();if(tr.annotation(Transaction.addToHistory)===false)
return!tr.changes.empty?state.addMapping(tr.changes.desc):state;let event=HistEvent.fromTransaction(tr);let time=tr.annotation(Transaction.time),userEvent=tr.annotation(Transaction.userEvent);if(event)
state=state.addChanges(event,time,userEvent,config.newGroupDelay,config.minDepth);else if(tr.selection)
state=state.addSelection(tr.startState.selection,time,userEvent,config.newGroupDelay);if(isolate=="full"||isolate=="after")
state=state.isolate();return state;},toJSON(value){return{done:value.done.map(e=>e.toJSON()),undone:value.undone.map(e=>e.toJSON())};},fromJSON(json){return new HistoryState(json.done.map(HistEvent.fromJSON),json.undone.map(HistEvent.fromJSON));}});function history(config={}){return[historyField_,historyConfig.of(config),EditorView.domEventHandlers({beforeinput(e,view){let command=e.inputType=="historyUndo"?undo:e.inputType=="historyRedo"?redo:null;if(!command)
return false;e.preventDefault();return command(view);}})];}
const historyField=historyField_;function cmd(side,selection){return function({state,dispatch}){if(!selection&&state.readOnly)
return false;let historyState=state.field(historyField_,false);if(!historyState)
return false;let tr=historyState.pop(side,state,selection);if(!tr)
return false;dispatch(tr);return true;};}
const undo=cmd(0,false);const redo=cmd(1,false);const undoSelection=cmd(0,true);const redoSelection=cmd(1,true);function depth(side){return function(state){let histState=state.field(historyField_,false);if(!histState)
return 0;let branch=side==0?histState.done:histState.undone;return branch.length-(branch.length&&!branch[0].changes?1:0);};}
const undoDepth=depth(0);const redoDepth=depth(1);class HistEvent{constructor(changes,effects,mapped,startSelection,selectionsAfter){this.changes=changes;this.effects=effects;this.mapped=mapped;this.startSelection=startSelection;this.selectionsAfter=selectionsAfter;}
setSelAfter(after){return new HistEvent(this.changes,this.effects,this.mapped,this.startSelection,after);}
toJSON(){var _a,_b,_c;return{changes:(_a=this.changes)===null||_a===void 0?void 0:_a.toJSON(),mapped:(_b=this.mapped)===null||_b===void 0?void 0:_b.toJSON(),startSelection:(_c=this.startSelection)===null||_c===void 0?void 0:_c.toJSON(),selectionsAfter:this.selectionsAfter.map(s=>s.toJSON())};}
static fromJSON(json){return new HistEvent(json.changes&&ChangeSet.fromJSON(json.changes),[],json.mapped&&ChangeDesc.fromJSON(json.mapped),json.startSelection&&EditorSelection.fromJSON(json.startSelection),json.selectionsAfter.map(EditorSelection.fromJSON));}
static fromTransaction(tr,selection){let effects=none;for(let invert of tr.startState.facet(invertedEffects)){let result=invert(tr);if(result.length)
effects=effects.concat(result);}
if(!effects.length&&tr.changes.empty)
return null;return new HistEvent(tr.changes.invert(tr.startState.doc),effects,undefined,selection||tr.startState.selection,none);}
static selection(selections){return new HistEvent(undefined,none,undefined,undefined,selections);}}
function updateBranch(branch,to,maxLen,newEvent){let start=to+1>maxLen+20?to-maxLen-1:0;let newBranch=branch.slice(start,to);newBranch.push(newEvent);return newBranch;}
function isAdjacent(a,b){let ranges=[],isAdjacent=false;a.iterChangedRanges((f,t)=>ranges.push(f,t));b.iterChangedRanges((_f,_t,f,t)=>{for(let i=0;i<ranges.length;){let from=ranges[i++],to=ranges[i++];if(t>=from&&f<=to)
isAdjacent=true;}});return isAdjacent;}
function eqSelectionShape(a,b){return a.ranges.length==b.ranges.length&&a.ranges.filter((r,i)=>r.empty!=b.ranges[i].empty).length===0;}
function conc(a,b){return!a.length?b:!b.length?a:a.concat(b);}
const none=[];const MaxSelectionsPerEvent=200;function addSelection(branch,selection){if(!branch.length){return[HistEvent.selection([selection])];}
else{let lastEvent=branch[branch.length-1];let sels=lastEvent.selectionsAfter.slice(Math.max(0,lastEvent.selectionsAfter.length-MaxSelectionsPerEvent));if(sels.length&&sels[sels.length-1].eq(selection))
return branch;sels.push(selection);return updateBranch(branch,branch.length-1,1e9,lastEvent.setSelAfter(sels));}}
function popSelection(branch){let last=branch[branch.length-1];let newBranch=branch.slice();newBranch[branch.length-1]=last.setSelAfter(last.selectionsAfter.slice(0,last.selectionsAfter.length-1));return newBranch;}
function addMappingToBranch(branch,mapping){if(!branch.length)
return branch;let length=branch.length,selections=none;while(length){let event=mapEvent(branch[length-1],mapping,selections);if(event.changes&&!event.changes.empty||event.effects.length){let result=branch.slice(0,length);result[length-1]=event;return result;}
else{mapping=event.mapped;length--;selections=event.selectionsAfter;}}
return selections.length?[HistEvent.selection(selections)]:none;}
function mapEvent(event,mapping,extraSelections){let selections=conc(event.selectionsAfter.length?event.selectionsAfter.map(s=>s.map(mapping)):none,extraSelections);if(!event.changes)
return HistEvent.selection(selections);let mappedChanges=event.changes.map(mapping),before=mapping.mapDesc(event.changes,true);let fullMapping=event.mapped?event.mapped.composeDesc(before):before;return new HistEvent(mappedChanges,StateEffect.mapEffects(event.effects,mapping),fullMapping,event.startSelection.map(before),selections);}
const joinableUserEvent=/^(input\.type|delete)($|\.)/;class HistoryState{constructor(done,undone,prevTime=0,prevUserEvent=undefined){this.done=done;this.undone=undone;this.prevTime=prevTime;this.prevUserEvent=prevUserEvent;}
isolate(){return this.prevTime?new HistoryState(this.done,this.undone):this;}
addChanges(event,time,userEvent,newGroupDelay,maxLen){let done=this.done,lastEvent=done[done.length-1];if(lastEvent&&lastEvent.changes&&!lastEvent.changes.empty&&event.changes&&(!userEvent||joinableUserEvent.test(userEvent))&&((!lastEvent.selectionsAfter.length&&time-this.prevTime<newGroupDelay&&isAdjacent(lastEvent.changes,event.changes))||userEvent=="input.type.compose")){done=updateBranch(done,done.length-1,maxLen,new HistEvent(event.changes.compose(lastEvent.changes),conc(event.effects,lastEvent.effects),lastEvent.mapped,lastEvent.startSelection,none));}
else{done=updateBranch(done,done.length,maxLen,event);}
return new HistoryState(done,none,time,userEvent);}
addSelection(selection,time,userEvent,newGroupDelay){let last=this.done.length?this.done[this.done.length-1].selectionsAfter:none;if(last.length>0&&time-this.prevTime<newGroupDelay&&userEvent==this.prevUserEvent&&userEvent&&/^select($|\.)/.test(userEvent)&&eqSelectionShape(last[last.length-1],selection))
return this;return new HistoryState(addSelection(this.done,selection),this.undone,time,userEvent);}
addMapping(mapping){return new HistoryState(addMappingToBranch(this.done,mapping),addMappingToBranch(this.undone,mapping),this.prevTime,this.prevUserEvent);}
pop(side,state,selection){let branch=side==0?this.done:this.undone;if(branch.length==0)
return null;let event=branch[branch.length-1];if(selection&&event.selectionsAfter.length){return state.update({selection:event.selectionsAfter[event.selectionsAfter.length-1],annotations:fromHistory.of({side,rest:popSelection(branch)}),userEvent:side==0?"select.undo":"select.redo",scrollIntoView:true});}
else if(!event.changes){return null;}
else{let rest=branch.length==1?none:branch.slice(0,branch.length-1);if(event.mapped)
rest=addMappingToBranch(rest,event.mapped);return state.update({changes:event.changes,selection:event.startSelection,effects:event.effects,annotations:fromHistory.of({side,rest}),filter:false,userEvent:side==0?"undo":"redo",scrollIntoView:true});}}}
HistoryState.empty=new HistoryState(none,none);const historyKeymap=[{key:"Mod-z",run:undo,preventDefault:true},{key:"Mod-y",mac:"Mod-Shift-z",run:redo,preventDefault:true},{key:"Mod-u",run:undoSelection,preventDefault:true},{key:"Alt-u",mac:"Mod-Shift-u",run:redoSelection,preventDefault:true}];function updateSel(sel,by){return EditorSelection.create(sel.ranges.map(by),sel.mainIndex);}
function setSel(state,selection){return state.update({selection,scrollIntoView:true,userEvent:"select"});}
function moveSel({state,dispatch},how){let selection=updateSel(state.selection,how);if(selection.eq(state.selection))
return false;dispatch(setSel(state,selection));return true;}
function rangeEnd(range,forward){return EditorSelection.cursor(forward?range.to:range.from);}
function cursorByChar(view,forward){return moveSel(view,range=>range.empty?view.moveByChar(range,forward):rangeEnd(range,forward));}
function ltrAtCursor(view){return view.textDirectionAt(view.state.selection.main.head)==Direction.LTR;}
const cursorCharLeft=view=>cursorByChar(view,!ltrAtCursor(view));const cursorCharRight=view=>cursorByChar(view,ltrAtCursor(view));const cursorCharForward=view=>cursorByChar(view,true);const cursorCharBackward=view=>cursorByChar(view,false);function cursorByGroup(view,forward){return moveSel(view,range=>range.empty?view.moveByGroup(range,forward):rangeEnd(range,forward));}
const cursorGroupLeft=view=>cursorByGroup(view,!ltrAtCursor(view));const cursorGroupRight=view=>cursorByGroup(view,ltrAtCursor(view));const cursorGroupForward=view=>cursorByGroup(view,true);const cursorGroupBackward=view=>cursorByGroup(view,false);function moveBySubword(view,range,forward){let categorize=view.state.charCategorizer(range.from);return view.moveByChar(range,forward,start=>{let cat=CharCategory.Space,pos=range.from;let done=false,sawUpper=false,sawLower=false;let step=(next)=>{if(done)
return false;pos+=forward?next.length:-next.length;let nextCat=categorize(next),ahead;if(cat==CharCategory.Space)
cat=nextCat;if(cat!=nextCat)
return false;if(cat==CharCategory.Word){if(next.toLowerCase()==next){if(!forward&&sawUpper)
return false;sawLower=true;}
else if(sawLower){if(forward)
return false;done=true;}
else{if(sawUpper&&forward&&categorize(ahead=view.state.sliceDoc(pos,pos+1))==CharCategory.Word&&ahead.toLowerCase()==ahead)
return false;sawUpper=true;}}
return true;};step(start);return step;});}
function cursorBySubword(view,forward){return moveSel(view,range=>range.empty?moveBySubword(view,range,forward):rangeEnd(range,forward));}
const cursorSubwordForward=view=>cursorBySubword(view,true);const cursorSubwordBackward=view=>cursorBySubword(view,false);function interestingNode(state,node,bracketProp){if(node.type.prop(bracketProp))
return true;let len=node.to-node.from;return len&&(len>2||/[^\s,.;:]/.test(state.sliceDoc(node.from,node.to)))||node.firstChild;}
function moveBySyntax(state,start,forward){let pos=syntaxTree(state).resolveInner(start.head);let bracketProp=forward?NodeProp.closedBy:NodeProp.openedBy;for(let at=start.head;;){let next=forward?pos.childAfter(at):pos.childBefore(at);if(!next)
break;if(interestingNode(state,next,bracketProp))
pos=next;else
at=forward?next.to:next.from;}
let bracket=pos.type.prop(bracketProp),match,newPos;if(bracket&&(match=forward?matchBrackets(state,pos.from,1):matchBrackets(state,pos.to,-1))&&match.matched)
newPos=forward?match.end.to:match.end.from;else
newPos=forward?pos.to:pos.from;return EditorSelection.cursor(newPos,forward?-1:1);}
const cursorSyntaxLeft=view=>moveSel(view,range=>moveBySyntax(view.state,range,!ltrAtCursor(view)));const cursorSyntaxRight=view=>moveSel(view,range=>moveBySyntax(view.state,range,ltrAtCursor(view)));function cursorByLine(view,forward){return moveSel(view,range=>{if(!range.empty)
return rangeEnd(range,forward);let moved=view.moveVertically(range,forward);return moved.head!=range.head?moved:view.moveToLineBoundary(range,forward);});}
const cursorLineUp=view=>cursorByLine(view,false);const cursorLineDown=view=>cursorByLine(view,true);function pageHeight(view){return Math.max(view.defaultLineHeight,Math.min(view.dom.clientHeight,innerHeight)-5);}
function cursorByPage(view,forward){let{state}=view,selection=updateSel(state.selection,range=>{return range.empty?view.moveVertically(range,forward,pageHeight(view)):rangeEnd(range,forward);});if(selection.eq(state.selection))
return false;let startPos=view.coordsAtPos(state.selection.main.head);let scrollRect=view.scrollDOM.getBoundingClientRect();let effect;if(startPos&&startPos.top>scrollRect.top&&startPos.bottom<scrollRect.bottom&&startPos.top-scrollRect.top<=view.scrollDOM.scrollHeight-view.scrollDOM.scrollTop-view.scrollDOM.clientHeight)
effect=EditorView.scrollIntoView(selection.main.head,{y:"start",yMargin:startPos.top-scrollRect.top});view.dispatch(setSel(state,selection),{effects:effect});return true;}
const cursorPageUp=view=>cursorByPage(view,false);const cursorPageDown=view=>cursorByPage(view,true);function moveByLineBoundary(view,start,forward){let line=view.lineBlockAt(start.head),moved=view.moveToLineBoundary(start,forward);if(moved.head==start.head&&moved.head!=(forward?line.to:line.from))
moved=view.moveToLineBoundary(start,forward,false);if(!forward&&moved.head==line.from&&line.length){let space=/^\s*/.exec(view.state.sliceDoc(line.from,Math.min(line.from+100,line.to)))[0].length;if(space&&start.head!=line.from+space)
moved=EditorSelection.cursor(line.from+space);}
return moved;}
const cursorLineBoundaryForward=view=>moveSel(view,range=>moveByLineBoundary(view,range,true));const cursorLineBoundaryBackward=view=>moveSel(view,range=>moveByLineBoundary(view,range,false));const cursorLineStart=view=>moveSel(view,range=>EditorSelection.cursor(view.lineBlockAt(range.head).from,1));const cursorLineEnd=view=>moveSel(view,range=>EditorSelection.cursor(view.lineBlockAt(range.head).to,-1));function toMatchingBracket(state,dispatch,extend){let found=false,selection=updateSel(state.selection,range=>{let matching=matchBrackets(state,range.head,-1)||matchBrackets(state,range.head,1)||(range.head>0&&matchBrackets(state,range.head-1,1))||(range.head<state.doc.length&&matchBrackets(state,range.head+1,-1));if(!matching||!matching.end)
return range;found=true;let head=matching.start.from==range.head?matching.end.to:matching.end.from;return extend?EditorSelection.range(range.anchor,head):EditorSelection.cursor(head);});if(!found)
return false;dispatch(setSel(state,selection));return true;}
const cursorMatchingBracket=({state,dispatch})=>toMatchingBracket(state,dispatch,false);const selectMatchingBracket=({state,dispatch})=>toMatchingBracket(state,dispatch,true);function extendSel(view,how){let selection=updateSel(view.state.selection,range=>{let head=how(range);return EditorSelection.range(range.anchor,head.head,head.goalColumn);});if(selection.eq(view.state.selection))
return false;view.dispatch(setSel(view.state,selection));return true;}
function selectByChar(view,forward){return extendSel(view,range=>view.moveByChar(range,forward));}
const selectCharLeft=view=>selectByChar(view,!ltrAtCursor(view));const selectCharRight=view=>selectByChar(view,ltrAtCursor(view));const selectCharForward=view=>selectByChar(view,true);const selectCharBackward=view=>selectByChar(view,false);function selectByGroup(view,forward){return extendSel(view,range=>view.moveByGroup(range,forward));}
const selectGroupLeft=view=>selectByGroup(view,!ltrAtCursor(view));const selectGroupRight=view=>selectByGroup(view,ltrAtCursor(view));const selectGroupForward=view=>selectByGroup(view,true);const selectGroupBackward=view=>selectByGroup(view,false);function selectBySubword(view,forward){return extendSel(view,range=>moveBySubword(view,range,forward));}
const selectSubwordForward=view=>selectBySubword(view,true);const selectSubwordBackward=view=>selectBySubword(view,false);const selectSyntaxLeft=view=>extendSel(view,range=>moveBySyntax(view.state,range,!ltrAtCursor(view)));const selectSyntaxRight=view=>extendSel(view,range=>moveBySyntax(view.state,range,ltrAtCursor(view)));function selectByLine(view,forward){return extendSel(view,range=>view.moveVertically(range,forward));}
const selectLineUp=view=>selectByLine(view,false);const selectLineDown=view=>selectByLine(view,true);function selectByPage(view,forward){return extendSel(view,range=>view.moveVertically(range,forward,pageHeight(view)));}
const selectPageUp=view=>selectByPage(view,false);const selectPageDown=view=>selectByPage(view,true);const selectLineBoundaryForward=view=>extendSel(view,range=>moveByLineBoundary(view,range,true));const selectLineBoundaryBackward=view=>extendSel(view,range=>moveByLineBoundary(view,range,false));const selectLineStart=view=>extendSel(view,range=>EditorSelection.cursor(view.lineBlockAt(range.head).from));const selectLineEnd=view=>extendSel(view,range=>EditorSelection.cursor(view.lineBlockAt(range.head).to));const cursorDocStart=({state,dispatch})=>{dispatch(setSel(state,{anchor:0}));return true;};const cursorDocEnd=({state,dispatch})=>{dispatch(setSel(state,{anchor:state.doc.length}));return true;};const selectDocStart=({state,dispatch})=>{dispatch(setSel(state,{anchor:state.selection.main.anchor,head:0}));return true;};const selectDocEnd=({state,dispatch})=>{dispatch(setSel(state,{anchor:state.selection.main.anchor,head:state.doc.length}));return true;};const selectAll=({state,dispatch})=>{dispatch(state.update({selection:{anchor:0,head:state.doc.length},userEvent:"select"}));return true;};const selectLine=({state,dispatch})=>{let ranges=selectedLineBlocks(state).map(({from,to})=>EditorSelection.range(from,Math.min(to+1,state.doc.length)));dispatch(state.update({selection:EditorSelection.create(ranges),userEvent:"select"}));return true;};const selectParentSyntax=({state,dispatch})=>{let selection=updateSel(state.selection,range=>{var _a;let context=syntaxTree(state).resolveInner(range.head,1);while(!((context.from<range.from&&context.to>=range.to)||(context.to>range.to&&context.from<=range.from)||!((_a=context.parent)===null||_a===void 0?void 0:_a.parent)))
context=context.parent;return EditorSelection.range(context.to,context.from);});dispatch(setSel(state,selection));return true;};const simplifySelection=({state,dispatch})=>{let cur=state.selection,selection=null;if(cur.ranges.length>1)
selection=EditorSelection.create([cur.main]);else if(!cur.main.empty)
selection=EditorSelection.create([EditorSelection.cursor(cur.main.head)]);if(!selection)
return false;dispatch(setSel(state,selection));return true;};function deleteBy({state,dispatch},by){if(state.readOnly)
return false;let event="delete.selection";let changes=state.changeByRange(range=>{let{from,to}=range;if(from==to){let towards=by(from);if(towards<from)
event="delete.backward";else if(towards>from)
event="delete.forward";from=Math.min(from,towards);to=Math.max(to,towards);}
return from==to?{range}:{changes:{from,to},range:EditorSelection.cursor(from)};});if(changes.changes.empty)
return false;dispatch(state.update(changes,{scrollIntoView:true,userEvent:event}));return true;}
function skipAtomic(target,pos,forward){if(target instanceof EditorView)
for(let ranges of target.state.facet(EditorView.atomicRanges).map(f=>f(target)))
ranges.between(pos,pos,(from,to)=>{if(from<pos&&to>pos)
pos=forward?to:from;});return pos;}
const deleteByChar=(target,forward)=>deleteBy(target,pos=>{let{state}=target,line=state.doc.lineAt(pos),before,targetPos;if(!forward&&pos>line.from&&pos<line.from+200&&!/[^ \t]/.test(before=line.text.slice(0,pos-line.from))){if(before[before.length-1]=="\t")
return pos-1;let col=countColumn(before,state.tabSize),drop=col%getIndentUnit(state)||getIndentUnit(state);for(let i=0;i<drop&&before[before.length-1-i]==" ";i++)
pos--;targetPos=pos;}
else{targetPos=findClusterBreak(line.text,pos-line.from,forward,forward)+line.from;if(targetPos==pos&&line.number!=(forward?state.doc.lines:1))
targetPos+=forward?1:-1;}
return skipAtomic(target,targetPos,forward);});const deleteCharBackward=view=>deleteByChar(view,false);const deleteCharForward=view=>deleteByChar(view,true);const deleteByGroup=(target,forward)=>deleteBy(target,start=>{let pos=start,{state}=target,line=state.doc.lineAt(pos);let categorize=state.charCategorizer(pos);for(let cat=null;;){if(pos==(forward?line.to:line.from)){if(pos==start&&line.number!=(forward?state.doc.lines:1))
pos+=forward?1:-1;break;}
let next=findClusterBreak(line.text,pos-line.from,forward)+line.from;let nextChar=line.text.slice(Math.min(pos,next)-line.from,Math.max(pos,next)-line.from);let nextCat=categorize(nextChar);if(cat!=null&&nextCat!=cat)
break;if(nextChar!=" "||pos!=start)
cat=nextCat;pos=next;}
return skipAtomic(target,pos,forward);});const deleteGroupBackward=target=>deleteByGroup(target,false);const deleteGroupForward=target=>deleteByGroup(target,true);const deleteToLineEnd=view=>deleteBy(view,pos=>{let lineEnd=view.lineBlockAt(pos).to;return skipAtomic(view,pos<lineEnd?lineEnd:Math.min(view.state.doc.length,pos+1),true);});const deleteToLineStart=view=>deleteBy(view,pos=>{let lineStart=view.lineBlockAt(pos).from;return skipAtomic(view,pos>lineStart?lineStart:Math.max(0,pos-1),false);});const deleteTrailingWhitespace=({state,dispatch})=>{if(state.readOnly)
return false;let changes=[];for(let pos=0,prev="",iter=state.doc.iter();;){iter.next();if(iter.lineBreak||iter.done){let trailing=prev.search(/\s+$/);if(trailing>-1)
changes.push({from:pos-(prev.length-trailing),to:pos});if(iter.done)
break;prev="";}
else{prev=iter.value;}
pos+=iter.value.length;}
if(!changes.length)
return false;dispatch(state.update({changes,userEvent:"delete"}));return true;};const splitLine=({state,dispatch})=>{if(state.readOnly)
return false;let changes=state.changeByRange(range=>{return{changes:{from:range.from,to:range.to,insert:Text.of(["",""])},range:EditorSelection.cursor(range.from)};});dispatch(state.update(changes,{scrollIntoView:true,userEvent:"input"}));return true;};const transposeChars=({state,dispatch})=>{if(state.readOnly)
return false;let changes=state.changeByRange(range=>{if(!range.empty||range.from==0||range.from==state.doc.length)
return{range};let pos=range.from,line=state.doc.lineAt(pos);let from=pos==line.from?pos-1:findClusterBreak(line.text,pos-line.from,false)+line.from;let to=pos==line.to?pos+1:findClusterBreak(line.text,pos-line.from,true)+line.from;return{changes:{from,to,insert:state.doc.slice(pos,to).append(state.doc.slice(from,pos))},range:EditorSelection.cursor(to)};});if(changes.changes.empty)
return false;dispatch(state.update(changes,{scrollIntoView:true,userEvent:"move.character"}));return true;};function selectedLineBlocks(state){let blocks=[],upto=-1;for(let range of state.selection.ranges){let startLine=state.doc.lineAt(range.from),endLine=state.doc.lineAt(range.to);if(!range.empty&&range.to==endLine.from)
endLine=state.doc.lineAt(range.to-1);if(upto>=startLine.number){let prev=blocks[blocks.length-1];prev.to=endLine.to;prev.ranges.push(range);}
else{blocks.push({from:startLine.from,to:endLine.to,ranges:[range]});}
upto=endLine.number+1;}
return blocks;}
function moveLine(state,dispatch,forward){if(state.readOnly)
return false;let changes=[],ranges=[];for(let block of selectedLineBlocks(state)){if(forward?block.to==state.doc.length:block.from==0)
continue;let nextLine=state.doc.lineAt(forward?block.to+1:block.from-1);let size=nextLine.length+1;if(forward){changes.push({from:block.to,to:nextLine.to},{from:block.from,insert:nextLine.text+state.lineBreak});for(let r of block.ranges)
ranges.push(EditorSelection.range(Math.min(state.doc.length,r.anchor+size),Math.min(state.doc.length,r.head+size)));}
else{changes.push({from:nextLine.from,to:block.from},{from:block.to,insert:state.lineBreak+nextLine.text});for(let r of block.ranges)
ranges.push(EditorSelection.range(r.anchor-size,r.head-size));}}
if(!changes.length)
return false;dispatch(state.update({changes,scrollIntoView:true,selection:EditorSelection.create(ranges,state.selection.mainIndex),userEvent:"move.line"}));return true;}
const moveLineUp=({state,dispatch})=>moveLine(state,dispatch,false);const moveLineDown=({state,dispatch})=>moveLine(state,dispatch,true);function copyLine(state,dispatch,forward){if(state.readOnly)
return false;let changes=[];for(let block of selectedLineBlocks(state)){if(forward)
changes.push({from:block.from,insert:state.doc.slice(block.from,block.to)+state.lineBreak});else
changes.push({from:block.to,insert:state.lineBreak+state.doc.slice(block.from,block.to)});}
dispatch(state.update({changes,scrollIntoView:true,userEvent:"input.copyline"}));return true;}
const copyLineUp=({state,dispatch})=>copyLine(state,dispatch,false);const copyLineDown=({state,dispatch})=>copyLine(state,dispatch,true);const deleteLine=view=>{if(view.state.readOnly)
return false;let{state}=view,changes=state.changes(selectedLineBlocks(state).map(({from,to})=>{if(from>0)
from--;else if(to<state.doc.length)
to++;return{from,to};}));let selection=updateSel(state.selection,range=>view.moveVertically(range,true)).map(changes);view.dispatch({changes,selection,scrollIntoView:true,userEvent:"delete.line"});return true;};const insertNewline=({state,dispatch})=>{dispatch(state.update(state.replaceSelection(state.lineBreak),{scrollIntoView:true,userEvent:"input"}));return true;};function isBetweenBrackets(state,pos){if(/\(\)|\[\]|\{\}/.test(state.sliceDoc(pos-1,pos+1)))
return{from:pos,to:pos};let context=syntaxTree(state).resolveInner(pos);let before=context.childBefore(pos),after=context.childAfter(pos),closedBy;if(before&&after&&before.to<=pos&&after.from>=pos&&(closedBy=before.type.prop(NodeProp.closedBy))&&closedBy.indexOf(after.name)>-1&&state.doc.lineAt(before.to).from==state.doc.lineAt(after.from).from)
return{from:before.to,to:after.from};return null;}
const insertNewlineAndIndent=newlineAndIndent(false);const insertBlankLine=newlineAndIndent(true);function newlineAndIndent(atEof){return({state,dispatch})=>{if(state.readOnly)
return false;let changes=state.changeByRange(range=>{let{from,to}=range,line=state.doc.lineAt(from);let explode=!atEof&&from==to&&isBetweenBrackets(state,from);if(atEof)
from=to=(to<=line.to?line:state.doc.lineAt(to)).to;let cx=new IndentContext(state,{simulateBreak:from,simulateDoubleBreak:!!explode});let indent=getIndentation(cx,from);if(indent==null)
indent=/^\s*/.exec(state.doc.lineAt(from).text)[0].length;while(to<line.to&&/\s/.test(line.text[to-line.from]))
to++;if(explode)
({from,to}=explode);else if(from>line.from&&from<line.from+100&&!/\S/.test(line.text.slice(0,from)))
from=line.from;let insert=["",indentString(state,indent)];if(explode)
insert.push(indentString(state,cx.lineIndent(line.from,-1)));return{changes:{from,to,insert:Text.of(insert)},range:EditorSelection.cursor(from+1+insert[1].length)};});dispatch(state.update(changes,{scrollIntoView:true,userEvent:"input"}));return true;};}
function changeBySelectedLine(state,f){let atLine=-1;return state.changeByRange(range=>{let changes=[];for(let pos=range.from;pos<=range.to;){let line=state.doc.lineAt(pos);if(line.number>atLine&&(range.empty||range.to>line.from)){f(line,changes,range);atLine=line.number;}
pos=line.to+1;}
let changeSet=state.changes(changes);return{changes,range:EditorSelection.range(changeSet.mapPos(range.anchor,1),changeSet.mapPos(range.head,1))};});}
const indentSelection=({state,dispatch})=>{if(state.readOnly)
return false;let updated=Object.create(null);let context=new IndentContext(state,{overrideIndentation:start=>{let found=updated[start];return found==null?-1:found;}});let changes=changeBySelectedLine(state,(line,changes,range)=>{let indent=getIndentation(context,line.from);if(indent==null)
return;if(!/\S/.test(line.text))
indent=0;let cur=/^\s*/.exec(line.text)[0];let norm=indentString(state,indent);if(cur!=norm||range.from<line.from+cur.length){updated[line.from]=indent;changes.push({from:line.from,to:line.from+cur.length,insert:norm});}});if(!changes.changes.empty)
dispatch(state.update(changes,{userEvent:"indent"}));return true;};const indentMore=({state,dispatch})=>{if(state.readOnly)
return false;dispatch(state.update(changeBySelectedLine(state,(line,changes)=>{changes.push({from:line.from,insert:state.facet(indentUnit)});}),{userEvent:"input.indent"}));return true;};const indentLess=({state,dispatch})=>{if(state.readOnly)
return false;dispatch(state.update(changeBySelectedLine(state,(line,changes)=>{let space=/^\s*/.exec(line.text)[0];if(!space)
return;let col=countColumn(space,state.tabSize),keep=0;let insert=indentString(state,Math.max(0,col-getIndentUnit(state)));while(keep<space.length&&keep<insert.length&&space.charCodeAt(keep)==insert.charCodeAt(keep))
keep++;changes.push({from:line.from+keep,to:line.from+space.length,insert:insert.slice(keep)});}),{userEvent:"delete.dedent"}));return true;};const insertTab=({state,dispatch})=>{if(state.selection.ranges.some(r=>!r.empty))
return indentMore({state,dispatch});dispatch(state.update(state.replaceSelection("\t"),{scrollIntoView:true,userEvent:"input"}));return true;};const emacsStyleKeymap=[{key:"Ctrl-b",run:cursorCharLeft,shift:selectCharLeft,preventDefault:true},{key:"Ctrl-f",run:cursorCharRight,shift:selectCharRight},{key:"Ctrl-p",run:cursorLineUp,shift:selectLineUp},{key:"Ctrl-n",run:cursorLineDown,shift:selectLineDown},{key:"Ctrl-a",run:cursorLineStart,shift:selectLineStart},{key:"Ctrl-e",run:cursorLineEnd,shift:selectLineEnd},{key:"Ctrl-d",run:deleteCharForward},{key:"Ctrl-h",run:deleteCharBackward},{key:"Ctrl-k",run:deleteToLineEnd},{key:"Ctrl-Alt-h",run:deleteGroupBackward},{key:"Ctrl-o",run:splitLine},{key:"Ctrl-t",run:transposeChars},{key:"Ctrl-v",run:cursorPageDown},];const standardKeymap=[{key:"ArrowLeft",run:cursorCharLeft,shift:selectCharLeft,preventDefault:true},{key:"Mod-ArrowLeft",mac:"Alt-ArrowLeft",run:cursorGroupLeft,shift:selectGroupLeft},{mac:"Cmd-ArrowLeft",run:cursorLineBoundaryBackward,shift:selectLineBoundaryBackward},{key:"ArrowRight",run:cursorCharRight,shift:selectCharRight,preventDefault:true},{key:"Mod-ArrowRight",mac:"Alt-ArrowRight",run:cursorGroupRight,shift:selectGroupRight},{mac:"Cmd-ArrowRight",run:cursorLineBoundaryForward,shift:selectLineBoundaryForward},{key:"ArrowUp",run:cursorLineUp,shift:selectLineUp,preventDefault:true},{mac:"Cmd-ArrowUp",run:cursorDocStart,shift:selectDocStart},{mac:"Ctrl-ArrowUp",run:cursorPageUp,shift:selectPageUp},{key:"ArrowDown",run:cursorLineDown,shift:selectLineDown,preventDefault:true},{mac:"Cmd-ArrowDown",run:cursorDocEnd,shift:selectDocEnd},{mac:"Ctrl-ArrowDown",run:cursorPageDown,shift:selectPageDown},{key:"PageUp",run:cursorPageUp,shift:selectPageUp},{key:"PageDown",run:cursorPageDown,shift:selectPageDown},{key:"Home",run:cursorLineBoundaryBackward,shift:selectLineBoundaryBackward,preventDefault:true},{key:"Mod-Home",run:cursorDocStart,shift:selectDocStart},{key:"End",run:cursorLineBoundaryForward,shift:selectLineBoundaryForward,preventDefault:true},{key:"Mod-End",run:cursorDocEnd,shift:selectDocEnd},{key:"Enter",run:insertNewlineAndIndent},{key:"Mod-a",run:selectAll},{key:"Backspace",run:deleteCharBackward,shift:deleteCharBackward},{key:"Delete",run:deleteCharForward},{key:"Mod-Backspace",mac:"Alt-Backspace",run:deleteGroupBackward},{key:"Mod-Delete",mac:"Alt-Delete",run:deleteGroupForward},{mac:"Mod-Backspace",run:deleteToLineStart},{mac:"Mod-Delete",run:deleteToLineEnd}].concat(emacsStyleKeymap.map(b=>({mac:b.key,run:b.run,shift:b.shift})));const defaultKeymap=[{key:"Alt-ArrowLeft",mac:"Ctrl-ArrowLeft",run:cursorSyntaxLeft,shift:selectSyntaxLeft},{key:"Alt-ArrowRight",mac:"Ctrl-ArrowRight",run:cursorSyntaxRight,shift:selectSyntaxRight},{key:"Alt-ArrowUp",run:moveLineUp},{key:"Shift-Alt-ArrowUp",run:copyLineUp},{key:"Alt-ArrowDown",run:moveLineDown},{key:"Shift-Alt-ArrowDown",run:copyLineDown},{key:"Escape",run:simplifySelection},{key:"Mod-Enter",run:insertBlankLine},{key:"Alt-l",mac:"Ctrl-l",run:selectLine},{key:"Mod-i",run:selectParentSyntax,preventDefault:true},{key:"Mod-[",run:indentLess},{key:"Mod-]",run:indentMore},{key:"Mod-Alt-\\",run:indentSelection},{key:"Shift-Mod-k",run:deleteLine},{key:"Shift-Mod-\\",run:cursorMatchingBracket},{key:"Mod-/",run:toggleComment},{key:"Alt-A",run:toggleBlockComment}].concat(standardKeymap);const indentWithTab={key:"Tab",run:indentMore,shift:indentLess};export{blockComment,blockUncomment,copyLineDown,copyLineUp,cursorCharBackward,cursorCharForward,cursorCharLeft,cursorCharRight,cursorDocEnd,cursorDocStart,cursorGroupBackward,cursorGroupForward,cursorGroupLeft,cursorGroupRight,cursorLineBoundaryBackward,cursorLineBoundaryForward,cursorLineDown,cursorLineEnd,cursorLineStart,cursorLineUp,cursorMatchingBracket,cursorPageDown,cursorPageUp,cursorSubwordBackward,cursorSubwordForward,cursorSyntaxLeft,cursorSyntaxRight,defaultKeymap,deleteCharBackward,deleteCharForward,deleteGroupBackward,deleteGroupForward,deleteLine,deleteToLineEnd,deleteToLineStart,deleteTrailingWhitespace,emacsStyleKeymap,history,historyField,historyKeymap,indentLess,indentMore,indentSelection,indentWithTab,insertBlankLine,insertNewline,insertNewlineAndIndent,insertTab,invertedEffects,isolateHistory,lineComment,lineUncomment,moveLineDown,moveLineUp,redo,redoDepth,redoSelection,selectAll,selectCharBackward,selectCharForward,selectCharLeft,selectCharRight,selectDocEnd,selectDocStart,selectGroupBackward,selectGroupForward,selectGroupLeft,selectGroupRight,selectLine,selectLineBoundaryBackward,selectLineBoundaryForward,selectLineDown,selectLineEnd,selectLineStart,selectLineUp,selectMatchingBracket,selectPageDown,selectPageUp,selectParentSyntax,selectSubwordBackward,selectSubwordForward,selectSyntaxLeft,selectSyntaxRight,simplifySelection,splitLine,standardKeymap,toggleBlockComment,toggleBlockCommentByLine,toggleComment,toggleLineComment,transposeChars,undo,undoDepth,undoSelection};