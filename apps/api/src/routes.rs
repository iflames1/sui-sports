use crate::auth_tokens::{issue_session, verify_session};
use crate::auth_user::AuthUser;
use crate::error::{AppError, AppResult};
use crate::livekit_token::{dev_join_payload, mint_access_token};
use crate::models::{
    AccessRule, AthleteProfileRow, ContentItemRow, ContentType, LiveSessionRow, NotificationRow,
    SubscriptionStatus, SubscriptionTierRow, UserRole, UserRow,
};
use crate::state::AppState;
use crate::sui_rpc;
use crate::wallet_auth::subject_from_wallet_address;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::header::SET_COOKIE;
use axum::response::IntoResponse;
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

const ATHLETE_COLS: &str = "id, user_id, display_name, bio, sport, verified, verification_metadata, social_links, avatar_url, banner_url, verification_requested_at, verified_at, created_at";
const LIVE_COLS: &str =
    "id, athlete_user_id, title, starts_at, provider_room_id, visibility_tier_id, status, ended_at, created_at";

pub fn app_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/config/vapid-public-key", get(vapid_pub_key))
        .route("/auth/wallet/session", post(wallet_session))
        .route("/me", get(me))
        .route("/athletes", get(list_athletes))
        .route("/athletes/register", post(register_athlete))
        .route("/athletes/{id}", get(get_athlete))
        .route("/athletes/{id}/stats", get(athlete_stats))
        .route("/athletes/me/profile", patch(update_my_profile))
        .route(
            "/athletes/me/request-verification",
            post(request_verification),
        )
        .route("/athletes/{id}/follow", post(follow).delete(unfollow))
        .route("/athletes/{id}/tiers", get(list_tiers))
        .route("/athletes/{id}/live-sessions", get(list_athlete_lives))
        .route("/admin/athletes/{id}/verify", post(admin_verify))
        .route("/admin/athletes/pending", get(admin_pending_athletes))
        .route("/tiers", post(create_tier))
        .route("/subscriptions/sui/prepare", post(sub_prepare))
        .route("/subscriptions/sui/confirm", post(sub_confirm))
        .route("/subscriptions/me", get(sub_me))
        .route("/follows/me", get(follows_me))
        .route("/live-sessions", get(list_live_sessions).post(create_live_session))
        .route("/live-sessions/{id}", get(get_live_session))
        .route("/live-sessions/{id}/end", post(end_live_session))
        .route("/live-sessions/{id}/join-token", post(join_token))
        .route("/content/feed", get(content_feed))
        .route("/content", post(create_content))
        .route("/notifications", get(list_notifications))
        .route("/notifications/unread-count", get(unread_count))
        .route("/notifications/read-all", post(mark_all_read))
        .route("/notifications/{id}/read", post(mark_notif_read))
        .route("/notifications/push-subscribe", post(push_subscribe))
        .route("/ws/sessions/{session_id}/chat", get(chat_ws))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

async fn vapid_pub_key(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({ "publicKey": state.config.vapid_public_key.clone() }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSessionReq {
    pub wallet_address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletSessionRes {
    pub user_id: Uuid,
    pub role: String,
    /// JWT for cross-origin clients (cookie is also set when applicable).
    pub token: String,
}

async fn wallet_session(
    State(state): State<AppState>,
    Json(body): Json<WalletSessionReq>,
) -> AppResult<impl IntoResponse> {
    let subject = subject_from_wallet_address(&body.wallet_address)?;
    let user = upsert_user(
        &state.pool,
        None,
        "wallet",
        &subject,
        Some(&body.wallet_address),
    )
    .await?;
    if let Ok(bootstrap) = std::env::var("BOOTSTRAP_ADMIN_ZKLOGIN_SUBJECT") {
        if bootstrap == subject {
            sqlx::query("UPDATE users SET role = 'admin' WHERE id = $1")
                .bind(user.id)
                .execute(&state.pool)
                .await?;
        }
    }
    let user: UserRow = sqlx::query_as(
        r#"SELECT id, email, role, social_provider, zklogin_subject, wallet_address, created_at FROM users WHERE id = $1"#,
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await?;
    let token = issue_session(&state.config.jwt_secret, user.id, user.role)?;
    let cookie = format!(
        "sui_sports_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
    );
    let mut res = Json(WalletSessionRes {
        user_id: user.id,
        role: match user.role {
            UserRole::Fan => "fan".into(),
            UserRole::Athlete => "athlete".into(),
            UserRole::Admin => "admin".into(),
        },
        token: token.clone(),
    })
    .into_response();
    res.headers_mut().insert(SET_COOKIE, cookie.parse().unwrap());
    Ok(res)
}

async fn upsert_user(
    pool: &PgPool,
    email: Option<&str>,
    provider: &str,
    subject: &str,
    wallet: Option<&str>,
) -> AppResult<UserRow> {
    let existing: Option<UserRow> = sqlx::query_as(
        r#"SELECT id, email, role, social_provider, zklogin_subject, wallet_address, created_at
           FROM users WHERE zklogin_subject = $1"#,
    )
    .bind(subject)
    .fetch_optional(pool)
    .await?;
    if let Some(mut u) = existing {
        if wallet.is_some() {
            sqlx::query("UPDATE users SET wallet_address = COALESCE($1, wallet_address), email = COALESCE($2, email) WHERE id = $3")
                .bind(wallet)
                .bind(email)
                .bind(u.id)
                .execute(pool)
                .await?;
            u.wallet_address = wallet.map(|s| s.to_string()).or(u.wallet_address);
            u.email = email.map(|s| s.to_string()).or(u.email);
        }
        return Ok(u);
    }
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO users (id, email, role, social_provider, zklogin_subject, wallet_address)
           VALUES ($1, $2, 'fan', $3, $4, $5)"#,
    )
    .bind(id)
    .bind(email)
    .bind(provider)
    .bind(subject)
    .bind(wallet)
    .execute(pool)
    .await?;
    let u: UserRow = sqlx::query_as(
        r#"SELECT id, email, role, social_provider, zklogin_subject, wallet_address, created_at FROM users WHERE id = $1"#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(u)
}

async fn me(State(state): State<AppState>, auth: AuthUser) -> AppResult<Json<UserRow>> {
    let u: UserRow = sqlx::query_as(
        r#"SELECT id, email, role, social_provider, zklogin_subject, wallet_address, created_at FROM users WHERE id = $1"#,
    )
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(u))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAthletesQuery {
    q: Option<String>,
    verified: Option<bool>,
    sport: Option<String>,
    limit: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AthleteListItem {
    pub user_id: Uuid,
    pub display_name: String,
    pub sport: Option<String>,
    pub bio: Option<String>,
    pub verified: bool,
    pub avatar_url: Option<String>,
    pub follower_count: i64,
}

async fn list_athletes(
    State(state): State<AppState>,
    Query(q): Query<ListAthletesQuery>,
) -> AppResult<Json<Vec<AthleteListItem>>> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let search = q.q.as_ref().map(|s| format!("%{}%", s.trim().to_lowercase()));
    let rows: Vec<AthleteListItem> = sqlx::query_as(
        r#"SELECT p.user_id,
                  p.display_name,
                  p.sport,
                  p.bio,
                  p.verified,
                  p.avatar_url,
                  COALESCE((SELECT COUNT(*) FROM follows f WHERE f.athlete_user_id = p.user_id), 0)::bigint
                  AS follower_count
           FROM athlete_profiles p
           WHERE ($1::bool IS NULL OR p.verified = $1)
             AND ($2::text IS NULL OR p.sport ILIKE $2)
             AND ($3::text IS NULL
                  OR LOWER(p.display_name) LIKE $3
                  OR LOWER(COALESCE(p.sport, '')) LIKE $3
                  OR LOWER(COALESCE(p.bio, '')) LIKE $3)
           ORDER BY p.verified DESC, p.created_at DESC
           LIMIT $4"#,
    )
    .bind(q.verified)
    .bind(q.sport.as_deref())
    .bind(search.as_deref())
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

async fn register_athlete(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE users SET role = 'athlete' WHERE id = $1 AND role = 'fan'")
        .bind(auth.user_id)
        .execute(&state.pool)
        .await?;
    let exists: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM athlete_profiles WHERE user_id = $1")
            .bind(auth.user_id)
            .fetch_optional(&state.pool)
            .await?;
    if exists.is_none() {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO athlete_profiles (id, user_id, display_name, bio, sport, verified)
               VALUES ($1, $2, $3, '', NULL, false)"#,
        )
        .bind(id)
        .bind(auth.user_id)
        .bind(format!("Athlete {}", &auth.user_id.to_string()[..8]))
        .execute(&state.pool)
        .await?;
    }
    Ok(Json(json!({ "ok": true })))
}

async fn get_athlete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AthleteProfileRow>> {
    let sql = format!("SELECT {ATHLETE_COLS} FROM athlete_profiles WHERE user_id = $1");
    let row: AthleteProfileRow = sqlx::query_as(&sql)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AthleteStats {
    pub user_id: Uuid,
    pub follower_count: i64,
    pub active_subscriber_count: i64,
    pub content_count: i64,
    pub is_following: bool,
    pub active_subscription_tier_ids: Vec<Uuid>,
}

async fn athlete_stats(
    State(state): State<AppState>,
    auth: Option<AuthUser>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<AthleteStats>> {
    let follower_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM follows WHERE athlete_user_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;
    let active_subscriber_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT s.fan_user_id)::bigint
           FROM subscriptions s
           JOIN subscription_tiers t ON t.id = s.tier_id
           WHERE t.athlete_user_id = $1 AND s.status = 'active' AND s.valid_until > now()"#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let content_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM content_items WHERE athlete_user_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;
    let (is_following, sub_tier_ids) = if let Some(u) = &auth {
        let follows: Option<(Uuid,)> = sqlx::query_as(
            "SELECT fan_user_id FROM follows WHERE fan_user_id = $1 AND athlete_user_id = $2",
        )
        .bind(u.user_id)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
        let tiers: Vec<(Uuid,)> = sqlx::query_as(
            r#"SELECT s.tier_id FROM subscriptions s
               JOIN subscription_tiers t ON t.id = s.tier_id
               WHERE s.fan_user_id = $1
                 AND t.athlete_user_id = $2
                 AND s.status = 'active'
                 AND s.valid_until > now()"#,
        )
        .bind(u.user_id)
        .bind(id)
        .fetch_all(&state.pool)
        .await?;
        (
            follows.is_some(),
            tiers.into_iter().map(|(t,)| t).collect(),
        )
    } else {
        (false, Vec::new())
    };
    Ok(Json(AthleteStats {
        user_id: id,
        follower_count,
        active_subscriber_count,
        content_count,
        is_following,
        active_subscription_tier_ids: sub_tier_ids,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProfileReq {
    display_name: Option<String>,
    bio: Option<String>,
    sport: Option<String>,
    social_links: Option<serde_json::Value>,
    avatar_url: Option<String>,
    banner_url: Option<String>,
}

async fn update_my_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateProfileReq>,
) -> AppResult<Json<AthleteProfileRow>> {
    if auth.role != UserRole::Athlete && auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    sqlx::query(
        r#"UPDATE athlete_profiles SET
              display_name = COALESCE($1, display_name),
              bio = COALESCE($2, bio),
              sport = COALESCE($3, sport),
              social_links = COALESCE($4, social_links),
              avatar_url = COALESCE($5, avatar_url),
              banner_url = COALESCE($6, banner_url)
           WHERE user_id = $7"#,
    )
    .bind(body.display_name.as_deref())
    .bind(body.bio.as_deref())
    .bind(body.sport.as_deref())
    .bind(body.social_links.clone())
    .bind(body.avatar_url.as_deref())
    .bind(body.banner_url.as_deref())
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    let sql = format!("SELECT {ATHLETE_COLS} FROM athlete_profiles WHERE user_id = $1");
    let row: AthleteProfileRow = sqlx::query_as(&sql)
        .bind(auth.user_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(row))
}

async fn request_verification(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    if auth.role != UserRole::Athlete {
        return Err(AppError::Forbidden);
    }
    sqlx::query(
        r#"UPDATE athlete_profiles
           SET verification_requested_at = COALESCE(verification_requested_at, now())
           WHERE user_id = $1 AND verified = false"#,
    )
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn follow(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if auth.user_id == id {
        return Err(AppError::BadRequest("cannot follow yourself".into()));
    }
    let affected = sqlx::query(
        r#"INSERT INTO follows (fan_user_id, athlete_user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING"#,
    )
    .bind(auth.user_id)
    .bind(id)
    .execute(&state.pool)
    .await?
    .rows_affected();
    if affected > 0 {
        let nid = Uuid::new_v4();
        let _ = sqlx::query(
            r#"INSERT INTO notifications (id, user_id, type, payload_json, delivery_state)
               VALUES ($1, $2, 'new_follower', $3, 'pending')"#,
        )
        .bind(nid)
        .bind(id)
        .bind(json!({"fanUserId": auth.user_id}))
        .execute(&state.pool)
        .await;
    }
    Ok(Json(json!({ "ok": true, "isFollowing": true })))
}

async fn unfollow(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(r#"DELETE FROM follows WHERE fan_user_id = $1 AND athlete_user_id = $2"#)
        .bind(auth.user_id)
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true, "isFollowing": false })))
}

async fn follows_me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<AthleteListItem>>> {
    let rows: Vec<AthleteListItem> = sqlx::query_as(
        r#"SELECT p.user_id,
                  p.display_name,
                  p.sport,
                  p.bio,
                  p.verified,
                  p.avatar_url,
                  COALESCE((SELECT COUNT(*) FROM follows f2 WHERE f2.athlete_user_id = p.user_id), 0)::bigint
                  AS follower_count
           FROM follows f
           JOIN athlete_profiles p ON p.user_id = f.athlete_user_id
           WHERE f.fan_user_id = $1
           ORDER BY f.created_at DESC"#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

async fn list_tiers(
    State(state): State<AppState>,
    Path(athlete_user_id): Path<Uuid>,
) -> AppResult<Json<Vec<SubscriptionTierRow>>> {
    let rows: Vec<SubscriptionTierRow> = sqlx::query_as(
        r#"SELECT id, athlete_user_id, name, price_mist, billing_period_days, perks_json, onchain_tier_id, created_at
           FROM subscription_tiers WHERE athlete_user_id = $1 ORDER BY price_mist ASC, created_at"#,
    )
    .bind(athlete_user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTierReq {
    name: String,
    price_mist: i64,
    billing_period_days: i32,
    perks: Option<serde_json::Value>,
    onchain_tier_id: Option<String>,
}

async fn create_tier(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateTierReq>,
) -> AppResult<Json<SubscriptionTierRow>> {
    if auth.role != UserRole::Athlete && auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    if body.price_mist < 0 {
        return Err(AppError::BadRequest("priceMist must be >= 0".into()));
    }
    if body.billing_period_days <= 0 {
        return Err(AppError::BadRequest("billingPeriodDays must be > 0".into()));
    }
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO subscription_tiers (id, athlete_user_id, name, price_mist, billing_period_days, perks_json, onchain_tier_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(body.name.trim())
    .bind(body.price_mist)
    .bind(body.billing_period_days)
    .bind(body.perks.clone())
    .bind(body.onchain_tier_id.as_deref())
    .execute(&state.pool)
    .await?;
    let row: SubscriptionTierRow = sqlx::query_as(
        r#"SELECT id, athlete_user_id, name, price_mist, billing_period_days, perks_json, onchain_tier_id, created_at
           FROM subscription_tiers WHERE id = $1"#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SubPrepareRes {
    pub tier_id: Uuid,
    pub note: &'static str,
    pub move_call_hint: serde_json::Value,
}

async fn sub_prepare(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<SubPrepareRes>> {
    let tier_id = body
        .get("tierId")
        .or_else(|| body.get("tier_id"))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("tierId required".into()))?;
    let tier: SubscriptionTierRow = sqlx::query_as(
        r#"SELECT id, athlete_user_id, name, price_mist, billing_period_days, perks_json, onchain_tier_id, created_at
           FROM subscription_tiers WHERE id = $1"#,
    )
    .bind(tier_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let fan_id = auth.user_id;
    Ok(Json(SubPrepareRes {
        tier_id,
        note: "Build & sign a Sui PTB client-side that calls your Move package purchase_subscription; then POST /subscriptions/sui/confirm",
        move_call_hint: json!({
            "package": "<DEPLOYED_PACKAGE_ID>",
            "module": "subscription",
            "function": "purchase_subscription",
            "args": { "tier_object": tier.onchain_tier_id, "fan_user_id": fan_id }
        }),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubConfirmReq {
    tx_digest: String,
    tier_id: Uuid,
    entitlement_object_id: Option<String>,
    payer_wallet: Option<String>,
}

async fn sub_confirm(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SubConfirmReq>,
) -> AppResult<Json<serde_json::Value>> {
    let ok = if state.config.sui_tx_verify_relaxed {
        true
    } else {
        sui_rpc::transaction_succeeded(&state.config.sui_rpc_url, &body.tx_digest)
            .await
            .map_err(|e| AppError::BadRequest(format!("sui verify: {e}")))?
    };
    if !ok {
        return Err(AppError::BadRequest("transaction not successful".into()));
    }
    let tier: SubscriptionTierRow = sqlx::query_as(
        r#"SELECT id, athlete_user_id, name, price_mist, billing_period_days, perks_json, onchain_tier_id, created_at
           FROM subscription_tiers WHERE id = $1"#,
    )
    .bind(body.tier_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    let until = OffsetDateTime::now_utc() + time::Duration::days(tier.billing_period_days as i64);
    let sub_id = Uuid::new_v4();
    sqlx::query(r#"DELETE FROM subscriptions WHERE fan_user_id = $1 AND tier_id = $2"#)
        .bind(auth.user_id)
        .bind(tier.id)
        .execute(&state.pool)
        .await?;
    sqlx::query(
        r#"INSERT INTO subscriptions (id, fan_user_id, tier_id, status, valid_until, payer_wallet, last_purchase_tx_digest, entitlement_object_id, renewal_mode)
           VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, 'manual')"#,
    )
    .bind(sub_id)
    .bind(auth.user_id)
    .bind(tier.id)
    .bind(until)
    .bind(body.payer_wallet.as_deref())
    .bind(&body.tx_digest)
    .bind(body.entitlement_object_id.as_deref())
    .execute(&state.pool)
    .await?;

    let nid = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO notifications (id, user_id, type, payload_json, delivery_state)
           VALUES ($1, $2, 'new_subscriber', $3, 'pending')"#,
    )
    .bind(nid)
    .bind(tier.athlete_user_id)
    .bind(json!({"fanUserId": auth.user_id, "tierId": tier.id, "tierName": tier.name}))
    .execute(&state.pool)
    .await;

    Ok(Json(json!({
        "subscriptionId": sub_id,
        "validUntil": until.to_string(),
        "tierId": tier.id,
    })))
}

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
struct FanSubItem {
    pub id: Uuid,
    pub tier_id: Uuid,
    pub tier_name: String,
    pub athlete_user_id: Uuid,
    pub athlete_display_name: String,
    pub valid_until: OffsetDateTime,
    pub status: SubscriptionStatus,
}

async fn sub_me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<serde_json::Value>>> {
    let rows: Vec<FanSubItem> = sqlx::query_as(
        r#"SELECT s.id, s.tier_id, t.name as tier_name,
                  t.athlete_user_id, p.display_name as athlete_display_name,
                  s.valid_until, s.status
           FROM subscriptions s
           JOIN subscription_tiers t ON t.id = s.tier_id
           LEFT JOIN athlete_profiles p ON p.user_id = t.athlete_user_id
           WHERE s.fan_user_id = $1 AND s.status = 'active'
           ORDER BY s.valid_until DESC"#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    let out: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            let st = match r.status {
                SubscriptionStatus::Active => "active",
                SubscriptionStatus::Expired => "expired",
                SubscriptionStatus::Cancelled => "cancelled",
            };
            json!({
                "id": r.id,
                "tierId": r.tier_id,
                "tierName": r.tier_name,
                "athleteUserId": r.athlete_user_id,
                "athleteDisplayName": r.athlete_display_name,
                "validUntil": r.valid_until.to_string(),
                "status": st,
            })
        })
        .collect();
    Ok(Json(out))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveSessionReq {
    title: String,
    starts_at: String,
    visibility_tier_id: Option<Uuid>,
}

async fn create_live_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<LiveSessionReq>,
) -> AppResult<Json<LiveSessionRow>> {
    if auth.role != UserRole::Athlete && auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let starts =
        OffsetDateTime::parse(&body.starts_at, &time::format_description::well_known::Rfc3339)
            .map_err(|_| AppError::BadRequest("invalid startsAt".into()))?;
    let id = Uuid::new_v4();
    let room = format!("live-{id}");
    sqlx::query(
        r#"INSERT INTO live_sessions (id, athlete_user_id, title, starts_at, provider_room_id, visibility_tier_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')"#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(body.title.trim())
    .bind(starts)
    .bind(&room)
    .bind(body.visibility_tier_id)
    .execute(&state.pool)
    .await?;
    let sql = format!("SELECT {LIVE_COLS} FROM live_sessions WHERE id = $1");
    let row: LiveSessionRow = sqlx::query_as(&sql).bind(id).fetch_one(&state.pool).await?;

    let followers: Vec<(Uuid,)> =
        sqlx::query_as("SELECT fan_user_id FROM follows WHERE athlete_user_id = $1")
            .bind(auth.user_id)
            .fetch_all(&state.pool)
            .await?;
    for (fan,) in followers {
        let nid = Uuid::new_v4();
        let _ = sqlx::query(
            r#"INSERT INTO notifications (id, user_id, type, payload_json, delivery_state)
               VALUES ($1, $2, 'live_scheduled', $3, 'pending')"#,
        )
        .bind(nid)
        .bind(fan)
        .bind(json!({"sessionId": id, "athleteUserId": auth.user_id, "title": body.title.trim(), "startsAt": starts.to_string()}))
        .execute(&state.pool)
        .await;
    }
    Ok(Json(row))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListLiveQuery {
    athlete_user_id: Option<Uuid>,
    status: Option<String>,
    limit: Option<i64>,
}

async fn list_live_sessions(
    State(state): State<AppState>,
    Query(q): Query<ListLiveQuery>,
) -> AppResult<Json<Vec<LiveSessionRow>>> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let sql = format!(
        "SELECT {LIVE_COLS} FROM live_sessions
         WHERE ($1::uuid IS NULL OR athlete_user_id = $1)
           AND ($2::text IS NULL OR status = $2)
         ORDER BY starts_at ASC
         LIMIT $3"
    );
    let rows: Vec<LiveSessionRow> = sqlx::query_as(&sql)
        .bind(q.athlete_user_id)
        .bind(q.status.as_deref())
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

async fn list_athlete_lives(
    State(state): State<AppState>,
    Path(athlete_user_id): Path<Uuid>,
) -> AppResult<Json<Vec<LiveSessionRow>>> {
    let sql = format!(
        "SELECT {LIVE_COLS} FROM live_sessions WHERE athlete_user_id = $1 ORDER BY starts_at DESC LIMIT 50"
    );
    let rows: Vec<LiveSessionRow> = sqlx::query_as(&sql)
        .bind(athlete_user_id)
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(rows))
}

async fn get_live_session(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<LiveSessionRow>> {
    let sql = format!("SELECT {LIVE_COLS} FROM live_sessions WHERE id = $1");
    let row: LiveSessionRow = sqlx::query_as(&sql)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

async fn end_live_session(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let sql = format!("SELECT {LIVE_COLS} FROM live_sessions WHERE id = $1");
    let row: LiveSessionRow = sqlx::query_as(&sql)
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    if row.athlete_user_id != auth.user_id && auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    sqlx::query("UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct JoinTokenReq {}

async fn join_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(session_id): Path<Uuid>,
    Json(_): Json<JoinTokenReq>,
) -> AppResult<Json<serde_json::Value>> {
    let sql = format!("SELECT {LIVE_COLS} FROM live_sessions WHERE id = $1");
    let session: LiveSessionRow = sqlx::query_as(&sql)
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(tier_id) = session.visibility_tier_id {
        let ok: Option<(Uuid,)> = sqlx::query_as(
            r#"SELECT id FROM subscriptions WHERE fan_user_id = $1 AND tier_id = $2 AND status = 'active' AND valid_until > now()"#,
        )
        .bind(auth.user_id)
        .bind(tier_id)
        .fetch_optional(&state.pool)
        .await?;
        if ok.is_none() && auth.user_id != session.athlete_user_id {
            return Err(AppError::Forbidden);
        }
    }
    if session.athlete_user_id == auth.user_id && session.status == "scheduled" {
        let _ = sqlx::query("UPDATE live_sessions SET status = 'live' WHERE id = $1")
            .bind(session.id)
            .execute(&state.pool)
            .await;
    }
    let room = session.provider_room_id.as_deref().unwrap_or("room");
    let identity = auth.user_id.to_string();
    if let (Some(k), Some(s)) = (&state.config.livekit_api_key, &state.config.livekit_api_secret) {
        let token = mint_access_token(k, s, &identity, room)?;
        return Ok(Json(json!({
            "token": token,
            "url": state.config.livekit_url,
            "room": room,
            "identity": identity,
            "isHost": session.athlete_user_id == auth.user_id,
        })));
    }
    let mut payload = dev_join_payload(room, &identity);
    payload["isHost"] = json!(session.athlete_user_id == auth.user_id);
    Ok(Json(payload))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentFeedQuery {
    athlete_user_id: Option<Uuid>,
    following: Option<bool>,
}

async fn content_feed(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ContentFeedQuery>,
) -> AppResult<Json<Vec<ContentItemRow>>> {
    let rows: Vec<ContentItemRow> = if let Some(aid) = q.athlete_user_id {
        sqlx::query_as(
            r#"SELECT id, athlete_user_id, type, title, media_url, access_rule, required_tier_id, created_at
               FROM content_items WHERE athlete_user_id = $1 ORDER BY created_at DESC LIMIT 100"#,
        )
        .bind(aid)
        .fetch_all(&state.pool)
        .await?
    } else if q.following.unwrap_or(false) {
        sqlx::query_as(
            r#"SELECT c.id, c.athlete_user_id, c.type, c.title, c.media_url, c.access_rule, c.required_tier_id, c.created_at
               FROM content_items c
               JOIN follows f ON f.athlete_user_id = c.athlete_user_id
               WHERE f.fan_user_id = $1
               ORDER BY c.created_at DESC LIMIT 100"#,
        )
        .bind(auth.user_id)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as(
            r#"SELECT id, athlete_user_id, type, title, media_url, access_rule, required_tier_id, created_at
               FROM content_items ORDER BY created_at DESC LIMIT 100"#,
        )
        .fetch_all(&state.pool)
        .await?
    };
    let mut out = Vec::new();
    for item in rows {
        if item.access_rule == AccessRule::Free {
            out.push(item);
            continue;
        }
        if item.athlete_user_id == auth.user_id {
            out.push(item);
            continue;
        }
        if item.access_rule == AccessRule::Tier {
            if let Some(tid) = item.required_tier_id {
                let ok: Option<(Uuid,)> = sqlx::query_as(
                    r#"SELECT id FROM subscriptions WHERE fan_user_id = $1 AND tier_id = $2 AND status = 'active' AND valid_until > now()"#,
                )
                .bind(auth.user_id)
                .bind(tid)
                .fetch_optional(&state.pool)
                .await?;
                if ok.is_some() {
                    out.push(item);
                }
            }
        }
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateContentReq {
    title: String,
    #[serde(rename = "type")]
    content_type: String,
    media_url: Option<String>,
    access_rule: String,
    required_tier_id: Option<Uuid>,
}

async fn create_content(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateContentReq>,
) -> AppResult<Json<ContentItemRow>> {
    if auth.role != UserRole::Athlete && auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title required".into()));
    }
    let ct = match body.content_type.as_str() {
        "post" => ContentType::Post,
        "clip" => ContentType::Clip,
        "file" => ContentType::File,
        "replay" => ContentType::Replay,
        _ => return Err(AppError::BadRequest("invalid type".into())),
    };
    let ar = match body.access_rule.as_str() {
        "free" => AccessRule::Free,
        "tier" => AccessRule::Tier,
        "live_replay" => AccessRule::LiveReplay,
        _ => return Err(AppError::BadRequest("invalid accessRule".into())),
    };
    if matches!(ar, AccessRule::Tier) && body.required_tier_id.is_none() {
        return Err(AppError::BadRequest(
            "requiredTierId required for tier access".into(),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO content_items (id, athlete_user_id, type, title, media_url, access_rule, required_tier_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(ct)
    .bind(body.title.trim())
    .bind(body.media_url.as_deref())
    .bind(ar)
    .bind(body.required_tier_id)
    .execute(&state.pool)
    .await?;
    let row: ContentItemRow = sqlx::query_as(
        r#"SELECT id, athlete_user_id, type, title, media_url, access_rule, required_tier_id, created_at
           FROM content_items WHERE id = $1"#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    let followers: Vec<(Uuid,)> =
        sqlx::query_as("SELECT fan_user_id FROM follows WHERE athlete_user_id = $1")
            .bind(auth.user_id)
            .fetch_all(&state.pool)
            .await?;
    for (fan,) in followers {
        let nid = Uuid::new_v4();
        let _ = sqlx::query(
            r#"INSERT INTO notifications (id, user_id, type, payload_json, delivery_state)
               VALUES ($1, $2, 'new_content', $3, 'pending')"#,
        )
        .bind(nid)
        .bind(fan)
        .bind(json!({"contentId": id, "athleteUserId": auth.user_id, "title": body.title.trim()}))
        .execute(&state.pool)
        .await;
    }

    Ok(Json(row))
}

async fn list_notifications(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<NotificationRow>>> {
    let rows: Vec<NotificationRow> = sqlx::query_as(
        r#"SELECT id, user_id, type, payload_json, read_at, delivery_state, created_at
           FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100"#,
    )
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

async fn unread_count(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(auth.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({ "count": count })))
}

async fn mark_notif_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        r#"UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn mark_all_read(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(auth.user_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushSubReq {
    endpoint: String,
    p256dh: String,
    auth: String,
}

async fn push_subscribe(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PushSubReq>,
) -> AppResult<Json<serde_json::Value>> {
    let id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth"#,
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&body.endpoint)
    .bind(&body.p256dh)
    .bind(&body.auth)
    .execute(&state.pool)
    .await?;
    let _ = &state.config;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct WsAuth {
    token: String,
}

async fn chat_ws(
    ws: WebSocketUpgrade,
    Path(session_id): Path<Uuid>,
    Query(q): Query<WsAuth>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let claims = match verify_session(&state.config.jwt_secret, &q.token) {
        Ok(c) => c,
        Err(_) => return AppError::Unauthorized.into_response(),
    };
    let user_id = match Uuid::parse_str(&claims.sub) {
        Ok(u) => u,
        Err(_) => return AppError::Unauthorized.into_response(),
    };
    ws.on_upgrade(move |socket| handle_chat_socket(socket, state, session_id, user_id))
}

async fn handle_chat_socket(socket: WebSocket, state: AppState, session_id: Uuid, user_id: Uuid) {
    let tx = state.chat_sender(session_id);
    let mut rx = tx.subscribe();
    let pool = state.pool.clone();
    let tx_send = tx.clone();
    let (mut ws_write, mut ws_read) = socket.split();

    if let Ok(rows) = sqlx::query_as::<_, (Uuid, String, OffsetDateTime)>(
        r#"SELECT sender_user_id, message, created_at
           FROM live_chat_messages
           WHERE session_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    )
    .bind(session_id)
    .fetch_all(&pool)
    .await
    {
        for (sender, msg, at) in rows.into_iter().rev() {
            let payload = json!({
                "userId": sender,
                "text": msg,
                "at": at.to_string(),
                "historical": true,
            })
            .to_string();
            if ws_write.send(Message::Text(payload.into())).await.is_err() {
                return;
            }
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if ws_write.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_read.next().await {
            if let Message::Text(t) = msg {
                let line = t.trim();
                if line.is_empty() {
                    continue;
                }
                let truncated: String = line.chars().take(500).collect();
                let payload = json!({
                    "userId": user_id,
                    "text": truncated,
                    "at": OffsetDateTime::now_utc().to_string(),
                });
                let s = payload.to_string();
                let _ = sqlx::query(
                    r#"INSERT INTO live_chat_messages (session_id, sender_user_id, message) VALUES ($1, $2, $3)"#,
                )
                .bind(session_id)
                .bind(user_id)
                .bind(&truncated)
                .execute(&pool)
                .await;
                let _ = tx_send.send(s);
            }
        }
    });
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}

async fn admin_verify(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(athlete_user_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    sqlx::query(
        r#"UPDATE athlete_profiles
           SET verified = true,
               verified_at = now(),
               verification_metadata = $1
           WHERE user_id = $2"#,
    )
    .bind(json!({"byAdmin": auth.user_id}))
    .bind(athlete_user_id)
    .execute(&state.pool)
    .await?;
    let nid = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO notifications (id, user_id, type, payload_json, delivery_state)
           VALUES ($1, $2, 'verified', $3, 'pending')"#,
    )
    .bind(nid)
    .bind(athlete_user_id)
    .bind(json!({"byAdmin": auth.user_id}))
    .execute(&state.pool)
    .await;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_pending_athletes(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<AthleteProfileRow>>> {
    if auth.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    let sql = format!(
        "SELECT {ATHLETE_COLS} FROM athlete_profiles
         WHERE verified = false
         ORDER BY verification_requested_at DESC NULLS LAST, created_at DESC
         LIMIT 200"
    );
    let rows: Vec<AthleteProfileRow> = sqlx::query_as(&sql).fetch_all(&state.pool).await?;
    Ok(Json(rows))
}
