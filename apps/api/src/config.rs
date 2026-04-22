use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: Option<String>,
    pub jwt_secret: String,
    pub cors_origins: Vec<String>,
    pub sui_rpc_url: String,
    pub sui_tx_verify_relaxed: bool,
    pub livekit_api_key: Option<String>,
    pub livekit_api_secret: Option<String>,
    pub livekit_url: Option<String>,
    pub vapid_public_key: Option<String>,
    pub vapid_private_key: Option<String>,
    pub vapid_subject: Option<String>,
    pub bind_addr: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://suisports:suisports@127.0.0.1:5433/suisports".into()
        });
        let redis_url = env::var("REDIS_URL").ok();
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "dev-insecure-change-me".into());
        let cors = env::var("CORS_ORIGINS").unwrap_or_else(|_| "http://localhost:3000".into());
        let cors_origins = cors.split(',').map(|s| s.trim().to_string()).collect();
        let sui_rpc_url = env::var("SUI_RPC_URL")
            .unwrap_or_else(|_| "https://fullnode.testnet.sui.io:443".into());
        let sui_tx_verify_relaxed = env::var("SUI_TX_VERIFY_RELAXED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(true);
        let livekit_api_key = env::var("LIVEKIT_API_KEY").ok();
        let livekit_api_secret = env::var("LIVEKIT_API_SECRET").ok();
        let livekit_url = env::var("LIVEKIT_URL").ok();
        let vapid_public_key = env::var("VAPID_PUBLIC_KEY").ok();
        let vapid_private_key = env::var("VAPID_PRIVATE_KEY").ok();
        let vapid_subject = env::var("VAPID_SUBJECT").ok();
        // Railway / Render / Fly set PORT; fall back to BIND_ADDR or the default.
        let bind_addr = env::var("BIND_ADDR").ok().unwrap_or_else(|| {
            env::var("PORT")
                .ok()
                .map(|p| format!("0.0.0.0:{p}"))
                .unwrap_or_else(|| "0.0.0.0:8080".into())
        });
        Ok(Self {
            database_url,
            redis_url,
            jwt_secret,
            cors_origins,
            sui_rpc_url,
            sui_tx_verify_relaxed,
            livekit_api_key,
            livekit_api_secret,
            livekit_url,
            vapid_public_key,
            vapid_private_key,
            vapid_subject,
            bind_addr,
        })
    }
}
