mod commands;
pub mod types;
mod utils;

use commands::claude_md::migrate_claude_md_storage;
use commands::{classify, claude_md, config, data, dialog, import, marketplace, mcps, plugins, rules, skills, symlink, trash, usage};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Handle window close: hide instead of quit (macOS standard behavior)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Prevent the window from actually closing
                api.prevent_close();
                // Hide the window instead - app continues running in background
                let _ = window.hide();
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // v2.3.0: legacy data directory migration from ~/.ensemble/ to
            // ~/.cc-workshop/. MUST run before every other migration and
            // before any data.json / settings.json read — get_app_data_dir()
            // now resolves to ~/.cc-workshop/, but the user's data is still
            // at ~/.ensemble/ until this migration moves it.
            //
            // The migration also rewrites every absolute-path string inside
            // data.json (Skill::id == source_path invariant — types.rs:7-15)
            // and settings.json defaults. Without this rewrite, all Skill /
            // MCP metadata appears orphaned after the directory move and
            // every Scene's skill_ids becomes silently dangling.
            match utils::migration::migrate_legacy_data_dir() {
                Ok(utils::migration::MigrationOutcome::Migrated) => {
                    eprintln!("[Migration] data dir moved from ~/.ensemble/ to ~/.cc-workshop/");
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("legacy-data-migrated", ());
                    }
                }
                Ok(utils::migration::MigrationOutcome::Conflict) => {
                    eprintln!(
                        "[Migration] both ~/.ensemble/ and ~/.cc-workshop/ contain data — \
                         manual resolution required"
                    );
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("legacy-data-conflict", ());
                    }
                }
                Ok(utils::migration::MigrationOutcome::Skipped) => {}
                Err(e) => {
                    eprintln!("[Migration] legacy data dir migration FAILED: {e}");
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("legacy-data-migration-failed", e);
                    }
                }
            }

            // Run CLAUDE.md storage migration (from embedded content to independent files)
            if let Err(e) = migrate_claude_md_storage() {
                eprintln!("[Migration] Failed to migrate CLAUDE.md storage: {}", e);
                // Don't fail startup on migration error, just log it
            }

            // R2-1 (Round 2): one-time NFC normalisation of skill_metadata /
            // mcp_metadata keys. Runs once per install (gated by
            // `AppData::has_completed_unicode_normalization`). Failure is
            // non-fatal — the migration is best-effort; if it fails the
            // flag stays false and the next launch retries. Logging here
            // mirrors the CLAUDE.md migration pattern above.
            //
            // Ordering: runs BEFORE the frontend issues its first
            // `scan_skills` / `scan_mcps` (which happens after the React
            // tree mounts and `MainLayout::initApp` resolves). On a fresh
            // install, `init_app_data` sets the flag to `true` so this
            // call is an O(1) no-op.
            match data::migrate_unicode_normalization() {
                Ok(report) => {
                    if report.renormalized_skills > 0
                        || report.renormalized_mcps > 0
                        || report.merged_skill_collisions > 0
                        || report.merged_mcp_collisions > 0
                    {
                        eprintln!(
                            "[Migration] unicode-normalization: renormalized {} skills + {} mcps; collisions: {} skill + {} mcp",
                            report.renormalized_skills,
                            report.renormalized_mcps,
                            report.merged_skill_collisions,
                            report.merged_mcp_collisions,
                        );
                    }
                }
                Err(e) => {
                    eprintln!("[Migration] Failed to NFC-normalise metadata keys: {}", e);
                }
            }

            // V2 (2026-05-11): MCP marketplace switched from "full GET + 24h cache" to
            // realtime mirror. Best-effort delete of the legacy cache file so it
            // does not linger on user disks. Failure is silent — the new IPCs
            // do not depend on absence of this file.
            marketplace::cleanup_legacy_mcp_cache();

            // If app was launched with --launch argument, hide the window initially
            // Frontend will show it if needed (when folder has no Scene)
            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|a| a == "--launch") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 检查是否有 --launch 参数
            if let Some(launch_index) = args.iter().position(|a| a == "--launch") {
                if let Some(path) = args.get(launch_index + 1) {
                    // 尝试获取主窗口并发送事件
                    // 注意：不调用 set_focus()，让前端决定是否需要显示窗口
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("second-instance-launch", path.clone());
                    } else {
                        let windows = app.webview_windows();
                        if let Some((_, window)) = windows.into_iter().next() {
                            let _ = window.emit("second-instance-launch", path.clone());
                        }
                    }
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![
            // Skills commands
            skills::scan_skills,
            skills::get_skill,
            skills::update_skill_metadata,
            skills::delete_skill,
            // MCPs commands
            mcps::scan_mcps,
            mcps::get_mcp,
            mcps::update_mcp_metadata,
            mcps::delete_mcp,
            mcps::fetch_mcp_tools,
            // Symlink commands
            symlink::create_symlink,
            symlink::remove_symlink,
            symlink::is_symlink,
            symlink::get_symlink_target,
            symlink::create_symlinks,
            symlink::remove_symlinks,
            // Config commands
            config::write_mcp_config,
            config::sync_project_config,
            config::clear_project_config,
            config::get_project_config_status,
            // Data commands
            data::read_app_data,
            data::write_app_data,
            data::read_settings,
            data::write_settings,
            data::init_app_data,
            // Categories
            data::get_categories,
            data::add_category,
            data::update_category,
            data::delete_category,
            data::reorder_categories,
            data::set_category_parent,
            data::migrate_category_id_for_skills_mcps,
            // R2-1 (Round 2): one-time NFC normalisation of skill_metadata /
            // mcp_metadata keys so the same CJK / accented path stored as
            // NFC (git) vs. NFD (Finder) collapses to a single key. See
            // `data::migrate_unicode_normalization` and finding R6 F5.
            data::migrate_unicode_normalization,
            // Tags
            data::get_tags,
            data::add_tag,
            data::update_tag,
            data::delete_tag,
            data::reorder_tags,
            data::reset_auto_classify_data,
            // Scenes
            data::get_scenes,
            data::add_scene,
            data::update_scene,
            data::delete_scene,
            // Projects
            data::get_projects,
            data::add_project,
            data::update_project,
            data::delete_project,
            // Dialog
            dialog::select_folder,
            dialog::select_file,
            dialog::reveal_in_finder,
            dialog::bring_window_to_front,
            // Classify (Anthropic API)
            classify::auto_classify,
            // Import commands
            import::detect_existing_config,
            import::backup_before_import,
            import::backup_claude_json,
            import::import_existing_config,
            import::update_skill_scope,
            import::update_mcp_scope,
            import::remove_imported_skills,
            import::remove_imported_mcps,
            import::install_quick_action,
            import::launch_claude_for_folder,
            // R2-8 (bug-audit-2026-05-15): pre-flight check for the
            // user-selected terminal app so SettingsPage can flag a
            // missing install and LauncherModal can return a friendly
            // error instead of an OS-level "No such file or directory".
            import::validate_terminal_app,
            import::get_launch_args,
            import::open_accessibility_settings,
            // Usage stats commands
            usage::scan_usage_stats,
            // Plugin commands
            plugins::detect_installed_plugins,
            plugins::detect_plugin_skills,
            plugins::detect_plugin_mcps,
            plugins::import_plugin_skills,
            plugins::import_plugin_mcps,
            plugins::check_plugins_enabled,
            // R2-10 (bug-audit-2026-05-15): clean up orphan markers for
            // plugins uninstalled outside CC Workshop
            plugins::cleanup_orphan_plugin_imports,
            // CLAUDE.md commands
            claude_md::scan_claude_md_files,
            claude_md::import_claude_md,
            claude_md::read_claude_md,
            claude_md::get_claude_md_files,
            claude_md::update_claude_md,
            claude_md::delete_claude_md,
            claude_md::set_global_claude_md,
            claude_md::unset_global_claude_md,
            claude_md::distribute_claude_md,
            claude_md::distribute_scene_claude_md,
            // Rule commands
            rules::scan_rules,
            rules::import_rule,
            rules::read_rule,
            rules::get_rules,
            rules::update_rule,
            rules::delete_rule,
            rules::set_global_rule,
            rules::unset_global_rule,
            rules::distribute_rule,
            rules::distribute_scene_rules,
            // Trash recovery commands
            trash::list_trashed_items,
            trash::restore_skill,
            trash::restore_mcp,
            trash::restore_claude_md,
            trash::restore_rule,
            // A5: Scene / Project trash exposure (V2.2 bug-audit-2026-05-15)
            trash::restore_scene,
            trash::restore_project,
            // R2-9 (bug-audit-2026-05-15 round 2): permanent delete + empty
            // trash. Both gated behind a frontend confirm modal — backend
            // commits immediately on call.
            trash::delete_trashed_item_permanently,
            trash::empty_trash,
            // Marketplace commands
            marketplace::list_marketplace_skills,
            marketplace::search_marketplace_skills,
            marketplace::get_marketplace_skill_readme,
            marketplace::get_marketplace_mcp_readme,
            marketplace::get_marketplace_repo_stars,
            marketplace::get_marketplace_skill_summary,
            marketplace::list_skill_topics_map,
            // MCP marketplace V2 (2026-05-11): paginated realtime mirror of
            // registry.modelcontextprotocol.io. The V1 single-GET
            // `list_marketplace_mcps` IPC has been removed; the frontend now
            // uses these three.
            marketplace::list_marketplace_mcps_page,
            marketplace::list_recently_updated_mcps,
            marketplace::search_marketplace_mcps,
            marketplace::update_mcp_http_config,
            marketplace::install_marketplace_skill,
            marketplace::install_marketplace_mcp,
            marketplace::auto_classify_marketplace_item,
            marketplace::refresh_marketplace_cache,
            marketplace::update_mcp_env_vars,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Handle macOS Dock icon click when window is hidden
            if let RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    // Show the main window when Dock icon is clicked
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
}
