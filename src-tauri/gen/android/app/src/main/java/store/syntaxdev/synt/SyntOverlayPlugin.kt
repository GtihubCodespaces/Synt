package store.syntaxdev.synt

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
internal class MoodArgs {
  lateinit var mood: String
  var label: String = "Synt"
}

/**
 * The five commands the webview can call. Rust (`src/overlay.rs`) registers
 * this class by name; the JS side talks to the Rust commands, never to this
 * class directly.
 */
@TauriPlugin
class SyntOverlayPlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun state(invoke: Invoke) {
    invoke.resolve(SyntOverlayService.snapshot(activity))
  }

  @Command
  fun enable(invoke: Invoke) {
    if (!Settings.canDrawOverlays(activity)) {
      invoke.resolve(SyntOverlayService.snapshot(activity))
      return
    }
    askForNotifications()
    SyntOverlayService.start(activity)
    invoke.resolve(SyntOverlayService.snapshot(activity))
  }

  @Command
  fun disable(invoke: Invoke) {
    SyntOverlayService.stop()
    invoke.resolve(SyntOverlayService.snapshot(activity))
  }

  @Command
  fun permission(invoke: Invoke) {
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${activity.packageName}"),
    )
    try {
      activity.startActivity(intent)
    } catch (_: Throwable) {
      // some ROMs hide the screen; the settings toggle stays honest anyway
    }
    invoke.resolve()
  }

  @Command
  fun mood(invoke: Invoke) {
    val args = invoke.parseArgs(MoodArgs::class.java)
    SyntOverlayService.setMood(args.mood, args.label)
    invoke.resolve()
  }

  private fun askForNotifications() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
    try {
      activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4210)
    } catch (_: Throwable) {
      // the service still runs; only the notification is quieter
    }
  }
}
