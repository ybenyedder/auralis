package local.auralis.client.util

import android.content.Context
import android.provider.Settings

/**
 * Generate a stable device ID for Auralis Connect.
 * Uses Android ID + "auralis-" prefix to identify this device across the sync network.
 */
object DeviceIdUtil {
    fun getDeviceId(context: Context): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        return "auralis-${androidId ?: "unknown"}"
    }
}
