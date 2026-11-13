use std::fs;
use std::path::PathBuf;

use base64::Engine;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

mod overlay;

/// Six small commands. Everything else — the island, the cube, the chat, the
/// voice — lives in the web front end, so this file stays boring on purpose.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn store_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe.is_empty() {
        return Err("store name must be [a-zA-Z0-9_-]".into());
    }
    Ok(data_dir(app)?.join(format!("{safe}.json")))
}

#[tauri::command]
fn read_store(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let path = store_path(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn write_store(app: tauri::AppHandle, name: String, data: String) -> Result<bool, String> {
    let path = store_path(&app, &name)?;
    fs::write(&path, data).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Settings and the key file are for this user only.
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(true)
}

/// Keep the native window exactly the size of the island, pinned top-centre.
/// Desktop only: on Android the activity owns the window.
#[tauri::command]
fn set_island_size(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = (window, width, height);
        return Ok(());
    }

    #[cfg(desktop)]
    #[allow(unreachable_code)]
    {
    let scale = window.scale_factor().map_err(|err| err.to_string())?;
    let w = (width * scale).round().clamp(120.0, 4000.0) as u32;
    let h = (height * scale).round().clamp(40.0, 4000.0) as u32;
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|err| err.to_string())?;

    if let Some(monitor) = window.current_monitor().map_err(|err| err.to_string())? {
        let size = monitor.size();
        let origin = monitor.position();
        let x = origin.x + ((size.width as i64 - w as i64) / 2) as i32;
        window
            .set_position(PhysicalPosition::new(x, origin.y))
            .map_err(|err| err.to_string())?;
    }
    Ok(())
    }
}

#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    let extension = PathBuf::from(&path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());
    let mime = match extension.as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// Copy dropped screenshots into one folder, so they can be dragged into
/// SyntaxUI in the order they were dropped (one file per tab).
#[tauri::command]
fn stage_screenshots(app: tauri::AppHandle, paths: Vec<String>) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let folder = data_dir(&app)?.join("syntaxui").join(format!("drop-{stamp}"));
    fs::create_dir_all(&folder).map_err(|err| err.to_string())?;

    for (index, path) in paths.iter().enumerate() {
        let source = PathBuf::from(path);
        let name = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("screenshot.png");
        let target = folder.join(format!("{:02}-{name}", index + 1));
        let _ = fs::copy(&source, &target);
    }
    Ok(folder.to_string_lossy().to_string())
}

#[tauri::command]
fn open_external(target: String) -> Result<(), String> {
    // Only web URLs and paths that exist: this command is not a shell.
    let allowed = target.starts_with("https://") || target.starts_with("http://") || PathBuf::from(&target).exists();
    if !allowed {
        return Err("refusing to open this target".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    #[cfg(target_os = "android")]
    {
        std::process::Command::new("am")
            .args(["start", "-a", "android.intent.action.VIEW", "-d", &target])
            .spawn()
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(overlay::plugin())
        .invoke_handler(tauri::generate_handler![
            read_store,
            write_store,
            set_island_size,
            read_image,
            stage_screenshots,
            open_external,
            overlay::overlay_state,
            overlay::overlay_enable,
            overlay::overlay_disable,
            overlay::overlay_permission,
            overlay::overlay_mood
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(desktop)]
                {
                    let _ = window.set_always_on_top(true);
                    let _ = window.set_skip_taskbar(true);
                    let _ = window.set_decorations(false);
                }
                #[cfg(not(desktop))]
                let _ = &window;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Synt");
}
