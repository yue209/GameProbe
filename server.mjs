import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from './src/playwright-runner.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(root,'dist');
const port=Number(process.env.PORT||4175);
const initial=()=>({date:'2026-10-12',capacity:5,used:4,tickets:0,claimedDate:null,version:'buggy',message:'补给已就绪'});
let state=initial();

const json=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))};
const body=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e6)reject(new Error('body too large'))});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})});
function claim(){if(state.claimedDate===state.date){state.message='今日已领取：不可重复发奖';return {ok:false,code:'ALREADY_CLAIMED',state}}if(state.version==='buggy')state.claimedDate=state.date;if(state.used>=state.capacity){state.message='背包已满：补给发放失败';return {ok:false,code:'BAG_FULL',state}}state.used++;state.tickets++;state.claimedDate=state.date;state.message='领取成功：训练券 × 1';return {ok:true,code:'SUCCESS',state}}
async function qwen(requirement){
  const key=process.env.DASHSCOPE_API_KEY;if(!key)throw Object.assign(new Error('DASHSCOPE_API_KEY 未配置'),{status:503});
  const prompt=`你是游戏QA。只输出JSON，字段为 rules:string[], clarifications:string[], cases:{name:string,basis:string,preconditions:string[],steps:{tool:string,input?:object}[],expected:string}[]。工具只允许 reset_test_user,set_inventory,advance_test_date,click_claim,read_game_state,capture_evidence。需求：${requirement}`;
  const r=await fetch(process.env.QWEN_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.QWEN_MODEL||'qwen-plus',messages:[{role:'user',content:prompt}],temperature:.1,response_format:{type:'json_object'}})});
  if(!r.ok)throw Object.assign(new Error(`Qwen HTTP ${r.status}: ${await r.text()}`),{status:502});
  const data=await r.json();return JSON.parse(data.choices?.[0]?.message?.content||'{}');
}
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/health')return json(res,200,{ok:true,qwenConfigured:Boolean(process.env.DASHSCOPE_API_KEY),runner:'playwright',model:process.env.QWEN_MODEL||'qwen-plus'});
  if(u.pathname==='/api/test/state'&&req.method==='GET')return json(res,200,state);
  if(u.pathname==='/api/test/reset'&&req.method==='POST'){let b=await body(req);state={...initial(),version:b.version==='fixed'?'fixed':'buggy'};return json(res,200,state)}
  if(u.pathname==='/api/test/inventory'&&req.method==='POST'){let b=await body(req);state.used=Math.max(0,Math.min(state.capacity,Number(b.used)));state.tickets=Math.min(state.tickets,state.used);state.message=`测试准备：背包 ${state.used}/${state.capacity}`;return json(res,200,state)}
  if(u.pathname==='/api/test/date/advance'&&req.method==='POST'){let d=new Date(state.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);state.date=d.toISOString().slice(0,10);state.message='测试时钟已推进一天';return json(res,200,state)}
  if(u.pathname==='/api/test/claim'&&req.method==='POST')return json(res,200,claim());
  if(u.pathname==='/api/agent/analyze'&&req.method==='POST'){let b=await body(req);return json(res,200,await qwen(String(b.requirement||'')))}
  if(u.pathname==='/api/agent/run'&&req.method==='POST'){let b=await body(req);let result=await runAgent({baseURL:`http://127.0.0.1:${port}`,version:b.version||'buggy',requirement:b.requirement||'',analyze:qwen});return json(res,200,result)}
  let rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));let file=path.normalize(path.join(dist,rel));if(!file.startsWith(dist))return json(res,403,{error:'forbidden'});fs.readFile(file,(e,d)=>{if(e)return json(res,404,{error:'not found'});let ext=path.extname(file);res.writeHead(200,{'content-type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':'application/octet-stream'});res.end(d)});
}catch(e){json(res,e.status||500,{error:e.message})}});
server.listen(port,'127.0.0.1',()=>console.log(`TACTICAL QA Agent: http://127.0.0.1:${port}`));
