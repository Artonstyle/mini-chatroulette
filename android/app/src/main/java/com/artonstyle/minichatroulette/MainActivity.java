package com.artonstyle.minichatroulette;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewDatabase;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();
        WebStorage.getInstance().deleteAllData();
        WebViewDatabase.getInstance(this).clearFormData();
        WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword();

        if (bridge == null) {
            return;
        }

        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }

        webView.setBackgroundColor(Color.BLACK);
        webView.clearCache(true);
        webView.clearHistory();

        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    }
}
