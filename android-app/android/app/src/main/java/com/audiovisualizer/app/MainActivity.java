package com.audiovisualizer.app;

import android.os.Bundle;

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
