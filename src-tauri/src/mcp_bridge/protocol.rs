use axum::{routing::post, Router};

use super::{mcp_get, mcp_post, redeem_pairing, state::BridgeHttpState};

pub(super) fn router(state: BridgeHttpState) -> Router {
    Router::new()
        .route("/mcp", post(mcp_post).get(mcp_get))
        .route("/pair", post(redeem_pairing))
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
        .with_state(state)
}
