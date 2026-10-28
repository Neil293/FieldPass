# Rebuild beta/ as a fresh test copy of the live root files (storage shim, Firebase stub, BETA badge, own SW cache).
# Usage: python3 tools/make_beta.py .   (run from the repo root)
# WARNING: overwrites beta/index.html — only run when beta/ has no unpromoted work.
import os, re, shutil, sys
root = sys.argv[1]
b = os.path.join(root, 'beta')
os.makedirs(b, exist_ok=True)
for f in ['data.js', 'icon-192.png', 'icon-512.png']:
    shutil.copy(os.path.join(root, f), b)

def sub1(text, old, new):
    assert text.count(old) == 1, ('not unique', old[:60], text.count(old))
    return text.replace(old, new)

# ---------- index.html ----------
h = open(os.path.join(root, 'index.html'), encoding='utf-8').read()

SHIM = r'''<!-- BETA-ONLY: keep beta data separate from the live app (same website = shared storage) -->
<script>
(function(){
  var P='fpbeta:', S=Storage.prototype, g=S.getItem, s=S.setItem, r=S.removeItem;
  var COPY=/^(fp_|bf_|scc_|ct_)/;
  function L(o){ try{ return o===window.localStorage; }catch(e){ return false; } }
  function copyLive(){
    var ls=window.localStorage, keys=[];
    for(var i=0;i<ls.length;i++){ var k=ls.key(i); if(k&&k.indexOf(P)!==0&&COPY.test(k)) keys.push(k); }
    keys.forEach(function(k){ s.call(ls,P+k,g.call(ls,k)); });
    s.call(ls,P+'_init',new Date().toISOString());
    return keys.length;
  }
  function clearBeta(){
    var ls=window.localStorage, keys=[];
    for(var i=0;i<ls.length;i++){ var k=ls.key(i); if(k&&k.indexOf(P)===0) keys.push(k); }
    keys.forEach(function(k){ r.call(ls,k); });
  }
  try{
    if(g.call(window.localStorage,P+'_init')===null) copyLive();
  }catch(e){ alert('FieldPass Beta could not copy your live data: '+e.message); }
  S.getItem=function(k){ return g.call(this, L(this)?P+k:k); };
  S.setItem=function(k,v){ return s.call(this, L(this)?P+k:k, v); };
  S.removeItem=function(k){ return r.call(this, L(this)?P+k:k); };
  window.FP_BETA={
    copiedAt:function(){ return g.call(window.localStorage,P+'_init'); },
    recopy:function(){
      if(!confirm('Replace ALL beta data with a fresh copy of your live FieldPass data?\n\nAnything entered only in the beta will be lost. Live FieldPass is not changed.')) return;
      try{ clearBeta(); var n=copyLive(); alert('Copied '+n+' items from live FieldPass.'); location.reload(); }
      catch(e){ alert('Copy failed: '+e.message); }
    }
  };
})();
</script>
'''
h = sub1(h, '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n',
         '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' + SHIM)
h = sub1(h, '<title>FieldPass</title>', '<title>FieldPass Beta</title>')
h = sub1(h, '<meta name="theme-color" content="#1a4d6e">', '<meta name="theme-color" content="#e8590c">')

# Replace the Firebase module with a stub: no connection, so nothing can reach ct_sync/main
start = h.index('<!-- Firebase SDK -->')
end = h.index('</script>', start) + len('</script>')
h = h[:start] + '''<!-- BETA-ONLY: Firebase sync disabled so the beta can never overwrite live data -->
<script>
window._firebaseError='Sync is turned off in FieldPass Beta';
window.addEventListener('DOMContentLoaded',function(){ window.dispatchEvent(new Event('firebase-failed')); });
</script>''' + h[end:]

BADGE = '''
<!-- BETA-ONLY: visible marker -->
<div id="fp-beta-stripe" style="position:fixed;top:0;left:0;right:0;height:4px;background:#e8590c;z-index:99999;pointer-events:none"></div>
<button id="fp-beta-badge" onclick="fpBetaMenu()" style="position:fixed;left:10px;bottom:10px;z-index:99999;background:#e8590c;color:#fff;border:none;border-radius:999px;padding:6px 12px;font:600 12px/1 'DM Sans',sans-serif;letter-spacing:.06em;box-shadow:0 2px 8px rgba(0,0,0,.25)">BETA</button>
<script>
(function(){
  var orig=window.setSyncStatus;
  if(typeof orig!=='function') return;
  window.setSyncStatus=function(){
    orig.apply(this,arguments);
    var l=document.getElementById('sync-label'), d=document.getElementById('sync-dot'), i=document.getElementById('sync-indicator');
    if(l) l.textContent='Sync off (beta)';
    if(d) d.className='sync-dot error';
    if(i) i.onclick=fpBetaMenu;
  };
  setSyncStatus('offline');
})();
function fpBetaMenu(){
  var when=window.FP_BETA&&FP_BETA.copiedAt();
  var msg='FieldPass Beta — test copy.\\n\\nData here is separate from live FieldPass and is not synced.\\nLive data copied: '+(when?new Date(when).toLocaleString():'?')+'\\n\\nTap OK to replace beta data with a fresh copy of live data.';
  if(confirm(msg)) FP_BETA.recopy();
}
</script>
</body>'''
h = sub1(h, '</body>', BADGE)
open(os.path.join(b, 'index.html'), 'w', encoding='utf-8').write(h)

# ---------- sw.js ----------
s = open(os.path.join(root, 'sw.js'), encoding='utf-8').read()
s = re.sub(r"const CACHE_NAME = '[^']*';", "const CACHE_NAME = 'fieldpass-beta-v1';", s)
s = sub1(s, "const TILE_CACHE = 'complytrack-tiles-v1';", "const TILE_CACHE = 'fieldpass-beta-tiles-v1';")
# only clean up beta's own old caches, never the live app's
s = sub1(s, ".filter(k => k !== CACHE_NAME && k !== TILE_CACHE)",
         ".filter(k => k.startsWith('fieldpass-beta-') && k !== CACHE_NAME && k !== TILE_CACHE)")
s = '// BETA copy of the FieldPass service worker (scope /FieldPass/beta/)\n' + s
open(os.path.join(b, 'sw.js'), 'w', encoding='utf-8').write(s)

# ---------- manifest ----------
m = open(os.path.join(root, 'manifest.json'), encoding='utf-8').read()
m = sub1(m, '"name": "FieldPass"', '"name": "FieldPass Beta"')
m = sub1(m, '"short_name": "FieldPass"', '"short_name": "FP Beta"')
m = sub1(m, '"theme_color": "#1a4d6e"', '"theme_color": "#e8590c"')
m = sub1(m, '"start_url": "./index.html",', '"start_url": "./index.html",\n  "id": "./",\n  "scope": "./",')
open(os.path.join(b, 'manifest.json'), 'w', encoding='utf-8').write(m)
print('beta built')
