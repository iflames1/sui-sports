use crate::auth_tokens::{parse_role, verify_session};
use crate::error::AppError;
use crate::models::UserRole;
use crate::state::AppState;
use axum::extract::{FromRequestParts, OptionalFromRequestParts};
use axum::http::{header, request::Parts};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub role: UserRole,
}

fn try_from_parts(parts: &Parts, jwt_secret: &str) -> Option<AuthUser> {
    let token = bearer_token(parts).or_else(|| cookie_token(parts, "sui_sports_session"))?;
    let claims = verify_session(jwt_secret, &token).ok()?;
    let user_id = Uuid::parse_str(&claims.sub).ok()?;
    let role = parse_role(&claims.role)?;
    Some(AuthUser { user_id, role })
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let user = try_from_parts(parts, &state.config.jwt_secret);
        async move { user.ok_or(AppError::Unauthorized) }
    }
}

impl OptionalFromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Option<Self>, Self::Rejection>> + Send {
        let user = try_from_parts(parts, &state.config.jwt_secret);
        async move { Ok(user) }
    }
}

fn bearer_token(parts: &Parts) -> Option<String> {
    let h = parts.headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let rest = h.strip_prefix("Bearer ")?;
    Some(rest.to_string())
}

fn cookie_token(parts: &Parts, name: &str) -> Option<String> {
    let cookie_header = parts.headers.get(header::COOKIE)?.to_str().ok()?;
    let prefix = format!("{name}=");
    for part in cookie_header.split(';') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix(&prefix) {
            return Some(v.to_string());
        }
    }
    None
}
