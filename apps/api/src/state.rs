use crate::config::Config;
use dashmap::DashMap;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub pool: PgPool,
    /// Per live session: broadcast chat lines as JSON strings.
    pub chat: Arc<DashMap<Uuid, broadcast::Sender<String>>>,
}

impl AppState {
    pub fn chat_sender(&self, session_id: Uuid) -> broadcast::Sender<String> {
        self.chat
            .entry(session_id)
            .or_insert_with(|| broadcast::channel(512).0)
            .clone()
    }
}
