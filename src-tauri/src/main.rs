// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Fix PATH for macOS GUI apps launched from Finder/Launchpad.
    // GUI apps inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
    // missing paths from nvm, homebrew, etc. This must run BEFORE
    // any Command::new() calls that use bare command names.
    #[cfg(target_os = "macos")]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        if let Ok(output) = std::process::Command::new(&shell)
            .args(["-i", "-l", "-c", "echo $PATH"])
            .output()
        {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                unsafe { std::env::set_var("PATH", &path) };
            }
        }
    }

    cc_workshop_lib::run();
}
// Force rebuild 1770042641
// Force rebuild 1770043106
// Rebuild trigger 1770043167
