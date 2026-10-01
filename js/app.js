
async function apiPost(path, body) {
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  if (window.oseFetch) return window.oseFetch(path, opts);           // home → Render tự động
  const base = (window.OSE_API_BASE || window.INVENTORY_APP_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');
  return fetch(base + path, opts);
}

async function runOptimization() {
  const btn = document.getElementById('btnRun');
  try {
    readEditedInput();
    btn.disabled = true;
    setStatus('Đang kết nối máy chủ...');
    const base = String(await window.OSE_API_READY || window.OSE_API_BASE || '');
    setStatus(base.includes('onrender.com')
      ? 'Đang tính trên Render (lần đầu có thể mất 30–60 giây)...'
      : 'Backend is calculating...');
    const r = await apiPost('/api/optimize', { items: inputData, planning_days: 365, currency: 'VND' });
    const text = await r.text();
    let p;
    try { p = JSON.parse(text); } catch { throw new Error(`Máy chủ trả về phản hồi không hợp lệ (HTTP ${r.status})`); }
    if (!r.ok) throw new Error(typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail || 'Backend error'));
    results = p.results;
    renderTable('resultTable', results);
    updateMetrics();
    updateSummary(p.summary);
    drawAll();
    setStatus(p.message);
    showTab('results');
  } catch (e) {
    setStatus('Error: ' + e.message);
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}
const requiredCols=['Item_ID','Item_Name','Annual_Demand_D','Demand_Std_Daily','LeadTime_Days','LeadTime_Std_Days','Ordering_Cost_S','Holding_Cost_H_Year','Unit_Cost_C','Shortage_Cost_p','Service_Level','Current_Inventory','On_Order','Min_Order_Qty','Max_Order_Qty','Capacity_Max_Inventory','Transport_Cost_Per_Order','Fixed_Order_Cost'];
let inputData=[],results=[];

const setStatus=s=>document.getElementById('status').textContent=s;
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const fmt=x=>x===null||x===undefined||Number.isNaN(x)?'':typeof x==='boolean'?(x?'TRUE':'FALSE'):typeof x==='number'?x.toLocaleString('en-US',{maximumFractionDigits:3}):x;

function demoItems(){return [
{Item_ID:'I001',Item_Name:'Steel component',Annual_Demand_D:12000,Demand_Std_Daily:8,LeadTime_Days:7,LeadTime_Std_Days:1,Ordering_Cost_S:250000,Holding_Cost_H_Year:12000,Unit_Cost_C:85000,Shortage_Cost_p:50000,Service_Level:0.95,Current_Inventory:600,On_Order:200,Min_Order_Qty:100,Max_Order_Qty:5000,Capacity_Max_Inventory:10000,Transport_Cost_Per_Order:50000,Fixed_Order_Cost:0},
{Item_ID:'I002',Item_Name:'Packaging material',Annual_Demand_D:36000,Demand_Std_Daily:25,LeadTime_Days:4,LeadTime_Std_Days:0.5,Ordering_Cost_S:150000,Holding_Cost_H_Year:2500,Unit_Cost_C:12000,Shortage_Cost_p:10000,Service_Level:0.90,Current_Inventory:2500,On_Order:1000,Min_Order_Qty:500,Max_Order_Qty:10000,Capacity_Max_Inventory:25000,Transport_Cost_Per_Order:40000,Fixed_Order_Cost:0},
{Item_ID:'I003',Item_Name:'Spare part',Annual_Demand_D:4200,Demand_Std_Daily:5,LeadTime_Days:14,LeadTime_Std_Days:3,Ordering_Cost_S:350000,Holding_Cost_H_Year:18000,Unit_Cost_C:240000,Shortage_Cost_p:120000,Service_Level:0.97,Current_Inventory:120,On_Order:0,Min_Order_Qty:50,Max_Order_Qty:2000,Capacity_Max_Inventory:2500,Transport_Cost_Per_Order:70000,Fixed_Order_Cost:0},
{Item_ID:'I004',Item_Name:'Imported raw material',Annual_Demand_D:18000,Demand_Std_Daily:15,LeadTime_Days:30,LeadTime_Std_Days:6,Ordering_Cost_S:500000,Holding_Cost_H_Year:9000,Unit_Cost_C:55000,Shortage_Cost_p:30000,Service_Level:0.95,Current_Inventory:900,On_Order:500,Min_Order_Qty:300,Max_Order_Qty:8000,Capacity_Max_Inventory:15000,Transport_Cost_Per_Order:120000,Fixed_Order_Cost:0},
{Item_ID:'I005',Item_Name:'Critical medical item',Annual_Demand_D:9000,Demand_Std_Daily:10,LeadTime_Days:10,LeadTime_Std_Days:2,Ordering_Cost_S:300000,Holding_Cost_H_Year:15000,Unit_Cost_C:180000,Shortage_Cost_p:90000,Service_Level:0.98,Current_Inventory:300,On_Order:100,Min_Order_Qty:100,Max_Order_Qty:4000,Capacity_Max_Inventory:6000,Transport_Cost_Per_Order:80000,Fixed_Order_Cost:0}
]}

function renderTable(id,data,editable=false){
 const table=document.getElementById(id);table.innerHTML='';
 if(!data.length){table.innerHTML='<tr><td>No data</td></tr>';return}
 const cols=Object.keys(data[0]);
 table.innerHTML='<thead><tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>'+
 data.map((r,i)=>'<tr>'+cols.map(c=>`<td ${editable?'contenteditable="true"':''}>${fmt(r[c])}</td>`).join('')+'</tr>').join('')+'</tbody>';
}
function validate(data){
 if(!data.length)throw new Error('Input table is empty.');
 for(const c of requiredCols)if(!(c in data[0]))throw new Error('Missing required column: '+c);
 data.forEach((r,i)=>{if(num(r.Holding_Cost_H_Year)<=0)throw new Error('Invalid holding cost at row '+(i+1));const s=num(r.Service_Level);if(s<=0||s>=1)throw new Error('Service_Level must be between 0 and 1 at row '+(i+1))});
}
function readEditedInput(){
 const t=document.getElementById('inputTable'),h=[...t.querySelectorAll('thead th')].map(x=>x.textContent);
 inputData=[...t.querySelectorAll('tbody tr')].map(tr=>{const o={};[...tr.children].forEach((td,i)=>o[h[i]]=!['Item_ID','Item_Name'].includes(h[i])?num(td.textContent):td.textContent);return o});
 validate(inputData);setStatus('Edited input data applied.');
}
function showTab(id){document.querySelectorAll('section').forEach(s=>s.classList.remove('show'));document.getElementById(id).classList.add('show');document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id))}
function updateMetrics(){const total=results.reduce((s,r)=>s+r.Total_Annual_Cost,0),reorder=results.filter(r=>r.Reorder_Now).length,ss=Math.max(...results.map(r=>r.Safety_Stock));document.getElementById('metrics').innerHTML=`<div class="metric"><span>Total annual cost</span><b>${fmt(total)}</b><span class="muted">VND/year</span></div><div class="metric"><span>Items reorder now</span><b>${reorder}</b><span class="muted">SKU</span></div><div class="metric"><span>Max safety stock</span><b>${fmt(ss)}</b><span class="muted">units</span></div>`}
function updateSummary(s){document.getElementById('summary').innerHTML=`<p><b>Number of items analyzed:</b> ${s.number_of_items}</p><p><b>Items requiring reorder now:</b> ${s.items_reorder_now}</p><p><b>Total annual cost:</b> ${fmt(s.total_annual_cost)} VND/year</p><p><b>Cost breakdown:</b> Purchase ${fmt(s.purchase_cost)}, Ordering ${fmt(s.ordering_cost)}, Holding ${fmt(s.holding_cost)}, Expected shortage ${fmt(s.shortage_cost)} VND/year.</p><p><b>Highest total cost item:</b> ${s.highest_cost_item.Item_ID} - ${s.highest_cost_item.Item_Name}</p><p><b>Highest safety stock item:</b> ${s.highest_safety_stock_item.Item_ID} - ${s.highest_safety_stock_item.Item_Name}</p>`}
function simpleBar(canvasId,labels,series,title){const c=document.getElementById(canvasId),x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);const vals=series.flatMap(s=>s.values),max=Math.max(...vals,1)*1.15,L=70,B=55,T=30,R=20,W=c.width-L-R,H=c.height-T-B;x.fillStyle='#111827';x.font='14px Arial';x.fillText(title,20,20);x.strokeStyle='#d1d5db';x.beginPath();x.moveTo(L,T);x.lineTo(L,T+H);x.lineTo(L+W,T+H);x.stroke();const gw=W/labels.length,bw=gw/(series.length+1);series.forEach((s,si)=>{x.fillStyle=s.color;s.values.forEach((v,i)=>{const h=H*v/max;x.fillRect(L+i*gw+(si+.5)*bw,T+H-h,bw*.85,h)})});x.fillStyle='#374151';x.font='12px Arial';labels.forEach((l,i)=>x.fillText(l,L+i*gw+4,T+H+18))}
function drawAll(){if(!results.length)return;simpleBar('costCanvas',['Purchase','Ordering','Holding','Shortage'],[{values:['Purchase_Cost_Year','Ordering_Cost_Year','Holding_Cost_Year','Shortage_Cost_Year'].map(k=>results.reduce((s,r)=>s+r[k],0)),color:'#2563eb'}],'Annual Cost Components');simpleBar('itemCostCanvas',results.map(r=>r.Item_ID),[{values:results.map(r=>r.Total_Annual_Cost),color:'#0f766e'}],'Total Annual Cost by Item');simpleBar('policyCanvas',results.map(r=>r.Item_ID),[{values:results.map(r=>r.EOQ),color:'#2563eb'},{values:results.map(r=>r.Reorder_Point_ROP),color:'#0f766e'},{values:results.map(r=>r.Safety_Stock),color:'#b45309'}],'Inventory Policy');simpleBar('serviceCanvas',results.map(r=>r.Item_ID),[{values:results.map(r=>r.Service_Level*1000),color:'#2563eb'},{values:results.map(r=>r.Expected_Shortage_Units_Year),color:'#b91c1c'}],'Service Level and Expected Shortage')}

document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab)));
document.getElementById('btnDemo').onclick=()=>{inputData=demoItems();renderTable('inputTable',inputData,true);setStatus('Demo data loaded.');showTab('input')};
document.getElementById('btnApply').onclick=()=>{try{readEditedInput()}catch(e){alert(e.message)}};
document.getElementById('btnRun').onclick=runOptimization;
document.getElementById('btnLoad').onclick=()=>document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const b=await f.arrayBuffer(),w=XLSX.read(b),s=w.Sheets['Items']||w.Sheets[w.SheetNames[0]];inputData=XLSX.utils.sheet_to_json(s,{defval:''});validate(inputData);renderTable('inputTable',inputData,true);setStatus('Loaded file: '+f.name)}catch(err){alert(err.message)}};
document.getElementById('btnTemplate').onclick=()=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(demoItems()),'Items');XLSX.writeFile(w,'Inventory_Optimization_Template.xlsx')};
document.getElementById('btnExport').onclick=()=>{if(!results.length)return alert('No results');const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(inputData),'Input_Items');XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(results),'Optimization_Results');XLSX.writeFile(w,'Inventory_Optimization_Results.xlsx')};
inputData=demoItems();renderTable('inputTable',inputData,true);
