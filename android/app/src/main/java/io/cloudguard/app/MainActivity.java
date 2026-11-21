package io.cloudguard.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSIONS_REQUEST_CODE = 2001;
    private PermissionRequest pendingPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestNativeMediaPermissions();
    }

    private void requestNativeMediaPermissions() {
        String[] permissions = new String[] {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        };

        boolean needsPermission = false;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needsPermission = true;
                break;
            }
        }

        if (needsPermission) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSIONS_REQUEST_CODE);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> {
                try {
                    WebView webView = bridge.getWebView();
                    webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

                    // Set custom WebChromeClient to reliably handle camera & microphone permission pop-ups
                    webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
                        @Override
                        public void onPermissionRequest(final PermissionRequest request) {
                            runOnUiThread(() -> {
                                boolean hasCamera = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                                boolean hasAudio = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

                                List<String> needed = new ArrayList<>();
                                List<String> resources = Arrays.asList(request.getResources());

                                if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && !hasCamera) {
                                    needed.add(Manifest.permission.CAMERA);
                                }
                                if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && !hasAudio) {
                                    needed.add(Manifest.permission.RECORD_AUDIO);
                                }

                                if (!needed.isEmpty()) {
                                    pendingPermissionRequest = request;
                                    ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), PERMISSIONS_REQUEST_CODE);
                                } else {
                                    request.grant(request.getResources());
                                }
                            });
                        }
                    });
                } catch (Exception ignored) {}
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSIONS_REQUEST_CODE && pendingPermissionRequest != null) {
            runOnUiThread(() -> {
                try {
                    List<String> grantedResources = new ArrayList<>();
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        grantedResources.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                    }
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        grantedResources.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                    }

                    if (!grantedResources.isEmpty()) {
                        pendingPermissionRequest.grant(grantedResources.toArray(new String[0]));
                    } else {
                        pendingPermissionRequest.deny();
                    }
                } catch (Exception e) {
                    try {
                        pendingPermissionRequest.deny();
                    } catch (Exception ignored) {}
                } finally {
                    pendingPermissionRequest = null;
                }
            });
        }
    }
}
