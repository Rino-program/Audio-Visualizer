package io.github.rinoprogram.audiovisualizer;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MediaLibraryPlugin extends Plugin {

    private static final int DEFAULT_MAX_ITEMS = 5000;

    @PluginMethod
    public void scan(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "scanAfterPermission");
            return;
        }
        scanInternal(call);
    }

    @PermissionCallback
    private void scanAfterPermission(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            scanInternal(call);
        } else {
            call.reject("permission_denied");
        }
    }

    private void scanInternal(PluginCall call) {
        final int maxItems = Math.max(
            1,
            call.getInt("maxItems", DEFAULT_MAX_ITEMS)
        );

        getBridge().execute(() -> {
            JSArray tracks = new JSArray();
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

            String[] projection = new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.MIME_TYPE
            };

            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
            String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";

            int scanned = 0;
            try (Cursor cursor = resolver.query(collection, projection, selection, null, sortOrder)) {
                if (cursor != null) {
                    int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                    int titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int albumIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                    int durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                    int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE);

                    while (cursor.moveToNext() && tracks.length() < maxItems) {
                        scanned++;
                        long id = cursor.getLong(idColumn);
                        String displayName = cursor.getString(nameColumn);
                        String title = cursor.getString(titleColumn);
                        String artist = normalizeArtist(cursor.getString(artistColumn));
                        String album = safe(cursor.getString(albumColumn));
                        long albumId = cursor.getLong(albumIdColumn);
                        long durationMs = cursor.getLong(durationColumn);
                        long size = cursor.getLong(sizeColumn);
                        String mimeType = safe(cursor.getString(mimeColumn));
                        String name = !safe(displayName).isEmpty()
                            ? displayName
                            : (!safe(title).isEmpty() ? title : "Unknown");

                        Uri uri = ContentUris.withAppendedId(collection, id);

                        JSObject item = new JSObject();
                        item.put("id", id);
                        item.put("uri", uri.toString());
                        item.put("name", name);
                        item.put("title", safe(title));
                        item.put("artist", artist);
                        item.put("album", album);
                        item.put("albumId", albumId);
                        item.put("durationMs", durationMs);
                        item.put("size", size);
                        item.put("mimeType", mimeType);
                        item.put("isVideo", false);
                        tracks.put(item);
                    }
                }
            } catch (Exception e) {
                call.reject("Failed to scan media library", e);
                return;
            }

            JSObject result = new JSObject();
            result.put("tracks", tracks);
            result.put("scanned", scanned);
            call.resolve(result);
        });
    }

    private static String normalizeArtist(String artist) {
        if (artist == null) return "";
        String value = artist.trim();
        if (value.isEmpty() || "<unknown>".equalsIgnoreCase(value)) return "";
        return value;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
