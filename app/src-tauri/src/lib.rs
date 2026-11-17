// Núcleo do aplicativo OpenHidro (Tauri). Por enquanto só abre a janela e habilita os plugins de
// diálogo e arquivos; a ponte com o motor Python e o servidor MCP entram no M2/M3.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o OpenHidro");
}
