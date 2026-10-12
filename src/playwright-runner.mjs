import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const post=(base,p,data={})=>fetch(base+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());
const get=(base,p)=>fetch(base+p).then(r=>r.json());
const clickClaim=async page=>{await Promise.all([page.waitForResponse(r=>r.url().includes('/api/test/claim')),page.getByTestId('claim-reward').click()])};
export async function runAgent({baseURL,version='buggy',requirement='',analyze}){
  const runId=new Date().toISOString().replace(/[:.]/g,'-');const dir=path.resolve('artifacts',runId);await fs.mkdir(dir,{recursive:true});
  let analysis=null;if(requirement&&analyze)analysis=await analyze(requirement);
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});const page=await browser.newPage({viewport:{width:1280,height:800}});let results=[];
  const execute=async(id,name,fn,expected)=>{try{await post(baseURL,'/api/test/reset',{version});await page.goto(baseURL+'/supply.html');const actual=await fn(page);let shot=path.join(dir,`${id}.png`);await page.screenshot({path:shot,fullPage:true});let pass=expected(actual);results.push({id,name,status:pass?'passed':'failed',actual,evidence:shot});}catch(e){results.push({id,name,status:'execution_error',error:e.message})}};
  await execute('C01','空位时首次领取',async p=>{await clickClaim(p);return get(baseURL,'/api/test/state')},s=>s.tickets===1&&s.used===5);
  await execute('C02','重复领取不再发奖',async p=>{await clickClaim(p);await clickClaim(p);return get(baseURL,'/api/test/state')},s=>s.tickets===1&&s.message.includes('已领取'));
  await execute('C03','背包满不消耗资格',async p=>{await post(baseURL,'/api/test/inventory',{used:5});await p.reload();await clickClaim(p);return get(baseURL,'/api/test/state')},s=>s.tickets===0&&s.claimedDate===null);
  await execute('C04','满包失败后清空重试',async p=>{await post(baseURL,'/api/test/inventory',{used:5});await p.reload();await clickClaim(p);await post(baseURL,'/api/test/inventory',{used:0});await p.reload();await clickClaim(p);return get(baseURL,'/api/test/state')},s=>s.tickets===1&&s.message.includes('成功'));
  await execute('C05','跨日恢复资格',async p=>{await post(baseURL,'/api/test/inventory',{used:0});await p.reload();await clickClaim(p);await post(baseURL,'/api/test/date/advance');await p.reload();await clickClaim(p);return get(baseURL,'/api/test/state')},s=>s.tickets===2);
  await browser.close();let summary={passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,executionErrors:results.filter(x=>x.status==='execution_error').length};let report={runId,version,analysis,summary,results};await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));return report;
}
