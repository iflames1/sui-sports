use crate::error::AppError;
use crate::models::UserRole;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionClaims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
}

pub fn issue_session(jwt_secret: &str, user_id: Uuid, role: UserRole) -> anyhow::Result<String> {
    let exp = (time::OffsetDateTime::now_utc() + time::Duration::days(30)).unix_timestamp() as usize;
    let claims = SessionClaims {
        sub: user_id.to_string(),
        role: match role {
            UserRole::Fan => "fan",
            UserRole::Athlete => "athlete",
            UserRole::Admin => "admin",
        }
        .to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(Into::into)
}

pub fn verify_session(jwt_secret: &str, token: &str) -> Result<SessionClaims, AppError> {
    let data = decode::<SessionClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?;
    Ok(data.claims)
}

pub fn parse_role(s: &str) -> Option<UserRole> {
    match s {
        "fan" => Some(UserRole::Fan),
        "athlete" => Some(UserRole::Athlete),
        "admin" => Some(UserRole::Admin),
        _ => None,
    }
}
