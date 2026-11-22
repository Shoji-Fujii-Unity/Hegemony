/* PixiJS の非同期初期化とテクスチャ読み込みの回帰テスト */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('var battleMounted=false,BOARD=null');
const end=html.indexOf('/* ---------- DOM 盤面（予備） ---------- */',start);
assert(start>=0&&end>start,'盤面コードを検出');

function element(){
  const classes=new Set();
  return {
    style:{},children:[],clientWidth:320,clientHeight:300,
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
    appendChild(child){ this.children.push(child); return child; },
    addEventListener(){},setAttribute(){},getAttribute(){ return '0'; }
  };
}
const hosts={boardWrap:element(),boardHolder:element(),pixiHost:element(),domBoard:element()};
let resolveInit,initOptions,apps=0;
const pending=new Map(),empty={};
class Container{
  constructor(){ this.children=[]; }
  addChild(child){ child.parent=this; this.children.push(child); }
  removeChildren(){ this.children.forEach(child=>{ child.parent=null; }); this.children=[]; }
}
class Application{
  constructor(){ apps++; this.stage=new Container(); this.canvas=element(); }
  init(options){ initOptions=options; return new Promise(resolve=>{ resolveInit=resolve; }); }
  destroy(){}
}
const sandbox={
  console,Promise,LIB:{pixi:true},window:{devicePixelRatio:2},
  BT:{cols:1,rows:1,meSide:'p',tiles:[[{t:'plain'}]],units:[]},
  el:id=>hosts[id],clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  tileUri:()=> 'tile',onBoardTap(){},
  document:{createElement:()=>element(),createDocumentFragment:()=>element()},
  PIXI:{
    Application,Container,Rectangle:class{},Sprite:class{ constructor(texture){ this.texture=texture; } },
    Texture:{EMPTY:empty},
    Assets:{load(uri){
      assert(!pending.has(uri),'同一テクスチャの重複読み込み');
      let resolve,reject;
      const promise=new Promise((yes,no)=>{ resolve=yes; reject=no; });
      pending.set(uri,{resolve,reject});
      return promise;
    }}
  }
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start,end),sandbox);
vm.runInContext(html.slice(end,html.indexOf('DomBoard.prototype.render=',end)),sandbox);
sandbox.DomBoard.prototype.render=function(){};
sandbox.renderBattle=()=>{ if(sandbox.BOARD) sandbox.BOARD.render(sandbox.BT,{hl:{}},{}); };
const flush=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  sandbox.layoutBoard();
  sandbox.mountBoard();
  assert.strictEqual(apps,1,'初期化中に二重マウントしない');
  assert.strictEqual(initOptions.autoDensity,true,'高 DPI でも表示サイズと操作位置を一致させる');
  resolveInit();
  await flush();
  assert.strictEqual(sandbox.BOARD.kind,'pixi');
  const tile=sandbox.BOARD.layer.children[0];
  assert.strictEqual(tile.texture,empty,'読み込み中はプレースホルダー');
  const texture={width:16,height:16};
  pending.get('tile').resolve(texture);
  await flush();
  assert.strictEqual(tile.texture,texture,'読み込み完了後に実際のテクスチャを表示');
  assert.strictEqual(tile.width,sandbox.BOARD.cell);
  [...pending.entries()].find(([uri])=>uri!=='tile')[1].reject(new Error('asset failed'));
  await flush();
  assert.strictEqual(sandbox.BOARD.kind,'dom','画像読み込み失敗時は DOM 盤面へ切り替える');
  assert(!hosts.domBoard.classList.contains('hidden'));
  sandbox.layoutBoard();
  assert.strictEqual(sandbox.BOARD.kind,'dom','再レイアウトしてもフォールバックを維持');
  console.log('✓ PixiJS 盤面の非同期読み込み・フォールバック');
})().catch(error=>{ console.error(error); process.exitCode=1; });
