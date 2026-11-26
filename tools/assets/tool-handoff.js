(()=>{"use strict";
const key="ogb-tool-handoff-v1",ttl=15*60*1000,limit=1000000,byId=id=>document.getElementById(id);
const labels={"product-listing-prep":"商品登録・出品準備","product-ledger":"商品台帳","inventory-movement":"入出庫・現在庫集計","invoice-maker":"見積書・請求書作成","receivables-report":"売掛金管理","daily-sales-ledger":"日次売上台帳","sales-summary":"月次売上集計","annual-income-summary":"年間所得集計","income-tax-simulator":"所得税計算","resident-tax-simulator":"住民税計算","annual-expense-merge":"年間経費集計","expense-category-report":"経費科目別集計","product-margin-report":"商品別利益集計","channel-profit-report":"販売チャネル別利益集計","side-income-summary":"副業・給与所得集計","order-line-aggregate":"注文別集計","order-payment-reconcile":"受注・決済照合","packing-checklist":"発送準備チェックリスト","inventory-reorder":"在庫・発注点チェック","purchase-receiving":"仕入発注・入荷照合","stocktake-reconcile":"棚卸差異・在庫評価","supplier-payment-reconcile":"仕入先支払照合","shop-sales-performance":"日別売上分析","staff-cost-planner":"人件費計画","recipe-cost-calculator":"レシピ原価計算","project-profit-report":"案件別採算集計","business-expense-allocation":"家事按分","depreciation-calculator":"減価償却費計算","consumption-tax-simulator":"消費税概算","csv-merge":"CSV一括結合","csv-analyzer":"CSV自動分析","list-cleaner":"リスト整理","basic-statistics":"基本統計量"};
function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e}
function button(id,text){const e=node("button",text);e.type="button";e.id=id;return e}
function get(){const raw=sessionStorage.getItem(key);if(!raw)return null;let x;try{x=JSON.parse(raw)}catch{sessionStorage.removeItem(key);return null}if(!x||x.v!==1||typeof x.csv!=="string"||!x.csv||x.csv.length>limit||typeof x.created!=="number"||!Number.isFinite(x.created)||Date.now()-x.created>ttl||x.created>Date.now()+60000){sessionStorage.removeItem(key);return null}return x}
let activeConfig=null;
function init(cfg,getPayload,receivePayload){activeConfig=cfg;const guard=byId(cfg.guard||"export");
 const out=byId("handoffOut"),incoming=byId("handoffIn");
 if(out){const status=node("p");status.id="handoffOutStatus";status.setAttribute("role","status");out.append(node("p","次のツールへ直接引き継ぐ（CSV保存・再読み込み不要）"));const controls=[];for(const [dest,label] of cfg.out){const b=button("handoff-"+dest,label+"へ進む");controls.push(b);out.append(b);b.addEventListener("click",()=>{try{if(guard.disabled)throw Error("先に有効な明細・計算結果を用意してください。");const payload=getPayload(dest);if(typeof payload.csv!=="string"||!payload.csv||payload.csv.length>limit)throw Error("引継ぎデータが大きすぎます。CSV保存をご利用ください。");if(!confirm("同じタブで"+label+"へ移動します。現在の入力を残す必要がある場合は先に保存してください。進みますか？"))return;sessionStorage.setItem(key,JSON.stringify({v:1,created:Date.now(),source:cfg.slug,dest,csv:payload.csv,day:payload.day}));location.assign("../"+dest+"/")}catch(e){status.textContent="引継ぎできませんでした。"+e.message}})}out.append(status);const update=()=>controls.forEach(b=>b.disabled=guard.disabled);new MutationObserver(update).observe(guard,{attributes:true,attributeFilter:["disabled"]});update()}
 if(incoming){let data;try{data=get()}catch{return}if(!data||data.dest!==cfg.slug||!Object.prototype.hasOwnProperty.call(cfg.inbound,data.source))return;incoming.hidden=false;const status=node("p",(labels[data.source]||"前のツール")+"から引継ぎデータがあります。読み込んで内容を確認してください。"+(window.OGBCsvDraft?"保存済みの入力がある場合は読み込み時に復元してから追加します。":window.OGBTaxDraft?"保存済みの金額・設定は読込時に復元します。対象項目と適用条件を確認してください。":cfg.slug==="annual-expense-merge"?"保存済みの経費資料を復元して新しい資料を追加します。":window.OGBLedgerDraft&&cfg.slug==="packing-checklist"?"保存済みの進捗は読込時に復元してから追加します。":window.OGBEditableGrid?"保存済みの表入力は読込時に復元し、登録済みSKUを維持します。":cfg.slug==="profit-break-even"?"保存済みの計算条件を保持し、引継ぎ項目だけ反映します。":["csv-analyzer","list-cleaner","basic-statistics","correlation"].includes(cfg.slug)?"引継ぎ後に対象列や入力内容を確認してください。":"保存済みの入力を利用する場合は先に復元してください。")+""),accept=button("handoffAccept","引継ぎデータを読み込む"),discard=button("handoffDiscard","引継ぎを取り消す");status.id="handoffInStatus";status.setAttribute("role","status");incoming.append(status,accept,discard);accept.addEventListener("click",()=>{try{const latest=get();if(!latest||latest.dest!==cfg.slug||latest.source!==data.source||latest.created!==data.created||latest.csv!==data.csv)throw Error("引継ぎデータの有効期限が切れたか、変更されました。");if(window.OGBTaxDraft)window.OGBTaxDraft.prepareHandoff();if(receivePayload){if(window.OGBLedgerDraft&&cfg.slug==="packing-checklist")window.OGBLedgerDraft.prepareHandoff();if(window.OGBCsvDraft)window.OGBCsvDraft.prepareHandoff();if(receivePayload(latest)===false)return;sessionStorage.removeItem(key);incoming.hidden=true;return}const input=byId(cfg.inbound[data.source]),dt=new DataTransfer();dt.items.add(new File([latest.csv],"tool-handoff.csv",{type:"text/csv"}));if(!input)throw Error("取込先がありません。");if(cfg.slug==="cash-register-close"&&latest.day){const day=byId("date");if(/^\d{4}-\d{2}-\d{2}$/.test(latest.day)){day.value=latest.day;day.dispatchEvent(new Event("input",{bubbles:true}))}}input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));sessionStorage.removeItem(key);incoming.hidden=true}catch(e){status.textContent=e.message}});discard.addEventListener("click",()=>{try{const latest=get();if(latest&&latest.dest===cfg.slug&&latest.created===data.created)sessionStorage.removeItem(key);incoming.hidden=true}catch(e){status.textContent=e.message}})}
}

const catalog={"pdf-split-rename":"PDF分割・一括命名","image-batch":"画像一括変換・圧縮","list-cleaner":"リスト整理","csv-merge":"CSV結合","csv-analyzer":"CSV分析","basic-statistics":"基本統計","correlation":"相関係数","product-listing-prep":"商品名・SKU・出品準備","product-ledger":"商品台帳・出品状況管理","inventory-movement":"入出庫・現在庫集計","inventory-reorder":"在庫・発注点チェック","stocktake-reconcile":"棚卸差異・在庫評価","purchase-receiving":"仕入発注・入荷照合","supplier-payment-reconcile":"仕入請求・支払照合","inventory-aging":"滞留在庫・在庫年齢分析","marketplace-profit-compare":"メルカリ・ヤフオク利益比較","pricing-simulator":"販売価格・利益率の逆算","profit-break-even":"販売利益・損益分岐点","order-line-aggregate":"注文明細集計","order-payment-reconcile":"注文・決済照合","packing-checklist":"発送・梱包チェック","returns-refunds":"返品・返金管理","shipping-cost-report":"配送方法別送料・配送コスト集計","product-margin-report":"商品別粗利益・利益率集計","channel-profit-report":"販売チャネル別利益集計","daily-sales-ledger":"日次売上台帳","cash-register-close":"レジ締め・現金照合","sales-summary":"月次売上集計","shop-sales-performance":"日別売上・客数・曜日分析","recipe-cost-calculator":"メニュー・レシピ原価計算","staff-cost-planner":"勤務時間・人件費予算集計","invoice-maker":"見積書・請求書作成","receivables-report":"請求・売掛金・入金管理","cash-flow-planner":"月別資金繰り計画","project-profit-report":"案件別採算・作業時間集計","expense-category-report":"経費科目別支出集計","annual-income-summary":"年間売上・経費・所得集計","annual-expense-merge":"年間経費CSV統合","income-tax-simulator":"所得税・復興特別所得税","resident-tax-simulator":"住民税・森林環境税","business-expense-allocation":"家事按分・事業経費計算","depreciation-calculator":"減価償却費計算・定額法","side-income-summary":"副業・雑所得・一時所得集計","tax-filing-check":"確定申告の必要性確認","tax-reserve-planner":"納税資金管理","consumption-tax-simulator":"消費税概算・課税方式比較","withholding-tax-calculator":"報酬の源泉徴収税額計算"};
const workflows=[{"id":"products","name":"商品登録・出品・価格設定","business":["online-selling"],"steps":["product-listing-prep","product-ledger","image-batch","marketplace-profit-compare","pricing-simulator"]},{"id":"stock","name":"仕入・在庫・棚卸","business":["online-selling","small-shop"],"steps":["product-ledger","inventory-movement","inventory-reorder","purchase-receiving","stocktake-reconcile","inventory-aging","supplier-payment-reconcile","cash-flow-planner"]},{"id":"orders","name":"受注・決済・発送・返品","business":["online-selling"],"steps":["order-line-aggregate","order-payment-reconcile","packing-checklist","returns-refunds","shipping-cost-report"]},{"id":"profit","name":"販売利益・経費管理","business":["online-selling","small-shop"],"steps":["product-margin-report","channel-profit-report","profit-break-even","expense-category-report","annual-income-summary"]},{"id":"daily","name":"店舗の売上・人件費管理","business":["small-shop"],"steps":["daily-sales-ledger","cash-register-close","sales-summary","shop-sales-performance","staff-cost-planner","recipe-cost-calculator","profit-break-even"]},{"id":"invoice","name":"請求・入金・資金繰り","business":["freelance","small-shop"],"steps":["invoice-maker","withholding-tax-calculator","receivables-report","cash-flow-planner","project-profit-report","pdf-split-rename"]},{"id":"expense","name":"年間経費・事業所得・納税準備","business":["online-selling","small-shop","freelance"],"steps":["expense-category-report","business-expense-allocation","depreciation-calculator","annual-expense-merge","annual-income-summary","income-tax-simulator","resident-tax-simulator","consumption-tax-simulator","tax-reserve-planner"]},{"id":"side","name":"副業・申告要否の確認","business":["freelance"],"steps":["project-profit-report","side-income-summary","tax-filing-check","income-tax-simulator"]},{"id":"data","name":"CSV・リスト・統計分析","business":[],"steps":["csv-merge","csv-analyzer","list-cleaner","basic-statistics","correlation"]},{"id":"files","name":"画像・PDFファイル整理","business":[],"steps":["image-batch","pdf-split-rename"]}];
const businessNames={"online-selling":"ネット物販","small-shop":"小規模店舗","freelance":"個人事業主・フリーランス"};
const navKey="ogb-tool-navigation-v1";
const known=s=>typeof s==="string"&&Object.prototype.hasOwnProperty.call(catalog,s);
const cleanList=(a,n)=>Array.isArray(a)?[...new Set(a.filter(known))].slice(0,n):[];
function sanitizeNav(x){return {version:1,favorites:cleanList(x?.favorites,47),historyEnabled:x?.historyEnabled===true,recent:x?.historyEnabled===true?cleanList(x.recent,8):[]}}
function pageContext(path){const m=path.match(/(?:^|\/)tools\/(?:(business)\/([a-z-]+)\/?|([a-z-]+)\/?)?(?:index\.html)?$/);if(!m)return null;if(m[1])return Object.hasOwn(businessNames,m[2])?{business:m[2],base:"../../"}:null;if(m[3])return known(m[3])?{slug:m[3],base:"../"}:null;return {directory:true,base:"./"}}

const draftRegistry={"inventory-movement":{"key":"ogb-csv-grid-draft-v1:/tools/inventory-movement/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"receivables-report":{"key":"ogb-csv-grid-draft-v1:/tools/receivables-report/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"cash-flow-planner":{"key":"ogb-csv-grid-draft-v1:/tools/cash-flow-planner/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"shop-sales-performance":{"key":"ogb-csv-grid-draft-v1:/tools/shop-sales-performance/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"recipe-cost-calculator":{"key":"ogb-csv-grid-draft-v1:/tools/recipe-cost-calculator/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"staff-cost-planner":{"key":"ogb-csv-grid-draft-v1:/tools/staff-cost-planner/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"project-profit-report":{"key":"ogb-csv-grid-draft-v1:/tools/project-profit-report/","kind":"csv","restore":"csvDraftRestore","remove":"csvDraftDelete"},"stocktake-reconcile":{"key":"ogb-grid-draft-v1:/tools/stocktake-reconcile/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"purchase-receiving":{"key":"ogb-grid-draft-v1:/tools/purchase-receiving/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"supplier-payment-reconcile":{"key":"ogb-grid-draft-v1:/tools/supplier-payment-reconcile/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"inventory-aging":{"key":"ogb-grid-draft-v1:/tools/inventory-aging/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"shipping-cost-report":{"key":"ogb-grid-draft-v1:/tools/shipping-cost-report/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"product-margin-report":{"key":"ogb-grid-draft-v1:/tools/product-margin-report/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"channel-profit-report":{"key":"ogb-grid-draft-v1:/tools/channel-profit-report/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"expense-category-report":{"key":"ogb-grid-draft-v1:/tools/expense-category-report/","kind":"grid","restore":"ogbGridRestore","remove":"ogbGridDelete"},"annual-income-summary":{"key":"ogb-tax-form-draft-2026-v1:/tools/annual-income-summary/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"income-tax-simulator":{"key":"ogb-tax-form-draft-2026-v1:/tools/income-tax-simulator/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"resident-tax-simulator":{"key":"ogb-tax-form-draft-2026-v1:/tools/resident-tax-simulator/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"depreciation-calculator":{"key":"ogb-tax-form-draft-2026-v1:/tools/depreciation-calculator/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"side-income-summary":{"key":"ogb-tax-form-draft-2026-v1:/tools/side-income-summary/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"tax-filing-check":{"key":"ogb-tax-form-draft-2026-v1:/tools/tax-filing-check/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"tax-reserve-planner":{"key":"ogb-tax-form-draft-2026-v1:/tools/tax-reserve-planner/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"consumption-tax-simulator":{"key":"ogb-tax-form-draft-2026-v1:/tools/consumption-tax-simulator/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"withholding-tax-calculator":{"key":"ogb-tax-form-draft-2026-v1:/tools/withholding-tax-calculator/","kind":"tax","restore":"taxDraftRestore","remove":"taxDraftDelete"},"invoice-maker":{"key":"ogb-row-draft-v1:invoice-maker","kind":"row","restore":"rowDraftRestore","remove":"rowDraftDelete"},"business-expense-allocation":{"key":"ogb-row-draft-v1:business-expense-allocation","kind":"row","restore":"rowDraftRestore","remove":"rowDraftDelete"},"daily-sales-ledger":{"key":"ogb-daily-sales-ledger-v1","kind":"ledger","restore":"draftRestore","remove":"draftDelete"},"packing-checklist":{"key":"ogb-packing-checklist-v1","kind":"ledger","restore":"draftRestore","remove":"draftDelete"},"returns-refunds":{"key":"ogb-returns-refunds-v1","kind":"ledger","restore":"draftRestore","remove":"draftDelete"},"product-ledger":{"key":"ogb-product-ledger-v1","kind":"product","restore":"rows","remove":"clear"},"profit-break-even":{"key":"ogb-profit-break-even-v1","kind":"profit","restore":"profitDraftRestore","remove":"profitDraftDelete"},"annual-expense-merge":{"key":"ogb-annual-expense-merge-2026-v1","kind":"expense","restore":"expenseDraftRestore","remove":"expenseDraftDelete"},"pricing-simulator":{"key":"ogb-form-draft-v1:pricing-simulator","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"inventory-reorder":{"key":"ogb-form-draft-v1:inventory-reorder","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"marketplace-profit-compare":{"key":"ogb-form-draft-v1:marketplace-profit-compare","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"cash-register-close":{"key":"ogb-form-draft-v1:cash-register-close","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"product-listing-prep":{"key":"ogb-form-draft-v1:product-listing-prep","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"list-cleaner":{"key":"ogb-form-draft-v1:list-cleaner","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"basic-statistics":{"key":"ogb-form-draft-v1:basic-statistics","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"correlation":{"key":"ogb-form-draft-v1:correlation","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete"},"csv-merge":{"key":"ogb-form-draft-v1:csv-merge","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true},"csv-analyzer":{"key":"ogb-form-draft-v1:csv-analyzer","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true},"order-line-aggregate":{"key":"ogb-form-draft-v1:order-line-aggregate","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true},"order-payment-reconcile":{"key":"ogb-form-draft-v1:order-payment-reconcile","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true},"pdf-split-rename":{"key":"ogb-form-draft-v1:pdf-split-rename","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true},"image-batch":{"key":"ogb-form-draft-v1:image-batch","kind":"form","restore":"formDraftRestore","remove":"formDraftDelete","settingsOnly":true}};
const draftKinds={csv:"表入力・計算条件",grid:"表入力",tax:"税務計算条件",row:"明細・入力条件",ledger:"台帳・進捗",product:"商品台帳（自動保存）",profit:"計算条件",expense:"年間経費資料",form:"入力・計算条件"};
function draftMeta(raw,kind){
 if(raw===null)return null;
 try{
  if(typeof raw!=="string"||raw.length>6000000)throw Error("size");
  const x=JSON.parse(raw),obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v),array=Array.isArray;
  let valid=false,count=null;
  if(kind==="product"){valid=array(x)&&x.every(r=>array(r)&&r.length===6);if(valid&&x.length===0)return null;if(valid)count=x.length}
  else if(kind==="grid"){valid=obj(x)&&array(x.fields)&&array(x.data)&&x.data.every(r=>array(r)&&r.length===x.fields.length);if(valid)count=x.data.filter(r=>r.some(v=>v!=="")).length}
  else if(kind==="csv"){valid=obj(x)&&x.version===1&&array(x.labels)&&typeof x.data==="string"&&obj(x.settings)}
  else if(kind==="tax"){valid=obj(x)&&x.version===1&&x.year===2026&&obj(x.fields)}
  else if(kind==="row"){valid=obj(x)&&x.version===1&&obj(x.fields)&&array(x.rows);if(valid)count=x.rows.length}
  else if(kind==="ledger"){valid=obj(x)&&x.version===1&&array(x.items);if(valid)count=x.items.length}
  else if(kind==="profit"){valid=obj(x)&&x.version===1&&obj(x.fields)}
  else if(kind==="form"){valid=obj(x)&&x.version===1&&typeof x.tool==="string"&&obj(x.fields)}
  else if(kind==="expense"){valid=obj(x)&&x.version===1&&x.year===2026&&array(x.sources);if(valid)count=x.sources.length}
  if(!valid)throw Error("format");
  const time=typeof x.savedAt==="string"&&Number.isFinite(Date.parse(x.savedAt))?Date.parse(x.savedAt):null;
  return {state:"saved",time,count};
 }catch{return {state:"check",time:null,count:null}}
}
function inspectDrafts(storage){const result=[];for(const [slug,info] of Object.entries(draftRegistry)){const m=draftMeta(storage.getItem(info.key),info.kind);if(m)result.push({slug,...m})}return result.sort((a,b)=>(b.time??-1)-(a.time??-1)||catalog[a.slug].localeCompare(catalog[b.slug],"ja"))}


const backupLimit=12000000;
function validBackupRaw(slug,raw){
 if(!Object.hasOwn(draftRegistry,slug)||typeof raw!=="string")return false;
 const info=draftRegistry[slug],meta=draftMeta(raw,info.kind);
 if(!meta||meta.state!=="saved")return false;
 try{const x=JSON.parse(raw);return !["row","form"].includes(info.kind)||x.tool===slug}catch{return false}
}
function makeBackup(storage){
 const entries=[],skipped=[];
 for(const [slug,info] of Object.entries(draftRegistry)){const raw=storage.getItem(info.key);if(raw===null||draftMeta(raw,info.kind)===null)continue;if(validBackupRaw(slug,raw))entries.push({slug,raw});else skipped.push(slug)}
 const data={format:"ogb-data-lab-backup",version:1,createdAt:new Date().toISOString(),entries};
 const text=JSON.stringify(data);if(text.length>backupLimit)throw Error("バックアップの容量が上限を超えています。各ツールのCSV・編集用ファイルをご利用ください。");
 return {text,entries,skipped};
}
function parseBackup(text){
 if(typeof text!=="string"||text.length>backupLimit)throw Error("バックアップファイルの容量が上限を超えています。");
 const data=JSON.parse(text.replace(/^\uFEFF/,""));
 if(!data||data.format!=="ogb-data-lab-backup"||data.version!==1||!Array.isArray(data.entries)||!data.entries.length||data.entries.length>Object.keys(draftRegistry).length)throw Error("Data Labのバックアップ形式と一致しません。");
 const seen=new Set(),result=[];
 for(const e of data.entries){if(!e||typeof e.slug!=="string"||seen.has(e.slug)||!validBackupRaw(e.slug,e.raw))throw Error("未対応のツール、重複、または保存形式に問題があります。元の端末で確認してください。");seen.add(e.slug);result.push({slug:e.slug,raw:e.raw,meta:draftMeta(e.raw,draftRegistry[e.slug].kind)})}
 return result;
}
function restoreMissing(storage,entries){
 const applied=[],skipped=[],failed=[];
 for(const e of entries){try{if(!validBackupRaw(e.slug,e.raw))throw Error("format");const key=draftRegistry[e.slug].key;if(storage.getItem(key)!==null){skipped.push(e.slug);continue}storage.setItem(key,e.raw);applied.push(e.slug)}catch{failed.push(e.slug)}}
 return {applied,skipped,failed};
}


const workKey="ogb-workspace-v1",workLimit=20;
function parseWorkspace(raw){
 if(raw===null)return {version:1,active:"",sets:[]};
 if(typeof raw!=="string"||raw.length>100000)throw Error("業務セットの保存形式を確認してください。");
 const x=JSON.parse(raw);if(!x||x.version!==1||!Array.isArray(x.sets)||x.sets.length>workLimit||typeof x.active!=="string")throw Error("業務セットの保存形式を確認してください。");
 const seen=new Set();
 for(const s of x.sets){
  if(!s||typeof s.id!=="string"||!/^w-[a-z0-9-]{1,70}$/.test(s.id)||seen.has(s.id)||typeof s.name!=="string"||!s.name.trim()||s.name.length>60||!Array.isArray(s.steps)||s.steps.length>47||s.steps.some(t=>!known(t))||new Set(s.steps).size!==s.steps.length||!Array.isArray(s.done)||new Set(s.done).size!==s.done.length||s.done.some(t=>!s.steps.includes(t)))throw Error("業務セットの保存内容を確認してください。");
  seen.add(s.id);
 }
 if(x.active&&!seen.has(x.active))throw Error("選択中の業務セットが存在しません。");
 return x;
}
function workspaceNext(s){return s?.steps.find(t=>!s.done.includes(t))||""}
function workspaceMove(s,slug,delta){const i=s.steps.indexOf(slug),j=i+delta;if(i<0||![-1,1].includes(delta)||j<0||j>=s.steps.length)return false;[s.steps[i],s.steps[j]]=[s.steps[j],s.steps[i]];return true}

function renderNavigation(){
 const ctx=pageContext(location.pathname),main=document.querySelector("main");if(!ctx||!main||document.getElementById("ogbToolNavigation"))return;
 let available=true,state;function readState(){try{return sanitizeNav(JSON.parse(localStorage.getItem(navKey)||"null"))}catch(e){available=false;return sanitizeNav(null)}}
 state=readState();const saveState=next=>{if(!available)return false;try{localStorage.setItem(navKey,JSON.stringify(next));state=next;return true}catch(e){available=false;return false}};
 if(ctx.slug&&state.historyEnabled)saveState({...state,recent:[ctx.slug,...state.recent.filter(s=>s!==ctx.slug)].slice(0,8)});
 const panel=node("section");panel.id="ogbToolNavigation";panel.setAttribute("aria-label","Data Lab ツールナビ");panel.style.cssText="border:1px solid #d8e4e9;border-radius:10px;padding:12px 16px;margin:16px 0;background:#fff;color:#18313a;font:inherit;overflow-wrap:anywhere";
 const header=node("div");header.style.cssText="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px";const title=node("strong","Data Lab ツールナビ");header.append(title);
 const link=(slug,label)=>{const a=node("a",label||catalog[slug]);a.href=ctx.base+slug+"/";a.style.cssText="color:#075e78;text-decoration:underline";return a};
 const navLink=(href,label)=>{const a=node("a",label);a.href=ctx.base+href;a.style.cssText="color:#075e78;text-decoration:underline";return a};
 const b=(id,label)=>{const a=button(id,label);a.style.cssText="margin:0;padding:6px 10px;border:1px solid #9aadb4;border-radius:6px;background:#f5f8fa;color:#18313a;font:inherit;cursor:pointer";return a};
 const message=node("p");message.id="ogbNavStatus";message.setAttribute("role","status");message.style.cssText="margin:6px 0;font-size:.9em";const fav=b("ogbFavorite","☆ お気に入りに追加");if(ctx.slug)header.append(fav);if(!ctx.directory)header.append(navLink("#tool-directory","全ツール検索"),navLink("#ogbSavedData","保存済みデータ"),navLink("#workspace-entry","マイ業務セット"));panel.append(header);


 const workPanel=node("section");workPanel.id="ogbWorkspace";workPanel.setAttribute("aria-label","マイ業務セット");workPanel.style.cssText="border:1px solid #d8e4e9;border-radius:10px;padding:12px 16px;margin:16px 0;background:#fff;color:#18313a;font:inherit;overflow-wrap:anywhere";
 const workTitle=node("h2","マイ業務セット・進捗管理");workTitle.style.cssText="font-size:1.15em;margin:0 0 6px";
 const workStatus=node("p");workStatus.id="ogbWorkStatus";workStatus.setAttribute("role","status");
 const workBody=node("div");workBody.id="ogbWorkBody";workPanel.append(workTitle,node("p","よく使うツールを作業順に登録できます。完了は自分でチェックしてください。ツールを開いたり計算しただけでは完了になりません。業務セットはこのブラウザに保存され、入力データとは独立しています。"),workBody,workStatus);
 let workRaw,workState=null;
 const workInput=(id,value="",placeholder="")=>{const x=node("input");x.id=id;x.type="text";x.maxLength=60;x.value=value;x.placeholder=placeholder;x.style.cssText="width:100%;max-width:420px;box-sizing:border-box;padding:6px;font:inherit";return x};
 const workSelect=(id,options,value)=>{const x=node("select");x.id=id;x.style.cssText="max-width:100%;padding:6px;font:inherit";for(const [v,label] of options){const o=node("option",label);o.value=v;x.append(o)}if(value!==undefined)x.value=value;return x};
 const workLabel=(text,input)=>{const label=node("label",text);label.htmlFor=input.id;label.style.cssText="display:block;margin:6px 0";label.append(input);return label};
 const workActions=(...children)=>{const row=node("div");row.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0";row.append(...children);return row};
 const getActive=()=>workState?.sets.find(s=>s.id===workState.active);
 function reloadWork(force=false){
  try{const latest=localStorage.getItem(workKey);if(!force&&latest===workRaw&&workState)return;workRaw=latest;workState=parseWorkspace(latest);drawWork();drawWorkCurrent()}
  catch(e){workState=null;workBody.replaceChildren(node("p","業務セットを読み込めません。保存済みデータを保護するため変更しません。"));workStatus.textContent=e.message;drawWorkCurrent()}
 }
 function changeWork(fn,success){
  try{
   const latest=localStorage.getItem(workKey);if(latest!==workRaw)throw Error("別画面で業務セットが更新されました。最新の状態を確認し、もう一度操作してください。");
   const next=parseWorkspace(latest);fn(next);const raw=JSON.stringify(next);parseWorkspace(raw);localStorage.setItem(workKey,raw);workRaw=raw;workState=next;workStatus.textContent=success;drawWork();drawWorkCurrent();return true;
  }catch(e){workStatus.textContent=e.message;if(ctx.slug)message.textContent=e.message;reloadWork();return false}
 }
 function drawWork(){
  if(!ctx.directory||!workState)return;workBody.replaceChildren();
  const active=getActive(),choose=workSelect("ogbWorkSelect",[["","業務セットを選択"],...workState.sets.map(s=>[s.id,s.name])],workState.active);
  choose.addEventListener("change",()=>changeWork(x=>{x.active=choose.value},"使用する業務セットを変更しました。"));
  workBody.append(workLabel("使用中の業務セット",choose));
  const create=node("details");create.id="ogbWorkCreatePanel";create.open=!workState.sets.length;
  create.append(node("summary","業務セットを新規作成"));
  const template=workSelect("ogbWorkTemplate",[["","空のセットから作成"],...workflows.map(w=>[w.id,w.name])],"");
  const newName=workInput("ogbWorkName","","例：毎日の店舗業務");
  template.addEventListener("change",()=>{const w=workflows.find(w=>w.id===template.value);if(w)newName.value=w.name});
  const createButton=b("ogbWorkCreate","セットを作成");createButton.disabled=workState.sets.length>=workLimit;
  createButton.onclick=()=>{const name=newName.value.trim(),w=workflows.find(w=>w.id===template.value);if(!name){workStatus.textContent="業務セット名を入力してください。";return}changeWork(x=>{if(x.sets.length>=workLimit)throw Error("業務セットは20件までです。");let id="w-"+Date.now().toString(36);for(let n=1;x.sets.some(s=>s.id===id);n++)id="w-"+Date.now().toString(36)+"-"+n;x.sets.push({id,name,steps:w?[...w.steps]:[],done:[]});x.active=id},"業務セットを作成しました。")};
  create.append(workLabel("業務テンプレート",template),workLabel("セット名",newName),createButton,node("p","登録できる業務セットは20件までです。テンプレートは作成後に自由に編集できます。"));workBody.append(create);
  if(!active){workBody.append(node("p","業務セットを作成するか選択してください。"));return}
  const box=node("div");box.style.cssText="margin-top:14px;border-top:1px solid #d8e4e9;padding-top:10px";
  const name=workInput("ogbWorkRename",active.name),rename=b("ogbWorkRenameApply","名前を変更");
  const apply=(fn,msg)=>changeWork(x=>{const s=x.sets.find(t=>t.id===active.id);if(!s)throw Error("業務セットが変更されています。");fn(s,x)},msg);
  rename.onclick=()=>{const v=name.value.trim();if(!v){workStatus.textContent="セット名を入力してください。";return}apply(s=>s.name=v,"名前を変更しました。")};
  box.append(workActions(workLabel("セット名",name),rename));
  const progress=node("p","完了 "+active.done.length+" / "+active.steps.length+" 工程");progress.id="ogbWorkProgress";
  const meter=node("progress");meter.max=Math.max(1,active.steps.length);meter.value=active.done.length;meter.setAttribute("aria-label","業務進捗");meter.style.cssText="width:100%;max-width:420px";box.append(progress,meter);
  const next=workspaceNext(active);if(next){const a=link(next,"次の未完了工程を開く： "+catalog[next]);a.id="ogbWorkNext";box.append(workActions(a))}else if(active.steps.length)box.append(node("p","すべての工程を完了しました。次回の作業では進捗をリセットできます。"));
  const steps=node("div");steps.id="ogbWorkSteps";
  active.steps.forEach((slug,i)=>{
   const row=node("div");row.style.cssText="border-top:1px solid #e1e9ec;padding:8px 0;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center";
   const check=node("input");check.type="checkbox";check.id="ogbWorkDone-"+slug;check.checked=active.done.includes(slug);check.style.width="auto";check.setAttribute("aria-label",catalog[slug]+"を完了にする");check.onchange=()=>apply(s=>{s.done=check.checked?[...new Set([...s.done,slug])]:s.done.filter(t=>t!==slug)},"進捗を更新しました。");
   const a=link(slug,(i+1)+". "+catalog[slug]);a.style.flex="1 1 180px";
   const up=b("ogbWorkUp-"+slug,"↑"),down=b("ogbWorkDown-"+slug,"↓"),remove=b("ogbWorkRemove-"+slug,"外す");up.disabled=i===0;down.disabled=i===active.steps.length-1;up.setAttribute("aria-label",catalog[slug]+"を上へ");down.setAttribute("aria-label",catalog[slug]+"を下へ");remove.setAttribute("aria-label",catalog[slug]+"をセットから外す");
   up.onclick=()=>apply(s=>workspaceMove(s,slug,-1),"工程の順番を変更しました。");down.onclick=()=>apply(s=>workspaceMove(s,slug,1),"工程の順番を変更しました。");
   remove.onclick=()=>{if(!confirm(catalog[slug]+"をこの業務セットから外しますか？ ツールの保存済みデータは残ります。"))return;apply(s=>{s.steps=s.steps.filter(t=>t!==slug);s.done=s.done.filter(t=>t!==slug)},"工程を外しました。")};
   row.append(check,a,up,down,remove);steps.append(row);
  });box.append(steps);
  const add=workSelect("ogbWorkAddTool",[["","追加するツールを選択"],...Object.entries(catalog).filter(([s])=>!active.steps.includes(s)).map(([s,n])=>[s,n])],"");
  const addButton=b("ogbWorkAdd","工程を追加");addButton.disabled=active.steps.length===47;
  addButton.onclick=()=>{if(!known(add.value)){workStatus.textContent="追加するツールを選択してください。";return}apply(s=>{if(!s.steps.includes(add.value))s.steps.push(add.value)},"工程を追加しました。")};
  const reset=b("ogbWorkReset","次回用に進捗をリセット"),del=b("ogbWorkDelete","業務セットを削除");reset.disabled=!active.done.length;
  reset.onclick=()=>{if(confirm("完了チェックだけを解除しますか？ 保存済みデータ・工程は残ります。"))apply(s=>s.done=[],"完了チェックをリセットしました。")};
  del.onclick=()=>{if(confirm(active.name+"を削除しますか？ 各ツールの保存済みデータは残ります。"))apply((s,x)=>{x.sets=x.sets.filter(t=>t.id!==s.id);x.active=x.sets[0]?.id||""},"業務セットを削除しました。")};
  box.append(workActions(workLabel("追加する工程",add),addButton),workActions(reset,del),node("p","工程リンクは画面移動のみです。データの直接引継ぎには各ツールの引継ぎボタンを使ってください。作業の完了前に必要なデータを保存してください。"));workBody.append(box);
 }
 function drawWorkCurrent(){
  const old=document.getElementById("ogbCurrentWork");if(old)old.remove();if(!ctx.slug)return;
  const s=getActive();if(!s||!s.steps.includes(ctx.slug))return;
  const row=node("div");row.id="ogbCurrentWork";row.style.cssText="border-top:1px solid #d8e4e9;margin:8px 0;padding-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center";
  const label=node("span",s.name+" ／ "+(s.steps.indexOf(ctx.slug)+1)+"番目の工程 ／ 完了 "+s.done.length+" / "+s.steps.length);
  const done=s.done.includes(ctx.slug),mark=b("ogbWorkMark",done?"未完了に戻す":"この工程を完了にする");mark.setAttribute("aria-pressed",String(done));
  mark.onclick=()=>{if(!done&&!confirm("必要な入力・結果を保存しましたか？ この工程の完了チェックを付けます。"))return;if(changeWork(x=>{const t=x.sets.find(t=>t.id===s.id);if(!t||x.active!==s.id||!t.steps.includes(ctx.slug))throw Error("業務セットが変更されました。");t.done=done?t.done.filter(t=>t!==ctx.slug):[...new Set([...t.done,ctx.slug])]},"進捗を更新しました。"))message.textContent="業務の進捗を更新しました。"};
  row.append(label,mark);
  const next=workspaceNext(s);if(next&&next!==ctx.slug)row.append(link(next,"次の未完了工程へ"));row.append(navLink("#workspace-entry","業務セットへ戻る"));panel.append(row);
 }

 const savedPanel=node("section");savedPanel.id="ogbSavedData";savedPanel.setAttribute("aria-label","保存済みデータ・作業再開");savedPanel.style.cssText="border:1px solid #d8e4e9;border-radius:10px;padding:12px 16px;margin:16px 0;background:#fff;color:#18313a;font:inherit;overflow-wrap:anywhere";
 const savedTitle=node("h2","保存済みデータ・作業再開");savedTitle.style.cssText="font-size:1.15em;margin:0 0 6px";savedPanel.append(savedTitle,node("p","このブラウザに保存されている入力を確認できます。自動復元は行いません。復元・削除は各ツールで操作してください。"));
 const summarySaved=node("p");summarySaved.id="ogbSavedSummary";summarySaved.setAttribute("role","status");
 const reloadSaved=b("ogbSavedRefresh","保存状況を更新"),filterLabel=node("label","保存済みツールを検索"),filter=document.createElement("input");filter.type="search";filter.id="ogbSavedFilter";filter.placeholder="例：台帳、経費、所得税";filter.style.cssText="width:100%;max-width:440px;box-sizing:border-box;padding:6px 8px;font:inherit";filterLabel.append(filter);
 const savedList=node("div");savedList.id="ogbSavedList";savedPanel.append(summarySaved,reloadSaved,filterLabel,savedList,node("p","保存は同じブラウザ内に限られます。ブラウザのデータ削除・端末変更に備え、各ツールのCSV・編集用ファイル等も保管してください。保存日時を持たない旧形式は日時不明と表示します。"));

 const backup=node("details"),backupTitle=node("summary","バックアップ・別端末への移行");backup.id="ogbBackupPanel";backupTitle.style.cssText="cursor:pointer;font-weight:650;margin:10px 0";backup.append(backupTitle,node("p","保存済みの入力・設定をJSONファイルにまとめます。CSV・画像・PDFの元ファイル、未保存の入力、お気に入り、利用履歴、業務セット・進捗は含みません。バックアップは暗号化されません。個人情報や取引情報を含むため、保管場所にご注意ください。"));
 const exportBackup=b("ogbBackupExport","保存済みデータをバックアップ"),fileLabel=node("label","バックアップを読み込む（JSON）"),backupFile=document.createElement("input");backupFile.id="ogbBackupFile";backupFile.type="file";backupFile.accept=".json,application/json";backupFile.style.cssText="max-width:100%;display:block";fileLabel.append(backupFile);
 const previewBackup=node("div");previewBackup.id="ogbBackupPreview";const backupStatus=node("p");backupStatus.id="ogbBackupStatus";backupStatus.setAttribute("role","status");
 const applyBackup=b("ogbBackupApply","選択した未登録データを復元"),cancelBackup=b("ogbBackupCancel","読み込みを取り消す");applyBackup.disabled=cancelBackup.disabled=true;backup.append(exportBackup,fileLabel,previewBackup,applyBackup,cancelBackup,backupStatus);savedPanel.append(backup);
 let backupVersion=0,pendingBackup=[];
 function clearBackup(){backupVersion++;pendingBackup=[];backupFile.value="";previewBackup.replaceChildren();applyBackup.disabled=cancelBackup.disabled=true}
 exportBackup.onclick=()=>{try{
  const data=makeBackup(localStorage);
  if(!data.entries.length){backupStatus.textContent="バックアップできる保存データがありません。"+(data.skipped.length?" 形式確認が必要："+data.skipped.map(s=>catalog[s]).join("、"):"");return}
  if(!confirm(data.entries.length+"種類の保存データを、暗号化されていないJSONファイルに保存します。安全な場所に保管してください。"))return;
  const blob=new Blob([data.text],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),a=node("a");a.href=url;a.download="OGB-Data-Lab-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  backupStatus.textContent=data.entries.length+"種類のバックアップを作成しました。"+(data.skipped.length?" 形式確認のため対象外："+data.skipped.map(s=>catalog[s]).join("、"):"");
 }catch(e){backupStatus.textContent="バックアップできませんでした。"+e.message}};
 function previewEntries(entries){
  previewBackup.replaceChildren();pendingBackup=[];const list=node("div");list.style.cssText="margin:8px 0";
  for(const entry of entries){const exists=localStorage.getItem(draftRegistry[entry.slug].key)!==null,row=node("label"),check=document.createElement("input");check.type="checkbox";check.checked=!exists;check.disabled=exists;check.style.width="auto";check.dataset.backupSlug=entry.slug;
   row.style.cssText="display:block;margin:6px 0";row.append(check,document.createTextNode(" "+catalog[entry.slug]+" ／ "+(exists?"保存済みのためスキップ":"復元可能")+(entry.meta.count===null?"":" ／ "+entry.meta.count+(draftRegistry[entry.slug].kind==="expense"?"資料":"件"))));
   list.append(row);pendingBackup.push({entry,check});
  }
  const update=()=>{applyBackup.disabled=!pendingBackup.some(x=>x.check.checked&&!x.check.disabled)};
  list.addEventListener("change",update);previewBackup.append(node("p","復元前の確認：既存データは上書きしません。復元する未登録のツールを選択してください。各ツールで復元・内容確認が必要です。"),list);cancelBackup.disabled=false;update();
 }
 backupFile.addEventListener("change",async()=>{const version=++backupVersion;pendingBackup=[];previewBackup.replaceChildren();applyBackup.disabled=cancelBackup.disabled=true;backupStatus.textContent="";const file=backupFile.files[0];if(!file)return;try{if(file.size>backupLimit)throw Error("12MB以下のバックアップファイルを指定してください。");const raw=await file.text();if(version!==backupVersion)return;const entries=parseBackup(raw);previewEntries(entries);backupStatus.textContent=entries.length+"種類の保存データを確認しました。まだ復元していません。"}catch(e){if(version!==backupVersion)return;clearBackup();backupStatus.textContent="読み込めませんでした。"+e.message}});
 cancelBackup.onclick=()=>{clearBackup();backupStatus.textContent="読み込みを取り消しました。保存データは変更していません。"};
 applyBackup.onclick=()=>{const entries=pendingBackup.filter(x=>x.check.checked&&!x.check.disabled).map(x=>x.entry);if(!entries.length)return;if(!confirm(entries.length+"種類の未登録データを復元します。すでに保存されたデータは上書きしません。"))return;
  const result=restoreMissing(localStorage,entries);clearBackup();refreshSaved();
  backupStatus.textContent="復元 "+result.applied.length+"種類、既存データのためスキップ "+result.skipped.length+"種類、保存失敗 "+result.failed.length+"種類。"+(result.failed.length?" 保存できなかったツール："+result.failed.map(s=>catalog[s]).join("、")+"。空き容量・保存設定を確認してください。":"")+" 各ツールを開いて内容を確認してください。";
 };

 let savedRows=[];
 function displaySaved(){
  savedList.replaceChildren();const q=filter.value.normalize("NFKC").toLowerCase().trim();const matches=savedRows.filter(x=>!q||(catalog[x.slug]+" "+(draftRegistry[x.slug].settingsOnly?"読み込み・変換設定":draftKinds[draftRegistry[x.slug].kind])).normalize("NFKC").toLowerCase().includes(q));
  if(!matches.length){savedList.append(node("p",savedRows.length?"検索条件に一致する保存データがありません。":"保存済みデータはありません。各ツールで必要な入力を保存してください。"));return}
  for(const item of matches){const info=draftRegistry[item.slug],row=node("div");row.style.cssText="border-top:1px solid #d8e4e9;padding:10px 0;display:flex;flex-wrap:wrap;align-items:center;gap:5px 14px";
   const name=node("strong",catalog[item.slug]),meta=node("span",(info.settingsOnly?"読み込み・変換設定":draftKinds[info.kind])+" ／ "+(item.state==="check"?"形式の確認が必要":item.time===null?"保存日時不明":"保存："+new Date(item.time).toLocaleString("ja-JP"))+(item.count===null?"":" ／ "+item.count+(info.kind==="expense"?"資料":"件")));meta.style.cssText="font-size:.9em";
   const open=link(item.slug,item.state==="check"?"ツールで確認":info.kind==="product"?"台帳を開く":"復元・管理へ");open.href=ctx.base+item.slug+"/#"+info.restore;open.dataset.savedSlug=item.slug;
   row.append(name,meta,open);savedList.append(row);
  }
 }
 function refreshSaved(){
  try{savedRows=inspectDrafts(localStorage);summarySaved.textContent="保存データ："+savedRows.length+"種類（保存対応 "+Object.keys(draftRegistry).length+"種類）";displaySaved()}catch(e){savedRows=[];summarySaved.textContent="このブラウザの保存領域を確認できません。";savedList.replaceChildren()}
 }
 reloadSaved.onclick=refreshSaved;filter.addEventListener("input",displaySaved);
 function drawCurrentDraft(){
  const old=document.getElementById("ogbCurrentDraft");if(old)old.remove();const info=draftRegistry[ctx.slug];if(!info)return;
  const current=node("div");current.id="ogbCurrentDraft";current.style.cssText="margin:8px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap";let meta;
  try{meta=draftMeta(localStorage.getItem(info.key),info.kind)}catch{current.append(node("span","保存領域を確認できません。"));header.after(current);return}
  if(!meta){current.append(node("span","このツールの保存済みデータはありません。"));header.after(current);return}
  current.append(node("span",meta.state==="check"?"保存データの形式を確認してください。":"保存済みデータがあります。"));
  const resume=b("ogbResumeSaved",info.kind==="product"?"保存済み台帳へ":"保存内容を復元");
  resume.onclick=()=>{const target=document.getElementById(info.restore);if(!target){message.textContent="このツールの保存・復元欄を確認してください。";return}target.scrollIntoView({block:"center"});if(info.kind==="product"){message.textContent="商品台帳はページを開くと保存内容を読み込みます。";return}if(target.disabled){message.textContent="保存内容を復元できません。保存・復元欄を確認してください。";return}target.click();};
  const manage=b("ogbManageSaved","保存・削除欄へ");manage.onclick=()=>{const target=document.getElementById(info.remove)||document.getElementById(info.restore);if(target)target.scrollIntoView({block:"center"});else message.textContent="このツールの保存・復元欄を確認してください。"};
  current.append(resume,manage);header.after(current);
 }

 const detail=node("details"),summary=node("summary",ctx.slug?"関連ツール・お気に入り・最近使ったツール":"お気に入り・最近使ったツール");summary.style.cssText="cursor:pointer;font-weight:650;margin:8px 0";detail.append(summary);
 const body=node("div");detail.append(body);panel.append(detail,message);
 const list=(label,values)=>{const group=node("div");group.style.cssText="margin:8px 0";group.append(node("strong",label));const links=node("ul");links.style.cssText="display:flex;flex-wrap:wrap;gap:4px 18px;list-style:none;padding:0;margin:5px 0";for(const s of values){const li=node("li");if(s===ctx.slug){li.append(node("span",catalog[s]+"（現在）"));li.setAttribute("aria-current","page")}else li.append(link(s));links.append(li)}if(!values.length)group.append(node("p","まだありません。"));else group.append(links);body.append(group)};
 function draw(){body.replaceChildren();const isFav=ctx.slug&&state.favorites.includes(ctx.slug);fav.textContent=isFav?"★ お気に入りから外す":"☆ お気に入りに追加";fav.setAttribute("aria-pressed",String(!!isFav));fav.disabled=!available;
 if(ctx.slug){const config=activeConfig&&activeConfig.slug===ctx.slug?activeConfig:null,ins=Object.keys(config?.inbound||{}).filter(known),outs=(config?.out||[]).map(x=>x[0]).filter(known);
 if(ins.length)list("このツールに直接引き継げる元ツール（移動リンク）",ins);
 if(outs.length)list("結果を直接引き継げるツール（移動リンク）",outs);
 if(ins.length||outs.length)body.append(node("p","データを渡す場合は、元ツールで計算後に「次のツールへ直接引き継ぐ」を使ってください。この案内のリンクは画面移動のみです。"));
 else body.append(node("p","このツールからの直接データ転送はありません。関連ツールは必要に応じて開いてください。"));
 const related=workflows.filter(w=>w.steps.includes(ctx.slug)),relatedSlugs=[...new Set(related.flatMap(w=>w.steps))].filter(s=>s!==ctx.slug&&!ins.includes(s)&&!outs.includes(s)).slice(0,8);
 if(relatedSlugs.length)list("同じ業務で使うツール（移動のみ）",relatedSlugs);
 const row=node("div");row.style.cssText="display:flex;gap:6px 14px;flex-wrap:wrap;margin:8px 0";for(const slug of [...new Set(related.flatMap(w=>w.business))])row.append(navLink("business/"+slug+"/",businessNames[slug]+"の業務一覧"));if(row.children.length)body.append(row);
 }
 list("お気に入り",state.favorites);
 if(state.historyEnabled)list("最近使ったツール",state.recent);
 const actions=node("div");actions.style.cssText="display:flex;gap:8px;flex-wrap:wrap";const toggle=b("ogbHistoryToggle",state.historyEnabled?"利用履歴を停止・削除":"利用履歴を有効にする"),clear=b("ogbHistoryClear","利用履歴を消去"),reset=b("ogbFavoritesClear","お気に入りをすべて外す");toggle.disabled=!available;clear.disabled=!available||!state.recent.length;reset.disabled=!available||!state.favorites.length;
 toggle.onclick=()=>{const old=readState();const next={...old,historyEnabled:!old.historyEnabled,recent:!old.historyEnabled&&ctx.slug?[ctx.slug]:[]};if(saveState(next)){message.textContent=next.historyEnabled?"利用履歴を有効にしました。":"利用履歴を停止し、履歴を消去しました。";draw()}else message.textContent="端末内保存を利用できません。"};
 clear.onclick=()=>{const old=readState();if(saveState({...old,recent:[]})){message.textContent="利用履歴を消去しました。";draw()}};
 reset.onclick=()=>{if(!confirm("お気に入りをすべて外しますか？"))return;const old=readState();if(saveState({...old,favorites:[]})){message.textContent="お気に入りをすべて外しました。";draw()}};
 actions.append(toggle,clear,reset);body.append(actions,node("p","このブラウザにツール名だけを保存します。入力値・計算結果・ファイルは履歴に含めません。履歴は初期状態では無効です。"));if(!available)message.textContent="端末内保存を利用できません。関連ツールの案内は利用できます。";
 }
 fav.onclick=()=>{const old=readState(),exists=old.favorites.includes(ctx.slug);if(saveState({...old,favorites:exists?old.favorites.filter(s=>s!==ctx.slug):[ctx.slug,...old.favorites]})){message.textContent=exists?"お気に入りから外しました。":"お気に入りに追加しました。";draw()}else message.textContent="端末内保存を利用できません。"};
 detail.open=!!ctx.directory;draw();
 const heading=main.querySelector("h1")||main.querySelector("h2");if(ctx.directory){const target=document.getElementById("tool-directory");if(target){const entry=document.getElementById("saved-work-entry"),workEntry=document.getElementById("workspace-entry");if(entry)entry.append(savedPanel),entry.before(panel);else target.before(panel,savedPanel);if(workEntry)workEntry.append(workPanel);else target.before(workPanel);}else main.prepend(panel,savedPanel,workPanel);refreshSaved()}else if(heading)heading.after(panel);else main.prepend(panel);
 if(ctx.directory||ctx.slug)reloadWork(true);
 if(ctx.slug){drawCurrentDraft();document.addEventListener("ogb:draft-changed",drawCurrentDraft);document.addEventListener("click",e=>{const info=draftRegistry[ctx.slug];if(!info)return;const id=e.target?.id;if(id===info.restore||id===info.remove||["csvDraftSave","taxDraftSave","rowDraftSave","draftSave","profitDraftSave","expenseDraftSave","save","clear"].includes(id))queueMicrotask(drawCurrentDraft)});document.addEventListener("change",e=>{if(e.target?.id==="csvDraftAuto"||e.target?.id==="ogbGridAuto")queueMicrotask(drawCurrentDraft)});}
 window.addEventListener("storage",e=>{if(e.key===workKey||e.key===null)reloadWork();if(e.key===navKey||e.key===null){state=readState();draw()}if(e.key===null||Object.values(draftRegistry).some(x=>x.key===e.key)){if(ctx.directory)refreshSaved();if(ctx.slug)drawCurrentDraft()}});
 window.addEventListener("pageshow",()=>{if(ctx.directory||ctx.slug)reloadWork();if(ctx.directory)refreshSaved();if(ctx.slug)drawCurrentDraft()});
 window.addEventListener("focus",()=>{if(ctx.directory||ctx.slug)reloadWork();if(ctx.directory)refreshSaved();if(ctx.slug)drawCurrentDraft()});
 const fragment=location.hash.slice(1);if(fragment==="ogbSavedData"&&ctx.directory||ctx.slug&&draftRegistry[ctx.slug]?.restore===fragment)requestAnimationFrame(()=>document.getElementById(fragment)?.scrollIntoView({block:"center"}));
}
if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",renderNavigation,{once:true});else queueMicrotask(renderNavigation)}

window.OGBToolHandoff={init};
})();