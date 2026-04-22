use crate::error::AppError;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoGrant {
    room: String,
    room_join: bool,
    can_publish: bool,
    can_subscribe: bool,
}

#[derive(Serialize)]
struct LivekitClaims {
    video: VideoGrant,
    sub: String,
    iss: String,
    nbf: u64,
    exp: u64,
}

pub fn mint_access_token(
    api_key: &str,
    api_secret: &str,
    identity: &str,
    room: &str,
) -> Result<String, AppError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::BadRequest("time error".into()))?
        .as_secs();
    let exp = now + 3600;
    let claims = LivekitClaims {
        video: VideoGrant {
            room: room.to_string(),
            room_join: true,
            can_publish: true,
            can_subscribe: true,
        },
        sub: identity.to_string(),
        iss: api_key.to_string(),
        nbf: now,
        exp,
    };
    let mut header = Header::new(Algorithm::HS256);
    header.typ = Some("JWT".into());
    header.kid = Some(api_key.to_string());
    encode(
        &header,
        &claims,
        &EncodingKey::from_secret(api_secret.as_bytes()),
    )
    .map_err(|e| AppError::BadRequest(format!("livekit jwt: {e}")))
}

pub fn dev_join_payload(room: &str, identity: &str) -> serde_json::Value {
    json!({
        "token": null,
        "url": null,
        "room": room,
        "identity": identity,
        "dev": true,
        "message": "Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL for real tokens"
    })
}
