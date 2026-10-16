import {createServer} from 'node:http';
let revision=1,food=10,mode='accept',version=1,gets=0,posts=0,lastMotion=null,catchingUp=false;const requests=[];
const seen=new Set();
const snapshot=()=>({schemaVersion:version,revision,dialogueScope:'generation:branch',state:{status:'paused',food},speed:1,savedAt:0,recovered:false,temporaryPause:false,catchingUp});
const server=createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  let text='';for await(const chunk of req){text+=chunk;if(text.length>10000){reply(413,{});return;}}
  const input=text?JSON.parse(text):{};
  if(req.url==='/stats'){reply(200,{gets,posts,food,revision,version,lastMotion,requests});return;}
  if(req.url==='/control'){if(input.mode)mode=input.mode;if(input.version)version=input.version;if(typeof input.catchingUp==='boolean')catchingUp=input.catchingUp;reply(200,{ok:true});return;}
  if(req.url!=='/game-api/world'){reply(404,{});return;}
  if(req.headers['x-camp-native-protocol']!=='1'){reply(426,{error:'Missing native version'});return;}
  if(req.method==='GET'){gets++;reply(200,snapshot());return;}
  posts++;
  requests.push({operation:input.operation,type:input.action?.command?.type,direction:input.action?.command?.direction});
  if(mode==='conflict'){mode='accept';revision++;reply(409,{code:'REVISION_CONFLICT'});return;}
  if(!seen.has(input.operation)){seen.add(input.operation);revision++;if(input.action?.command?.type==='lord-input')lastMotion=input.action.command.direction;else food--;}
  if(mode==='drop'){req.socket.destroy();return;}
  reply(200,snapshot());
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({endpoint:`http://127.0.0.1:${server.address().port}`})+'\n'));
