package store.syntaxdev.synt

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import app.tauri.plugin.JSObject
import kotlin.math.abs

/**
 * Keeps Synt at the top of the screen after you leave the app.
 *
 * A foreground service draws one overlay window (SYSTEM_ALERT_WINDOW) with the
 * same pet as the island, plus a quiet notification that can reopen or hide
 * him. The window is removed while Synt itself is in front — there is no point
 * in two of him — and comes back the moment the app goes to the background.
 */
class SyntOverlayService : Service() {

  private var windowManager: WindowManager? = null
  private var pet: SyntPetView? = null
  private var params: WindowManager.LayoutParams? = null
  private var attached = false
  private var appVisible = false
  private var mood = "idle"
  private var label = "Synt"

  private var downRawX = 0f
  private var downRawY = 0f
  private var startX = 0
  private var startY = 0
  private var moved = false
  private var downAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      shutdown()
      return START_NOT_STICKY
    }
    if (!Settings.canDrawOverlays(this)) {
      shutdown()
      return START_NOT_STICKY
    }
    startForegroundNow()
    prefs().edit().putBoolean(PREF_ENABLED, true).apply()
    if (!appVisible) attach()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    detach()
    instance = null
    super.onDestroy()
  }

  // ── Window ────────────────────────────────────────────────────────────────

  private fun attach() {
    if (attached || !Settings.canDrawOverlays(this)) return
    val manager = windowManager ?: return
    val view = pet ?: SyntPetView(this).also { created ->
      created.setMood(mood)
      created.setLabel(label)
      bindTouch(created)
      pet = created
    }
    if (view.parent != null) {
      attached = true
      return
    }
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val layout = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      x = 0
      y = topOffset()
    }
    params = layout
    try {
      manager.addView(view, layout)
      attached = true
    } catch (error: Throwable) {
      attached = false
    }
  }

  private fun detach() {
    val view = pet ?: return
    if (!attached) return
    try {
      windowManager?.removeView(view)
    } catch (_: Throwable) {
      // already gone
    }
    attached = false
  }

  private fun bindTouch(view: SyntPetView) {
    view.setOnTouchListener { _, event ->
      val layout = params ?: return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          startX = layout.x
          startY = layout.y
          moved = false
          downAt = System.currentTimeMillis()
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downRawX
          val dy = event.rawY - downRawY
          if (!moved && (abs(dx) > dp(6f) || abs(dy) > dp(6f))) moved = true
          if (moved) {
            layout.x = (startX + dx).toInt()
            layout.y = (startY + dy).toInt()
            try {
              windowManager?.updateViewLayout(view, layout)
            } catch (_: Throwable) {
              // window vanished: the permission was revoked mid-drag
            }
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved && System.currentTimeMillis() - downAt < 260) openApp() else snapBack()
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          snapBack()
          true
        }
        else -> false
      }
    }
  }

  private fun snapBack() {
    val view = pet ?: return
    val layout = params ?: return
    val fromX = layout.x
    val fromY = layout.y
    ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 260
      interpolator = DecelerateInterpolator()
      addUpdateListener { animator ->
        val k = animator.animatedValue as Float
        layout.x = (fromX * (1f - k)).toInt()
        layout.y = (fromY + (topOffset() - fromY) * k).toInt()
        try {
          windowManager?.updateViewLayout(view, layout)
        } catch (_: Throwable) {
          // ignore
        }
      }
      start()
    }
  }

  private fun openApp() {
    val intent = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    try {
      startActivity(intent)
    } catch (_: Throwable) {
      // ignore
    }
  }

  private fun applyAppVisible(visible: Boolean) {
    appVisible = visible
    if (visible) detach() else attach()
  }

  // ── Notification ──────────────────────────────────────────────────────────

  private fun startForegroundNow() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "Synt", NotificationManager.IMPORTANCE_LOW).apply {
        description = getString(R.string.overlay_channel)
        setShowBadge(false)
        setSound(null, null)
      }
      manager.createNotificationChannel(channel)
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      flags,
    )
    val hide = PendingIntent.getService(
      this,
      1,
      Intent(this, SyntOverlayService::class.java).setAction(ACTION_STOP),
      flags,
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val icon = Icon.createWithResource(this, R.drawable.ic_synt_notification)
    val note = builder
      .setContentTitle("Synt")
      .setContentText(getString(R.string.overlay_notification))
      .setSmallIcon(R.drawable.ic_synt_notification)
      .setOngoing(true)
      .setShowWhen(false)
      .setContentIntent(open)
      .addAction(Notification.Action.Builder(icon, getString(R.string.overlay_open), open).build())
      .addAction(Notification.Action.Builder(icon, getString(R.string.overlay_hide), hide).build())
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTICE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTICE_ID, note)
    }
  }

  private fun shutdown() {
    detach()
    pet = null
    params = null
    prefs().edit().putBoolean(PREF_ENABLED, false).apply()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun dp(value: Float): Float = value * resources.displayMetrics.density

  private fun topOffset(): Int {
    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
    val bar = if (id > 0) resources.getDimensionPixelSize(id) else dp(24f).toInt()
    return bar + dp(6f).toInt()
  }

  companion object {
    private const val PREFS = "synt"
    private const val PREF_ENABLED = "overlay"
    private const val CHANNEL = "synt.overlay"
    private const val NOTICE_ID = 42
    private const val ACTION_STOP = "store.syntaxdev.synt.OVERLAY_STOP"

    @Volatile
    private var instance: SyntOverlayService? = null

    fun isRunning(): Boolean = instance != null

    fun start(context: Context): Boolean {
      if (!Settings.canDrawOverlays(context)) return false
      val intent = Intent(context, SyntOverlayService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (_: Throwable) {
        return false
      }
      return true
    }

    fun stop() {
      instance?.shutdown()
    }

    fun setAppVisible(visible: Boolean) {
      instance?.applyAppVisible(visible)
    }

    fun setMood(mood: String, label: String) {
      val service = instance ?: return
      service.mood = mood
      service.label = label
      service.pet?.setMood(mood)
      service.pet?.setLabel(label)
    }

    fun snapshot(context: Context): JSObject = JSObject().apply {
      put("supported", true)
      put("granted", Settings.canDrawOverlays(context))
      put("running", isRunning())
    }

    fun wasEnabled(context: Context): Boolean =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREF_ENABLED, false)
  }
}
