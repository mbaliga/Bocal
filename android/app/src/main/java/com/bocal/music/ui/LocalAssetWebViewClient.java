package com.bocal.music.ui;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;

/** No remote resource or unknown appassets URL may fall through to the network. */
final class LocalAssetWebViewClient extends WebViewClient {
    private final WebViewAssetLoader loader;
    private final Runnable recreateWebView;
    LocalAssetWebViewClient(WebViewAssetLoader loader, Runnable recreateWebView) {
        this.loader = loader;
        this.recreateWebView = recreateWebView;
    }
    private boolean isLocal(WebResourceRequest request) {
        Uri uri = request.getUrl();
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!isLocal(request)) return notFound();
        WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
        return response != null ? response : notFound();
    }
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (isLocal(request)) return false;
        Uri uri = request.getUrl();
        if (request.isForMainFrame() && request.hasGesture() && uri.getHost() != null && uri.getUserInfo() == null
                && ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
            try { view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (ActivityNotFoundException ignored) { }
        }
        return true; // Never replace the trusted page with a blob/data/remote document.
    }
    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        // Compose owns destruction in AndroidView.onRelease. Detach the dead view now.
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        recreateWebView.run();
        return true;
    }
}
