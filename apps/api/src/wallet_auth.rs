use crate::error::{AppError, AppResult};

/// Stable per-wallet subject stored in `users.zklogin_subject` (column name kept for DB compatibility).
pub fn subject_from_wallet_address(wallet_address: &str) -> AppResult<String> {
    let w = wallet_address.trim();
    if w.is_empty() {
        return Err(AppError::BadRequest("wallet_address is required".into()));
    }
    if !w.starts_with("0x") || w.len() < 6 {
        return Err(AppError::BadRequest("invalid Sui address".into()));
    }
    Ok(format!("wallet:{}", w.to_lowercase()))
}
