/** 当前二维地图版本的默认宿主，仅绑定127.0.0.1。正式NPC/MLP迁移仍未完成，不能伪称完整玩法已接入。 */
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,writeFileSync,renameSync,existsSync,readFileSync,unlinkSync,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {REGION,VILLAGE,LANDMARKS,buildings,atlas,minimap,cacheStats} from '../../src/games/camp/world/pixel/world.mjs';
import {MapSession} from '../../scripts/pixel-world/session.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function integer(query,name,fallback){
  const value=query.get(name);if(value===null&&fallback!==undefined)return fallback;
  if(value===null||!/^\d{1,5}$/.test(value))throw new RangeError('参数必须是非负整数：'+name);return Number(value);
}
function lockDatabase(file){
  if(file===':memory:')return()=>{};
  const target=path.resolve(file)+'.pixel-lock';mkdirSync(path.dirname(target),{recursive:true});
  const nonce=randomBytes(16).toString('hex');
  if(existsSync(target)){
    let old;try{old=JSON.parse(readFileSync(target,'utf8'));}catch{throw new Error('地图进程锁无效，请检查：'+target);}
    try{process.kill(old.pid,0);throw new Error('此二维地图存档已有宿主运行，不能重复启动');}
    catch(e){if(e.code!=='ESRCH')throw e;unlinkSync(target);}
  }
  const fd=openSync(target,'wx',0o600);try{writeFileSync(fd,JSON.stringify({pid:process.pid,nonce}));}finally{closeSync(fd);}
  return()=>{if(existsSync(target)){try{if(JSON.parse(readFileSync(target,'utf8')).nonce===nonce)unlinkSync(target);}catch{/* 不删除不属于本次的锁。 */}}};
}
export async function startMapServer({database=path.join(root,'native/LocalData/pixel-world-v1/world.sqlite'),port=0,connectionFile,parentPid}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('端口无效');
  const unlock=lockDatabase(database);let session;
  try{session=new MapSession(database);}catch(e){unlock();throw e;}
  const token=randomBytes(32).toString('hex'),secret=Buffer.from(token);let endpoint='',timer,parentWatch,closed=false,closing;
  const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    const reply=(status,body)=>{if(!res.writableEnded){res.statusCode=status;res.end(JSON.stringify(body));}};
    void(async()=>{
      try{
        if(req.socket.remoteAddress!=='127.0.0.1'){reply(403,{error:'仅支持本机回环'});return;}
        const url=new URL(req.url??'/',endpoint);
        if(req.headers.host!==new URL(endpoint).host||req.headers.origin&&req.headers.origin!==endpoint){reply(403,{error:'拒绝跨站请求'});return;}
        if(url.pathname==='/health'&&req.method==='GET'){reply(200,{service:'campmind-pixel-game',protocol:1,scope:'pixel-game'});return;}
        const supplied=Buffer.from(String(req.headers['x-pixel-token']??''));
        if(supplied.length!==secret.length||!timingSafeEqual(supplied,secret)){reply(403,{error:'地图连接令牌无效'});return;}
        if(req.method==='GET'){
          if(url.pathname==='/manifest'){reply(200,{protocol:1,scope:'pixel-game',region:REGION,village:VILLAGE,landmarks:LANDMARKS,buildings:buildings()});return;}
          if(url.pathname==='/snapshot'){reply(200,session.snapshot());return;}
          if(url.pathname==='/chunk'){reply(200,session.chunk(integer(url.searchParams,'x'),integer(url.searchParams,'y')));return;}
          if(url.pathname==='/atlas'){reply(200,atlas(integer(url.searchParams,'size',256)));return;}
          if(url.pathname==='/minimap'){reply(200,minimap(integer(url.searchParams,'x'),integer(url.searchParams,'y')));return;}
          if(url.pathname==='/diagnostics'){reply(200,{scope:'pixel-game',cache:cacheStats(),revision:session.snapshot().revision});return;}
        }
        if(req.method==='POST'&&['/input','/interact','/shutdown'].includes(url.pathname)){
          if(req.headers['content-type']?.split(';')[0]!=='application/json'){reply(415,{error:'需要JSON请求'});return;}
          let body='',bytes=0;for await(const part of req){bytes+=part.length;if(bytes>4096){reply(413,{error:'请求超过4096字节'});return;}body+=part.toString('utf8');}
          let input;try{input=JSON.parse(body);}catch{throw new RangeError('JSON格式错误');}
          if(url.pathname==='/input'){session.setInput(input,performance.now());reply(200,{ok:true});return;}
          if(url.pathname==='/interact'){reply(200,session.interact(input?.operationId));return;}
          reply(200,{ok:true});setTimeout(()=>void close(),10);return;
        }
        reply(404,{error:'没有此地图接口'});
      }catch(error){reply(error instanceof RangeError?400:409,{error:error instanceof Error?error.message:'地图请求失败'});}
    })();
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){session.close();unlock();throw error;}
  endpoint=`http://127.0.0.1:${server.address().port}`;
  const connection={protocol:1,endpoint,token,pid:process.pid,scope:'pixel-game'};
  try{
    if(connectionFile){mkdirSync(path.dirname(path.resolve(connectionFile)),{recursive:true});const tmp=connectionFile+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify(connection),{mode:0o600});renameSync(tmp,connectionFile);}
  }catch(error){server.close();session.close();unlock();throw error;}
  timer=setInterval(()=>{try{session.tick(.05,performance.now());}catch(error){console.error('地图固定步失败：',error.message);void close();}},50);
  if(parentPid){if(!Number.isSafeInteger(parentPid)||parentPid<=0){await close();throw new RangeError('父进程ID无效');}
    parentWatch=setInterval(()=>{try{process.kill(parentPid,0);}catch(e){if(e.code==='ESRCH')void close();}},1000);}
  function close(){
    if(closing)return closing;closed=true;clearInterval(timer);clearInterval(parentWatch);
    closing=new Promise(resolve=>{
      server.close(()=>{
        try{session.close();}
        finally{
          unlock();
          if(connectionFile&&existsSync(connectionFile)){
            try{if(JSON.parse(readFileSync(connectionFile,'utf8')).token===token)unlinkSync(connectionFile);}
            catch{/* 不删除其他会话连接文件。 */}
          }
          resolve();
        }
      });
      server.closeIdleConnections();
    });
    return closing;
  }
  return{connection,close,get closed(){return closed;}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  try{
    for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!value||!['--db','--port','--connection-file','--parent-pid'].includes(key))throw new Error('用法：node scripts/pixel-world/server.mjs [--db 路径] [--port 端口] [--connection-file 路径] [--parent-pid PID]');options[{'--db':'database','--port':'port','--connection-file':'connectionFile','--parent-pid':'parentPid'}[key]]=['--port','--parent-pid'].includes(key)?Number(value):path.resolve(value);}
    options.connectionFile??=path.join(root,'native/LocalData/pixel-world-v1/connection.json');
    const host=await startMapServer(options);console.log('二维游戏地图宿主已启动：'+host.connection.endpoint+'；连接信息保存在本机文件，未输出令牌。');
    for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>void host.close());
  }catch(error){console.error(error.message);process.exitCode=1;}
}
