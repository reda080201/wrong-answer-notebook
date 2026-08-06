/// Version returned by the desktop bridge and browser fallback.
pub(crate) const MCP_BRIDGE_VERSION: &str = "local-bridge-v2";

#[cfg(test)]
mod tests {
    use super::MCP_BRIDGE_VERSION;

    #[test]
    fn exposes_the_current_read_only_bridge_contract_version() {
        assert_eq!(MCP_BRIDGE_VERSION, "local-bridge-v2");
    }
}
