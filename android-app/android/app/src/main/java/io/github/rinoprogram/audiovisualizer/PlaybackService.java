package io.github.rinoprogram.audiovisualizer;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;

/**
 * Keeps playback alive while the app is in the background and owns the
 * foreground notification for the media session.
 */
public class PlaybackService extends Service {

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        MediaNotificationPlugin plugin = MediaNotificationPlugin.getInstance();
        if (plugin == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent != null ? intent.getAction() : null;
        if (action == null || "io.github.rinoprogram.audiovisualizer.action.UPDATE".equals(action)) {
            plugin.onServiceStarted();
            Notification notification = plugin.buildNotification();
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceCompat.startForeground(
                        this,
                        MediaNotificationPlugin.NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    );
                } else {
                    startForeground(MediaNotificationPlugin.NOTIFICATION_ID, notification);
                }
            } catch (Exception e) {
                stopSelf();
            }
        } else if (MediaNotificationPlugin.ACTION_PLAY.equals(action)) {
            plugin.handleServiceCommand("play");
        } else if (MediaNotificationPlugin.ACTION_PAUSE.equals(action)) {
            plugin.handleServiceCommand("pause");
        } else if (MediaNotificationPlugin.ACTION_NEXT.equals(action)) {
            plugin.handleServiceCommand("next");
        } else if (MediaNotificationPlugin.ACTION_PREV.equals(action)) {
            plugin.handleServiceCommand("prev");
        } else if (MediaNotificationPlugin.ACTION_STOP.equals(action)) {
            plugin.handleServiceCommand("stop");
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        MediaNotificationPlugin plugin = MediaNotificationPlugin.getInstance();
        if (plugin != null) {
            plugin.onServiceStopped();
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        MediaNotificationPlugin plugin = MediaNotificationPlugin.getInstance();
        if (plugin != null) {
            plugin.handleServiceCommand("stop");
        }
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
