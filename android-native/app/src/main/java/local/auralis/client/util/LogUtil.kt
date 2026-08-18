package local.auralis.client.util

import android.util.Log

object LogUtil {
    private const val TAG = "AuralisSync"

    fun logDebug(message: String) {
        Log.d(TAG, message)
    }

    fun logInfo(message: String) {
        Log.i(TAG, message)
    }

    fun logWarning(message: String) {
        Log.w(TAG, message)
    }

    fun logError(message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(TAG, message, throwable)
        } else {
            Log.e(TAG, message)
        }
    }
}
