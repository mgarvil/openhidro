// Evita abrir uma janela de console junto com o app no Windows (versão final)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openhidro_lib::run()
}
