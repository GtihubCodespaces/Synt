//! The floating Synt: on Android he keeps living at the top of the screen
//! after you leave the app, in a foreground service with a small notification.
//!
//! The Rust side is deliberately thin. It owns no state: it forwards five
//! calls to the Kotlin `SyntOverlayPlugin` that lives in `gen/android`, and
//! answers honestly on desktop so the settings card never lies about a
//! feature that does not exist there.

use serde::{Deserialize, Serialize};

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct OverlayState {
    pub supported: bool,
    pub granted: bool,
    pub running: bool,
}

#[cfg(target_os = "android")]
pub struct SyntOverlay(tauri::plugin::PluginHandle<tauri::Wry>);

#[cfg(target_os = "android")]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri::Manager;

    tauri::plugin::Builder::<tauri::Wry>::new("synt-overlay")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("store.syntaxdev.synt", "SyntOverlayPlugin")?;
            app.manage(SyntOverlay(handle));
            Ok(())
        })
        .build()
}

#[cfg(not(target_os = "android"))]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("synt-overlay").build()
}

#[cfg(target_os = "android")]
fn forward(
    app: &tauri::AppHandle,
    method: &str,
    payload: impl Serialize,
) -> Result<OverlayState, String> {
    use tauri::Manager;

    app.state::<SyntOverlay>()
        .0
        .run_mobile_plugin(method, payload)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn overlay_state(app: tauri::AppHandle) -> Result<OverlayState, String> {
    #[cfg(target_os = "android")]
    {
        return forward(&app, "state", ());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(OverlayState::default())
    }
}

#[tauri::command]
pub fn overlay_enable(app: tauri::AppHandle) -> Result<OverlayState, String> {
    #[cfg(target_os = "android")]
    {
        return forward(&app, "enable", ());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(OverlayState::default())
    }
}

#[tauri::command]
pub fn overlay_disable(app: tauri::AppHandle) -> Result<OverlayState, String> {
    #[cfg(target_os = "android")]
    {
        return forward(&app, "disable", ());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(OverlayState::default())
    }
}

#[tauri::command]
pub fn overlay_permission(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        app.state::<SyntOverlay>()
            .0
            .run_mobile_plugin::<serde_json::Value>("permission", ())
            .map(|_| ())
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[derive(Serialize)]
struct MoodPayload {
    mood: String,
    label: String,
}

#[tauri::command]
pub fn overlay_mood(app: tauri::AppHandle, mood: String, label: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;

        app.state::<SyntOverlay>()
            .0
            .run_mobile_plugin::<serde_json::Value>("mood", MoodPayload { mood, label })
            .map(|_| ())
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, mood, label);
        Ok(())
    }
}
