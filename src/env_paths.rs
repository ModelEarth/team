// Resolves the external .env file used for server secrets/config.
//
// Secrets no longer live in this repo's docker/.env. Instead, CloudRoot/automation/paths.yaml
// -- a sibling of this repo's own GitHub folder, not checked into this repo -- holds an
// `env_file` key pointing at the real .env file, so every local checkout of this repo on the
// same machine shares one set of secrets instead of each needing its own docker/.env copy.

use std::path::{Path, PathBuf};

const PATHS_YAML: &str = "../../CloudRoot/automation/paths.yaml";

/// Resolves the `env_file` path from CloudRoot/automation/paths.yaml, relative to this
/// process's cwd (expected to be this repo's `team/` directory). `env_file`'s value is itself
/// relative to paths.yaml's own directory, not to our cwd. Returns None if paths.yaml is
/// missing or malformed, in which case callers should log and continue without secrets rather
/// than fail outright (mirrors the old dotenv::from_path(...).ok() tolerance).
pub fn resolve_env_file_path() -> Option<PathBuf> {
    let paths_yaml = Path::new(PATHS_YAML);
    let contents = std::fs::read_to_string(paths_yaml)
        .inspect_err(|e| log::warn!("Could not read {}: {}", PATHS_YAML, e))
        .ok()?;
    let parsed: serde_yaml::Value = serde_yaml::from_str(&contents)
        .inspect_err(|e| log::warn!("Could not parse {}: {}", PATHS_YAML, e))
        .ok()?;
    let env_file = match parsed.get("env_file").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => {
            log::warn!("{} has no env_file key", PATHS_YAML);
            return None;
        }
    };
    let dir = paths_yaml.parent().unwrap_or_else(|| Path::new("."));
    let resolved = dir.join(env_file);
    Some(resolved.canonicalize().unwrap_or(resolved))
}
