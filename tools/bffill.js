/* BF Fill — FieldPass → BackFlowID / Tradehack backflow test fill.
 *
 * Phone bookmark (name it "bffill"):
 * javascript:(function(){var s=document.createElement('script');s.src='https://neil293.github.io/FieldPass/tools/bffill.js?'+Date.now();s.onerror=function(){alert('BF Fill: could not load script')};document.body.appendChild(s)})()
 *
 * FieldPass copies the test to the clipboard as "FPBF1 {json}" when readings are saved.
 * This script reads it (clipboard, or a paste box), then on each page:
 *   BackFlowID tag form     → fills empty device fields (type, make, model, size, serial, location, GPS)
 *   BackFlowID test form    → readings, isolating valves / strainer / install = Yes, result, test kit
 *   BackFlowID test result  → "Tradehack →" (re-copies the test, opens Tradehack search for the serial)
 *   Tradehack lists         → finds the device row by serial, "Open test"
 *   Tradehack test page     → readings, valves tight, strainer yes, kit, appendix, result
 * It never presses Submit / Complete. Filled fields are highlighted yellow.
 */
(function(){
'use strict';
if(window.__bffill){window.__bffill.show();return;}

var VER='1.0';
var KEY='fpbf_packet_v1', MAXAGE=18*3600e3;

/* ── helpers ─────────────────────────────────────────── */
function norm(s){return String(s==null?'':s).toLowerCase().replace(/[\s ]+/g,' ').replace(/[*?:]/g,'').trim();}
function nser(s){return String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,'');}
function has(v){return v!==undefined&&v!==null&&v!=='';}
function visible(el){return !!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));}
function q(sel,root){return (root||document).querySelector(sel);}
function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function parsePacket(t){
  var m=String(t||'').match(/FPBF1\s*(\{[\s\S]*\})/);
  if(!m) return null;
  try{var p=JSON.parse(m[1]);return p&&has(p.serial)?p:null;}catch(e){return null;}
}
function stored(){
  try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&o.p&&Date.now()-o.at<MAXAGE) return o.p;}catch(e){}
  return null;
}
function store(p){try{localStorage.setItem(KEY,JSON.stringify({p:p,at:Date.now()}));}catch(e){}}
function packetText(p){return 'FPBF1 '+JSON.stringify(p);}
var IN_APP=!!(window.FieldPassApp&&window.FieldPassApp.getPacket);
function appPacket(){try{return IN_APP?parsePacket(window.FieldPassApp.getPacket()):null;}catch(e){return null;}}
function newest(a,b){if(!a) return b;if(!b) return a;return (a.ts||0)>=(b.ts||0)?a:b;}

var filled=0, missed=[];
function mark(el){
  if(!el) return;
  el.style.setProperty('background-color','#fff3b0','important');
  el.style.setProperty('outline','2px solid #e0b400','important');
}
function fire(el,types){
  var W=el.ownerDocument.defaultView||window;
  types.forEach(function(t){el.dispatchEvent(new W.Event(t,{bubbles:true}));});
}
function setVal(el,v){
  if(!el||!has(v)) return false;
  v=String(v);
  var W=el.ownerDocument.defaultView||window;
  var proto=el.tagName==='SELECT'?W.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?W.HTMLTextAreaElement.prototype:W.HTMLInputElement.prototype;
  var d=Object.getOwnPropertyDescriptor(proto,'value');
  if(d&&d.set) d.set.call(el,v); else el.value=v;
  fire(el,['input','change','keyup','blur']);
  mark(el); filled++;
  return true;
}
function clickRadio(r){
  if(!r) return false;
  if(!r.checked) r.click();
  if(!r.checked){r.checked=true;fire(r,['change']);}
  mark(r.closest('label')||r); filled++;
  return true;
}
function setCheckbox(c,on){
  if(!c) return false;
  if(!!c.checked!==!!on) c.click();
  mark(c.closest('label')||c); filled++;
  return true;
}
function setSelect(sel,test){
  if(!sel) return false;
  for(var i=0;i<sel.options.length;i++){
    var o=sel.options[i];
    if(o.value!==''&&test(o)) return setVal(sel,o.value);
  }
  return false;
}
function pageHasSerial(serial){
  var want=nser(serial); if(!want) return true;
  var txt=document.body.innerText||'';
  // serials shown as text, plus serial inputs' values
  var vals=qa('input').map(function(i){return i.value||'';}).join(' ');
  return (txt+' '+vals).split(/[\s,;|()]+/).some(function(w){return nser(w)===want;});
}

/* ── page detection ─────────────────────────────────── */
function bfFields(){
  return qa('form-input').map(function(fi){
    var p=fi.querySelector('p,label');
    return {el:fi,label:norm(p?p.textContent:''),name:((fi.className||'').match(/name-([\w-]+)/)||[])[1]||''};
  });
}
function detect(){
  if(q('#device_check_valve_1')||q('form.form9_qld')) return 'th_test';
  if(/tradehack/i.test(location.hostname)||q('a[href*="/clients/retest/"]')){
    return q('a[href*="/clients/retest/"]')?'th_list':'th_other';
  }
  var f=bfFields();
  if(f.some(function(x){return /check valve ?#? ?1|relief valve/.test(x.label)&&x.el.querySelector('input,select');})) return 'bf_test';
  if(q('form [name="manufacturer"]')&&q('form [name="type_code"]')) return 'bf_tag';
  if(/result \(provided by tester\)/i.test(document.body.innerText||'')) return 'bf_result';
  if(/backflowid/i.test(location.hostname)) return 'bf_other';
  return 'other';
}

/* ── BackFlowID: test form ──────────────────────────── */
function bfSet(f,value){
  if(!f||!has(value)) return false;
  var want=norm(value);
  var radios=qa('input[type=radio]',f.el);
  if(radios.length){
    var pick=null;
    radios.forEach(function(r){
      if(pick) return;
      var t=norm(r.value), lt=norm((r.closest('label')||r.parentNode).textContent);
      if(t===want||lt===want) pick=r;
    });
    if(!pick) radios.forEach(function(r){
      if(pick) return;
      var t=norm(r.value), lt=norm((r.closest('label')||r.parentNode).textContent);
      if(t.indexOf(want)===0||lt.indexOf(want)===0) pick=r;
    });
    return clickRadio(pick);
  }
  var sel=q('select',f.el);
  if(sel) return setSelect(sel,function(o){return norm(o.value)===want||norm(o.textContent).indexOf(want)>=0;});
  var cb=q('input[type=checkbox]',f.el);
  if(cb) return setCheckbox(cb,/^(yes|true|pass|1)$/.test(want));
  var inp=q('input:not([type=hidden]):not([type=file]),textarea',f.el);
  return setVal(inp,value);
}
function bfIsEmpty(f){
  if(!f) return false;
  var radios=qa('input[type=radio]',f.el);
  if(radios.length) return !radios.some(function(r){return r.checked;});
  var x=q('select,input:not([type=hidden]):not([type=file]),textarea',f.el);
  return x?!x.value:false;
}
function fillBfTest(p){
  var fields=bfFields().filter(function(f){return f.label;});
  var used=[];
  function find(re){
    for(var i=0;i<fields.length;i++){var f=fields[i];if(used.indexOf(f)<0&&re.test(f.label)){used.push(f);return f;}}
    return null;
  }
  var result=p.result==='Fail'?'Fail':'Pass';
  var plan=[
    ['Upstream isolating valve tight',   /^upstream isolat/,                         'Yes'],
    ['Downstream isolating valve tight', /^downstream isolat/,                       'Yes'],
    ['Check valve #1 reading',           /^(check valve|cv) ?#? ?(no\.? ?)?1\b|^first check valve.*(reading|kpa)/, p.cv1],
    ['Relief valve opened at',           /^relief valve|^differential pressure/,     p.type==='RPZD'?p.rv:null],
    ['Second check valve tight',         /^second check valve tight|^(check valve|cv) ?#? ?2 tight/, 'Yes'],
    ['Check valve #2 reading',           /^(check valve|cv) ?#? ?(no\.? ?)?2\b|^second check valve.*(reading|kpa)/, p.cv2],
    ['Mains Pressure',                   /^mains? pressure/,                         p.main],
    ['Installation complies',            /installation complies/,                    'Yes'],
    ['Permission to turn off water',     /permission received/,                      'Yes'],
    ['Cleaned Strainer / Screen',        /^clean(ed)? strainer/,                     'Yes'],
    ['Result (provided by tester)',      /^result( \(provided by tester\))?$|^test result$/, result],
  ];
  plan.forEach(function(s){
    if(!has(s[2])) return;
    var f=find(s[1]);
    if(!f||!bfSet(f,s[2])) missed.push(s[0]);
  });
  // only when nothing chosen yet
  var st=find(/^strainer ?\/? ?screen installed|^has a strainer/);
  if(st&&bfIsEmpty(st)) bfSet(st,'Yes');
  var kit=find(/^test kit$/);
  if(kit&&p.kit&&p.kit.serial&&bfIsEmpty(kit)){
    var s=nser(p.kit.serial);
    var sel=q('select',kit.el);
    if(!(sel&&setSelect(sel,function(o){return nser(o.textContent).indexOf(s)>=0;}))) missed.push('Test kit '+p.kit.serial);
  }
  var cm=find(/^comments?$|^test remarks|^remarks/);
  if(cm&&p.remarks&&bfIsEmpty(cm)) bfSet(cm,p.remarks);
}

/* ── BackFlowID: tag form (only fills empty fields) ─── */
function fillBfTag(p){
  var warn=[];
  function el(n){return q('form [name="'+n+'"]');}
  function ifEmpty(n,v){var e=el(n);if(e&&!e.value&&has(v)) setVal(e,v);}
  var tc=el('type_code');
  if(tc&&!tc.value&&p.type) setSelect(tc,function(o){return o.value===p.type;});
  ifEmpty('manufacturer',p.make);
  ifEmpty('model',p.model);
  var sz=el('size');
  if(sz&&!sz.value&&has(p.size)){
    var n=String(p.size).replace(/[^0-9]/g,'');
    if(!setSelect(sz,function(o){return o.value.replace(/[^0-9]/g,'')===n;})) missed.push('Size '+p.size);
  }
  var se=el('serial');
  if(se){
    if(!se.value) setVal(se,p.serial);
    else if(nser(se.value)!==nser(p.serial)) warn.push('Serial on form is '+se.value+', FieldPass has '+p.serial);
  }
  ifEmpty('location_description',p.location);
  ifEmpty('location_latitude',p.lat);
  ifEmpty('location_longitude',p.lng);
  return warn;
}

/* ── Tradehack: test page ───────────────────────────── */
function thRadio(name,value){
  var r=qa('input[type=radio]').filter(function(x){return x.name===name&&norm(x.value)===norm(value);})[0];
  if(!r){missed.push(name.replace(/\[\]$/,'')+' = '+value);return false;}
  return clickRadio(r);
}
function thNoneChecked(name){return !qa('input[type=radio]').some(function(x){return x.name===name&&x.checked;});}
function fillThTest(p,done){
  var isDCV=p.type==='DCV';
  thRadio('device_type[]',isDCV?'Double check valve':'Reduced pressure zone device');
  setTimeout(function(){
    var g=function(id){return document.getElementById(id);};
    setVal(g('mains_pressure_kpa'),p.main);
    if(g('mains_pressure_time_of_test')&&!g('mains_pressure_time_of_test').value) setVal(g('mains_pressure_time_of_test'),p.time);
    var dt=g('date_of_test');
    if(dt&&p.date&&(!dt.max||p.date<=dt.max)&&dt.value!==p.date) setVal(dt,p.date);
    setVal(g('device_check_valve_1'),p.cv1);
    if(!isDCV) setVal(g('device_differential_pressure'),p.rv);
    var box=q('.main_device_check2'), alt=q('.main_device_check2_alt');
    if(!box||visible(box)) setVal(g('device_check_valve_2'),p.cv2);
    if(alt&&visible(alt)) thRadio('device_check_valve_2[]','Tight');
    thRadio('upstream_valve_tight','tight');
    thRadio('downstream_valve_tight','tight');
    if(thNoneChecked('strainer_fitted[]')) thRadio('strainer_fitted[]','yes');
    thRadio('strainer_cleaned[]','yes');
    var kit=g('test_kits');
    if(kit&&p.kit&&p.kit.serial){
      var s=nser(p.kit.serial);
      if(!setSelect(kit,function(o){return nser(o.textContent).indexOf(s)>=0;})) missed.push('Test kit '+p.kit.serial);
    }
    thRadio('appendix[]',isDCV?'F':'E');
    thRadio('test_result[]',p.result==='Fail'?'Fail':'Pass');
    var rm=g('test_remarks');
    if(rm&&!rm.value&&p.remarks) setVal(rm,p.remarks);
    done();
  },350);
}

/* ── Tradehack: lists (schedule / search) ───────────── */
function thFindRows(p){
  var want=nser(p.serial);
  return qa('a[href*="/clients/retest/"]').filter(function(a){
    var row=a.closest('tr')||a.parentNode;
    var cell=q('td[data-title="Serial"]',row);
    if(cell) return nser(cell.textContent)===want;
    return (row.textContent||'').split(/[\s,;|()]+/).some(function(w){return nser(w)===want;});
  });
}

/* ── UI ─────────────────────────────────────────────── */
var host=document.createElement('div');
host.id='bffill-host';
host.style.cssText='position:fixed;right:10px;bottom:10px;z-index:2147483647';
['focusin','keydown','keyup','keypress','touchstart','mousedown'].forEach(function(t){host.addEventListener(t,function(e){e.stopPropagation();});});
var root=host.attachShadow({mode:'open'});
document.body.appendChild(host);
root.innerHTML='<style>'+
  '.w{font:14px/1.35 system-ui,-apple-system,Roboto,sans-serif;background:#fff;color:#1c1c1a;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.28);width:260px;max-width:calc(100vw - 20px);overflow:hidden;border:1px solid rgba(0,0,0,.12)}'+
  '.h{display:flex;align-items:center;gap:6px;background:#1a4d6e;color:#fff;padding:7px 10px;font-weight:600;font-size:13px}'+
  '.h span{flex:1}.h button{background:none;border:none;color:#fff;font-size:16px;padding:2px 6px;cursor:pointer}'+
  '.b{padding:9px 10px}.pk{font-size:12px;color:#555;margin-bottom:8px;word-break:break-word}.pk b{color:#1c1c1a}'+
  '.msg{font-size:12px;margin:0 0 8px;padding:7px 8px;border-radius:8px;display:none}.ok{background:#eaf4ee;color:#1a6636}.bad{background:#fdf0f0;color:#b83232}.inf{background:#fff8d6;color:#6b5500}'+
  '.row{display:flex;gap:6px}.row button{flex:1}'+
  'button.x{font:600 14px system-ui,sans-serif;border-radius:10px;border:1px solid rgba(0,0,0,.15);background:#f0efe9;color:#1c1c1a;padding:10px 6px;cursor:pointer}'+
  'button.p{background:#1a6636;color:#fff;border-color:#1a6636}button.o{background:#e8590c;color:#fff;border-color:#e8590c}'+
  'textarea{width:100%;box-sizing:border-box;height:70px;font:12px monospace;margin:6px 0;border:1px solid #ccc;border-radius:8px;padding:6px}'+
  '.mini{display:none}.min .b{display:none}'+
'</style>'+
'<div class="w" id="w"><div class="h"><span id="t">BF Fill</span><button id="mn" title="Minimise">–</button><button id="cl" title="Close">✕</button></div>'+
'<div class="b"><div class="pk" id="pk"></div><div class="msg" id="msg"></div>'+
'<div id="paste" style="display:none"><div style="font-size:12px">Long-press below, Paste, then Use.</div><textarea id="ta"></textarea><button class="x" id="use" style="width:100%">Use</button></div>'+
'<div class="row" style="margin-bottom:6px"><button class="x p" id="go"></button></div>'+
'<div class="row"><button class="x" id="ld">📋 Load test</button><button class="x" id="mp" title="Copy this page\'s field list">🗺 Map</button></div>'+
'</div></div>';
var $=function(id){return root.getElementById(id);};

var packet=newest(appPacket(),stored());
function showPacket(){
  var p=packet;
  if(!p){$('pk').innerHTML='No test loaded. Save the test in FieldPass, then tap <b>Load test</b>.';return;}
  var r=[p.type,p.result].filter(Boolean).join(' · ');
  var v=[has(p.cv1)?'CV1 '+p.cv1:'',p.type==='RPZD'&&has(p.rv)?'RV '+p.rv:'',has(p.cv2)?'CV2 '+p.cv2:'',has(p.main)?'Main '+p.main:''].filter(Boolean).join(' · ');
  $('pk').innerHTML='<b>S/N '+esc(p.serial)+'</b> — '+esc((p.make||'')+' '+(p.model||''))+'<br>'+esc(r)+'<br>'+esc(v)+(p.kit&&p.kit.serial?'<br>Kit '+esc(p.kit.serial):'');
}
function say(text,kind){var m=$('msg');m.className='msg '+(kind||'inf');m.textContent=text;m.style.display=text?'block':'none';}

function loadClipboard(cb){
  if(IN_APP){
    var ap=appPacket();
    if(ap){packet=ap;store(ap);showPacket();say('Loaded test for S/N '+ap.serial,'ok');if(cb) cb();}
    else say('No test from FieldPass yet. Save the readings in FieldPass first.','bad');
    return;
  }
  if(!navigator.clipboard||!navigator.clipboard.readText){showPaste();return;}
  navigator.clipboard.readText().then(function(t){
    var p=parsePacket(t);
    if(p){packet=p;store(p);showPacket();say('Loaded test for S/N '+p.serial,'ok');if(cb) cb();}
    else{say('No FieldPass test on the clipboard. Save the test in FieldPass first, or paste it below.','bad');showPaste();}
  },function(){showPaste();});
}
function showPaste(){$('paste').style.display='block';$('ta').value='';say('Clipboard not readable here — paste the test instead.','inf');}
$('use').onclick=function(){
  var p=parsePacket($('ta').value);
  if(!p){say('That isn\'t a FieldPass test. Copy it again from FieldPass.','bad');return;}
  packet=p;store(p);$('paste').style.display='none';showPacket();say('Loaded test for S/N '+p.serial,'ok');
};
$('ld').onclick=function(){loadClipboard();};
$('cl').onclick=function(){host.remove();window.__bffill=null;};
$('mn').onclick=function(){$('w').classList.toggle('min');};
$('mp').onclick=function(){
  var out=[location.href];
  qa('form-input').forEach(function(fi){
    var p=fi.querySelector('p,label');
    out.push('FI|'+((fi.className.match(/name-([\w-]+)/)||[])[1]||'')+'|'+norm(p?p.textContent:'')+'|'+qa('input,select,textarea',fi).map(function(e){return e.tagName.toLowerCase()+':'+(e.type||'')+':'+(e.name||'')+(e.type==='radio'?'='+e.value:'');}).join(','));
  });
  qa('input,select,textarea').forEach(function(e){if(e.type!=='hidden'&&!e.closest('form-input')) out.push('IN|'+e.tagName.toLowerCase()+'|'+(e.type||'')+'|'+(e.name||'')+'|'+(e.id||'')+(e.type==='radio'?'|'+e.value:''));});
  var t=out.join('\n');
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(function(){say('Field list copied ('+out.length+' lines). Paste it to Claude.','ok');},function(){$('paste').style.display='block';$('ta').value=t;say('Copy the field list below.','inf');});
};

function withPacket(fn){
  var ap=appPacket();
  if(ap&&(!packet||(ap.ts||0)>(packet.ts||0))){packet=ap;store(ap);showPacket();}
  if(packet) return fn(packet);
  loadClipboard(function(){fn(packet);});
}
function report(extraWarn){
  var parts=[];
  if(filled) parts.push('Filled '+filled+' fields (yellow). Check them, then submit.');
  if(missed.length) parts.push('Not found: '+missed.join(', ')+'. Tap 🗺 Map and send it to Claude if this keeps happening.');
  if(extraWarn&&extraWarn.length) parts.push(extraWarn.join('. '));
  say(parts.join(' ')||'Nothing to fill on this page.',missed.length||(extraWarn&&extraWarn.length)?'bad':(filled?'ok':'inf'));
}
function checkSerial(p){
  if(pageHasSerial(p.serial)) return true;
  return confirm('This page doesn\'t show serial '+p.serial+'.\n\nIs this the right device? Tap OK to fill anyway.');
}

/* ── per-page action ────────────────────────────────── */
var page=null;
var titles={bf_test:'BackFlowID test',bf_tag:'BackFlowID tag',bf_result:'BackFlowID result',bf_other:'BackFlowID',th_test:'Tradehack test',th_list:'Tradehack',th_other:'Tradehack',other:'BF Fill'};
var go=$('go');
function setupPage(){
page=detect();
filled=0;missed=[];say('');
go.className='x p';
$('t').textContent='BF Fill · '+(titles[page]||'');
if(IN_APP&&/other$/.test(page)) $('w').classList.add('min'); else $('w').classList.remove('min');

function scrollToEl(el){if(el&&el.scrollIntoView) el.scrollIntoView({block:'center',behavior:'smooth'});}

if(page==='bf_test'){
  go.textContent='⚡ Fill test';
  go.onclick=function(){withPacket(function(p){
    if(!checkSerial(p)) return;
    filled=0;missed=[];fillBfTest(p);report();
  });};
} else if(page==='bf_tag'){
  go.textContent='⚡ Fill device details';
  go.onclick=function(){withPacket(function(p){
    filled=0;missed=[];var w=fillBfTag(p);report(w);
  });};
} else if(page==='bf_result'){
  go.textContent='Tradehack →';
  go.className='x o';
  go.onclick=function(){withPacket(function(p){
    if(p.tradehack===false){say('Tradehack is turned off in FieldPass settings.','inf');return;}
    var url='https://my.tradehack.com.au/search/?q='+encodeURIComponent(p.serial);
    var open=function(){location.href=url;};
    // put the test back on the clipboard for Tradehack
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(packetText(p)):Promise.reject()).then(open,open);
  });};
  if(packet&&packet.tradehack===false){go.textContent='Done ✓';go.className='x';go.onclick=function(){say('Tradehack is turned off in FieldPass settings — nothing more to do.','ok');};}
} else if(page==='th_test'){
  go.textContent='⚡ Fill test';
  go.onclick=function(){withPacket(function(p){
    var sn=document.getElementById('device_serial_number');
    if(sn&&sn.value&&nser(sn.value)!==nser(p.serial)&&!confirm('This Tradehack test is for serial '+sn.value+', but the FieldPass test is for '+p.serial+'.\n\nFill anyway?')) return;
    filled=0;missed=[];
    fillThTest(p,function(){report();scrollToEl(q('.complete-test'));});
  });};
} else if(page==='th_list'){
  go.textContent='🔎 Find device';
  var hits=[];
  go.onclick=function(){withPacket(function(p){
    hits=thFindRows(p);
    if(!hits.length){say('S/N '+p.serial+' isn\'t on this page. Open the right site or search for the serial.','bad');return;}
    var a=hits[0], row=a.closest('tr')||a.parentNode;
    if(row.style&&row.style.display==='none') row.style.display='';
    mark(row);scrollToEl(row);
    say(hits.length>1?'Found '+hits.length+' matches — first one highlighted.':'Found S/N '+p.serial+'.','ok');
    go.textContent='Open test →';
    go.onclick=function(){location.href=a.href;};
  });};
} else {
  go.textContent='⚡ Fill';
  go.onclick=function(){say(page==='th_other'?'Open the device\'s backflow Test page, then run BF Fill again.':page==='bf_other'?'Open the device, tap Test Device (or Tag), then run BF Fill again.':'This isn\'t a BackFlowID or Tradehack page.','inf');};
}
}
setupPage();
// BackFlowID changes screens without a full page load — follow along
setInterval(function(){try{if(detect()!==page) setupPage();}catch(e){}},1000);

showPacket();
window.__bffill={show:function(){host.style.display='';$('w').classList.remove('min');},version:VER};
})();
