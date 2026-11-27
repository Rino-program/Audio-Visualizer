package io.github.rinoprogram.audiovisualizer;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MediaNotification",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MediaNotificationPlugin extends Plugin {

    public static final String CHANNEL_ID = "audio_visualizer_playback";
    public static final int NOTIFICATION_ID = 4101;

    private static final String ACTION_UPDATE = "io.github.rinoprogram.audiovisualizer.action.UPDATE";
    public static final String ACTION_PLAY = "io.github.rinoprogram.audiovisualizer.action.PLAY";
    public static final String ACTION_PAUSE = "io.github.rinoprogram.audiovisualizer.action.PAUSE";
    public static final String ACTION_STOP = "io.github.rinoprogram.audiovisualizer.action.STOP";
    public static final String ACTION_NEXT = "io.github.rinoprogram.audiovisualizer.action.NEXT";
    public static final String ACTION_PREV = "io.github.rinoprogram.audiovisualizer.action.PREV";

    private static MediaNotificationPlugin instance;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private NotificationManager notificationManager;
    private AudioManager audioManager;
    private MediaSessionCompat mediaSession;
    private AudioFocusRequest audioFocusRequest;
    private boolean audioFocusRequested = false;

    private boolean serviceStarted = false;
    private boolean isPlaying = false;
    private boolean hasTrack = false;
    private String title = "Audio Visualizer";
    private String artist = "";
    private String album = "Audio Visualizer";
    private long durationMs = 0L;
    private long positionMs = 0L;
    private String lastArtworkData = "";
    private Bitmap artwork = null;

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            handleCommand("pause", -1L);
        }
    };

    public static MediaNotificationPlugin getInstance() {
        return instance;
    }

    @Override
    public void load() {
        instance = this;
        notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannel();
        createMediaSession();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        abandonAudioFocus();
        stopPlaybackService();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.handleOnDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || notificationManager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getContext().getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(
            getContext().getString(R.string.notification_channel_description)
        );
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(channel);
    }

    private void createMediaSession() {
        if (mediaSession != null) return;

        mediaSession = new MediaSessionCompat(getContext(), "AudioVisualizer");
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                handleCommand("play", -1L);
            }

            @Override
            public void onPause() {
                handleCommand("pause", -1L);
            }

            @Override
            public void onSkipToNext() {
                handleCommand("next", -1L);
            }

            @Override
            public void onSkipToPrevious() {
                handleCommand("prev", -1L);
            }

            @Override
            public void onStop() {
                handleCommand("stop", -1L);
            }

            @Override
            public void onSeekTo(long pos) {
                handleCommand("seek", pos);
            }
        });
        mediaSession.setSessionActivity(buildContentIntent());
        mediaSession.setMediaButtonReceiver(
            MediaButtonReceiver.buildMediaButtonPendingIntent(
                getContext(),
                PlaybackStateCompat.ACTION_PLAY_PAUSE
            )
        );
        mediaSession.setActive(true);
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = safe(call.getString("title", "Audio Visualizer"));
        artist = safe(call.getString("artist", ""));
        album = safe(call.getString("album", "Audio Visualizer"));
        isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        hasTrack = !Boolean.FALSE.equals(call.getBoolean("hasTrack", true));
        durationMs = Math.max(0L, call.getLong("durationMs", 0L));
        positionMs = Math.max(0L, call.getLong("positionMs", 0L));
        updateArtwork(safe(call.getString("artwork", "")));

        if (!hasTrack) {
            isPlaying = false;
            abandonAudioFocus();
            updateMediaSession();
            stopPlaybackService();
            call.resolve();
            return;
        }

        updateMediaSession();

        if (isPlaying) {
            requestAudioFocus();
            if (!serviceStarted) {
                ensureServiceStarted();
            } else {
                updateNotification();
            }
        } else {
            abandonAudioFocus();
            if (serviceStarted) updateNotification();
        }

        call.resolve();
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        PermissionState state = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            ? PermissionState.GRANTED
            : getPermissionState("notifications");
        JSObject result = new JSObject();
        result.put("granted", state == PermissionState.GRANTED);
        call.resolve(result);
    }

    public void onServiceStarted() {
        serviceStarted = true;
    }

    public void onServiceStopped() {
        serviceStarted = false;
    }

    public boolean isPlaying() {
        return isPlaying;
    }

    public void handleServiceCommand(String command) {
        handleCommand(command, -1L);
    }

    private void ensureServiceStarted() {
        if (serviceStarted) return;
        serviceStarted = true;
        try {
            Intent intent = new Intent(getContext(), PlaybackService.class);
            intent.setAction(ACTION_UPDATE);
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (Exception e) {
            serviceStarted = false;
        }
    }

    private void stopPlaybackService() {
        serviceStarted = false;
        try {
            getContext().stopService(new Intent(getContext(), PlaybackService.class));
        } catch (Exception ignored) {
            // ignore
        }
        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
    }

    private void updateNotification() {
        if (notificationManager == null) return;
        if (!serviceStarted) {
            if (isPlaying) ensureServiceStarted();
            return;
        }
        notificationManager.notify(NOTIFICATION_ID, buildNotification());
    }

    public Notification buildNotification() {
        PendingIntent contentIntent = buildContentIntent();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_audio_visualizer)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentIntent)
            .setDeleteIntent(buildActionIntent(ACTION_STOP, 100))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(isPlaying);

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        int playPauseIcon = isPlaying
            ? android.R.drawable.ic_media_pause
            : android.R.drawable.ic_media_play;
        String playPauseTitle = getContext().getString(
            isPlaying ? R.string.notification_pause : R.string.notification_play
        );

        builder.addAction(
            android.R.drawable.ic_media_previous,
            getContext().getString(R.string.notification_previous),
            buildActionIntent(ACTION_PREV, 101)
        );
        builder.addAction(
            playPauseIcon,
            playPauseTitle,
            buildActionIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 102)
        );
        builder.addAction(
            android.R.drawable.ic_media_next,
            getContext().getString(R.string.notification_next),
            buildActionIntent(ACTION_NEXT, 103)
        );
        builder.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            getContext().getString(R.string.notification_stop),
            buildActionIntent(ACTION_STOP, 104)
        );

        if (mediaSession != null) {
            builder.setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            );
        }

        return builder.build();
    }

    private PendingIntent buildContentIntent() {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            getContext(),
            0,
            intent,
            pendingIntentFlags()
        );
    }

    private PendingIntent buildActionIntent(String action, int requestCode) {
        Intent intent = new Intent(getContext(), PlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            getContext(),
            requestCode,
            intent,
            pendingIntentFlags()
        );
    }

    private int pendingIntentFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private void updateMediaSession() {
        if (mediaSession == null) return;

        if (!hasTrack) {
            mediaSession.setMetadata(null);
            mediaSession.setPlaybackState(
                new PlaybackStateCompat.Builder()
                    .setActions(PlaybackStateCompat.ACTION_STOP)
                    .setState(PlaybackStateCompat.STATE_STOPPED, 0L, 0f, SystemClock.elapsedRealtime())
                    .build()
            );
            mediaSession.setActive(false);
            return;
        }

        MediaMetadataCompat.Builder metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) {
            metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
            metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork);
        }

        mediaSession.setMetadata(metadata.build());
        mediaSession.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY |
                    PlaybackStateCompat.ACTION_PAUSE |
                    PlaybackStateCompat.ACTION_PLAY_PAUSE |
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackStateCompat.ACTION_SEEK_TO |
                    PlaybackStateCompat.ACTION_STOP
                )
                .setState(
                    isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    positionMs,
                    isPlaying ? 1.0f : 0.0f,
                    SystemClock.elapsedRealtime()
                )
                .build()
        );
        mediaSession.setActive(true);
    }

    private void updateArtwork(String artworkData) {
        if (artworkData.equals(lastArtworkData)) return;
        lastArtworkData = artworkData;

        if (artworkData.isEmpty()) {
            artwork = null;
            return;
        }

        try {
            int comma = artworkData.indexOf(',');
            String base64 = comma >= 0 ? artworkData.substring(comma + 1) : artworkData;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);

            int sample = 1;
            int maxSide = Math.max(bounds.outWidth, bounds.outHeight);
            while (maxSide / sample > 512) {
                sample *= 2;
            }

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            artwork = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (Exception e) {
            artwork = null;
        }
    }

    private void handleCommand(String command, long seekMs) {
        mainHandler.post(() -> {
            if ("play".equals(command)) {
                isPlaying = true;
                requestAudioFocus();
                updateMediaSession();
                updateNotification();
            } else if ("pause".equals(command)) {
                isPlaying = false;
                abandonAudioFocus();
                updateMediaSession();
                updateNotification();
            } else if ("stop".equals(command)) {
                isPlaying = false;
                abandonAudioFocus();
                updateMediaSession();
                stopPlaybackService();
            } else if ("seek".equals(command) && seekMs >= 0) {
                positionMs = seekMs;
                updateMediaSession();
                updateNotification();
            }

            JSObject event = new JSObject();
            event.put("command", command);
            if ("seek".equals(command) && seekMs >= 0) {
                event.put("positionMs", seekMs);
            }
            notifyListeners("command", event);
        });
    }

    private void requestAudioFocus() {
        if (audioManager == null || audioFocusRequested) return;

        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
                    .build();
            }
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }
        audioFocusRequested = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null || !audioFocusRequested) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusChangeListener);
        }
        audioFocusRequested = false;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
