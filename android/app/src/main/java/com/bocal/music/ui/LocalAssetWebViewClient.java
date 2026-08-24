package com.bocal.music.ui;

import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;

/** Restricts the instrument Lab to bundled appassets and recovers from renderer termination. */
final class LocalAssetWebViewClient extends WebViewClient {
    private static final String APPASSETS_HOST = "appassets.androidplatform.net";

    private final WebViewAssetLoader loader;
    private final Runnable recreateWebView;

    LocalAssetWebViewClient(WebViewAssetLoader loader, Runnable recreateWebView) {
        this.loader = loader;
        this.recreateWebView = recreateWebView;
    }

    private boolean isLocal(WebResourceRequest request) {
        return "https".equals(request.getUrl().getScheme())
                && APPASSETS_HOST.equals(request.getUrl().getHost());
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!isLocal(request)) {
            return new WebResourceResponse(
                    "text/plain",
                    "UTF-8",
                    new ByteArrayInputStream(new byte[0])
            );
        }
        return loader.shouldInterceptRequest(request.getUrl());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !isLocal(request);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        view.destroy();
        recreateWebView.run();
        return true;
    }
}
