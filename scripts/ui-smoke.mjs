import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--grep','all 13|shadow choice'],{stdio:'inherit'});
process.exit(result.status??1);
