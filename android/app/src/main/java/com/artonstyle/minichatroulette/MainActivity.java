package com.artonstyle.minichatroulette;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private WebView appWebView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge == null) {
            return;
        }

        appWebView = bridge.getWebView();
        if (appWebView == null) {
            return;
        }

        appWebView.setBackgroundColor(Color.BLACK);

        WebSettings settings = appWebView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    }

    @Override
    public void onBackPressed() {
        if (appWebView != null && appWebView.canGoBack()) {
            appWebView.goBack();
            return;
        }

        super.onBackPressed();
    }
}
