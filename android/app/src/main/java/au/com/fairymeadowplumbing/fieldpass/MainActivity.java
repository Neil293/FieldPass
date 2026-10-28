package au.com.fairymeadowplumbing.fieldpass;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * FieldPass Android app.
 *
 * Main screen: FieldPass (web app) in a WebView.
 * In-app browser: BackFlowID / QR2id / Tradehack open in a second WebView inside the app,
 * with logins kept between sessions. BF Fill (tools/bffill.js) is loaded into those pages
 * automatically, and FieldPass hands the test over through the FieldPassApp bridge
 * instead of the clipboard.
 */
public class MainActivity extends Activity {

    // Entry page decides which FieldPass version the app runs (beta for now) — change it without a new APK.
    static final String HOME_URL = "https://neil293.github.io/FieldPass/app/";
    static final String APP_HOST = "neil293.github.io";
    static final String[] FILL_HOSTS = {"backflowid.com", "qr2id.net", "qr2id.com", "tradehack.com.au"};

    static final String BFFILL_LOADER =
        "(function(){if(window.__bffill||window.__bffillLoading)return;window.__bffillLoading=1;window.__BFFILL_APP=1;" +
        "var s=document.createElement('script');s.src='https://neil293.github.io/FieldPass/tools/bffill.js?'+Date.now();" +
        "s.onload=s.onerror=function(){window.__bffillLoading=0};(document.body||document.documentElement).appendChild(s);})()";

    // Lets FieldPass downloads (backup JSON, CoC PDF) be saved: blob links are read in JS and passed to saveFile().
    static final String DOWNLOAD_SHIM =
        "(function(){if(window.__fpAppDl)return;window.__fpAppDl=1;var map={};var oc=URL.createObjectURL;" +
        "URL.createObjectURL=function(b){var u=oc.call(URL,b);try{map[u]=b}catch(e){}return u};" +
        "function save(name,blob){var fr=new FileReader();fr.onload=function(){var s=String(fr.result);" +
        "FieldPassApp.saveFile(name,blob.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};fr.readAsDataURL(blob);}" +
        "var ck=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var h=this.href||'';" +
        "if(this.hasAttribute('download')&&(h.indexOf('blob:')===0||h.indexOf('data:')===0)){var n=this.getAttribute('download')||'download';" +
        "if(map[h]){save(n,map[h]);return;}fetch(h).then(function(r){return r.blob()}).then(function(b){save(n,b)});return;}" +
        "return ck.apply(this,arguments);};})()";

    static final int REQ_FILE = 11, REQ_PERM_CAMERA = 12, REQ_PERM_GEO = 13, REQ_PERM_START = 14;

    WebView main, ext;
    LinearLayout extBox;
    TextView extTitle;
    SharedPreferences prefs;

    ValueCallback<Uri[]> fileCallback;
    Uri cameraUri;
    PermissionRequest pendingPermission;
    GeolocationPermissions.Callback geoCallback;
    String geoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("fieldpass", MODE_PRIVATE);
        getWindow().setStatusBarColor(Color.parseColor("#0d2d44"));
        WebView.setWebContentsDebuggingEnabled(true);

        FrameLayout root = new FrameLayout(this);
        main = makeWebView(false);
        root.addView(main, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        extBox = new LinearLayout(this);
        extBox.setOrientation(LinearLayout.VERTICAL);
        extBox.setBackgroundColor(Color.WHITE);
        extBox.addView(makeTopBar(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        ext = makeWebView(true);
        extBox.addView(ext, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        extBox.setVisibility(View.GONE);
        root.addView(extBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(main, true);
        cm.setAcceptThirdPartyCookies(ext, true);

        askStartupPermissions();
        main.loadUrl(HOME_URL);
    }

    int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    View makeTopBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#1a4d6e"));

        TextView back = barButton("‹ FieldPass");
        back.setOnClickListener(v -> closeExt());
        bar.addView(back);

        extTitle = new TextView(this);
        extTitle.setTextColor(Color.WHITE);
        extTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        extTitle.setSingleLine(true);
        extTitle.setEllipsize(TextUtils.TruncateAt.END);
        extTitle.setPadding(dp(4), 0, dp(4), 0);
        bar.addView(extTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView fill = barButton("⚡");
        fill.setOnClickListener(v -> ext.evaluateJavascript("window.__bffill?window.__bffill.show():" + BFFILL_LOADER, null));
        bar.addView(fill);

        TextView reload = barButton("↻");
        reload.setOnClickListener(v -> ext.reload());
        bar.addView(reload);

        TextView chrome = barButton("⇱");
        chrome.setOnClickListener(v -> {
            String u = ext.getUrl();
            if (u != null && u.startsWith("http")) openExternal(Uri.parse(u));
        });
        bar.addView(chrome);
        return bar;
    }

    TextView barButton(String label) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), 0, dp(12), 0);
        t.setMinimumHeight(dp(48));
        TypedValue tv = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, tv, true);
        t.setBackgroundResource(tv.resourceId);
        return t;
    }

    WebView makeWebView(boolean isExt) {
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString() + " FieldPassApp/" + BuildConfigVersion());
        w.addJavascriptInterface(new Bridge(isExt), "FieldPassApp");
        w.setWebViewClient(new Client(isExt));
        w.setWebChromeClient(new Chrome(isExt));
        w.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) return; // handled by DOWNLOAD_SHIM
            openExternal(Uri.parse(url));
        });
        return w;
    }

    String BuildConfigVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1";
        }
    }

    /* ── routing ─────────────────────────────────────── */

    static boolean hostIs(String host, String domain) {
        if (host == null) return false;
        host = host.toLowerCase();
        return host.equals(domain) || host.endsWith("." + domain);
    }

    static boolean isFillHost(String host) {
        for (String d : FILL_HOSTS) if (hostIs(host, d)) return true;
        return false;
    }

    static boolean isMaps(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase();
        String p = u.getPath() == null ? "" : u.getPath();
        return h.equals("maps.app.goo.gl") || h.startsWith("maps.google.") || h.equals("goo.gl") && p.startsWith("/maps")
            || (h.contains("google.") && p.startsWith("/maps"));
    }

    /** Decide where a link goes. Returns true if handled (caller must not load it itself). */
    boolean route(Uri u, boolean fromExt) {
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (scheme.equals("intent")) {
            try {
                Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                Uri data = i.getData();
                if (data != null && ("https".equals(data.getScheme()) || "http".equals(data.getScheme()))) {
                    if (!isMaps(data)) { openExt(data.toString()); return true; }
                }
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                startActivity(i);
            } catch (Exception e) {
                toast("Couldn't open that link");
            }
            return true;
        }
        if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about") || scheme.equals("javascript")) return false;
        if (!scheme.equals("http") && !scheme.equals("https")) { openExternal(u); return true; }
        if (isMaps(u)) { openExternal(u); return true; }
        if (hostIs(u.getHost(), APP_HOST)) {
            if (fromExt) { closeExt(); main.loadUrl(u.toString()); return true; }
            return false;
        }
        if (fromExt) return false;   // keep BackFlowID / Tradehack (and their login pages) inside the in-app browser
        openExt(u.toString());
        return true;
    }

    void openExt(String url) {
        extBox.setVisibility(View.VISIBLE);
        extTitle.setText(Uri.parse(url).getHost());
        ext.loadUrl(url);
    }

    void closeExt() {
        extBox.setVisibility(View.GONE);
        main.requestFocus();
    }

    void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            toast("No app can open this link");
        }
    }

    void toast(String m) {
        runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_SHORT).show());
    }

    class Client extends WebViewClient {
        final boolean isExt;
        Client(boolean isExt) { this.isExt = isExt; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return route(req.getUrl(), isExt);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (isExt) extTitle.setText(Uri.parse(url).getHost());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Uri u = Uri.parse(url);
            if (isExt) {
                if (isFillHost(u.getHost())) view.evaluateJavascript(BFFILL_LOADER, null);
            } else if (hostIs(u.getHost(), APP_HOST)) {
                view.evaluateJavascript(DOWNLOAD_SHIM, null);
            }
            CookieManager.getInstance().flush();
        }
    }

    class Chrome extends WebChromeClient {
        final boolean isExt;
        Chrome(boolean isExt) { this.isExt = isExt; }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            if (isExt && title != null && !title.isEmpty()) extTitle.setText(title);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // window.open(...) — catch the first URL and route it, instead of opening a real popup
            WebView tmp = new WebView(MainActivity.this);
            tmp.setWebViewClient(new WebViewClient() {
                boolean done = false;
                void handle(WebView v, String url) {
                    if (done || url == null || url.equals("about:blank")) return;
                    done = true;
                    Uri u = Uri.parse(url);
                    if (!route(u, isExt)) {
                        if (url.startsWith("blob:") || url.startsWith("data:")) toast("Can't open this here — use Download instead");
                        else (isExt ? ext : main).loadUrl(url);
                    }
                    v.stopLoading();
                    v.post(v::destroy);
                }
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { handle(v, r.getUrl().toString()); return true; }
                @Override
                public void onPageStarted(WebView v, String url, Bitmap f) { handle(v, url); }
            });
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(tmp);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            cameraUri = null;
            Intent pick;
            try { pick = params.createIntent(); } catch (Exception e) { pick = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*"); }
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            boolean images = false;
            String[] types = params.getAcceptTypes();
            if (types == null || types.length == 0) images = true;
            else for (String t : types) if (t == null || t.isEmpty() || t.startsWith("image") || t.equals("*/*")) images = true;

            List<Intent> extra = new ArrayList<>();
            if (images && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, "FieldPass_" + System.currentTimeMillis() + ".jpg");
                    v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/FieldPass");
                    cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (cameraUri != null) {
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        extra.add(cam);
                    }
                } catch (Exception ignored) { cameraUri = null; }
            }
            Intent chooser = Intent.createChooser(pick, "Choose");
            if (!extra.isEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extra.toArray(new Intent[0]));
            try {
                startActivityForResult(chooser, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsCamera = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                if (!wantsCamera) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingPermission = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_PERM_CAMERA);
                }
            });
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, true);
            } else {
                geoOrigin = origin;
                geoCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERM_GEO);
            }
        }
    }

    /* ── bridge used by FieldPass and BF Fill ───────── */

    class Bridge {
        final boolean isExt;
        Bridge(boolean isExt) { this.isExt = isExt; }

        @JavascriptInterface public boolean isApp() { return true; }

        @JavascriptInterface public String version() { return BuildConfigVersion(); }

        /** FieldPass hands over the test (FPBF1 …). Only the FieldPass screen may set it. */
        @JavascriptInterface public void setPacket(String text) {
            if (isExt) return;
            prefs.edit().putString("packet", text == null ? "" : text).putLong("packetAt", System.currentTimeMillis()).apply();
        }

        @JavascriptInterface public String getPacket() { return prefs.getString("packet", ""); }

        @JavascriptInterface public void openInApp(String url) {
            if (isExt || url == null) return;
            runOnUiThread(() -> openExt(url));
        }

        @JavascriptInterface public void saveFile(String name, String mime, String base64) {
            if (isExt) return;
            runOnUiThread(() -> saveToDownloads(name, mime, base64));
        }
    }

    void saveToDownloads(String name, String mime, String base64) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, "Download/FieldPass");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("no uri");
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) throw new Exception("no stream");
                os.write(bytes);
            }
            Toast.makeText(this, "Saved to Downloads/FieldPass/" + name, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Couldn't save " + name, Toast.LENGTH_LONG).show();
        }
    }

    /* ── permissions & results ──────────────────────── */

    void askStartupPermissions() {
        List<String> need = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA);
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.ACCESS_FINE_LOCATION);
            need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERM_START);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_PERM_CAMERA && pendingPermission != null) {
            if (granted) pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingPermission.deny();
            pendingPermission = null;
        } else if (requestCode == REQ_PERM_GEO && geoCallback != null) {
            geoCallback.invoke(geoOrigin, granted, granted);
            geoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if (result == null && data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            }
            if (result == null && cameraUri != null) result = new Uri[]{cameraUri};
        }
        boolean usedCamera = false;
        if (result != null && cameraUri != null) for (Uri r : result) if (cameraUri.equals(r)) usedCamera = true;
        if (cameraUri != null && !usedCamera) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) { }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (extBox.getVisibility() == View.VISIBLE) {
            if (ext.canGoBack()) ext.goBack();
            else closeExt();
            return;
        }
        if (main.canGoBack()) { main.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
