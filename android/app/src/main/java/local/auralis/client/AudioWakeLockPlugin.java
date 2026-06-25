package local.auralis.client;

import android.content.Context;
import android.os.PowerManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// A minimal bridge so the web layer can hold a PARTIAL_WAKE_LOCK while audio is
// actually playing. The @jofr media-session plugin runs a foreground service (which
// keeps the PROCESS alive), but on devices that deep-sleep the CPU with the screen
// off (notably MIUI/HyperOS) the WebView's audio decode can still stall mid-track —
// which both cut playback and stopped the "ended" event that advances the queue.
// Holding a partial wake lock keeps the CPU running so playback continues and the
// queue keeps moving with the screen off. The lock is acquired on play and released
// on pause/stop (and on destroy as a backstop) so it never drains battery when idle.
@CapacitorPlugin(name = "AudioWakeLock")
public class AudioWakeLockPlugin extends Plugin {
    private PowerManager.WakeLock wakeLock;

    private PowerManager.WakeLock lock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Auralis::Playback");
            // Not reference-counted: a single acquire is balanced by a single release,
            // so a missed/duplicated call can't leave a phantom lock held forever.
            wakeLock.setReferenceCounted(false);
        }
        return wakeLock;
    }

    @PluginMethod
    public void acquire(PluginCall call) {
        try {
            PowerManager.WakeLock wl = lock();
            if (!wl.isHeld()) {
                wl.acquire();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("wake lock acquire failed", e);
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("wake lock release failed", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }
}
