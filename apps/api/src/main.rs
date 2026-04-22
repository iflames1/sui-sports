mod auth_tokens;
mod auth_user;
mod config;
mod error;
mod livekit_token;
mod models;
mod routes;
mod state;
mod sui_rpc;
mod wallet_auth;

use crate::config::Config;
use crate::routes::app_router;
use crate::state::AppState;
use axum::http::{header, HeaderValue, Method};
use dashmap::DashMap;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Arc::new(Config::from_env()?);
    let vapid_ready = config.vapid_public_key.is_some()
        && config.vapid_private_key.is_some()
        && config.vapid_subject.is_some();
    tracing::info!(
        redis_configured = config.redis_url.is_some(),
        vapid_ready,
        "loaded config"
    );
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState {
        config: config.clone(),
        pool,
        chat: Arc::new(DashMap::new()),
    };

    let origins: Vec<HeaderValue> = config
        .cors_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::COOKIE,
            header::ACCEPT,
        ])
        .allow_credentials(true)
        .allow_origin(AllowOrigin::list(origins));

    let app = app_router(state).layer(TraceLayer::new_for_http()).layer(cors);

    let addr: SocketAddr = config.bind_addr.parse()?;
    tracing::info!("listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
