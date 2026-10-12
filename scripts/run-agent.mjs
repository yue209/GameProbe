import { runAgent } from '../src/playwright-runner.mjs';
const version=process.argv.includes('--version')?process.argv[process.argv.indexOf('--version')+1]:'buggy';
const baseURL=process.env.QA_BASE_URL||'http://127.0.0.1:4175';
const result=await runAgent({baseURL,version});console.log(JSON.stringify(result,null,2));
