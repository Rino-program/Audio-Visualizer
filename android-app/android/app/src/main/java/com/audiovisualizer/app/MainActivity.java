package com.audiovisualizer.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		applyImmersiveFullscreen();
		registerPlugin(LocalFolderImportPlugin.class);
		
		// WebView設定: バックグラウンド音声再生を有効化
		WebView webView = getBridge().getWebView();
		if (webView != null) {
			webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
		}
	}

	@Override
	public void onResume() {
		super.onResume();
		applyImmersiveFullscreen();
	}

	@Override
	public void onWindowFocusChanged(boolean hasFocus) {
		super.onWindowFocusChanged(hasFocus);
		if (hasFocus) {
			applyImmersiveFullscreen();
		}
	}

	@Override
	public void onPause() {
		// バックグラウンド再生のため、WebViewのタイマーを停止しない
		// デフォルトのsuper.onPause()はWebViewを一時停止するため、
		// 音楽再生を維持するためにオーバーライド
		try {
			// Capacitorの基本処理は呼び出すが、WebViewの一時停止をスキップ
			// WebViewのJavaScriptタイマーを維持
			WebView webView = getBridge().getWebView();
			if (webView != null) {
				// resumeTimersでバックグラウンドでもJSタイマーを維持
				webView.resumeTimers();
			}
		} catch (Exception ignored) {}
		super.onPause();
	}

	private void applyImmersiveFullscreen() {
		try {
			WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
			WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
			if (controller != null) {
				controller.hide(WindowInsetsCompat.Type.systemBars());
				controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
			}
		} catch (Exception ignored) {
			// ignore
		}
	}
}
