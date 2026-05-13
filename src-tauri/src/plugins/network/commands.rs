use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use rusqlite::{params, Connection};
use tokio::net::{lookup_host, TcpStream};
use tokio::process::Command;
use tokio::time::{timeout, Instant};

use super::types::{
    DnsLookupResult, NetworkHistoryItem, PingResult, TcpCheckResult, TraceHop, TracerouteResult,
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn duration_ms(started: Instant) -> u64 {
    started.elapsed().as_millis() as u64
}

fn timeout_duration(timeout_ms: Option<u64>) -> Duration {
    Duration::from_millis(timeout_ms.unwrap_or(5_000).clamp(500, 120_000))
}

fn trim_required(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(trimmed.to_string())
    }
}

fn save_history(
    app_handle: &tauri::AppHandle,
    tool_type: &str,
    target: &str,
    params_json: serde_json::Value,
    status: &str,
    duration_ms: u64,
    summary: &str,
    result_json: serde_json::Value,
) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO network_diagnostic_history (
          id, tool_type, target, params_json, status, duration_ms, summary, result_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
        params![
            uuid::Uuid::new_v4().to_string(),
            tool_type,
            target,
            params_json.to_string(),
            status,
            duration_ms as i64,
            summary,
            result_json.to_string(),
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .map_err(|err| format!("save network history failed: {err}"))?;
    Ok(())
}

fn parse_loss_percent(text: &str) -> Option<f64> {
    for line in text.lines() {
        if !line.contains('%') {
            continue;
        }
        if !(line.to_ascii_lowercase().contains("loss") || line.contains("丢失")) {
            continue;
        }
        let before_percent = line.split('%').next().unwrap_or_default();
        if let Some(value) = before_percent
            .split(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
            .filter(|part| !part.is_empty())
            .last()
        {
            if let Ok(parsed) = value.parse::<f64>() {
                return Some(parsed);
            }
        }
    }
    None
}

fn parse_ping_counts(text: &str) -> (Option<u32>, Option<u32>) {
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        let is_count_line = lower.contains("packets transmitted")
            || (lower.contains("sent") && lower.contains("received"))
            || (line.contains("已发送") && line.contains("已接收"));
        if !is_count_line {
            continue;
        }
        let numbers = line
            .split(|ch: char| !ch.is_ascii_digit())
            .filter_map(|part| part.parse::<u32>().ok())
            .collect::<Vec<_>>();
        if numbers.len() >= 2 {
            return (numbers.first().copied(), numbers.get(1).copied());
        }
    }
    (None, None)
}

fn parse_ping_avg(text: &str) -> Option<f64> {
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("min/avg/max") || lower.contains("round-trip") {
            if let Some(eq_idx) = line.find('=') {
                let values = line[eq_idx + 1..]
                    .split('/')
                    .filter_map(|part| part.trim().split_whitespace().next()?.parse::<f64>().ok())
                    .collect::<Vec<_>>();
                if values.len() >= 2 {
                    return values.get(1).copied();
                }
            }
        }
        if lower.contains("average") || line.contains("平均") {
            let numbers = line
                .split(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
                .filter_map(|part| part.parse::<f64>().ok())
                .collect::<Vec<_>>();
            if let Some(last) = numbers.last() {
                return Some(*last);
            }
        }
    }
    None
}

async fn run_command_with_timeout(
    mut command: Command,
    max_wait: Duration,
) -> Result<(bool, String), String> {
    let output = timeout(max_wait, command.output())
        .await
        .map_err(|_| format!("command timed out after {}ms", max_wait.as_millis()))?
        .map_err(|err| format!("failed to run command: {err}"))?;
    let mut text = String::new();
    text.push_str(&decode_command_output(&output.stdout));
    text.push_str(&decode_command_output(&output.stderr));
    Ok((output.status.success(), text))
}

#[cfg(target_os = "windows")]
fn decode_command_output(bytes: &[u8]) -> String {
    let (text, _, had_errors) = encoding_rs::GBK.decode(bytes);
    if had_errors {
        String::from_utf8_lossy(bytes).to_string()
    } else {
        text.to_string()
    }
}

#[cfg(not(target_os = "windows"))]
fn decode_command_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_: &mut Command) {}

fn make_ping_command(target: &str, count: u32, timeout_ms: u64) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("ping");
        command.args([
            "-n",
            &count.to_string(),
            "-w",
            &timeout_ms.to_string(),
            target,
        ]);
        hide_console(&mut command);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new("ping");
        command.args([
            "-c",
            &count.to_string(),
            "-W",
            &(timeout_ms / 1_000).max(1).to_string(),
            target,
        ]);
        hide_console(&mut command);
        command
    }
}

fn make_traceroute_command(target: &str, max_hops: u32, timeout_ms: u64) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("tracert");
        command.args([
            "-d",
            "-h",
            &max_hops.to_string(),
            "-w",
            &timeout_ms.to_string(),
            target,
        ]);
        hide_console(&mut command);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new("traceroute");
        command.args([
            "-n",
            "-m",
            &max_hops.to_string(),
            "-w",
            &(timeout_ms / 1_000).max(1).to_string(),
            target,
        ]);
        hide_console(&mut command);
        command
    }
}

fn parse_trace_hops(output: &str) -> Vec<TraceHop> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let first = trimmed.split_whitespace().next()?;
            let hop = first.trim_end_matches('.').parse::<u32>().ok()?;
            let address = trimmed
                .split_whitespace()
                .find(|part| part.parse::<IpAddr>().is_ok())
                .map(|part| part.to_string());
            Some(TraceHop {
                hop,
                address,
                raw_line: trimmed.to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn cmd_network_tcp_check(
    app_handle: tauri::AppHandle,
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<TcpCheckResult, String> {
    let host = trim_required(&host, "host")?;
    let wait = timeout_duration(timeout_ms);
    let started = Instant::now();
    let target = format!("{host}:{port}");
    let result = match timeout(wait, TcpStream::connect((host.as_str(), port))).await {
        Ok(Ok(stream)) => TcpCheckResult {
            connected: true,
            host: host.clone(),
            port,
            duration_ms: duration_ms(started),
            remote_addr: stream.peer_addr().ok().map(|addr| addr.to_string()),
            error: None,
        },
        Ok(Err(err)) => TcpCheckResult {
            connected: false,
            host: host.clone(),
            port,
            duration_ms: duration_ms(started),
            remote_addr: None,
            error: Some(err.to_string()),
        },
        Err(_) => TcpCheckResult {
            connected: false,
            host: host.clone(),
            port,
            duration_ms: duration_ms(started),
            remote_addr: None,
            error: Some(format!("timeout after {}ms", wait.as_millis())),
        },
    };
    let summary = if result.connected {
        "TCP connected"
    } else {
        "TCP connection failed"
    };
    save_history(
        &app_handle,
        "tcp",
        &target,
        serde_json::json!({ "host": host, "port": port, "timeoutMs": wait.as_millis() }),
        if result.connected {
            "success"
        } else {
            "failed"
        },
        result.duration_ms,
        summary,
        serde_json::to_value(&result).map_err(|err| err.to_string())?,
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn cmd_network_ping(
    app_handle: tauri::AppHandle,
    target: String,
    count: Option<u32>,
    timeout_ms: Option<u64>,
) -> Result<PingResult, String> {
    let target = trim_required(&target, "target")?;
    let count = count.unwrap_or(4).clamp(1, 20);
    let timeout_ms = timeout_ms.unwrap_or(1_000).clamp(500, 10_000);
    let started = Instant::now();
    let (success, raw_output) = run_command_with_timeout(
        make_ping_command(&target, count, timeout_ms),
        Duration::from_millis((timeout_ms * count as u64 + 1_000).min(30_000)),
    )
    .await?;
    let (transmitted, received) = parse_ping_counts(&raw_output);
    let result = PingResult {
        target: target.clone(),
        transmitted,
        received,
        loss_percent: parse_loss_percent(&raw_output),
        avg_ms: parse_ping_avg(&raw_output),
        duration_ms: duration_ms(started),
        raw_output,
        success,
    };
    let summary = result
        .avg_ms
        .map(|avg| format!("Ping avg {avg:.2} ms"))
        .unwrap_or_else(|| {
            if success {
                "Ping completed"
            } else {
                "Ping failed"
            }
            .to_string()
        });
    save_history(
        &app_handle,
        "ping",
        &target,
        serde_json::json!({ "target": target, "count": count, "timeoutMs": timeout_ms }),
        if success { "success" } else { "failed" },
        result.duration_ms,
        &summary,
        serde_json::to_value(&result).map_err(|err| err.to_string())?,
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn cmd_network_dns_lookup(
    app_handle: tauri::AppHandle,
    host: String,
    record_type: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<DnsLookupResult, String> {
    let host = trim_required(&host, "host")?;
    let record_type = record_type.unwrap_or_else(|| "A/AAAA".to_string());
    let normalized = record_type.trim().to_ascii_uppercase();
    let wait = timeout_duration(timeout_ms);
    let started = Instant::now();
    let lookup = timeout(wait, lookup_host((host.as_str(), 0))).await;
    let addresses = match lookup {
        Ok(Ok(iter)) => iter
            .map(|addr: SocketAddr| addr.ip())
            .filter(|ip| match normalized.as_str() {
                "A" => ip.is_ipv4(),
                "AAAA" => ip.is_ipv6(),
                _ => true,
            })
            .map(|ip| ip.to_string())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>(),
        Ok(Err(err)) => {
            let duration = duration_ms(started);
            save_history(
                &app_handle,
                "dns",
                &host,
                serde_json::json!({ "host": host, "recordType": normalized, "timeoutMs": wait.as_millis() }),
                "failed",
                duration,
                "DNS lookup failed",
                serde_json::json!({ "error": err.to_string() }),
            )?;
            return Err(format!("dns lookup failed: {err}"));
        }
        Err(_) => {
            let duration = duration_ms(started);
            save_history(
                &app_handle,
                "dns",
                &host,
                serde_json::json!({ "host": host, "recordType": normalized, "timeoutMs": wait.as_millis() }),
                "failed",
                duration,
                "DNS lookup timed out",
                serde_json::json!({ "error": format!("timeout after {}ms", wait.as_millis()) }),
            )?;
            return Err(format!("dns lookup timed out after {}ms", wait.as_millis()));
        }
    };
    let result = DnsLookupResult {
        host: host.clone(),
        record_type: normalized.clone(),
        addresses,
        duration_ms: duration_ms(started),
    };
    let summary = format!("{} record(s) resolved", result.addresses.len());
    save_history(
        &app_handle,
        "dns",
        &host,
        serde_json::json!({ "host": host, "recordType": normalized, "timeoutMs": wait.as_millis() }),
        if result.addresses.is_empty() {
            "failed"
        } else {
            "success"
        },
        result.duration_ms,
        &summary,
        serde_json::to_value(&result).map_err(|err| err.to_string())?,
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn cmd_network_traceroute(
    app_handle: tauri::AppHandle,
    target: String,
    max_hops: Option<u32>,
    timeout_ms: Option<u64>,
) -> Result<TracerouteResult, String> {
    let target = trim_required(&target, "target")?;
    let max_hops = max_hops.unwrap_or(15).clamp(1, 30);
    let timeout_ms = timeout_ms.unwrap_or(1_000).clamp(500, 5_000);
    let started = Instant::now();
    let (success, raw_output) = run_command_with_timeout(
        make_traceroute_command(&target, max_hops, timeout_ms),
        Duration::from_millis((timeout_ms * max_hops as u64 + 2_000).min(30_000)),
    )
    .await?;
    let hops = parse_trace_hops(&raw_output);
    let result = TracerouteResult {
        target: target.clone(),
        hops,
        duration_ms: duration_ms(started),
        raw_output,
        success,
    };
    let summary = format!("{} hop(s) captured", result.hops.len());
    save_history(
        &app_handle,
        "traceroute",
        &target,
        serde_json::json!({ "target": target, "maxHops": max_hops, "timeoutMs": timeout_ms }),
        if success { "success" } else { "failed" },
        result.duration_ms,
        &summary,
        serde_json::to_value(&result).map_err(|err| err.to_string())?,
    )?;
    Ok(result)
}

#[tauri::command]
pub fn cmd_network_list_history(
    app_handle: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<NetworkHistoryItem>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, tool_type, target, params_json, status, duration_ms, summary, result_json, created_at
            FROM network_diagnostic_history
            ORDER BY created_at DESC
            LIMIT ?1
            "#,
        )
        .map_err(|err| format!("prepare network history query failed: {err}"))?;
    let rows = stmt
        .query_map(params![limit.unwrap_or(100)], |row| {
            let duration: i64 = row.get(5)?;
            Ok(NetworkHistoryItem {
                id: row.get(0)?,
                tool_type: row.get(1)?,
                target: row.get(2)?,
                params_json: row.get(3)?,
                status: row.get(4)?,
                duration_ms: duration.max(0) as u64,
                summary: row.get(6)?,
                result_json: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|err| format!("query network history failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse network history failed: {err}"))
}

#[tauri::command]
pub fn cmd_network_delete_history(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute(
        "DELETE FROM network_diagnostic_history WHERE id = ?1",
        params![id],
    )
    .map_err(|err| format!("delete network history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_network_clear_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM network_diagnostic_history", [])
        .map_err(|err| format!("clear network history failed: {err}"))?;
    Ok(())
}
