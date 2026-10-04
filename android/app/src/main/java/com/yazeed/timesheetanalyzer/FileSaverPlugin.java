package com.yazeed.timesheetanalyzer;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;
import androidx.annotation.RequiresApi;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves files the web app "downloads" (PDF, Excel, CSV, PNG). Android 10+ writes
 * to the public Downloads folder; older versions write to the app cache and open
 * the share sheet. Either way the user gets a toast and the file opens.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String fileName = sanitize(call.getString("fileName", "download"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (data == null) {
            call.reject("Missing file data");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                uri = saveToDownloads(bytes, fileName, mimeType);
                toast("تم الحفظ في التنزيلات: " + fileName);
                openFile(uri, mimeType);
            } else {
                uri = saveToCache(bytes, fileName);
                shareFile(uri, mimeType);
            }
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save file", e);
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private Uri saveToDownloads(byte[] bytes, String fileName, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("MediaStore insert failed");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IllegalStateException("Cannot open output stream");
            out.write(bytes);
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return uri;
    }

    private Uri saveToCache(byte[] bytes, String fileName) throws Exception {
        File dir = new File(getContext().getCacheDir(), "exports");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create cache dir");
        File file = new File(dir, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    private void openFile(Uri uri, String mimeType) {
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mimeType);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(view);
        } catch (ActivityNotFoundException ignored) {
            // No viewer installed; the file is still in Downloads.
        }
    }

    private void shareFile(Uri uri, String mimeType) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
    }

    private void toast(String message) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
    }

    private static String sanitize(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return cleaned.isEmpty() ? "download" : cleaned;
    }
}
