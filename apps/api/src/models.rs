use serde::{Deserialize, Serialize};
use sqlx::Type;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
pub enum UserRole {
    Fan,
    Athlete,
    Admin,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    pub id: Uuid,
    pub email: Option<String>,
    pub role: UserRole,
    pub social_provider: Option<String>,
    pub zklogin_subject: Option<String>,
    pub wallet_address: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AthleteProfileRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub bio: Option<String>,
    pub sport: Option<String>,
    pub verified: bool,
    pub verification_metadata: Option<serde_json::Value>,
    pub social_links: Option<serde_json::Value>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub verification_requested_at: Option<OffsetDateTime>,
    pub verified_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "subscription_status", rename_all = "lowercase")]
pub enum SubscriptionStatus {
    Active,
    Expired,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionTierRow {
    pub id: Uuid,
    pub athlete_user_id: Uuid,
    pub name: String,
    pub price_mist: i64,
    pub billing_period_days: i32,
    pub perks_json: Option<serde_json::Value>,
    pub onchain_tier_id: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LiveSessionRow {
    pub id: Uuid,
    pub athlete_user_id: Uuid,
    pub title: String,
    pub starts_at: OffsetDateTime,
    pub provider_room_id: Option<String>,
    pub visibility_tier_id: Option<Uuid>,
    pub status: String,
    pub ended_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "content_type", rename_all = "lowercase")]
pub enum ContentType {
    Post,
    Clip,
    File,
    Replay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "access_rule", rename_all = "snake_case")]
pub enum AccessRule {
    Free,
    Tier,
    LiveReplay,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContentItemRow {
    pub id: Uuid,
    pub athlete_user_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub content_type: ContentType,
    pub title: String,
    pub media_url: Option<String>,
    pub access_rule: AccessRule,
    pub required_tier_id: Option<Uuid>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRow {
    pub id: Uuid,
    pub user_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub notif_type: String,
    pub payload_json: serde_json::Value,
    pub read_at: Option<OffsetDateTime>,
    pub delivery_state: String,
    pub created_at: OffsetDateTime,
}
