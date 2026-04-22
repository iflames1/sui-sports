use anyhow::Context;
use serde_json::{json, Value};

pub async fn transaction_succeeded(rpc_url: &str, digest: &str) -> anyhow::Result<bool> {
    let client = reqwest::Client::new();
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getTransactionBlock",
        "params": [
            digest,
            {
                "showInput": false,
                "showRawInput": false,
                "showEffects": true,
                "showEvents": false,
                "showObjectChanges": false,
                "showBalanceChanges": false,
                "showRawEffects": false
            }
        ]
    });
    let res = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await
        .context("sui rpc request")?;
    let v: Value = res.json().await.context("sui rpc json")?;
    if v.get("error").is_some() {
        return Ok(false);
    }
    let status = v
        .pointer("/result/effects/status/status")
        .and_then(|s| s.as_str());
    Ok(status == Some("success"))
}
