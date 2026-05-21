/* ============================================================
   INJECTION MOLDING DASHBOARD
   Pulls live data from Google Sheets (CSV gviz endpoint)
   ============================================================ */
const SHEET_ID = "1687hf4iPefPAw_5Jx55Y_kN20ebDi6s131p3ajGc2ow";
const GID      = "78827421";
const CSV_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

/* Column index map (0-based)
   B=1 Date | D=3 Shift
   H=7  Shift Capacity   | I=8  Shift Target | J=9  Actual Output
   L=11 % Achievement    | AB=27 NPT%        | AE=30 Wastage%
   AH=33 % Availability  | AI=34 Performance%| AJ=35 Quality%
   AK=36 OEE%
   IGNORE: AM=38, AN=39
*/
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

/* Other analytical columns (skip AM=38, AN=39) */
const ANALYSIS_COLS = {
  SBU:0, Section:2, Machine:4, Product:5, Supervisor:6,
  IdealCycle:10, OperationTime:12, PlannedDown:13, AvailableRun:14,
  NPT:15, ActualRun:16, UtilityGas:17, UtilityElec:18,
  Unavailable:19, RawMat:20, Manpower:21, QCO:22, Setup:23,
  Mechanical:24, Electrical:25, OthersDT:26, WastageTarget:28,
  TotalWastage:29, WastageReason:31, GoodProduction:32, Remarks:37
};

/* Columns to ignore in the data table */
const IGNORE_COLS = [38, 39]; // AM, AN

/* Original sheet headers will be captured from row 1 */
let HEADERS = [];
let RAW = [];
let charts = {};

/* ---------- Helpers ---------- */
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

/* ---------- Load CSV ---------- */
async function loadData(){
  const res  = await fetch(CSV_URL+"&_="+Date.now());
  const text = await res.text();
  const parsed = Papa.parse(text,{header:false}).data;
  HEADERS = parsed[0] || [];
  RAW = parsed.slice(1).filter(r => r && r[1]); // need a Date in B
  buildFilters();
  applyFilters();
}

/* ---------- Filters (only Month, Date, Shift) ---------- */
function buildFilters(){
  const months = new Set(), dates = new Set(), shifts = new Set();
  RAW.forEach(r=>{
    const d = parseDate(r[1]);
    if(d){ months.add(monthName(d)); dates.add(r[1]); }
    if(r[3]) shifts.add(r[3]);
  });

  // reset selects (keep only the "All" option)
  resetSelect("monthFilter");
  resetSelect("dateFilter");
  resetSelect("shiftFilter");

  fillSelect("monthFilter",[...months]);
  // sort dates chronologically
  fillSelect("dateFilter",[...dates].sort((a,b)=>parseDate(a)-parseDate(b)));
  fillSelect("shiftFilter",[...shifts]);

  // remove any extra filter cards if they exist (cleanup)
  const extra = document.getElementById("extraFilters");
  if(extra) extra.innerHTML = "";

  ["monthFilter","dateFilter","shiftFilter"].forEach(id=>{
    const el = document.getElementById(id);
    el.onchange = applyFilters; // single handler, prevents duplicates
  });
}
function resetSelect(id){
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="ALL">All</option>`;
}
function fillSelect(id,vals){
  const sel = document.getElementById(id);
  vals.forEach(v=>{
    const o=document.createElement("option");o.value=v;o.textContent=v;sel.appendChild(o);
  });
}

/* ---------- Apply filters & redraw ---------- */
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

/* ---------- KPI Cards ---------- */
function renderKPIs(rows){
  const wrap = document.getElementById("kpiCards");
  wrap.innerHTML = "";
  KPI_COLS.forEach(c=>{
    const vals = rows.map(r=>toNum(r[c.idx])).filter(v=>!isNaN(v));
    const sum  = vals.reduce((a,b)=>a+b,0);
    const avg  = vals.length ? sum/vals.length : 0;
    const suffix = c.type==="pct" ? "%" : "";
    wrap.insertAdjacentHTML("beforeend",`
      <div class="kpi ${c.color}">
        <h4>${c.label} <span style="opacity:.5">[${c.key}]</span></h4>
        <div class="total">${c.type==="pct"?fmt(avg,2)+suffix:fmt(sum,0)}</div>
        <div class="avg">${c.type==="pct"?`Sum: ${fmt(sum,1)}${suffix}`:`Avg: ${fmt(avg,2)}`}</div>
      </div>`);
  });
}

/* ---------- Charts ---------- */
function destroyCharts(){ Object.values(charts).forEach(c=>c?.destroy()); charts={}; }
function renderCharts(rows){
  destroyCharts();

  /* Trend: Output vs Target by date */
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

  /* OEE Components - average */
  const avg = idx => {
    const v = rows.map(r=>toNum(r[idx])); return v.length? v.reduce((a,b)=>a+b,0)/v.length:0;
  };
  charts.oee = new Chart(oeeChart,{type:"bar",data:{
    labels:["Availability","Performance","Quality","OEE"],
    datasets:[{label:"%",data:[avg(33),avg(34),avg(35),avg(36)],
      backgroundColor:["#3b82f6","#22d3ee","#a855f7","#22c55e"]}]
  },options:chartOpts()});

  /* Downtime breakdown - SUM of mins */
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

  /* Wastage by reason */
  const wreason = {};
  rows.forEach(r=>{
    const reason = (r[ANALYSIS_COLS.WastageReason]||"Unspecified").trim()||"Unspecified";
    wreason[reason] = (wreason[reason]||0) + toNum(r[ANALYSIS_COLS.TotalWastage]);
  });
  charts.waste = new Chart(wastageChart,{type:"bar",data:{
    labels:Object.keys(wreason),
    datasets:[{label:"Wastage Pcs",data:Object.values(wreason),backgroundColor:"#f87171"}]
  },options:chartOpts()});

  /* Production by Supervisor */
  const sup = {};
  rows.forEach(r=>{
    const k = r[ANALYSIS_COLS.Supervisor]||"N/A";
    sup[k] = (sup[k]||0) + toNum(r[9]);
  });
  charts.sup = new Chart(supervisorChart,{type:"bar",data:{
    labels:Object.keys(sup),
    datasets:[{label:"Output (Pcs)",data:Object.values(sup),backgroundColor:"#22c55e"}]
  },options:chartOpts()});

  /* Production by Machine */
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

/* ---------- Data Table (ALL columns except AM & AN) ---------- */
function renderTable(rows){
  // build list of columns to show: every header index except IGNORE_COLS
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

/* ---------- Init ---------- */
document.getElementById("refreshBtn").addEventListener("click",loadData);
loadData();
setInterval(loadData, 5*60*1000); // auto-refresh every 5 min
