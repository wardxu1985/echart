mod state;
mod excel_reader;
mod downsample;
mod commands;

pub fn run() {
    let app_state = state::AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::get_series,
            commands::close_window,
            commands::create_window,
            commands::pick_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
