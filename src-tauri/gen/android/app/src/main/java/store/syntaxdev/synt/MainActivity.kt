package store.syntaxdev.synt

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // The island already lives in this window: while Synt is in front the
  // floating copy stays out of the way and comes back on the way out.
  override fun onResume() {
    super.onResume()
    SyntOverlayService.setAppVisible(true)
  }

  override fun onPause() {
    SyntOverlayService.setAppVisible(false)
    super.onPause()
  }
}
