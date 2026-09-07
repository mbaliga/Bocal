package com.bocal.music.ui;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;

/**
 * Restricts the instrument app to bundled appassets, recovers from renderer
 * termination, and opens non-local http(s) navigations (model credit links,
 * reference sources) in the system browser instead of swallowing them.
 */
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
        if (isLocal(request)) {
            return false;
        }
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            try {
                view.getContext().startActivity(
                        new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ignored) {
                // No browser available; nothing else to do.
            }
        }
        // blob: navigations (take download, transcript share) are left
        // unhandled here so WebView's own DownloadListener/JS bridge path can
        // see them; everything else that is not local is consumed.
        return !"blob".equals(scheme);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        view.destroy();
        recreateWebView.run();
        return true;
    }
}
