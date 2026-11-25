package com.citylifestyle.qrscanner;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Let the scanner play its beep / spoken voice ("Already entered",
        // "Not recognised" ...) right after a scan. By default Android WebView
        // blocks audio that did not start from a tap, so it stayed silent.
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
