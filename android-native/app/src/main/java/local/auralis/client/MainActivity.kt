package local.auralis.client

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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

        // The in-app nav stack consumes Back; at a root the system default applies
        // (leave the app). The callback is enabled only while the stack is
        // non-empty so the system (predictive back, enableOnBackInvokedCallback)
        // knows when Back will actually close the app — the deprecated
        // onBackPressed() override broke that contract.
        val backCallback = object : OnBackPressedCallback(/* enabled = */ false) {
            override fun handleOnBackPressed() {
                vm.back()
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)

        setContent {
            val ui by vm.ui.collectAsState()
            SideEffect { backCallback.isEnabled = ui.backStack.isNotEmpty() }
            AppRoot(vm)
        }
    }
}
