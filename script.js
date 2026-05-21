/* ============================================================
   INJECTION MOLDING DASHBOARD  -  v2 (no Sum on % cards)
   ============================================================ */
const SHEET_ID = "1687hf4iPefPAw_5Jx55Y_kN20ebDi6s131p3ajGc2ow";
const GID      = "78827421";
const CSV_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

const KPI_COLS = [
  {idx:7,  key:"H",  label:"Shift Capacity (Pcs)", type:"num", color:"blue"},
  {idx:8,  key:"I",  label:"Shift Target (Pcs)",   type:"num", color:""},
  {idx:9,  key:"J",  label:"Actual Output (Pcs)",  type:"num", color:"cyan"},
  {idx:11, key:"L",  label:"% Achievement",        type:"pct", color:"purple"},
  {idx:27, key:"AB", label:"NPT%",                 type:"pct", color:"orange"},
  {idx:30, key:"AE", label:"Wastage%",             type:"pct", color:"red"},
  {idx:33, key:"AH", label:"% Availability",       type:"pct", color:"blue"},
  {idx:34, key:"AI", label:"Performance%",         type:"pct", color:"cyan"},
  {idx:35, key:"AJ", label:"Quality%",             type:"pct", color:"purple"},
  {idx:36, key:"AK", label:"OEE%",                 type:"pct", color:"orange"},
];

const ANALYSIS_COLS = {
  SBU:0, Section:2, Machine:4, Product:5, Supervisor:6,
  IdealCycle:10, OperationTime:12, PlannedDown:13, AvailableRun:14,
  NPT:15, ActualRun:16, UtilityGas:17, UtilityElec:18,
  Unavailable:19, RawMat:20, Manpower:21, QCO:22, Setup:23,
  Mechanical:24, Electrical:25, OthersDT:26, WastageTarget:28,
  TotalWastage:29, WastageReason:31, GoodProduction:32, Remarks:37
};

const IGNORE_COLS = [38, 39]; // AM, AN

let HEADERS = [];
let RAW = [];
let charts = {};

const toNum = v => {
  if(v==null||v==="") return 0;
  const s = String(v).replace(/[%,\s]/g,"");
  const n = parseFloat(s);
  return isNaN(n)?0:n;
};
const fmt = (n,d=2) => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d});
const parseDate = s => {
  if(!s) return null;
  const p = String(s).split("/");
  if(p.length===3){
    const [m,d,y] = p.map(Number);
    return new Date(y, m-1, d);
  }
  return new Date(s);
};
const monthName = d => d ? d.toLocaleString("en",{month:"long",year:"numeric"}) : "";

async function loadData(){
  const res  = await fetch(CSV_URL+"&_="+Date.now());
  const text = await res.text();
  const parsed = Papa.parse(text,{header:false}).data;
  HEADERS = parsed[0] || [];
  RAW = parsed.slice(1).filter(r => r && r[1]);
  buildFilters();
  applyFilters();
}

function buildFilters(){
  const months = new Set(), dates = new Set(), shifts = new Set();
  RAW.forEach(r=>{
    const d = parseDate(r[1]);
    if(d){ months.add(monthName(d)); dates.add(r[1]); }
    if(r[3]) shifts.add(r[3]);
  });
  resetSelect("monthFilter");
  resetSelect("dateFilter");
  resetSelect("shiftFilter");
  fillSelect("monthFilter",[...months]);
  fillSelect("dateFilter",[...dates].sort((a,b)=>parseDate(a)-parseDate(b)));
  fillSelect("shiftFilter",[...shifts]);
  const extra = document.getElementById("extraFilters");
  if(extra) extra.innerHTML = "";
  ["monthFilter","dateFilter","shiftFilter"].forEach(id=>{
    document.getElementById(id).onchange = applyFilters;
  });
}
function resetSelect(id){
  document.getElementById(id).innerHTML = `<option value="ALL">All</option>`;
}
function fillSelect(id,vals){
  const sel = document.getElementById(id);
  vals.forEach(v=>{
    const o=document.createElement("option");o.value=v;o.textContent=v;sel.appendChild(o);
  });
}

function applyFilters(){
  const month = document.getElementById("monthFilter").value;
  const date  = document.getElementById("dateFilter").value;
  const shift = document.getElementById("shiftFilter").value;
  const filtered = RAW.filter(r=>{
    const d = parseDate(r[1]);
    if(month!=="ALL" && monthName(d)!==month) return false;
    if(date !=="ALL" && r[1]!==date) return false;
    if(shift!=="ALL" && r[3]!==shift) return false;
    return true;
  });
  renderKPIs(filtered);
  renderCharts(filtered);
  renderTable(filtered);
}

/* ---------- KPI Cards (NO SUM ON % CARDS) ---------- */
function renderKPIs(rows){
  const wrap = document.getElementById("kpiCards");
  wrap.innerHTML = "";
  KPI_COLS.forEach(c=>{
    const vals = rows.map(r=>toNum(r[c.idx])).filter(v=>!isNaN(v));
    const sum  = vals.reduce((a,b)=>a+b,0);
    const avg  = vals.length ? sum/vals.length : 0;

    let headline, subline;
    if(c.type === "pct"){
      headline = fmt(avg, 2) + "%";
      subline  = "";   // 🚫 NO Sum line for percentage cards
    } else {
      headline = fmt(sum, 0);
      subline  = `<div class="avg">Avg: ${fmt(avg, 2)}</div>`;
    }

    wrap.insertAdjacentHTML("beforeend",`
      <div class="kpi ${c.color}">
        <h4>${c.label} <span style="opacity:.5">[${c.key}]</span></h4>
        <div class="total">${headline}</div>
        ${subline}
      </div>`);
  });
}

function destroyCharts(){ Object.values(charts).forEach(c=>c?.destroy()); charts={}; }
function renderCharts(rows){
  destroyCharts();
  const byDate = {};
  rows.forEach(r=>{
    const d = r[1]; if(!d) return;
    byDate[d] = byDate[d] || {target:0, output:0};
    byDate[d].target += toNum(r[8]);
    byDate[d].output += toNum(r[9]);
  });
  const dKeys = Object.keys(byDate).sort((a,b)=>parseDate(a)-parseDate(b));
  charts.trend = new Chart(trendChart,{type:"line",data:{
    labels:dKeys,
    datasets:[
      {label:"Target",data:dKeys.map(k=>byDate[k].target),borderColor:"#fbbf24",backgroundColor:"rgba(251,191,36,.2)",tension:.3,fill:true},
      {label:"Output",data:dKeys.map(k=>byDate[k].output),borderColor:"#4ade80",backgroundColor:"rgba(74,222,128,.2)",tension:.3,fill:true}
    ]},options:chartOpts()});

  const avg = idx => {
    const v = rows.map(r=>toNum(r[idx])); return v.length? v.reduce((a,b)=>a+b,0)/v.length:0;
  };
  charts.oee = new Chart(oeeChart,{type:"bar",data:{
    labels:["Availability","Performance","Quality","OEE"],
    datasets:[{label:"%",data:[avg(33),avg(34),avg(35),avg(36)],
      backgroundColor:["#3b82f6","#22d3ee","#a855f7","#22c55e"]}]
  },options:chartOpts()});

  const dt = {
    "Unavailable Order":ANALYSIS_COLS.Unavailable,
    "Raw Material":ANALYSIS_COLS.RawMat,
    "Manpower":ANALYSIS_COLS.Manpower,
    "QCO":ANALYSIS_COLS.QCO,
    "Setup/Adj":ANALYSIS_COLS.Setup,
    "Mechanical":ANALYSIS_COLS.Mechanical,
    "Electrical":ANALYSIS_COLS.Electrical,
    "Others":ANALYSIS_COLS.OthersDT
  };
  const dtLabels = Object.keys(dt);
  const dtVals   = dtLabels.map(l=> rows.reduce((s,r)=>s+toNum(r[dt[l]]),0));
  charts.dt = new Chart(downtimeChart,{type:"doughnut",data:{
    labels:dtLabels,
    datasets:[{data:dtVals,backgroundColor:["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#a855f7","#ec4899"]}]
  },options:chartOpts()});

  const wreason = {};
  rows.forEach(r=>{
    const reason = (r[ANALYSIS_COLS.WastageReason]||"Unspecified").trim()||"Unspecified";
    wreason[reason] = (wreason[reason]||0) + toNum(r[ANALYSIS_COLS.TotalWastage]);
  });
  charts.waste = new Chart(wastageChart,{type:"bar",data:{
    labels:Object.keys(wreason),
    datasets:[{label:"Wastage Pcs",data:Object.values(wreason),backgroundColor:"#f87171"}]
  },options:chartOpts()});

  const sup = {};
  rows.forEach(r=>{
    const k = r[ANALYSIS_COLS.Supervisor]||"N/A";
    sup[k] = (sup[k]||0) + toNum(r[9]);
  });
  charts.sup = new Chart(supervisorChart,{type:"bar",data:{
    labels:Object.keys(sup),
    datasets:[{label:"Output (Pcs)",data:Object.values(sup),backgroundColor:"#22c55e"}]
  },options:chartOpts()});

  const mac = {};
  rows.forEach(r=>{
    const k = r[ANALYSIS_COLS.Machine]||"N/A";
    mac[k] = (mac[k]||0) + toNum(r[9]);
  });
  charts.mac = new Chart(machineChart,{type:"bar",data:{
    labels:Object.keys(mac),
    datasets:[{label:"Output (Pcs)",data:Object.values(mac),backgroundColor:"#3b82f6"}]
  },options:chartOpts()});
}
function chartOpts(){
  return {responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{color:"#e2e8f0"}}},
    scales:{
      x:{ticks:{color:"#cbd5e1"},grid:{color:"rgba(255,255,255,.05)"}},
      y:{ticks:{color:"#cbd5e1"},grid:{color:"rgba(255,255,255,.05)"}}
    }};
}

function renderTable(rows){
  const totalCols = HEADERS.length || (rows[0] ? rows[0].length : 0);
  const visibleIdx = [];
  for(let i=0;i<totalCols;i++){
    if(!IGNORE_COLS.includes(i)) visibleIdx.push(i);
  }
  const t = document.getElementById("dataTable");
  const headHtml = "<thead><tr>" +
    visibleIdx.map(i=>`<th>${(HEADERS[i]||"Col "+(i+1))}</th>`).join("") +
    "</tr></thead>";
  const bodyHtml = "<tbody>" +
    rows.map(r=>"<tr>"+visibleIdx.map(i=>`<td>${r[i]??""}</td>`).join("")+"</tr>").join("") +
    "</tbody>";
  t.innerHTML = headHtml + bodyHtml;
}

document.getElementById("refreshBtn").addEventListener("click",loadData);
loadData();
setInterval(loadData, 5*60*1000);
