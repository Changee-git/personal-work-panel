use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct Counters {
    next_task_no: u64,
    next_todo_no: HashMap<String, u64>,
}

impl Default for Counters {
    fn default() -> Self {
        Self {
            next_task_no: 1,
            next_todo_no: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct Settings {
    last_main_tab: String,
    window_mode: String,
    autostart: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            last_main_tab: "today".into(),
            window_mode: "main".into(),
            autostart: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Task {
    id: String,
    task_no: u64,
    name: String,
    status: String,
    created_at: String,
    last_progress_at: String,
    completed_at: Option<String>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    summary_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Todo {
    id: String,
    todo_no: u64,
    task_id: String,
    content: String,
    #[serde(default)]
    images: Vec<String>,
    status: String,
    created_at: String,
    completed_at: Option<String>,
    order: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Issue {
    id: String,
    task_id: String,
    title: String,
    detail: String,
    #[serde(default)]
    images: Vec<String>,
    status: String,
    created_at: String,
    resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Idea {
    id: String,
    content: String,
    #[serde(default)]
    images: Vec<String>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AppDatabase {
    version: u32,
    counters: Counters,
    settings: Settings,
    tasks: Vec<Task>,
    todos: Vec<Todo>,
    issues: Vec<Issue>,
    ideas: Vec<Idea>,
}

impl Default for AppDatabase {
    fn default() -> Self {
        Self {
            version: 1,
            counters: Counters::default(),
            settings: Settings::default(),
            tasks: vec![],
            todos: vec![],
            issues: vec![],
            ideas: vec![],
        }
    }
}

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn database_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("work-panel.json"))
}

fn previous_path(path: &Path) -> PathBuf {
    match path.extension().and_then(|value| value.to_str()) {
        Some(extension) => path.with_extension(format!("backup.{extension}")),
        None => path.with_extension("backup"),
    }
}

fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("data");
    let temp = path.with_extension(format!("{}.{}.tmp", extension, uuid::Uuid::new_v4()));
    let previous = previous_path(path);

    fs::write(&temp, content).map_err(|error| error.to_string())?;

    if path.exists() {
        if previous.exists() {
            fs::remove_file(&previous).map_err(|error| error.to_string())?;
        }
        fs::rename(path, &previous).map_err(|error| error.to_string())?;
    }

    if let Err(error) = fs::rename(&temp, path) {
        if previous.exists() && !path.exists() {
            let _ = fs::rename(&previous, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }

    Ok(())
}

fn read_database_file(path: &Path) -> Result<AppDatabase, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| format!("数据文件解析失败: {error}"))
}

#[tauri::command]
fn load_database(app: AppHandle) -> Result<AppDatabase, String> {
    let path = database_path(&app)?;
    let previous = previous_path(&path);

    if path.exists() {
        match read_database_file(&path) {
            Ok(database) => return Ok(database),
            Err(primary_error) if previous.exists() => {
                let recovered = read_database_file(&previous).map_err(|backup_error| {
          format!("主数据与恢复副本均不可用。主数据: {primary_error}; 恢复副本: {backup_error}")
        })?;
                let bytes =
                    serde_json::to_vec_pretty(&recovered).map_err(|error| error.to_string())?;
                atomic_write(&path, &bytes)?;
                return Ok(recovered);
            }
            Err(error) => return Err(error),
        }
    }

    if previous.exists() {
        let recovered = read_database_file(&previous)?;
        let bytes = serde_json::to_vec_pretty(&recovered).map_err(|error| error.to_string())?;
        atomic_write(&path, &bytes)?;
        return Ok(recovered);
    }

    Ok(AppDatabase::default())
}

#[tauri::command]
fn save_database(app: AppHandle, database: AppDatabase) -> Result<(), String> {
    let path = database_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&database).map_err(|error| error.to_string())?;
    atomic_write(&path, &bytes)
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_window_mode(window: WebviewWindow, mode: String) -> Result<(), String> {
    if mode == "compact" {
        window
            .set_min_size(Some(LogicalSize::new(560.0, 640.0)))
            .map_err(|error| error.to_string())?;
        window
            .set_size(LogicalSize::new(620.0, 720.0))
            .map_err(|error| error.to_string())?;
        if let Ok(Some(monitor)) = window.current_monitor() {
            let area = monitor.work_area();
            let size = window.outer_size().map_err(|error| error.to_string())?;
            window
                .set_position(PhysicalPosition::new(
                    area.position.x + area.size.width as i32 - size.width as i32 - 18,
                    area.position.y + area.size.height as i32 - size.height as i32 - 18,
                ))
                .map_err(|error| error.to_string())?;
        }
    } else {
        window
            .set_min_size(Some(LogicalSize::new(760.0, 600.0)))
            .map_err(|error| error.to_string())?;
        window
            .set_size(LogicalSize::new(1180.0, 780.0))
            .map_err(|error| error.to_string())?;
        window.center().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_image(app: AppHandle, data_base64: String, mime_type: String) -> Result<String, String> {
    let extension = match mime_type.as_str() {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| error.to_string())?;
    let directory = data_dir(&app)?.join("images");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{}.{}", uuid::Uuid::new_v4(), extension));
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn safe_name(value: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    value
        .chars()
        .map(|character| {
            if invalid.contains(&character) {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn copy_images(paths: &[String], resource_dir: &Path) -> Result<Vec<String>, String> {
    let mut relative = vec![];
    for source in paths {
        let source_path = Path::new(source);
        if source_path.exists() {
            let name = source_path.file_name().ok_or("图片文件名无效")?;
            let target = resource_dir.join(name);
            fs::copy(source_path, &target).map_err(|error| error.to_string())?;
            relative.push(format!(
                "{}/{}",
                resource_dir
                    .file_name()
                    .ok_or("资源目录名无效")?
                    .to_string_lossy(),
                name.to_string_lossy()
            ));
        }
    }
    Ok(relative)
}

fn project_root() -> Result<PathBuf, String> {
    if let Ok(current) = std::env::current_dir() {
        if current.join("package.json").is_file() && current.join("src-tauri").is_dir() {
            return Ok(current);
        }
    }

    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_dir = executable.parent().ok_or("无法确定应用所在目录")?;
    for ancestor in executable_dir.ancestors() {
        if ancestor.file_name().and_then(|name| name.to_str()) == Some("src-tauri")
            && ancestor.join("tauri.conf.json").is_file()
        {
            return ancestor
                .parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| "无法确定项目根目录".to_string());
        }
    }

    Ok(executable_dir.to_path_buf())
}

fn default_export_directory() -> Result<PathBuf, String> {
    Ok(project_root()?.join("export"))
}

#[tauri::command]
fn get_default_export_directory() -> Result<String, String> {
    Ok(default_export_directory()?.to_string_lossy().into_owned())
}

fn todo_completion_marker(status: &str) -> &'static str {
    if status == "done" {
        "√"
    } else {
        " "
    }
}

fn task_export_base(task: &Task) -> String {
    let date = task
        .completed_at
        .as_deref()
        .unwrap_or(&task.last_progress_at)
        .chars()
        .take(10)
        .collect::<String>();
    let name = safe_name(&task.name);
    format!(
        "{:02}_{}_{}",
        task.task_no,
        if name.is_empty() { "project" } else { &name },
        date
    )
}

fn export_project_markdown(
    database: &AppDatabase,
    task: &Task,
    target_directory: &Path,
) -> Result<PathBuf, String> {
    let base = task_export_base(task);
    let resources = target_directory.join(format!("{}_assets", base));
    fs::create_dir_all(&resources).map_err(|error| error.to_string())?;

    let summary_images = copy_images(&task.summary_images, &resources)?;
    let mut markdown = format!(
        "# {}\n\n- 项目序号: No.{:02}\n- 创建时间: {}\n- 最近推进: {}\n- 完成时间: {}\n\n## 项目总结\n\n{}\n\n",
        task.name,
        task.task_no,
        task.created_at,
        task.last_progress_at,
        task.completed_at.as_deref().unwrap_or("—"),
        if task.summary.is_empty() { "暂无总结" } else { &task.summary }
    );
    for path in summary_images {
        markdown.push_str(&format!("![]({})\n\n", path));
    }

    markdown.push_str("## To-do\n\n");
    let mut todos: Vec<_> = database
        .todos
        .iter()
        .filter(|todo| todo.task_id == task.id)
        .collect();
    todos.sort_by(|left, right| {
        left.order
            .partial_cmp(&right.order)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for todo in todos {
        markdown.push_str(&format!(
            "- [{}] {:02}. {}\n",
            todo_completion_marker(&todo.status),
            todo.todo_no,
            todo.content
        ));
        for path in copy_images(&todo.images, &resources)? {
            markdown.push_str(&format!("  ![]({})\n", path));
        }
    }

    markdown.push_str("\n## Issue\n\n");
    for issue in database
        .issues
        .iter()
        .filter(|issue| issue.task_id == task.id)
    {
        markdown.push_str(&format!(
            "### [{}] {}\n\n{}\n\n",
            if issue.status == "resolved" {
                "已解决"
            } else {
                "未解决"
            },
            issue.title,
            issue.detail
        ));
        for path in copy_images(&issue.images, &resources)? {
            markdown.push_str(&format!("![]({})\n\n", path));
        }
    }

    let output = target_directory.join(format!("{}.md", base));
    atomic_write(&output, markdown.as_bytes())?;
    Ok(output)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownExportResult {
    directory: String,
    file_count: usize,
    files: Vec<String>,
}

fn resolve_export_directory(target_directory: Option<String>) -> Result<PathBuf, String> {
    let target = match target_directory {
        Some(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => default_export_directory()?,
    };
    if !target.is_absolute() {
        return Err("导出路径必须是绝对路径".into());
    }
    fs::create_dir_all(&target).map_err(|error| format!("无法创建导出目录: {error}"))?;
    Ok(target)
}

#[tauri::command]
fn export_projects_markdown(
    app: AppHandle,
    task_ids: Vec<String>,
    target_directory: Option<String>,
) -> Result<MarkdownExportResult, String> {
    if task_ids.is_empty() {
        return Err("请至少选择一个要导出的项目".into());
    }

    let database = load_database(app)?;
    let target = resolve_export_directory(target_directory)?;
    let mut seen = HashSet::new();
    let mut files = Vec::new();

    for task_id in task_ids {
        if !seen.insert(task_id.clone()) {
            continue;
        }
        let task = database
            .tasks
            .iter()
            .find(|task| task.id == task_id)
            .ok_or_else(|| format!("项目不存在: {task_id}"))?;
        let output = export_project_markdown(&database, task, &target)?;
        files.push(output.to_string_lossy().into_owned());
    }

    Ok(MarkdownExportResult {
        directory: target.to_string_lossy().into_owned(),
        file_count: files.len(),
        files,
    })
}

#[tauri::command]
fn export_task_markdown(app: AppHandle, task_id: String) -> Result<String, String> {
    let result = export_projects_markdown(app, vec![task_id], None)?;
    result
        .files
        .into_iter()
        .next()
        .ok_or_else(|| "项目未生成 Markdown 文件".to_string())
}

#[cfg(test)]
mod markdown_export_tests {
    use super::{safe_name, todo_completion_marker};

    #[test]
    fn completed_todo_uses_check_mark_instead_of_x() {
        assert_eq!(todo_completion_marker("done"), "√");
        assert_ne!(todo_completion_marker("done"), "x");
        assert_eq!(todo_completion_marker("open"), " ");
    }

    #[test]
    fn export_file_name_removes_windows_reserved_characters() {
        assert_eq!(safe_name("计划:第一阶段/验收?"), "计划_第一阶段_验收_");
    }
}

fn show_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("window-shown", ());
    }
}

fn show_or_hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--minimized"])
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_or_hide(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "打开", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_or_hide(tray.app_handle());
                    }
                })
                .build(app)?;

            app.global_shortcut().register("Ctrl+Shift+Space")?;
            if let Some(window) = app.get_webview_window("main") {
                window.set_skip_taskbar(true)?;
                if std::env::args().any(|argument| argument == "--minimized") {
                    window.hide()?;
                }
                let close_window = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = close_window.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_database,
            save_database,
            hide_window,
            quit_app,
            set_window_mode,
            save_image,
            get_default_export_directory,
            export_projects_markdown,
            export_task_markdown
        ])
        .run(tauri::generate_context!())
        .expect("failed to run personal work panel");
}
