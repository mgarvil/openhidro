// Núcleo do aplicativo OpenHidro (Tauri): janela, plugins de diálogo, arquivos e shell (este
// último só para executar o motor de cálculo empacotado, binaries/openhidro-motor) e a ponte local
// para o Claude: um servidor HTTP em 127.0.0.1 que recebe comandos do servidor MCP
// (python -m openhidro.app_mcp) e os repassa para a interface, que executa exatamente os mesmos
// comandos dos botões. A porta e uma chave aleatória ficam em <dados do app>/mcp.json.
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{Emitter, Manager, State};

#[derive(Default, Clone)]
struct Pendentes(Arc<Mutex<HashMap<u64, mpsc::Sender<Value>>>>);

#[derive(Default)]
struct InfoPonte(Mutex<Value>);

#[tauri::command]
fn mcp_resposta(id: u64, resposta: Value, pendentes: State<Pendentes>) {
    if let Some(tx) = pendentes.0.lock().unwrap().remove(&id) {
        let _ = tx.send(resposta);
    }
}

#[tauri::command]
fn mcp_info(info: State<InfoPonte>) -> Value {
    info.0.lock().unwrap().clone()
}

fn chave_aleatoria() -> String {
    let mut b = [0u8; 24];
    getrandom::getrandom(&mut b).expect("gerador aleatório");
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn iniciar_ponte(app: tauri::AppHandle, pendentes: Pendentes) -> Result<Value, String> {
    let servidor = tiny_http::Server::http("127.0.0.1:47821")
        .or_else(|_| tiny_http::Server::http("127.0.0.1:0"))
        .map_err(|e| e.to_string())?;
    let porta = servidor.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let chave = chave_aleatoria();
    let info = json!({ "porta": porta, "chave": chave, "versao": env!("CARGO_PKG_VERSION") });
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("mcp.json"), info.to_string());
    }
    let contador = AtomicU64::new(1);
    std::thread::spawn(move || {
        for mut req in servidor.incoming_requests() {
            let autorizado = req.headers().iter().any(|h| {
                h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {}", chave)
            });
            let responder = |req: tiny_http::Request, cod: u16, corpo: Value| {
                let cab = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                let _ = req.respond(tiny_http::Response::from_string(corpo.to_string()).with_status_code(cod).with_header(cab));
            };
            if !autorizado {
                responder(req, 401, json!({ "ok": false, "erro": "chave inválida" }));
                continue;
            }
            let mut texto = String::new();
            let _ = req.as_reader().read_to_string(&mut texto);
            let pedido: Value = serde_json::from_str(&texto).unwrap_or(json!({}));
            let id = contador.fetch_add(1, Ordering::SeqCst);
            let (tx, rx) = mpsc::channel();
            pendentes.0.lock().unwrap().insert(id, tx);
            let _ = app.emit("mcp-pedido", json!({ "id": id, "comando": pedido["comando"], "args": pedido["args"] }));
            match rx.recv_timeout(Duration::from_secs(180)) {
                Ok(r) => responder(req, 200, r),
                Err(_) => {
                    pendentes.0.lock().unwrap().remove(&id);
                    responder(req, 504, json!({ "ok": false, "erro": "o OpenHidro não respondeu a tempo" }))
                }
            }
        }
    });
    Ok(info)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Pendentes::default())
        .manage(InfoPonte::default())
        .invoke_handler(tauri::generate_handler![mcp_resposta, mcp_info])
        .setup(|app| {
            let pendentes = app.state::<Pendentes>().inner().clone();
            match iniciar_ponte(app.handle().clone(), pendentes) {
                Ok(info) => *app.state::<InfoPonte>().0.lock().unwrap() = info,
                Err(e) => *app.state::<InfoPonte>().0.lock().unwrap() = json!({ "erro": e }),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o OpenHidro");
}
