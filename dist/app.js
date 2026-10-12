const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const defaultRules = [
  '每个账号每天最多领取 1 次',
  '每张训练券占 1 个背包格且不叠加',
  '背包满时发奖失败，不能消耗领取机会',
  '清理背包后，同一天可以再次领取',
  '资格按测试环境模拟日期刷新'
];

const cases = [
  {id:'normal',name:'正常领取',basis:'每天可领取1张训练券',desc:'未领取、背包有空位 → 获得 1 张券'},
  {id:'duplicate',name:'重复领取',basis:'每个账号每天一次',desc:'当天已领取 → 再次点击不发奖'},
  {id:'full',name:'背包已满',basis:'背包满时领取失败',desc:'无空位 → 失败且不扣机会'},
  {id:'retry',name:'失败后重试',basis:'失败不消耗领取机会',desc:'领取失败 → 清空背包 → 再领取成功'},
  {id:'nextday',name:'跨日领取',basis:'按环境日期判断跨日',desc:'前一天已领取 → 推进日期 → 新一天可领取'}
];

let state = {date:new Date(2026,9,12),used:2,tickets:0,claimedDate:null,version:'buggy'};
let results = {};
let running = false;
let lastFailed = null;

function fmtDate(){return `${state.date.getFullYear()}年${state.date.getMonth()+1}月${state.date.getDate()}日`}
function dateKey(){return state.date.toISOString().slice(0,10)}
function renderState(){
  $('#dateText').textContent=fmtDate(); $('#usedSlots').textContent=state.used;
  $('#ticketCount').textContent=state.tickets;
  $('#stateText').textContent=state.claimedDate===dateKey()?'今天已领取':'未领取';
  $('#remainingText').textContent=`剩余 ${6-state.used} 个空位`;
  $('#slots').innerHTML=Array.from({length:6},(_,i)=>`<div class="slot ${i<state.used?'used':''}">${i<state.used?(i<state.tickets?'券':'物品'):i+1}</div>`).join('');
}
function setMessage(text,type='neutral'){const el=$('#gameMessage');el.textContent=text;el.className=`game-message ${type}`}
function reset(){state.used=2;state.tickets=0;state.claimedDate=null;state.date=new Date(2026,9,12);setMessage('测试账号已重置');renderState()}
function fill(){state.used=6;setMessage('背包已填满');renderState()}
function clearBag(){state.used=0;state.tickets=0;setMessage('背包已清空');renderState()}
function nextDay(){state.date.setDate(state.date.getDate()+1);setMessage('模拟日期已推进一天');renderState()}
function claim(){
  if(state.claimedDate===dateKey()){setMessage('领取失败：今天已经领取','error');return {ok:false,reason:'今天已经领取'}}
  if(state.used>=6){if(state.version==='buggy')state.claimedDate=dateKey();setMessage('领取失败：背包已满','error');renderState();return {ok:false,reason:'背包已满'}}
  state.used++;state.tickets++;state.claimedDate=dateKey();setMessage('领取成功：训练券 × 1','success');renderState();return {ok:true,reason:'领取成功'}
}
function renderRules(rules=defaultRules){$('#ruleCount').textContent=`${rules.length} 条`;$('#ruleList').innerHTML=rules.map((r,i)=>`<div class="rule-item"><b>R${i+1}</b><span>${r}</span></div>`).join('')}
function renderCases(){
  $('#caseList').innerHTML=cases.map((c,i)=>`<div class="case" data-id="${c.id}"><div class="case-top"><span class="case-index">0${i+1}</span><span class="case-name">${c.name}</span><span class="status-pill ${results[c.id]||''}">${results[c.id]==='pass'?'通过':results[c.id]==='fail'?'失败':'可执行'}</span></div><p>${c.desc}</p></div>`).join('');
  $$('.case').forEach(el=>el.onclick=()=>runCase(el.dataset.id));
}
function counts(){const v=Object.values(results);$('#passCount').textContent=v.filter(x=>x==='pass').length;$('#failCount').textContent=v.filter(x=>x==='fail').length;$('#errorCount').textContent=0}
function logStep(title,detail,bad=false,assertion=''){
  const t=$('#timeline');if(t.classList.contains('empty')){t.classList.remove('empty');t.innerHTML=''}
  t.insertAdjacentHTML('beforeend',`<div class="timeline-item"><span class="timeline-icon ${bad?'bad':''}">${bad?'!':'✓'}</span><div class="timeline-copy"><b>${title}</b><p>${detail}</p>${assertion?`<div class="assertion ${bad?'bad':''}">${assertion}</div>`:''}</div></div>`);t.scrollTop=t.scrollHeight;
}
async function action(title,detail,fn){logStep(title,detail);await sleep(330);return fn?fn():undefined}
function buildDefect(){
  $('#defectBadge').textContent='1';$('#defectEmpty').classList.add('hidden');const d=$('#defectCard');d.classList.remove('hidden');
  d.innerHTML=`<header><small>BUG-001 · 高优先级</small><h3>背包满导致发奖失败后，当天领取资格仍被消耗</h3></header><div class="defect-body"><div class="field"><b>测试版本</b><p>v1.3.0 · 含预埋缺陷</p></div><div class="field"><b>前置条件</b><p>账号今天未领取，背包已满。</p></div><div class="field"><b>复现步骤</b><p>1. 点击领取，提示背包已满；2. 清空背包；3. 再次点击领取。</p></div><div class="field"><b>预期 / 实际</b><p>预期第二次成功并获得 1 张券；实际提示“今天已经领取”，券数量为 0。</p></div><div class="field"><b>影响</b><p>用户未获得奖励，却失去当天领取机会。</p></div><div class="field"><b>原因线索</b><p>领取状态可能在发奖成功前被更新；尚需代码确认。</p></div><div class="field evidence-chips"><b>证据</b><span>操作时间线 × 6</span><span>领取状态快照</span><span>背包容量记录</span></div></div>`;
  $('#retestBtn').disabled=false;
}
async function runCase(id){
  if(running)return;running=true;const c=cases.find(x=>x.id===id);$$('.case').forEach(x=>x.classList.toggle('active',x.dataset.id===id));
  $('#runStatus').textContent='执行中';$('#runStatus').className='idle running';$('#activeCaseName').textContent=c.name;$('#activeCaseMeta').textContent=`依据：${c.basis}`;$('#timeline').className='timeline';$('#timeline').innerHTML='';
  await action('重置测试账号','恢复默认日期、背包和领取资格',reset);
  let passed=true;
  if(id==='normal'){
    const r=await action('点击领取','页面动作：领取今日奖励',claim);passed=r.ok&&state.tickets===1;logStep('确定性断言',`券数量=${state.tickets}，领取状态=${state.claimedDate===dateKey()?'已领取':'未领取'}`,!passed,passed?'实际结果符合预期：成功获得 1 张券':'预期获得 1 张券');
  }else if(id==='duplicate'){
    await action('首次领取','建立“当天已领取”前置状态',claim);const before=state.tickets;const r=await action('再次点击领取','验证每日领取限制',claim);passed=!r.ok&&state.tickets===before;logStep('确定性断言',`提示=${r.reason}，券数量仍为 ${state.tickets}`,!passed,passed?'符合预期：未重复发奖':'出现重复发奖');
  }else if(id==='full'){
    await action('填满背包','设置 6 / 6 个格子',fill);const r=await action('点击领取','在无空位状态尝试发奖',claim);passed=!r.ok&&state.tickets===0;logStep('确定性断言',`提示=${r.reason}，券数量=${state.tickets}`,!passed,passed?'符合预期：发奖失败':'预期不应发放训练券');
  }else if(id==='retry'){
    await action('填满背包','设置 6 / 6 个格子',fill);const r1=await action('第一次点击领取','预期：背包已满，失败但不扣机会',claim);await action('清空背包','释放全部背包格子',clearBag);const r2=await action('第二次点击领取','验证失败后仍可领取',claim);passed=!r1.ok&&r2.ok&&state.tickets===1;logStep('确定性断言',`第二次提示=${r2.reason}，券数量=${state.tickets}，领取状态=${state.claimedDate===dateKey()?'已领取':'未领取'}`,!passed,passed?'实际结果符合预期：重试成功':'与预期不一致：发奖失败仍消耗了领取机会');
  }else if(id==='nextday'){
    await action('前一天领取','建立已领取状态',claim);await action('推进模拟日期','通过环境时钟进入下一天',nextDay);const r=await action('新一天点击领取','验证领取资格按日期刷新',claim);passed=r.ok&&state.tickets===2;logStep('确定性断言',`提示=${r.reason}，累计券数量=${state.tickets}`,!passed,passed?'符合预期：新一天可再次领取':'跨日后领取资格未恢复');
  }
  results[id]=passed?'pass':'fail';if(!passed){lastFailed=id;buildDefect()}
  renderCases();counts();$('#runStatus').textContent=passed?'通过':'发现缺陷';$('#runStatus').className='idle done';running=false;
}
async function runAll(){if(running)return;for(const c of cases){await runCase(c.id);await sleep(180)}}
function analyze(){
  const text=$('#requirementInput').value;let rules=[];
  if(/每天/.test(text))rules.push('每个账号每天最多领取 1 次');
  if(/不叠加|格子/.test(text))rules.push('每张训练券占 1 个背包格且不叠加');
  if(/背包满/.test(text))rules.push('背包满时发奖失败，不能消耗领取机会');
  if(/清理背包|重新领取/.test(text))rules.push('清理背包后，同一天可以再次领取');
  if(/日期|跨日/.test(text))rules.push('资格按测试环境模拟日期刷新');
  if(!rules.length)rules=['尚未识别到可验证的明确规则'];renderRules(rules);
  const ambiguous=!/日期|跨日|永久一次/.test(text);$('#ambiguity').classList.toggle('hidden',!ambiguous);$('#ambiguity').innerHTML=ambiguous?'⚠ <b>需要补充：</b>需求未说明第二天是否恢复领取资格，跨日用例暂不能确定预期。':'';
  $('#caseCount').textContent=ambiguous?'4 / 5 可执行':'5 / 5 可执行';
}
function switchTab(name){$$('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));$$('.tab-content').forEach(x=>x.classList.remove('active'));$(`#${name}Tab`).classList.add('active')}

$('#claimBtn').onclick=claim;$('#resetBtn').onclick=reset;$('#fillBtn').onclick=fill;$('#clearBtn').onclick=clearBag;$('#nextDayBtn').onclick=nextDay;$('#readBtn').onclick=()=>{setMessage(`状态已读取：${state.claimedDate===dateKey()?'今天已领取':'未领取'}，训练券 ${state.tickets} 张`);renderState()};
$('#versionSelect').onchange=e=>{state.version=e.target.value;reset();results={};lastFailed=null;renderCases();counts();setMessage(e.target.value==='buggy'?'已切换到含预埋缺陷版本':'已切换到修复版本')};
$('#analyzeBtn').onclick=analyze;$('#runAllBtn').onclick=runAll;$$('.tabs button').forEach(x=>x.onclick=()=>switchTab(x.dataset.tab));
$('#retestBtn').onclick=async()=>{state.version='fixed';$('#versionSelect').value='fixed';switchTab('steps');await runCase(lastFailed||'retry')};
renderRules();renderCases();renderState();
