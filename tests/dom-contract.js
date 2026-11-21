/* DOM 契約テスト：HTML 側と JS 側の参照が噛み合っているかを守る
 *   node tests/dom-contract.js
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const body=html.split('</head>')[1]||html;
const style=(html.match(/<style>([\s\S]*?)<\/style>/)||[,''])[1];

const blocks=[];const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m;
while((m=re.exec(html))){ if(m[1].indexOf('window.__lib')>=0) continue; blocks.push(m[1]); }
const js=blocks.join('\n;\n');
const ctx=vm.createContext({console,setTimeout:()=>0,clearTimeout:()=>0,setInterval:()=>0,clearInterval:()=>0});
let parseError=null;
try{ vm.runInContext(js,ctx,{filename:'inline.js'}); }catch(e){ parseError=e; }

let pass=0,fail=0;const fails=[],warn=[];
function ok(c,label){ if(c) pass++; else { fail++; fails.push(label); } }

ok(!parseError,'JS がパースできる'+(parseError?': '+parseError.message:''));
if(parseError){ report(); process.exit(1); }

/* ---- 1. id 契約 ---- */
const ids=[];let r;
const idRe=/\bid="([\w-]+)"/g;
while((r=idRe.exec(body))) ids.push(r[1]);
/* JS が innerHTML で作る id も含む */
const jsIdRe=/id=['"]([\w-]+)['"]/g;
while((r=jsIdRe.exec(js))) ids.push(r[1]);
const idSet=new Set(ids);
const dupCheck=(body.match(/\bid="([\w-]+)"/g)||[]);
ok(new Set(dupCheck).size===dupCheck.length,'HTML 側に id 重複が無い（'+dupCheck.length+'個）');
const refs=new Set();
[/\bel\('([\w-]+)'\)/g,/getElementById\('([\w-]+)'\)/g,/openOverlay\('([\w-]+)'\)/g,/closeOverlay\('([\w-]+)'\)/g,
 /\bon\('([\w-]+)'/g,/chipSet\('([\w-]+)'/g,/querySelector\('#([\w-]+)'\)/g,/querySelectorAll\('#([\w-]+)'/g]
  .forEach(rx=>{ while((r=rx.exec(js))) refs.add(r[1]); });
refs.forEach(id=>ok(idSet.has(id),'JS が指す id が存在する: '+id));
const unusedIds=[...new Set(body.match(/\bid="([\w-]+)"/g)||[])].map(s=>s.slice(4,-1))
  .filter(id=>!refs.has(id)&&!new RegExp('#'+id+'[^-\\w]').test(style));
unusedIds.forEach(id=>warn.push('未使用の id: '+id));

/* ---- 2. 多言語キー契約 ---- */
const I18N=ctx.I18N;
const langs=Object.keys(I18N);
ok(langs.includes('ja')&&langs.includes('en'),'ja/en が定義済み');
const used=new Set();
const tRe=/\bt\('([a-z0-9_]+)'\s*\)/g;
while((r=tRe.exec(js))) used.add(r[1]);
/* data-i18n 属性もキーとして検証 */
const di18n=new Set();
const dRe=/data-i18n="([a-z0-9_]+)"/g;
while((r=dRe.exec(body))) di18n.add(r[1]);
di18n.forEach(k=>used.add(k));
ok(di18n.size>40,'data-i18n キーを検出（'+di18n.size+'個）');
used.forEach(k=>{
  langs.forEach(l=>ok(k in I18N[l],'キー '+k+' が '+l+' にある'));
});
/* t(key) のうち I18N に無いものは、動的生成キー（genName 等）だけ。念のため列挙 */
const missing=[...used].filter(k=>!(k in I18N.ja));
ok(missing.length===0,'未定義キーで呼ばれる t() が無い'+(missing.length?': '+missing.join(','):''));
/* 連結で作るキー t('xxx_'+..) の接頭辞が実在するか */
const pfxRe=/\bt\('([a-z0-9_]+_)'\s*\+/g;
const pfxs=new Set();
while((r=pfxRe.exec(js))) pfxs.add(r[1]);
ok(pfxs.size>5,'連結キーの接頭辞を検出（'+[...pfxs].join(',')+'）');
pfxs.forEach(p=>{
  langs.forEach(l=>{
    const n=Object.keys(I18N[l]).filter(k=>k.startsWith(p)).length;
    ok(n>0,'接頭辞 '+p+' のキーが '+l+' に存在する（'+n+'件）');
  });
});
const dataMap={unit_:Object.keys(ctx.TYPES),ty_:Object.keys(ctx.TYPES),spec_:Object.keys(ctx.SPEC),
  terr_:Object.keys(ctx.TERRAIN),trn_:Object.keys(ctx.TERRAIN),sk_:Object.keys(ctx.SKILLS),
  diff_:Object.keys(ctx.DIFF),wd_:Object.keys(ctx.WWEA)};
Object.keys(dataMap).forEach(p=>{
  if(!pfxs.has(p)) return;
  dataMap[p].forEach(k2=>ok((p+k2) in I18N.ja,'接頭辞キー '+p+k2));
});
/* 盤面タイルのラベル tg_* は全言語・全地形分必須 */
Object.keys(ctx.TERRAIN).forEach(t2=>langs.forEach(l=>ok(('tg_'+t2) in I18N[l],'盤面ラベル tg_'+t2+' ('+l+')')));
/* 勢力・都市・武将名は全言語 */
ctx.STATES.forEach(s=>['ja','en','zh'].forEach(l=>ok(!!s.n[l],'勢力名 '+s.k+' '+l)));
ctx.CITIES.forEach(c=>['ja','en','zh'].forEach(l=>ok(!!c.n[l],'都市名 '+c.k+' '+l)));
ctx.GENERALS.forEach(g=>['ja','en','zh'].forEach(l=>ok(!!g.n[l],'武将名 '+g.k+' '+l)));

/* ---- 3. イベント結線（インラインハンドラに依存しない設計） ---- */
const handlers=[];
const hRe=/\bon(?:click|change|input|submit|keydown)="([^"]*)"/g;
while((r=hRe.exec(body))) handlers.push(r[1]);
ok(handlers.length===0,'HTML にインライン on*= ハンドラを書いていない（JS で結線）');
/* on('id',...) の結線先は上記の id 契約で検査済み。ここでは键盘ショートカットの存在を見る */
ok(/addEventListener\('keydown'/.test(js),'キーボード操作を受け付ける');
ok(/function on\(/.test(js),'結線ヘルパ on() がある');

/* ---- 4. CSS クラス契約（警告のみ） ---- */
const clsUse=new Set();
const cRe=/class="([a-z0-9_ \-]+)"/g;
while((r=cRe.exec(js))) r[1].split(/\s+/).forEach(c=>{ if(c) clsUse.add(c); });
const cRe2=/class="([a-z0-9_ \-]+)"/g;
while((r=cRe2.exec(body))) r[1].split(/\s+/).forEach(c=>{ if(c) clsUse.add(c); });
const dyn=new Set(['on','go','warn','sel','active','hidden','dead','lose','win','brush','lit']);
[...clsUse].forEach(c=>{
  if(!new RegExp('\\.'+c.replace(/[-]/g,'\\-')+'(\\b|[^\\w])').test(style)) dyn.add(c);
});
if(dyn.size) warn.push('CSS 未定義のクラス（動的付与の可能性）: '+[...dyn].join(', '));

/* ---- 5. 画面・オーバーレイの対応 ---- */
const screens=[...body.matchAll(/id="(scr[A-Z]\w*)"/g)].map(x=>x[1]);
ok(screens.length===3,'画面が3つ（'+screens.join(',')+'）');
screens.forEach(s=>ok(new RegExp("'"+s+"'").test(js),'画面 '+s+' が JS から参照される'));
const overlays=[...body.matchAll(/id="(\w+Ov)"/g)].map(x=>x[1]);
ok(overlays.length>=7,'オーバーレイ数 '+overlays.length);
overlays.forEach(o=>ok(refs.has(o)||/bootOv/.test(o),'オーバーレイ '+o+' が open/close される'));

/* ---- 6. ライブラリ依存の最低限 ---- */
ok(/pixi\.js@8/.test(html),'PixiJS v8 の URL');
ok(/gsap@3/.test(html),'GSAP v3 の URL');
ok(/tone@14/.test(html),'Tone.js v14 の URL');
ok(/chart\.js@4/.test(html),'Chart.js v4 の URL');
blocks.concat(html.match(/<script src="[^"]+"/g)||[]).forEach(()=>{});
ok(!/\bimport\s|\bexport\s|type="module"/.test(html),'ESM を使っていない（file:// で動く）');
ok(!/\bfetch\s*\(|XMLHttpRequest/.test(js),'外部取り読み込みが無い（完全オフライン動作）');
ok(/localStorage/.test(js),'セーブ機能あり');
ok(/lang="ja"/.test(html),'html lang 指定');
ok(/<meta name="viewport"/.test(html),'viewport 指定');

/* ---- 7. 起動順 ---- */
ok(/function boot\(\)/.test(js),'boot() がある');
ok(/addEventListener\('DOMContentLoaded'/.test(js)||/readyState/.test(js),'DOM 準備待ちがある');
ok(ctx.I18N.ja.help_html.indexOf('{_skills}')>=0,'ヘルプの战法一覧プレースホルダ');
ok(!!ctx.I18N.zh,'中華語（I18N.zh）が読み込まれている');
ok(/I18N\.zh\s*=\s*\{/.test(html),'中華語ブロックが本体に埋め込み済み');

report();
function report(){
  if(warn.length) console.log('警告:\n'+warn.map(w=>'  ! '+w).join('\n'));
  console.log('\n'+(fail?'✕':'✓')+' DOM契約 '+pass+' 件成功 / 失敗 '+fail+' 件');
  if(fail) console.log(fails.slice(0,30).map(f=>'  - '+f).join('\n'));
  if(fail) process.exit(1);
}
