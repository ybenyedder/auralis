package local.auralis.client

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import local.auralis.client.ui.AppRoot
import local.auralis.client.ui.AppViewModel

class MainActivity : ComponentActivity() {

    private val vm: AppViewModel by viewModels()

    // Android 13+ requires the POST_NOTIFICATIONS grant before the media notification
    // (lock-screen transport controls) can show.
    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* result ignored */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent { AppRoot(vm) }
    }

    override fun onBackPressed() {
        // Let the in-app nav stack consume Back; fall through to default when at a root.
        val state = vm.ui.value
        if (state.backStack.isNotEmpty()) {
            vm.back()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
}
