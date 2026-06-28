package io.github.rinoprogram.audiovisualizer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

public class MediaPlaybackService extends Service {

    public static final String ACTION_UPDATE = "io.github.rinoprogram.audiovisualizer.action.UPDATE";
    public static final String ACTION_STOP_SERVICE = "io.github.rinoprogram.audiovisualizer.action.STOP_SERVICE";

    public static final String ACTION_PLAY = "io.github.rinoprogram.audiovisualizer.action.PLAY";
    public static final String ACTION_PAUSE = "io.github.rinoprogram.audiovisualizer.action.PAUSE";
    public static final String ACTION_NEXT = "io.github.rinoprogram.audiovisualizer.action.NEXT";
    public static final String ACTION_PREV = "io.github.rinoprogram.audiovisualizer.action.PREV";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "isPlaying";

    public static final String BROADCAST_MEDIA_COMMAND = "io.github.rinoprogram.audiovisualizer.MEDIA_COMMAND";
    public static final String EXTRA_COMMAND = "command";

    private static final String CHANNEL_ID = "media_playback";
    private static final int NOTIFICATION_ID = 1001;

    private MediaSessionCompat mediaSession;

    private String title = "Audio Visualizer";
    private String artist = "";
    private boolean isPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();

        mediaSession = new MediaSessionCompat(this, "AudioVisualizerSession");
        mediaSession.setActive(true);

        ensureNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return startAsForeground();
        }

        String action = intent.getAction();

        if (ACTION_UPDATE.equals(action)) {
            String newTitle = intent.getStringExtra(EXTRA_TITLE);
            String newArtist = intent.getStringExtra(EXTRA_ARTIST);
            boolean newIsPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, isPlaying);

            if (newTitle != null) title = newTitle;
            if (newArtist != null) artist = newArtist;
            isPlaying = newIsPlaying;

            updateMediaSession();
            return startAsForeground();
        }

        if (ACTION_STOP_SERVICE.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PLAY.equals(action)) {
            broadcastCommand("play");
        } else if (ACTION_PAUSE.equals(action)) {
            broadcastCommand("pause");
        } else if (ACTION_NEXT.equals(action)) {
            broadcastCommand("next");
        } else if (ACTION_PREV.equals(action)) {
            broadcastCommand("prev");
        }

        // デフォルトで通知を維持
        return startAsForeground();
    }

    /** Android 14対応: startForeground を確実に呼ぶヘルパー */
    private int startAsForeground() {
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }

    private void broadcastCommand(String command) {
        Intent i = new Intent(BROADCAST_MEDIA_COMMAND);
        i.setPackage(getPackageName());
        i.putExtra(EXTRA_COMMAND, command);
        sendBroadcast(i);
    }

    private void updateMediaSession() {
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .build();
        mediaSession.setMetadata(metadata);

        long actions = PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_STOP;

        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build();
        mediaSession.setPlaybackState(playbackState);
    }

    private Notification buildNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent();
        }

        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        PendingIntent prevIntent = PendingIntent.getService(
                this,
                1,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV),
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        PendingIntent playPauseIntent = PendingIntent.getService(
                this,
                2,
                new Intent(this, MediaPlaybackService.class).setAction(isPlaying ? ACTION_PAUSE : ACTION_PLAY),
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        PendingIntent nextIntent = PendingIntent.getService(
                this,
                3,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT),
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        PendingIntent stopIntent = PendingIntent.getService(
                this,
                4,
                new Intent(this, MediaPlaybackService.class).setAction(ACTION_STOP_SERVICE),
                pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = isPlaying ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(contentIntent)
                .setOnlyAlertOnce(true)
                .setOngoing(isPlaying)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_previous, "Prev", prevIntent)
                .addAction(playPauseIcon, playPauseTitle, playPauseIntent)
                .addAction(android.R.drawable.ic_media_next, "Next", nextIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
                .setStyle(new MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2)
                )
                .setPriority(NotificationCompat.PRIORITY_LOW);

        builder.setDeleteIntent(MediaButtonReceiver.buildMediaButtonPendingIntent(
                this,
                PlaybackStateCompat.ACTION_STOP
        ));

        return builder.build();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Media playback",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Audio Visualizer playback controls");
        nm.createNotificationChannel(channel);
    }

    private static int pendingIntentFlags(int base) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return base | PendingIntent.FLAG_IMMUTABLE;
        }
        return base;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        try {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
            }
        } catch (Exception ignored) {}
        stopForeground(true);
        super.onDestroy();
    }
}