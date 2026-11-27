package io.github.rinoprogram.audiovisualizer;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "MediaMetadata")
public class MediaMetadataPlugin extends Plugin {

    private static final int MAX_ARTWORK_SIZE = 512;

    @PluginMethod
    public void getMetadata(PluginCall call) {
        String path = safe(call.getString("path", ""));
        String uri = safe(call.getString("uri", ""));
        if (path.isEmpty() && uri.isEmpty()) {
            call.reject("path or uri is required");
            return;
        }

        getBridge().execute(() -> {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                if (!uri.isEmpty()) {
                    retriever.setDataSource(getContext(), Uri.parse(uri));
                } else {
                    retriever.setDataSource(path);
                }

                JSObject result = new JSObject();
                result.put("title", safe(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)));
                String artist = safe(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST));
                if ("<unknown>".equalsIgnoreCase(artist)) artist = "";
                result.put("artist", artist);
                result.put("album", safe(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)));
                result.put("durationMs", parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)));

                Bitmap artwork = decodeArtwork(retriever.getEmbeddedPicture());
                if (artwork == null && !uri.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        artwork = getContext().getContentResolver().loadThumbnail(
                            Uri.parse(uri),
                            new Size(MAX_ARTWORK_SIZE, MAX_ARTWORK_SIZE),
                            null
                        );
                    } catch (Exception ignored) {
                        // No thumbnail available for this media item.
                    }
                }

                if (artwork != null) {
                    result.put("artwork", bitmapToDataUrl(artwork));
                    result.put("artworkMime", "image/jpeg");
                }

                call.resolve(result);
            } catch (Exception e) {
                call.reject("Failed to read media metadata", e);
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        });
    }

    private Bitmap decodeArtwork(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return null;

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;

        int sample = 1;
        int maxSide = Math.max(bounds.outWidth, bounds.outHeight);
        while (maxSide / sample > MAX_ARTWORK_SIZE) {
            sample *= 2;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    private String bitmapToDataUrl(Bitmap bitmap) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out);
        String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        return "data:image/jpeg;base64," + base64;
    }

    private static long parseLong(String value) {
        if (value == null || value.isEmpty()) return 0L;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
