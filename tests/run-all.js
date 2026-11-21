/* 全テストを一括実行
 *   node tests/run-all.js [季節数]
 */
'use strict';
const path=require('path'),cp=require('child_process');
const dir=__dirname;
const seasons=process.argv[2]||'36';
const suites=[
  ['dom-contract.js',[],'HTML と JS の噛み合い'],
  ['headless-test.js',[seasons],'エンジン不変条件'],
  ['stub-dom.js',[],'スタブ DOM での実操作']
];
let bad=0;
for(const s of suites){
  console.log('--- '+s[0]+'  ('+s[2]+') ---');
  const r=cp.spawnSync(process.execPath,[path.join(dir,s[0])].concat(s[1]),{stdio:'inherit'});
  if(r.error){ console.log('  => 起動失敗: '+r.error.message); bad++; continue; }
  if(r.status!==0){ bad++; console.log('  => 失敗 (exit '+r.status+')'); }
}
console.log('');
console.log(bad?('✕ '+bad+' 個のスイートが失敗しました'):('✓ 全スイート成功（'+suites.length+' 個）'));
process.exit(bad?1:0);
