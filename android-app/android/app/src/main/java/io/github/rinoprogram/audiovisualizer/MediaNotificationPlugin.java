package io.github.rinoprogram.audiovisualizer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {
    private BroadcastReceiver commandReceiver;

    @Override
    public void load() {
        super.load();

        commandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                if (!MediaPlaybackService.BROADCAST_MEDIA_COMMAND.equals(intent.getAction())) return;

                String command = intent.getStringExtra(MediaPlaybackService.EXTRA_COMMAND);
                if (command == null || command.isEmpty()) return;

                JSObject payload = new JSObject();
                payload.put("command", command);
                notifyListeners("command", payload, true);
            }
        };

        IntentFilter filter = new IntentFilter(MediaPlaybackService.BROADCAST_MEDIA_COMMAND);
        Context ctx = getContext();
        if (ctx == null) return;

        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(commandReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            //noinspection deprecation
            ctx.registerReceiver(commandReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        Context ctx = getContext();
        if (ctx != null && commandReceiver != null) {
            try {
                ctx.unregisterReceiver(commandReceiver);
            } catch (Exception ignored) {}
        }
        commandReceiver = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "Audio Visualizer");
        String artist = call.getString("artist", "");
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));

        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        Intent i = new Intent(ctx, MediaPlaybackService.class);
        i.setAction(MediaPlaybackService.ACTION_UPDATE);
        i.putExtra(MediaPlaybackService.EXTRA_TITLE, title);
        i.putExtra(MediaPlaybackService.EXTRA_ARTIST, artist);
        i.putExtra(MediaPlaybackService.EXTRA_IS_PLAYING, isPlaying);

        try {
            ContextCompat.startForegroundService(ctx, i);
        } catch (Exception e) {
            call.reject("Failed to start service", e);
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        try {
            ctx.stopService(new Intent(ctx, MediaPlaybackService.class));
        } catch (Exception ignored) {
            // ignore
        }

        call.resolve();
    }
}
