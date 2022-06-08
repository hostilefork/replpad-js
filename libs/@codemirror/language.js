import{Facet,EditorState,StateEffect,StateField,countColumn,RangeSet,RangeSetBuilder,combineConfig,Prec}from '../@codemirror/state.js';import{ViewPlugin,logException,EditorView,gutter,Decoration,WidgetType,GutterMarker}from '../@codemirror/view.js';const DefaultBufferLength=1024;let nextPropID=0;class Range{constructor(from,to){this.from=from;this.to=to;}}
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
NodeType.none=new NodeType("",Object.create(null),0,8);class NodeSet{constructor(types){this.types=types;for(let i=0;i<types.length;i++)
if(types[i].id!=i)
throw new RangeError("Node type ids should correspond to array positions when creating a node set");}
extend(...props){let newTypes=[];for(let type of this.types){let newProps=null;for(let source of props){let add=source(type);if(add){if(!newProps)
newProps=Object.assign({},type.props);newProps[add[0].id]=add[1];}}
newTypes.push(newProps?new NodeType(type.name,newProps,type.id,type.flags):type);}
return new NodeSet(newTypes);}}
const CachedNode=new WeakMap(),CachedInnerNode=new WeakMap();var IterMode;(function(IterMode){IterMode[IterMode["ExcludeBuffers"]=1]="ExcludeBuffers";IterMode[IterMode["IncludeAnonymous"]=2]="IncludeAnonymous";IterMode[IterMode["IgnoreMounts"]=4]="IgnoreMounts";IterMode[IterMode["IgnoreOverlays"]=8]="IgnoreOverlays";})(IterMode||(IterMode={}));class Tree{constructor(type,children,positions,length,props){this.type=type;this.children=children;this.positions=positions;this.length=length;this.props=null;if(props&&props.length){this.props=Object.create(null);for(let[prop,value]of props)
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
function highlightTags(highlighters,tags){let result=null;for(let highlighter of highlighters){let value=highlighter.style(tags);if(value)
result=result?result+" "+value:value;}
return result;}
function highlightTree(tree,highlighter,putStyle,from=0,to=tree.length){let builder=new HighlightBuilder(from,Array.isArray(highlighter)?highlighter:[highlighter],putStyle);builder.highlightRange(tree.cursor(),from,to,"",builder.highlighters);builder.flush(to);}
class HighlightBuilder{constructor(at,highlighters,span){this.at=at;this.highlighters=highlighters;this.span=span;this.class="";}
startSpan(at,cls){if(cls!=this.class){this.flush(at);if(at>this.at)
this.at=at;this.class=cls;}}
flush(to){if(to>this.at&&this.class)
this.span(this.at,to,this.class);}
highlightRange(cursor,from,to,inheritedClass,highlighters){let{type,from:start,to:end}=cursor;if(start>=to||end<=from)
return;if(type.isTop)
highlighters=this.highlighters.filter(h=>!h.scope||h.scope(type));let cls=inheritedClass;let rule=type.prop(ruleNodeProp),opaque=false;while(rule){if(!rule.context||cursor.matchContext(rule.context)){let tagCls=highlightTags(highlighters,rule.tags);if(tagCls){if(cls)
cls+=" ";cls+=tagCls;if(rule.mode==1)
inheritedClass+=(inheritedClass?" ":"")+tagCls;else if(rule.mode==0)
opaque=true;}
break;}
rule=rule.next;}
this.startSpan(cursor.from,cls);if(opaque)
return;let mounted=cursor.tree&&cursor.tree.prop(NodeProp.mounted);if(mounted&&mounted.overlay){let inner=cursor.node.enter(mounted.overlay[0].from+start,1);let innerHighlighters=this.highlighters.filter(h=>!h.scope||h.scope(mounted.tree.type));let hasChild=cursor.firstChild();for(let i=0,pos=start;;i++){let next=i<mounted.overlay.length?mounted.overlay[i]:null;let nextPos=next?next.from+start:end;let rangeFrom=Math.max(from,pos),rangeTo=Math.min(to,nextPos);if(rangeFrom<rangeTo&&hasChild){while(cursor.from<rangeTo){this.highlightRange(cursor,rangeFrom,rangeTo,inheritedClass,highlighters);this.startSpan(Math.min(to,cursor.to),cls);if(cursor.to>=nextPos||!cursor.nextSibling())
break;}}
if(!next||nextPos>to)
break;pos=next.to+start;if(pos>from){this.highlightRange(inner.cursor(),Math.max(from,next.from+start),Math.min(to,pos),inheritedClass,innerHighlighters);this.startSpan(pos,cls);}}
if(hasChild)
cursor.parent();}
else if(cursor.firstChild()){do{if(cursor.to<=from)
continue;if(cursor.from>=to)
break;this.highlightRange(cursor,from,to,inheritedClass,highlighters);this.startSpan(Math.min(to,cursor.to),cls);}while(cursor.nextSibling());cursor.parent();}}}
const t=Tag.define;const comment=t(),name=t(),typeName=t(name),propertyName=t(name),literal=t(),string=t(literal),number=t(literal),content=t(),heading=t(content),keyword=t(),operator=t(),punctuation=t(),bracket=t(punctuation),meta=t();const tags={comment,lineComment:t(comment),blockComment:t(comment),docComment:t(comment),name,variableName:t(name),typeName:typeName,tagName:t(typeName),propertyName:propertyName,attributeName:t(propertyName),className:t(name),labelName:t(name),namespace:t(name),macroName:t(name),literal,string,docString:t(string),character:t(string),attributeValue:t(string),number,integer:t(number),float:t(number),bool:t(literal),regexp:t(literal),escape:t(literal),color:t(literal),url:t(literal),keyword,self:t(keyword),null:t(keyword),atom:t(keyword),unit:t(keyword),modifier:t(keyword),operatorKeyword:t(keyword),controlKeyword:t(keyword),definitionKeyword:t(keyword),moduleKeyword:t(keyword),operator,derefOperator:t(operator),arithmeticOperator:t(operator),logicOperator:t(operator),bitwiseOperator:t(operator),compareOperator:t(operator),updateOperator:t(operator),definitionOperator:t(operator),typeOperator:t(operator),controlOperator:t(operator),punctuation,separator:t(punctuation),bracket,angleBracket:t(bracket),squareBracket:t(bracket),paren:t(bracket),brace:t(bracket),content,heading,heading1:t(heading),heading2:t(heading),heading3:t(heading),heading4:t(heading),heading5:t(heading),heading6:t(heading),contentSeparator:t(content),list:t(content),quote:t(content),emphasis:t(content),strong:t(content),link:t(content),monospace:t(content),strikethrough:t(content),inserted:t(),deleted:t(),changed:t(),invalid:t(),meta,documentMeta:t(meta),annotation:t(meta),processingInstruction:t(meta),definition:Tag.defineModifier(),constant:Tag.defineModifier(),function:Tag.defineModifier(),standard:Tag.defineModifier(),local:Tag.defineModifier(),special:Tag.defineModifier()};tagHighlighter([{tag:tags.link,class:"tok-link"},{tag:tags.heading,class:"tok-heading"},{tag:tags.emphasis,class:"tok-emphasis"},{tag:tags.strong,class:"tok-strong"},{tag:tags.keyword,class:"tok-keyword"},{tag:tags.atom,class:"tok-atom"},{tag:tags.bool,class:"tok-bool"},{tag:tags.url,class:"tok-url"},{tag:tags.labelName,class:"tok-labelName"},{tag:tags.inserted,class:"tok-inserted"},{tag:tags.deleted,class:"tok-deleted"},{tag:tags.literal,class:"tok-literal"},{tag:tags.string,class:"tok-string"},{tag:tags.number,class:"tok-number"},{tag:[tags.regexp,tags.escape,tags.special(tags.string)],class:"tok-string2"},{tag:tags.variableName,class:"tok-variableName"},{tag:tags.local(tags.variableName),class:"tok-variableName tok-local"},{tag:tags.definition(tags.variableName),class:"tok-variableName tok-definition"},{tag:tags.special(tags.variableName),class:"tok-variableName2"},{tag:tags.definition(tags.propertyName),class:"tok-propertyName tok-definition"},{tag:tags.typeName,class:"tok-typeName"},{tag:tags.namespace,class:"tok-namespace"},{tag:tags.className,class:"tok-className"},{tag:tags.macroName,class:"tok-macroName"},{tag:tags.propertyName,class:"tok-propertyName"},{tag:tags.operator,class:"tok-operator"},{tag:tags.comment,class:"tok-comment"},{tag:tags.meta,class:"tok-meta"},{tag:tags.invalid,class:"tok-invalid"},{tag:tags.punctuation,class:"tok-punctuation"}]);const C="\u037c";const COUNT=typeof Symbol=="undefined"?"__"+C:Symbol.for(C);const SET=typeof Symbol=="undefined"?"__styleSet"+Math.floor(Math.random()*1e8):Symbol("styleSet");const top=typeof globalThis!="undefined"?globalThis:typeof window!="undefined"?window:{};class StyleModule{constructor(spec,options){this.rules=[];let{finish}=options||{};function splitSelector(selector){return /^@/.test(selector)?[selector]:selector.split(/,\s*/)}
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
var _a;const languageDataProp=new NodeProp();function defineLanguageFacet(baseData){return Facet.define({combine:baseData?values=>values.concat(baseData):undefined});}
class Language{constructor(data,parser,extraExtensions=[]){this.data=data;if(!EditorState.prototype.hasOwnProperty("tree"))
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
class LRLanguage extends Language{constructor(data,parser){super(data,parser);this.parser=parser;}
static define(spec){let data=defineLanguageFacet(spec.languageData);return new LRLanguage(data,spec.parser.configure({props:[languageDataProp.add(type=>type.isTop?data:undefined)]}));}
configure(options){return new LRLanguage(this.data,this.parser.configure(options));}
get allowsNesting(){return this.parser.hasWrappers();}}
function syntaxTree(state){let field=state.field(Language.state,false);return field?field.tree:Tree.empty;}
function ensureSyntaxTree(state,upto,timeout=50){var _a;let parse=(_a=state.field(Language.state,false))===null||_a===void 0?void 0:_a.context;return!parse?null:parse.isDone(upto)||parse.work(timeout,upto)?parse.tree:null;}
function syntaxTreeAvailable(state,upto=state.doc.length){var _a;return((_a=state.field(Language.state,false))===null||_a===void 0?void 0:_a.context.isDone(upto))||false;}
function forceParsing(view,upto=view.viewport.to,timeout=100){let success=ensureSyntaxTree(view.state,upto,timeout);if(success!=syntaxTree(view.state))
view.dispatch({});return!!success;}
function syntaxParserRunning(view){var _a;return((_a=view.plugin(parseWorker))===null||_a===void 0?void 0:_a.isWorking())||false;}
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
isWorking(){return!!(this.working||this.workScheduled>0);}},{eventHandlers:{focus(){this.scheduleWork();}}});const language=Facet.define({combine(languages){return languages.length?languages[0]:null;},enables:[Language.state,parseWorker]});class LanguageSupport{constructor(language,support=[]){this.language=language;this.support=support;this.extension=[language,support];}}
class LanguageDescription{constructor(name,alias,extensions,filename,loadFunc,support=undefined){this.name=name;this.alias=alias;this.extensions=extensions;this.filename=filename;this.loadFunc=loadFunc;this.support=support;this.loading=null;}
load(){return this.loading||(this.loading=this.loadFunc().then(support=>this.support=support,err=>{this.loading=null;throw err;}));}
static of(spec){let{load,support}=spec;if(!load){if(!support)
throw new RangeError("Must pass either 'load' or 'support' to LanguageDescription.of");load=()=>Promise.resolve(support);}
return new LanguageDescription(spec.name,(spec.alias||[]).concat(spec.name).map(s=>s.toLowerCase()),spec.extensions||[],spec.filename,load,support);}
static matchFilename(descs,filename){for(let d of descs)
if(d.filename&&d.filename.test(filename))
return d;let ext=/\.([^.]+)$/.exec(filename);if(ext)
for(let d of descs)
if(d.extensions.indexOf(ext[1])>-1)
return d;return null;}
static matchLanguageName(descs,name,fuzzy=true){name=name.toLowerCase();for(let d of descs)
if(d.alias.some(a=>a==name))
return d;if(fuzzy)
for(let d of descs)
for(let a of d.alias){let found=name.indexOf(a);if(found>-1&&(a.length>2||!/\w/.test(name[found-1])&&!/\w/.test(name[found+a.length])))
return d;}
return null;}}
const indentService=Facet.define();const indentUnit=Facet.define({combine:values=>{if(!values.length)
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
function delimitedIndent({closing,align=true,units=1}){return(context)=>delimitedStrategy(context,align,units,closing);}
function delimitedStrategy(context,align,units,closing,closedAt){let after=context.textAfter,space=after.match(/^\s*/)[0].length;let closed=closing&&after.slice(space,space+closing.length)==closing||closedAt==context.pos+space;let aligned=align?bracketedAligned(context):null;if(aligned)
return closed?context.column(aligned.from):context.column(aligned.to);return context.baseIndent+(closed?0:context.unit*units);}
const flatIndent=(context)=>context.baseIndent;function continuedIndent({except,units=1}={}){return(context)=>{let matchExcept=except&&except.test(context.textAfter);return context.baseIndent+(matchExcept?0:units*context.unit);};}
const DontIndentBeyond=200;function indentOnInput(){return EditorState.transactionFilter.of(tr=>{if(!tr.docChanged||!tr.isUserEvent("input.type")&&!tr.isUserEvent("input.complete"))
return tr;let rules=tr.startState.languageDataAt("indentOnInput",tr.startState.selection.main.head);if(!rules.length)
return tr;let doc=tr.newDoc,{head}=tr.newSelection.main,line=doc.lineAt(head);if(head>line.from+DontIndentBeyond)
return tr;let lineStart=doc.sliceString(line.from,head);if(!rules.some(r=>r.test(lineStart)))
return tr;let{state}=tr,last=-1,changes=[];for(let{head}of state.selection.ranges){let line=state.doc.lineAt(head);if(line.from==last)
continue;last=line.from;let indent=getIndentation(state,line.from);if(indent==null)
continue;let cur=/^\s*/.exec(line.text)[0];let norm=indentString(state,indent);if(cur!=norm)
changes.push({from:line.from,to:line.from+cur.length,insert:norm});}
return changes.length?[tr,{changes,sequential:true}]:tr;});}
const foldService=Facet.define();const foldNodeProp=new NodeProp();function foldInside(node){let first=node.firstChild,last=node.lastChild;return first&&first.to<last.from?{from:first.to,to:last.type.isError?node.to:last.from}:null;}
function syntaxFolding(state,start,end){let tree=syntaxTree(state);if(tree.length<end)
return null;let inner=tree.resolveInner(end);let found=null;for(let cur=inner;cur;cur=cur.parent){if(cur.to<=end||cur.from>end)
continue;if(found&&cur.from<start)
break;let prop=cur.type.prop(foldNodeProp);if(prop&&(cur.to<tree.length-50||tree.length==state.doc.length||!isUnfinished(cur))){let value=prop(cur,state);if(value&&value.from<=end&&value.from>=start&&value.to>end)
found=value;}}
return found;}
function isUnfinished(node){let ch=node.lastChild;return ch&&ch.to==node.to&&ch.type.isError;}
function foldable(state,lineStart,lineEnd){for(let service of state.facet(foldService)){let result=service(state,lineStart,lineEnd);if(result)
return result;}
return syntaxFolding(state,lineStart,lineEnd);}
function mapRange(range,mapping){let from=mapping.mapPos(range.from,1),to=mapping.mapPos(range.to,-1);return from>=to?undefined:{from,to};}
const foldEffect=StateEffect.define({map:mapRange});const unfoldEffect=StateEffect.define({map:mapRange});function selectedLines(view){let lines=[];for(let{head}of view.state.selection.ranges){if(lines.some(l=>l.from<=head&&l.to>=head))
continue;lines.push(view.lineBlockAt(head));}
return lines;}
const foldState=StateField.define({create(){return Decoration.none;},update(folded,tr){folded=folded.map(tr.changes);for(let e of tr.effects){if(e.is(foldEffect)&&!foldExists(folded,e.value.from,e.value.to))
folded=folded.update({add:[foldWidget.range(e.value.from,e.value.to)]});else if(e.is(unfoldEffect))
folded=folded.update({filter:(from,to)=>e.value.from!=from||e.value.to!=to,filterFrom:e.value.from,filterTo:e.value.to});}
if(tr.selection){let onSelection=false,{head}=tr.selection.main;folded.between(head,head,(a,b)=>{if(a<head&&b>head)
onSelection=true;});if(onSelection)
folded=folded.update({filterFrom:head,filterTo:head,filter:(a,b)=>b<=head||a>=head});}
return folded;},provide:f=>EditorView.decorations.from(f)});function foldedRanges(state){return state.field(foldState,false)||RangeSet.empty;}
function findFold(state,from,to){var _a;let found=null;(_a=state.field(foldState,false))===null||_a===void 0?void 0:_a.between(from,to,(from,to)=>{if(!found||found.from>from)
found={from,to};});return found;}
function foldExists(folded,from,to){let found=false;folded.between(from,from,(a,b)=>{if(a==from&&b==to)
found=true;});return found;}
function maybeEnable(state,other){return state.field(foldState,false)?other:other.concat(StateEffect.appendConfig.of(codeFolding()));}
const foldCode=view=>{for(let line of selectedLines(view)){let range=foldable(view.state,line.from,line.to);if(range){view.dispatch({effects:maybeEnable(view.state,[foldEffect.of(range),announceFold(view,range)])});return true;}}
return false;};const unfoldCode=view=>{if(!view.state.field(foldState,false))
return false;let effects=[];for(let line of selectedLines(view)){let folded=findFold(view.state,line.from,line.to);if(folded)
effects.push(unfoldEffect.of(folded),announceFold(view,folded,false));}
if(effects.length)
view.dispatch({effects});return effects.length>0;};function announceFold(view,range,fold=true){let lineFrom=view.state.doc.lineAt(range.from).number,lineTo=view.state.doc.lineAt(range.to).number;return EditorView.announce.of(`${view.state.phrase(fold?"Folded lines":"Unfolded lines")} ${lineFrom} ${view.state.phrase("to")} ${lineTo}.`);}
const foldAll=view=>{let{state}=view,effects=[];for(let pos=0;pos<state.doc.length;){let line=view.lineBlockAt(pos),range=foldable(state,line.from,line.to);if(range)
effects.push(foldEffect.of(range));pos=(range?view.lineBlockAt(range.to):line).to+1;}
if(effects.length)
view.dispatch({effects:maybeEnable(view.state,effects)});return!!effects.length;};const unfoldAll=view=>{let field=view.state.field(foldState,false);if(!field||!field.size)
return false;let effects=[];field.between(0,view.state.doc.length,(from,to)=>{effects.push(unfoldEffect.of({from,to}));});view.dispatch({effects});return true;};const foldKeymap=[{key:"Ctrl-Shift-[",mac:"Cmd-Alt-[",run:foldCode},{key:"Ctrl-Shift-]",mac:"Cmd-Alt-]",run:unfoldCode},{key:"Ctrl-Alt-[",run:foldAll},{key:"Ctrl-Alt-]",run:unfoldAll}];const defaultConfig={placeholderDOM:null,placeholderText:"…"};const foldConfig=Facet.define({combine(values){return combineConfig(values,defaultConfig);}});function codeFolding(config){let result=[foldState,baseTheme$1];if(config)
result.push(foldConfig.of(config));return result;}
const foldWidget=Decoration.replace({widget:new class extends WidgetType{toDOM(view){let{state}=view,conf=state.facet(foldConfig);let onclick=(event)=>{let line=view.lineBlockAt(view.posAtDOM(event.target));let folded=findFold(view.state,line.from,line.to);if(folded)
view.dispatch({effects:unfoldEffect.of(folded)});event.preventDefault();};if(conf.placeholderDOM)
return conf.placeholderDOM(view,onclick);let element=document.createElement("span");element.textContent=conf.placeholderText;element.setAttribute("aria-label",state.phrase("folded code"));element.title=state.phrase("unfold");element.className="cm-foldPlaceholder";element.onclick=onclick;return element;}}});const foldGutterDefaults={openText:"⌄",closedText:"›",markerDOM:null,domEventHandlers:{},foldingChanged:()=>false};class FoldMarker extends GutterMarker{constructor(config,open){super();this.config=config;this.open=open;}
eq(other){return this.config==other.config&&this.open==other.open;}
toDOM(view){if(this.config.markerDOM)
return this.config.markerDOM(this.open);let span=document.createElement("span");span.textContent=this.open?this.config.openText:this.config.closedText;span.title=view.state.phrase(this.open?"Fold line":"Unfold line");return span;}}
function foldGutter(config={}){let fullConfig=Object.assign(Object.assign({},foldGutterDefaults),config);let canFold=new FoldMarker(fullConfig,true),canUnfold=new FoldMarker(fullConfig,false);let markers=ViewPlugin.fromClass(class{constructor(view){this.from=view.viewport.from;this.markers=this.buildMarkers(view);}
update(update){if(update.docChanged||update.viewportChanged||update.startState.facet(language)!=update.state.facet(language)||update.startState.field(foldState,false)!=update.state.field(foldState,false)||syntaxTree(update.startState)!=syntaxTree(update.state)||fullConfig.foldingChanged(update))
this.markers=this.buildMarkers(update.view);}
buildMarkers(view){let builder=new RangeSetBuilder();for(let line of view.viewportLineBlocks){let mark=findFold(view.state,line.from,line.to)?canUnfold:foldable(view.state,line.from,line.to)?canFold:null;if(mark)
builder.add(line.from,line.from,mark);}
return builder.finish();}});let{domEventHandlers}=fullConfig;return[markers,gutter({class:"cm-foldGutter",markers(view){var _a;return((_a=view.plugin(markers))===null||_a===void 0?void 0:_a.markers)||RangeSet.empty;},initialSpacer(){return new FoldMarker(fullConfig,false);},domEventHandlers:Object.assign(Object.assign({},domEventHandlers),{click:(view,line,event)=>{if(domEventHandlers.click&&domEventHandlers.click(view,line,event))
return true;let folded=findFold(view.state,line.from,line.to);if(folded){view.dispatch({effects:unfoldEffect.of(folded)});return true;}
let range=foldable(view.state,line.from,line.to);if(range){view.dispatch({effects:foldEffect.of(range)});return true;}
return false;}})}),codeFolding()];}
const baseTheme$1=EditorView.baseTheme({".cm-foldPlaceholder":{backgroundColor:"#eee",border:"1px solid #ddd",color:"#888",borderRadius:".2em",margin:"0 1px",padding:"0 1px",cursor:"pointer"},".cm-foldGutter span":{padding:"0 1px",cursor:"pointer"}});class HighlightStyle{constructor(spec,options){let modSpec;function def(spec){let cls=StyleModule.newName();(modSpec||(modSpec=Object.create(null)))["."+cls]=spec;return cls;}
const all=typeof options.all=="string"?options.all:options.all?def(options.all):undefined;const scopeOpt=options.scope;this.scope=scopeOpt instanceof Language?(type)=>type.prop(languageDataProp)==scopeOpt.data:scopeOpt?(type)=>type==scopeOpt:undefined;this.style=tagHighlighter(spec.map(style=>({tag:style.tag,class:style.class||def(Object.assign({},style,{tag:null}))})),{all,}).style;this.module=modSpec?new StyleModule(modSpec):null;this.themeType=options.themeType;}
static define(specs,options){return new HighlightStyle(specs,options||{});}}
const highlighterFacet=Facet.define();const fallbackHighlighter=Facet.define({combine(values){return values.length?[values[0]]:null;}});function getHighlighters(state){let main=state.facet(highlighterFacet);return main.length?main:state.facet(fallbackHighlighter);}
function syntaxHighlighting(highlighter,options){let ext=[treeHighlighter],themeType;if(highlighter instanceof HighlightStyle){if(highlighter.module)
ext.push(EditorView.styleModule.of(highlighter.module));themeType=highlighter.themeType;}
if(options===null||options===void 0?void 0:options.fallback)
ext.push(fallbackHighlighter.of(highlighter));else if(themeType)
ext.push(highlighterFacet.computeN([EditorView.darkTheme],state=>{return state.facet(EditorView.darkTheme)==(themeType=="dark")?[highlighter]:[];}));else
ext.push(highlighterFacet.of(highlighter));return ext;}
function highlightingFor(state,tags,scope){let highlighters=getHighlighters(state);let result=null;if(highlighters)
for(let highlighter of highlighters){if(!highlighter.scope||scope&&highlighter.scope(scope)){let cls=highlighter.style(tags);if(cls)
result=result?result+" "+cls:cls;}}
return result;}
class TreeHighlighter{constructor(view){this.markCache=Object.create(null);this.tree=syntaxTree(view.state);this.decorations=this.buildDeco(view,getHighlighters(view.state));}
update(update){let tree=syntaxTree(update.state),highlighters=getHighlighters(update.state);let styleChange=highlighters!=getHighlighters(update.startState);if(tree.length<update.view.viewport.to&&!styleChange&&tree.type==this.tree.type){this.decorations=this.decorations.map(update.changes);}
else if(tree!=this.tree||update.viewportChanged||styleChange){this.tree=tree;this.decorations=this.buildDeco(update.view,highlighters);}}
buildDeco(view,highlighters){if(!highlighters||!this.tree.length)
return Decoration.none;let builder=new RangeSetBuilder();for(let{from,to}of view.visibleRanges){highlightTree(this.tree,highlighters,(from,to,style)=>{builder.add(from,to,this.markCache[style]||(this.markCache[style]=Decoration.mark({class:style})));},from,to);}
return builder.finish();}}
const treeHighlighter=Prec.high(ViewPlugin.fromClass(TreeHighlighter,{decorations:v=>v.decorations}));const defaultHighlightStyle=HighlightStyle.define([{tag:tags.meta,color:"#7a757a"},{tag:tags.link,textDecoration:"underline"},{tag:tags.heading,textDecoration:"underline",fontWeight:"bold"},{tag:tags.emphasis,fontStyle:"italic"},{tag:tags.strong,fontWeight:"bold"},{tag:tags.strikethrough,textDecoration:"line-through"},{tag:tags.keyword,color:"#708"},{tag:[tags.atom,tags.bool,tags.url,tags.contentSeparator,tags.labelName],color:"#219"},{tag:[tags.literal,tags.inserted],color:"#164"},{tag:[tags.string,tags.deleted],color:"#a11"},{tag:[tags.regexp,tags.escape,tags.special(tags.string)],color:"#e40"},{tag:tags.definition(tags.variableName),color:"#00f"},{tag:tags.local(tags.variableName),color:"#30a"},{tag:[tags.typeName,tags.namespace],color:"#085"},{tag:tags.className,color:"#167"},{tag:[tags.special(tags.variableName),tags.macroName],color:"#256"},{tag:tags.definition(tags.propertyName),color:"#00c"},{tag:tags.comment,color:"#940"},{tag:tags.invalid,color:"#f00"}]);const baseTheme=EditorView.baseTheme({"&.cm-focused .cm-matchingBracket":{backgroundColor:"#328c8252"},"&.cm-focused .cm-nonmatchingBracket":{backgroundColor:"#bb555544"}});const DefaultScanDist=10000,DefaultBrackets="()[]{}";const bracketMatchingConfig=Facet.define({combine(configs){return combineConfig(configs,{afterCursor:true,brackets:DefaultBrackets,maxScanDistance:DefaultScanDist,renderMatch:defaultRenderMatch});}});const matchingMark=Decoration.mark({class:"cm-matchingBracket"}),nonmatchingMark=Decoration.mark({class:"cm-nonmatchingBracket"});function defaultRenderMatch(match){let decorations=[];let mark=match.matched?matchingMark:nonmatchingMark;decorations.push(mark.range(match.start.from,match.start.to));if(match.end)
decorations.push(mark.range(match.end.from,match.end.to));return decorations;}
const bracketMatchingState=StateField.define({create(){return Decoration.none;},update(deco,tr){if(!tr.docChanged&&!tr.selection)
return deco;let decorations=[];let config=tr.state.facet(bracketMatchingConfig);for(let range of tr.state.selection.ranges){if(!range.empty)
continue;let match=matchBrackets(tr.state,range.head,-1,config)||(range.head>0&&matchBrackets(tr.state,range.head-1,1,config))||(config.afterCursor&&(matchBrackets(tr.state,range.head,1,config)||(range.head<tr.state.doc.length&&matchBrackets(tr.state,range.head+1,-1,config))));if(match)
decorations=decorations.concat(config.renderMatch(match,tr.state));}
return Decoration.set(decorations,true);},provide:f=>EditorView.decorations.from(f)});const bracketMatchingUnique=[bracketMatchingState,baseTheme];function bracketMatching(config={}){return[bracketMatchingConfig.of(config),bracketMatchingUnique];}
function matchingNodes(node,dir,brackets){let byProp=node.prop(dir<0?NodeProp.openedBy:NodeProp.closedBy);if(byProp)
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
function countCol(string,end,tabSize,startIndex=0,startValue=0){if(end==null){end=string.search(/[^\s\u00a0]/);if(end==-1)
end=string.length;}
let n=startValue;for(let i=startIndex;i<end;i++){if(string.charCodeAt(i)==9)
n+=tabSize-(n%tabSize);else
n++;}
return n;}
class StringStream{constructor(string,tabSize,indentUnit){this.string=string;this.tabSize=tabSize;this.indentUnit=indentUnit;this.pos=0;this.start=0;this.lastColumnPos=0;this.lastColumnValue=0;}
eol(){return this.pos>=this.string.length;}
sol(){return this.pos==0;}
peek(){return this.string.charAt(this.pos)||undefined;}
next(){if(this.pos<this.string.length)
return this.string.charAt(this.pos++);}
eat(match){let ch=this.string.charAt(this.pos);let ok;if(typeof match=="string")
ok=ch==match;else
ok=ch&&(match instanceof RegExp?match.test(ch):match(ch));if(ok){++this.pos;return ch;}}
eatWhile(match){let start=this.pos;while(this.eat(match)){}
return this.pos>start;}
eatSpace(){let start=this.pos;while(/[\s\u00a0]/.test(this.string.charAt(this.pos)))
++this.pos;return this.pos>start;}
skipToEnd(){this.pos=this.string.length;}
skipTo(ch){let found=this.string.indexOf(ch,this.pos);if(found>-1){this.pos=found;return true;}}
backUp(n){this.pos-=n;}
column(){if(this.lastColumnPos<this.start){this.lastColumnValue=countCol(this.string,this.start,this.tabSize,this.lastColumnPos,this.lastColumnValue);this.lastColumnPos=this.start;}
return this.lastColumnValue;}
indentation(){return countCol(this.string,null,this.tabSize);}
match(pattern,consume,caseInsensitive){if(typeof pattern=="string"){let cased=(str)=>caseInsensitive?str.toLowerCase():str;let substr=this.string.substr(this.pos,pattern.length);if(cased(substr)==cased(pattern)){if(consume!==false)
this.pos+=pattern.length;return true;}
else
return null;}
else{let match=this.string.slice(this.pos).match(pattern);if(match&&match.index>0)
return null;if(match&&consume!==false)
this.pos+=match[0].length;return match;}}
current(){return this.string.slice(this.start,this.pos);}}
function fullParser(spec){return{token:spec.token,blankLine:spec.blankLine||(()=>{}),startState:spec.startState||(()=>true),copyState:spec.copyState||defaultCopyState,indent:spec.indent||(()=>null),languageData:spec.languageData||{},tokenTable:spec.tokenTable||noTokens};}
function defaultCopyState(state){if(typeof state!="object")
return state;let newState={};for(let prop in state){let val=state[prop];newState[prop]=(val instanceof Array?val.slice():val);}
return newState;}
class StreamLanguage extends Language{constructor(parser){let data=defineLanguageFacet(parser.languageData);let p=fullParser(parser),self;let impl=new class extends Parser{createParse(input,fragments,ranges){return new Parse(self,input,fragments,ranges);}};super(data,impl,[indentService.of((cx,pos)=>this.getIndent(cx,pos))]);this.topNode=docID(data);self=this;this.streamParser=p;this.stateAfter=new NodeProp({perNode:true});this.tokenTable=parser.tokenTable?new TokenTable(p.tokenTable):defaultTokenTable;}
static define(spec){return new StreamLanguage(spec);}
getIndent(cx,pos){let tree=syntaxTree(cx.state),at=tree.resolve(pos);while(at&&at.type!=this.topNode)
at=at.parent;if(!at)
return null;let start=findState(this,tree,0,at.from,pos),statePos,state;if(start){state=start.state;statePos=start.pos+1;}
else{state=this.streamParser.startState(cx.unit);statePos=0;}
if(pos-statePos>10000)
return null;while(statePos<pos){let line=cx.state.doc.lineAt(statePos),end=Math.min(pos,line.to);if(line.length){let stream=new StringStream(line.text,cx.state.tabSize,cx.unit);while(stream.pos<end-line.from)
readToken(this.streamParser.token,stream,state);}
else{this.streamParser.blankLine(state,cx.unit);}
if(end==pos)
break;statePos=line.to+1;}
let{text}=cx.lineAt(pos);return this.streamParser.indent(state,/^\s*(.*)/.exec(text)[1],cx);}
get allowsNesting(){return false;}}
function findState(lang,tree,off,startPos,before){let state=off>=startPos&&off+tree.length<=before&&tree.prop(lang.stateAfter);if(state)
return{state:lang.streamParser.copyState(state),pos:off+tree.length};for(let i=tree.children.length-1;i>=0;i--){let child=tree.children[i],pos=off+tree.positions[i];let found=child instanceof Tree&&pos<before&&findState(lang,child,pos,startPos,before);if(found)
return found;}
return null;}
function cutTree(lang,tree,from,to,inside){if(inside&&from<=0&&to>=tree.length)
return tree;if(!inside&&tree.type==lang.topNode)
inside=true;for(let i=tree.children.length-1;i>=0;i--){let pos=tree.positions[i],child=tree.children[i],inner;if(pos<to&&child instanceof Tree){if(!(inner=cutTree(lang,child,from-pos,to-pos,inside)))
break;return!inside?inner:new Tree(tree.type,tree.children.slice(0,i).concat(inner),tree.positions.slice(0,i+1),pos+inner.length);}}
return null;}
function findStartInFragments(lang,fragments,startPos,editorState){for(let f of fragments){let from=f.from+(f.openStart?25:0),to=f.to-(f.openEnd?25:0);let found=from<=startPos&&to>startPos&&findState(lang,f.tree,0-f.offset,startPos,to),tree;if(found&&(tree=cutTree(lang,f.tree,startPos+f.offset,found.pos+f.offset,false)))
return{state:found.state,tree};}
return{state:lang.streamParser.startState(editorState?getIndentUnit(editorState):4),tree:Tree.empty};}
class Parse{constructor(lang,input,fragments,ranges){this.lang=lang;this.input=input;this.fragments=fragments;this.ranges=ranges;this.stoppedAt=null;this.chunks=[];this.chunkPos=[];this.chunk=[];this.chunkReused=undefined;this.rangeIndex=0;this.to=ranges[ranges.length-1].to;let context=ParseContext.get(),from=ranges[0].from;let{state,tree}=findStartInFragments(lang,fragments,from,context===null||context===void 0?void 0:context.state);this.state=state;this.parsedPos=this.chunkStart=from+tree.length;for(let i=0;i<tree.children.length;i++){this.chunks.push(tree.children[i]);this.chunkPos.push(tree.positions[i]);}
if(context&&this.parsedPos<context.viewport.from-100000){this.state=this.lang.streamParser.startState(getIndentUnit(context.state));context.skipUntilInView(this.parsedPos,context.viewport.from);this.parsedPos=context.viewport.from;}
this.moveRangeIndex();}
advance(){let context=ParseContext.get();let parseEnd=this.stoppedAt==null?this.to:Math.min(this.to,this.stoppedAt);let end=Math.min(parseEnd,this.chunkStart+2048);if(context)
end=Math.min(end,context.viewport.to);while(this.parsedPos<end)
this.parseLine(context);if(this.chunkStart<this.parsedPos)
this.finishChunk();if(this.parsedPos>=parseEnd)
return this.finish();if(context&&this.parsedPos>=context.viewport.to){context.skipUntilInView(this.parsedPos,parseEnd);return this.finish();}
return null;}
stopAt(pos){this.stoppedAt=pos;}
lineAfter(pos){let chunk=this.input.chunk(pos);if(!this.input.lineChunks){let eol=chunk.indexOf("\n");if(eol>-1)
chunk=chunk.slice(0,eol);}
else if(chunk=="\n"){chunk="";}
return pos+chunk.length<=this.to?chunk:chunk.slice(0,this.to-pos);}
nextLine(){let from=this.parsedPos,line=this.lineAfter(from),end=from+line.length;for(let index=this.rangeIndex;;){let rangeEnd=this.ranges[index].to;if(rangeEnd>=end)
break;line=line.slice(0,rangeEnd-(end-line.length));index++;if(index==this.ranges.length)
break;let rangeStart=this.ranges[index].from;let after=this.lineAfter(rangeStart);line+=after;end=rangeStart+after.length;}
return{line,end};}
skipGapsTo(pos,offset,side){for(;;){let end=this.ranges[this.rangeIndex].to,offPos=pos+offset;if(side>0?end>offPos:end>=offPos)
break;let start=this.ranges[++this.rangeIndex].from;offset+=start-end;}
return offset;}
moveRangeIndex(){while(this.ranges[this.rangeIndex].to<this.parsedPos)
this.rangeIndex++;}
emitToken(id,from,to,size,offset){if(this.ranges.length>1){offset=this.skipGapsTo(from,offset,1);from+=offset;let len0=this.chunk.length;offset=this.skipGapsTo(to,offset,-1);to+=offset;size+=this.chunk.length-len0;}
this.chunk.push(id,from,to,size);return offset;}
parseLine(context){let{line,end}=this.nextLine(),offset=0,{streamParser}=this.lang;let stream=new StringStream(line,context?context.state.tabSize:4,context?getIndentUnit(context.state):2);if(stream.eol()){streamParser.blankLine(this.state,stream.indentUnit);}
else{while(!stream.eol()){let token=readToken(streamParser.token,stream,this.state);if(token)
offset=this.emitToken(this.lang.tokenTable.resolve(token),this.parsedPos+stream.start,this.parsedPos+stream.pos,4,offset);if(stream.start>10000)
break;}}
this.parsedPos=end;this.moveRangeIndex();if(this.parsedPos<this.to)
this.parsedPos++;}
finishChunk(){let tree=Tree.build({buffer:this.chunk,start:this.chunkStart,length:this.parsedPos-this.chunkStart,nodeSet,topID:0,maxBufferLength:2048,reused:this.chunkReused});tree=new Tree(tree.type,tree.children,tree.positions,tree.length,[[this.lang.stateAfter,this.lang.streamParser.copyState(this.state)]]);this.chunks.push(tree);this.chunkPos.push(this.chunkStart-this.ranges[0].from);this.chunk=[];this.chunkReused=undefined;this.chunkStart=this.parsedPos;}
finish(){return new Tree(this.lang.topNode,this.chunks,this.chunkPos,this.parsedPos-this.ranges[0].from).balance();}}
function readToken(token,stream,state){stream.start=stream.pos;for(let i=0;i<10;i++){let result=token(stream,state);if(stream.pos>stream.start)
return result;}
throw new Error("Stream parser failed to advance stream.");}
const noTokens=Object.create(null);const typeArray=[NodeType.none];const nodeSet=new NodeSet(typeArray);const warned=[];const defaultTable=Object.create(null);for(let[legacyName,name]of[["variable","variableName"],["variable-2","variableName.special"],["string-2","string.special"],["def","variableName.definition"],["tag","typeName"],["attribute","propertyName"],["type","typeName"],["builtin","variableName.standard"],["qualifier","modifier"],["error","invalid"],["header","heading"],["property","propertyName"]])
defaultTable[legacyName]=createTokenType(noTokens,name);class TokenTable{constructor(extra){this.extra=extra;this.table=Object.assign(Object.create(null),defaultTable);}
resolve(tag){return!tag?0:this.table[tag]||(this.table[tag]=createTokenType(this.extra,tag));}}
const defaultTokenTable=new TokenTable(noTokens);function warnForPart(part,msg){if(warned.indexOf(part)>-1)
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
function docID(data){let type=NodeType.define({id:typeArray.length,name:"Document",props:[languageDataProp.add(()=>data)]});typeArray.push(type);return type;}
export{HighlightStyle,IndentContext,LRLanguage,Language,LanguageDescription,LanguageSupport,ParseContext,StreamLanguage,StringStream,TreeIndentContext,bracketMatching,codeFolding,continuedIndent,defaultHighlightStyle,defineLanguageFacet,delimitedIndent,ensureSyntaxTree,flatIndent,foldAll,foldCode,foldEffect,foldGutter,foldInside,foldKeymap,foldNodeProp,foldService,foldable,foldedRanges,forceParsing,getIndentUnit,getIndentation,highlightingFor,indentNodeProp,indentOnInput,indentService,indentString,indentUnit,language,languageDataProp,matchBrackets,syntaxHighlighting,syntaxParserRunning,syntaxTree,syntaxTreeAvailable,unfoldAll,unfoldCode,unfoldEffect};