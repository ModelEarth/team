// Resolves the external .env file used for server secrets/config.
//
// Secrets live outside the webroot. An `automation/paths.yaml` file (not checked in) holds an
// `env_file` key pointing at the real .env file, so every local checkout on the same machine
// shares one set of secrets. CloudRoot/automation/paths.yaml -- a sibling of this webroot's
// own GitHub folder -- is checked first, then the webroot's own automation/paths.yaml.

use std::path::{Path, PathBuf};

const PATHS_YAML_CANDIDATES: &[&str] = &[
    "../../CloudRoot/automation/paths.yaml",
    "../automation/paths.yaml",
];

/// Resolves the `env_file` path from the first paths.yaml in PATHS_YAML_CANDIDATES that exists,
/// relative to this process's cwd (expected to be this repo's `team/` directory). `env_file`'s
/// value is itself relative to paths.yaml's own directory, not to our cwd. Returns None if no
/// paths.yaml exists or it is malformed, in which case callers should log and continue without
/// secrets rather than fail outright.
pub fn resolve_env_file_path() -> Option<PathBuf> {
    let paths_yaml = match PATHS_YAML_CANDIDATES.iter().map(Path::new).find(|p| p.exists()) {
        Some(p) => p,
        None => {
            log::warn!("Could not find paths.yaml at {}", PATHS_YAML_CANDIDATES.join(" or "));
            return None;
        }
    };
    let contents = std::fs::read_to_string(paths_yaml)
        .inspect_err(|e| log::warn!("Could not read {}: {}", paths_yaml.display(), e))
        .ok()?;
    let parsed: serde_yaml::Value = serde_yaml::from_str(&contents)
        .inspect_err(|e| log::warn!("Could not parse {}: {}", paths_yaml.display(), e))
        .ok()?;
    let env_file = match parsed.get("env_file").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => {
            log::warn!("{} has no env_file key", paths_yaml.display());
            return None;
        }
    };
    let dir = paths_yaml.parent().unwrap_or_else(|| Path::new("."));
    let resolved = dir.join(env_file);
    Some(resolved.canonicalize().unwrap_or(resolved))
}
