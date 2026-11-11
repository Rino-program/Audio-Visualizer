package io.github.rinoprogram.audiovisualizer;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalFolderImport", requestCodes = { 9101 })
public class LocalFolderImportPlugin extends Plugin {
    private static final Set<String> ALLOWED_EXT = new HashSet<>(Arrays.asList(
            "mp3", "wav", "m4a", "aac", "mp4", "webm", "mkv", "mov", "ogg", "flac", "opus"
    ));

    private static final Set<String> VIDEO_EXT = new HashSet<>(Arrays.asList(
            "mp4", "webm", "mkv", "mov"
    ));

    private static final int DEFAULT_MAX_FILES = 2000;

    private static final int REQUEST_CODE_PICK_DIRECTORY = 9101;
    private static final String PENDING_IMPORT_FILE = "pending-folder-import.json";
    private PluginCall pendingPickCall;
    private final ExecutorService importExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickAudioFolder(PluginCall call) {
        pendingPickCall = call;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, REQUEST_CODE_PICK_DIRECTORY);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CODE_PICK_DIRECTORY) return;

        PluginCall call = pendingPickCall;
        pendingPickCall = null;
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("files", new JSArray());
            call.resolve(ret);
            return;
        }

        if (data == null || data.getData() == null) {
            call.reject("No directory selected");
            return;
        }

        Uri treeUri = data.getData();
        try {
            final int takeFlags = data.getFlags()
                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
        } catch (Exception ignored) {
            // ignore
        }

        int maxFiles = DEFAULT_MAX_FILES;
        try {
            if (call.getInt("maxFiles") != null) {
                maxFiles = Math.max(1, call.getInt("maxFiles"));
            }
        } catch (Exception ignored) {
            // ignore
        }

        final int selectedMaxFiles = maxFiles;
        importExecutor.execute(() -> importTree(call, treeUri, selectedMaxFiles));
    }

    @Override
    protected void handleOnDestroy() {
        importExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private void importTree(PluginCall call, Uri treeUri, int maxFiles) {
        JSArray out = new JSArray();
        int scanned = 0;

        ContentResolver resolver = getContext().getContentResolver();
        String rootDocId;
        try {
            rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
        } catch (Exception e) {
            call.reject("Failed to read directory", e);
            return;
        }

        ArrayDeque<String> dirQueue = new ArrayDeque<>();
        dirQueue.add(rootDocId);

        File importDir = new File(getContext().getFilesDir(), "imported");
        //noinspection ResultOfMethodCallIgnored
        importDir.mkdirs();

        while (!dirQueue.isEmpty() && out.length() < maxFiles) {
            String dirDocId = dirQueue.removeFirst();
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, dirDocId);

            try (Cursor cursor = resolver.query(
                    childrenUri,
                    new String[]{
                            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                            DocumentsContract.Document.COLUMN_MIME_TYPE,
                            DocumentsContract.Document.COLUMN_SIZE
                    },
                    null,
                    null,
                    null
            )) {
                if (cursor == null) continue;

                while (cursor.moveToNext() && out.length() < maxFiles) {
                    scanned++;
                    String childDocId = cursor.getString(0);
                    String displayName = cursor.getString(1);
                    String mimeType = cursor.getString(2);
                    long size = cursor.getLong(3);

                    if (childDocId == null) continue;
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                        dirQueue.add(childDocId);
                        continue;
                    }

                    String lower = displayName != null ? displayName.toLowerCase(Locale.ROOT) : "";
                    String ext = "";
                    int dot = lower.lastIndexOf('.');
                    if (dot >= 0 && dot + 1 < lower.length()) {
                        ext = lower.substring(dot + 1);
                    }

                    boolean isAudioMime = mimeType != null && mimeType.startsWith("audio/");
                    boolean isVideoMime = mimeType != null && mimeType.startsWith("video/");
                    boolean allowedByExt = !ext.isEmpty() && ALLOWED_EXT.contains(ext);
                    if (!(isAudioMime || isVideoMime || allowedByExt)) {
                        continue;
                    }

                    boolean isVideo = isVideoMime || (!ext.isEmpty() && VIDEO_EXT.contains(ext));

                    Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childDocId);
                    if (docUri == null) continue;

                    String safeName = sanitizeFilename(displayName != null ? displayName : (UUID.randomUUID() + (ext.isEmpty() ? "" : ("." + ext))));
                    File outFile = new File(importDir, UUID.randomUUID() + "_" + safeName);

                    try (InputStream in = resolver.openInputStream(docUri);
                         FileOutputStream fos = new FileOutputStream(outFile)) {
                        if (in == null) continue;
                        byte[] buf = new byte[1024 * 64];
                        int read;
                        while ((read = in.read(buf)) != -1) {
                            fos.write(buf, 0, read);
                        }
                    } catch (Exception ignored) {
                        // ignore failed file
                        //noinspection ResultOfMethodCallIgnored
                        outFile.delete();
                        continue;
                    }

                    JSObject fileObj = new JSObject();
                    fileObj.put("name", displayName != null ? displayName : safeName);
                    fileObj.put("path", outFile.getAbsolutePath());
                    fileObj.put("isVideo", isVideo);
                    fileObj.put("size", size > 0 ? size : outFile.length());
                    out.put(fileObj);
                }
            } catch (Exception ignored) {
                // ignore directory read errors
            }
        }

        JSObject ret = new JSObject();
        ret.put("files", out);
        ret.put("scanned", scanned);
        ret.put("importId", UUID.randomUUID().toString());
        if (!savePendingImport(ret)) {
            deleteImportedResultFiles(out);
            call.reject("Failed to save folder import result");
            return;
        }
        call.resolve(ret);
    }

    private void deleteImportedResultFiles(JSArray files) {
        File importDir = new File(getContext().getFilesDir(), "imported");
        try {
            String base = importDir.getCanonicalPath();
            for (int i = 0; i < files.length(); i++) {
                try {
                    String path = files.getJSONObject(i).getString("path");
                    if (path == null) continue;
                    File file = new File(path);
                    String canonical = file.getCanonicalPath();
                    if (canonical.startsWith(base + File.separator)) {
                        file.delete();
                    }
                } catch (Exception ignored) {
                    // Ignore cleanup failures and preserve the original rejection.
                }
            }
        } catch (Exception ignored) {
            // Ignore cleanup failures and preserve the original rejection.
        }
    }

    /**
     * Returns an import result left pending by a previous Activity instance.
     */
    @PluginMethod
    public void getPendingImport(PluginCall call) {
        File pending = new File(getContext().getFilesDir(), PENDING_IMPORT_FILE);
        if (!pending.isFile()) {
            call.resolve(new JSObject());
            return;
        }
        try {
            byte[] data = java.nio.file.Files.readAllBytes(pending.toPath());
            call.resolve(new JSObject(new String(data, StandardCharsets.UTF_8)));
        } catch (Exception e) {
            call.reject("Failed to read pending folder import", e);
        }
    }

    /**
     * Removes the pending import after the JavaScript side has persisted it.
     */
    @PluginMethod
    public void acknowledgePendingImport(PluginCall call) {
        File pending = new File(getContext().getFilesDir(), PENDING_IMPORT_FILE);
        if (pending.exists() && !pending.delete()) {
            call.reject("Failed to remove pending folder import");
            return;
        }
        call.resolve();
    }

    private boolean savePendingImport(JSObject result) {
        File pending = new File(getContext().getFilesDir(), PENDING_IMPORT_FILE);
        File temporary = new File(pending.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temporary)) {
            out.write(result.toString().getBytes(StandardCharsets.UTF_8));
            out.flush();
            if (!temporary.renameTo(pending)) {
                temporary.delete();
                return false;
            }
            return true;
        } catch (Exception e) {
            temporary.delete();
            return false;
        }
    }

    @PluginMethod
    public void deleteImportedFiles(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null) {
            call.reject("paths is required");
            return;
        }

        File importDir = new File(getContext().getFilesDir(), "imported");
        //noinspection ResultOfMethodCallIgnored
        importDir.mkdirs();

        String base;
        try {
            base = importDir.getCanonicalPath();
        } catch (Exception e) {
            call.reject("Failed to resolve import directory", e);
            return;
        }

        int deleted = 0;
        for (int i = 0; i < paths.length(); i++) {
            String p;
            try {
                p = paths.getString(i);
            } catch (Exception ignored) {
                continue;
            }
            if (p == null || p.isEmpty()) continue;

            try {
                File f = new File(p);
                String canon = f.getCanonicalPath();
                if (!canon.equals(base) && !canon.startsWith(base + File.separator)) continue;
                if (f.exists() && f.isFile() && f.delete()) deleted++;
            } catch (Exception ignored) {
                // ignore
            }
        }

        JSObject ret = new JSObject();
        ret.put("deleted", deleted);
        call.resolve(ret);
    }

    private static String sanitizeFilename(String input) {
        if (input == null || input.isEmpty()) return "file";
        // Keep it simple and filesystem-safe
        return input.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
