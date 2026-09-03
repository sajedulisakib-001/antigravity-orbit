/**
 * Generates the full HTML for the Orbit Settings & Customization Dashboard Webview.
 *
 * @param {object} params
 * @param {string} params.nonce Cryptographic nonce for Content Security Policy.
 * @param {string} params.currentProfile Active profile name in this window.
 * @param {string} params.version Orbit extension version.
 * @param {string} params.profilesRoot Path to profiles storage directory.
 * @param {object} params.settings Current extension settings.
 * @param {object} params.registry Current registry data containing all custom profiles.
 * @param {string} [params.iconDataUri] Base64 Data URI for icon.png.
 * @param {Array} [params.installedExtensions] List of user extensions in the active profile.
 * @returns {string} Complete HTML string.
 */
function getSettingsHtml({ nonce, currentProfile, version, profilesRoot, settings, registry, iconDataUri, installedExtensions }) {
    const safeSettings = settings || {};
    const safeRegistry = registry || { lastActiveProfile: 'Default', profiles: {}, universalExtensions: {} };
    const safeInstalled = Array.isArray(installedExtensions) ? installedExtensions : [];

    const initialDataJson = JSON.stringify({
        currentProfile,
        version,
        profilesRoot,
        settings: safeSettings,
        registry: safeRegistry,
        installedExtensions: safeInstalled
    }).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: vscode-resource: vscode-webview:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orbit Settings & Dashboard</title>
    <style>
        :root {
            --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
            --accent-color: #6366f1;
            --accent-hover: #4f46e5;
            --accent-light: rgba(99, 102, 241, 0.15);
            --surface-bg: var(--vscode-editor-background, #1e1e2e);
            --card-bg: var(--vscode-sideBar-background, rgba(30, 30, 46, 0.7));
            --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            --card-hover-border: rgba(99, 102, 241, 0.4);
            --text-main: var(--vscode-foreground, #cdd6f4);
            --text-muted: var(--vscode-descriptionForeground, #a6adc8);
            --text-heading: var(--vscode-editor-foreground, #ffffff);
            --success-color: #10b981;
            --warning-color: #f59e0b;
            --danger-color: #ef4444;
            --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            --radius-sm: 6px;
            --radius-md: 10px;
            --radius-lg: 14px;
            --transition-speed: 0.2s;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--font-family);
            background-color: var(--surface-bg);
            color: var(--text-main);
            line-height: 1.5;
            font-size: 13px;
            padding: 24px 32px 64px 32px;
            max-width: 1100px;
            margin: 0 auto;
            overflow-y: auto;
        }

        /* ---------------- Header & Hero ---------------- */
        .hero {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 24px 28px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.06) 100%);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-lg);
            margin-bottom: 24px;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
            gap: 16px;
            flex-wrap: wrap;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: -40px;
            right: -40px;
            width: 160px;
            height: 160px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, transparent 70%);
            border-radius: 50%;
            pointer-events: none;
        }

        .hero-left {
            display: flex;
            align-items: center;
            gap: 18px;
            min-width: 0;
            flex: 1;
        }

        .hero-icon {
            width: 58px;
            height: 58px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0f1017;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: var(--radius-md);
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
            animation: pulse-orbit 4s ease-in-out infinite alternate;
            flex-shrink: 0;
            overflow: hidden;
            padding: 3px;
        }

        .hero-logo-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: calc(var(--radius-md) - 3px);
            display: block;
        }

        @keyframes pulse-orbit {
            0% { transform: scale(1); box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35); }
            100% { transform: scale(1.04); box-shadow: 0 12px 28px rgba(139, 92, 246, 0.5); }
        }

        .hero-title-group {
            min-width: 0;
            flex: 1;
        }

        .hero-title-group h1 {
            font-size: 22px;
            font-weight: 700;
            color: var(--text-heading);
            letter-spacing: -0.02em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .hero-title-group p {
            color: var(--text-muted);
            font-size: 13px;
            margin-top: 3px;
        }

        .hero-badges {
            display: flex;
            gap: 8px;
            margin-top: 8px;
            flex-wrap: wrap;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            max-width: 260px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .badge-active {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success-color);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .badge-active::before {
            content: '';
            width: 6px;
            height: 6px;
            background-color: var(--success-color);
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 8px var(--success-color);
            flex-shrink: 0;
        }

        .badge-version {
            background: rgba(99, 102, 241, 0.15);
            color: #a5b4fc;
            border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .hero-actions {
            display: flex;
            gap: 10px;
            flex-shrink: 0;
        }

        /* ---------------- Tab Navigation ---------------- */
        .tabs {
            display: flex;
            gap: 6px;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 24px;
            padding-bottom: 2px;
            overflow-x: auto;
        }

        .tab-button {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            padding: 10px 18px;
            border-radius: var(--radius-sm) var(--radius-sm) 0 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all var(--transition-speed);
            position: relative;
            white-space: nowrap;
        }

        .tab-button:hover {
            color: var(--text-heading);
            background: rgba(255, 255, 255, 0.04);
        }

        .tab-button.active {
            color: #818cf8;
            background: rgba(99, 102, 241, 0.1);
        }

        .tab-button.active::after {
            content: '';
            position: absolute;
            bottom: -3px;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--primary-gradient);
            border-radius: 2px;
        }

        .tab-content {
            display: none;
            animation: fadeIn 0.25s ease-in-out;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ---------------- Settings Grid & Cards ---------------- */
        .settings-section {
            margin-bottom: 28px;
        }

        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
        }

        .section-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--text-heading);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .card-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-md);
            padding: 18px 20px;
            transition: all var(--transition-speed);
            position: relative;
            min-width: 0;
            overflow: hidden;
        }

        .card:hover {
            border-color: var(--card-hover-border);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            min-width: 0;
        }

        .setting-info {
            flex: 1;
            min-width: 0;
        }

        .setting-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-heading);
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .setting-code {
            font-family: monospace;
            font-size: 11px;
            color: var(--text-muted);
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .setting-desc {
            font-size: 12px;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .setting-control {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 160px;
            justify-content: flex-end;
            flex-shrink: 0;
        }

        /* ---------------- Form Controls ---------------- */
        .switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-input-background, #2a2b3d);
            border: 1px solid var(--card-border);
            transition: .25s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: var(--text-main);
            transition: .25s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--accent-color);
            border-color: var(--accent-color);
        }

        input:focus + .slider {
            box-shadow: 0 0 1px var(--accent-color);
        }

        input:checked + .slider:before {
            transform: translateX(20px);
            background-color: #ffffff;
        }

        select.custom-select {
            background: var(--vscode-input-background, #2a2b3d);
            color: var(--vscode-input-foreground, #ffffff);
            border: 1px solid var(--vscode-input-border, var(--card-border));
            border-radius: var(--radius-sm);
            padding: 7px 12px;
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            outline: none;
            transition: border-color var(--transition-speed);
            min-width: 160px;
        }

        select.custom-select:focus {
            border-color: var(--accent-color);
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 7px 14px;
            font-family: inherit;
            font-size: 12px;
            font-weight: 500;
            border-radius: var(--radius-sm);
            border: 1px solid transparent;
            cursor: pointer;
            transition: all var(--transition-speed);
            text-decoration: none;
            white-space: nowrap;
            user-select: none;
        }

        .btn-primary {
            background: var(--primary-gradient);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .btn-primary:hover {
            opacity: 0.92;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.08));
            color: var(--vscode-button-secondaryForeground, var(--text-main));
            border: 1px solid var(--card-border);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.14);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .btn-danger {
            background: rgba(239, 68, 68, 0.15);
            color: #fca5a5;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .btn-danger:hover {
            background: rgba(239, 68, 68, 0.28);
            border-color: var(--danger-color);
        }

        .btn-sm {
            padding: 5px 10px;
            font-size: 11px;
        }

        /* ---------------- Profiles & Universal Grid ---------------- */
        .profiles-top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .search-wrapper {
            position: relative;
            flex: 1;
            min-width: 240px;
        }

        .search-input {
            width: 100%;
            background: var(--vscode-input-background, #2a2b3d);
            color: var(--vscode-input-foreground, #ffffff);
            border: 1px solid var(--vscode-input-border, var(--card-border));
            border-radius: var(--radius-sm);
            padding: 8px 12px 8px 34px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
            transition: border-color var(--transition-speed);
        }

        .search-input:focus {
            border-color: var(--accent-color);
        }

        .search-icon {
            position: absolute;
            left: 11px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            pointer-events: none;
        }

        .profile-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
        }

        .profile-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-md);
            padding: 18px 20px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 14px;
            transition: all var(--transition-speed);
            position: relative;
            min-width: 0;
            overflow: hidden;
            box-sizing: border-box;
        }

        .profile-card:hover {
            border-color: var(--card-hover-border);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }

        .profile-card.active-card {
            border-color: rgba(16, 185, 129, 0.5);
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, var(--card-bg) 100%);
        }

        .profile-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            min-width: 0;
            width: 100%;
        }

        .profile-avatar {
            width: 38px;
            height: 38px;
            border-radius: var(--radius-sm);
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .profile-card.active-card .profile-avatar {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success-color);
        }

        .profile-card-title-group {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }

        .profile-name-text {
            font-size: 15px;
            font-weight: 700;
            color: var(--text-heading);
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            width: 100%;
        }

        .profile-name-span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
            flex: 1;
        }

        .profile-meta {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 6px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            width: 100%;
        }

        .profile-meta-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            width: 100%;
            overflow: hidden;
        }

        .profile-meta-icon {
            flex-shrink: 0;
            font-size: 12px;
        }

        .profile-meta-label {
            flex-shrink: 0;
            color: var(--text-muted);
            font-size: 11px;
        }

        .profile-meta-value {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
            flex: 1;
            color: var(--text-main);
            font-size: 11px;
        }

        .profile-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            padding-top: 12px;
            align-items: center;
        }

        /* ---------------- Modals ---------------- */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.65);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
        }

        .modal-overlay.open {
            display: flex;
        }

        .modal {
            background: var(--surface-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-lg);
            width: 440px;
            max-width: 90vw;
            padding: 24px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
            animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalScale {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        .modal-title {
            font-size: 17px;
            font-weight: 700;
            color: var(--text-heading);
            margin-bottom: 8px;
        }

        .modal-desc {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 18px;
        }

        .modal-field {
            margin-bottom: 16px;
        }

        .modal-label {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
            display: block;
        }

        .modal-input {
            width: 100%;
            background: var(--vscode-input-background, #2a2b3d);
            color: var(--vscode-input-foreground, #ffffff);
            border: 1px solid var(--vscode-input-border, var(--card-border));
            border-radius: var(--radius-sm);
            padding: 9px 12px;
            font-family: inherit;
            font-size: 13px;
            outline: none;
        }

        .modal-input:focus {
            border-color: var(--accent-color);
        }

        .modal-hint {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }

        /* ---------------- Storage & Registry Tab ---------------- */
        .storage-box {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-md);
            padding: 20px;
            margin-bottom: 20px;
            min-width: 0;
            overflow: hidden;
        }

        .storage-path-display {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-sm);
            padding: 8px 12px;
            margin-top: 10px;
            font-family: monospace;
            font-size: 12px;
            color: #a5b4fc;
            gap: 10px;
            min-width: 0;
        }

        .storage-path-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
            flex: 1;
        }

        .json-editor {
            width: 100%;
            height: 280px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-sm);
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            color: var(--text-main);
            outline: none;
            resize: vertical;
            line-height: 1.4;
        }

        /* ---------------- Toast Notification ---------------- */
        .toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1e1e2e;
            color: #ffffff;
            border: 1px solid var(--accent-color);
            border-radius: var(--radius-md);
            padding: 12px 18px;
            font-size: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            gap: 10px;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 2000;
        }

        .toast.show {
            transform: translateY(0);
            opacity: 1;
        }

        /* ---------------- Documentation Accordion ---------------- */
        .faq-item {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: var(--radius-md);
            margin-bottom: 10px;
            overflow: hidden;
        }

        .faq-header {
            padding: 14px 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
            color: var(--text-heading);
            user-select: none;
        }

        .faq-header:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .faq-content {
            padding: 0 18px 14px 18px;
            color: var(--text-muted);
            font-size: 12px;
            line-height: 1.6;
            display: none;
        }

        .faq-item.open .faq-content {
            display: block;
        }

        .faq-icon {
            transition: transform 0.2s;
        }

        .faq-item.open .faq-icon {
            transform: rotate(180deg);
        }
    </style>
</head>
<body>

    <!-- Hero Header -->
    <div class="hero">
        <div class="hero-left">
            <div class="hero-icon">
                ${iconDataUri 
                    ? `<img src="${iconDataUri}" alt="Orbit Logo" class="hero-logo-img" />` 
                    : `<span style="font-size:36px;">🪐</span>`}
            </div>
            <div class="hero-title-group">
                <h1>Orbit Customization & Dashboard</h1>
                <p>Sandboxed developer workspaces & isolated profiles for Google Antigravity IDE</p>
                <div class="hero-badges">
                    <span class="badge badge-active" id="heroActiveBadge" title="Active Profile: ${escapeHtml(currentProfile)}">Active: ${escapeHtml(currentProfile)}</span>
                    <span class="badge badge-version">v${escapeHtml(version)}</span>
                </div>
            </div>
        </div>
        <div class="hero-actions">
            <button class="btn btn-secondary" id="btnHeaderOpenFolder" title="Open profiles storage directory">
                📂 Storage Folder
            </button>
            <button class="btn btn-primary" id="btnHeaderCreateProfile">
                ➕ New Profile
            </button>
        </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tabs">
        <button class="tab-button active" data-tab="tab-settings" id="tabNavSettings">
            ⚙️ General Settings
        </button>
        <button class="tab-button" data-tab="tab-profiles" id="tabNavProfiles">
            🪐 Profiles Manager (<span id="tabProfileCount">0</span>)
        </button>
        <button class="tab-button" data-tab="tab-universal" id="tabNavUniversal">
            ✨ Universal Extensions (<span id="tabUniversalCount">0</span>)
        </button>
        <button class="tab-button" data-tab="tab-storage" id="tabNavStorage">
            💾 Storage & Registry
        </button>
        <button class="tab-button" data-tab="tab-docs" id="tabNavDocs">
            📖 Guide & Reference
        </button>
    </div>

    <!-- Tab 1: Settings -->
    <div class="tab-content active" id="tab-settings">
        <div class="settings-section">
            <div class="section-header">
                <div class="section-title">🚀 Startup & Window Management</div>
            </div>
            <div class="card-grid">
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Auto-Restore Last Active Profile
                                <span class="setting-code">autoRestoreLastProfile</span>
                            </div>
                            <div class="setting-desc">
                                Seamlessly restores and switches into your last active custom profile when starting Antigravity IDE instead of remaining on Default.
                            </div>
                        </div>
                        <div class="setting-control">
                            <label class="switch">
                                <input type="checkbox" id="settingAutoRestore" ${safeSettings.autoRestoreLastProfile !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Default Launch Action
                                <span class="setting-code">defaultLaunchMode</span>
                            </div>
                            <div class="setting-desc">
                                Choose the default behavior when clicking or launching a profile from menus or quick picks.
                            </div>
                        </div>
                        <div class="setting-control">
                            <select class="custom-select" id="settingDefaultLaunchMode">
                                <option value="prompt" ${safeSettings.defaultLaunchMode === 'prompt' ? 'selected' : ''}>Always Prompt (Switch or New Window)</option>
                                <option value="switch" ${safeSettings.defaultLaunchMode === 'switch' ? 'selected' : ''}>Always Switch Orbit (Migrate Workspace)</option>
                                <option value="new_window" ${safeSettings.defaultLaunchMode === 'new_window' ? 'selected' : ''}>Always Open in New Window</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Close Window on Orbit Switch
                                <span class="setting-code">closeAfterSwitch</span>
                            </div>
                            <div class="setting-desc">
                                Automatically close the current Antigravity IDE window when transferring the workspace into the target profile.
                            </div>
                        </div>
                        <div class="setting-control">
                            <label class="switch">
                                <input type="checkbox" id="settingCloseAfterSwitch" ${safeSettings.closeAfterSwitch !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <div class="section-header">
                <div class="section-title">🎨 UI & Status Bar Customization</div>
            </div>
            <div class="card-grid">
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Show Status Bar Indicator
                                <span class="setting-code">showStatusBarItem</span>
                            </div>
                            <div class="setting-desc">
                                Displays the active orbit name and switcher widget in the bottom status bar (<code style="font-size:11px;">$(globe) Orbit: &lt;Active&gt;</code>).
                            </div>
                        </div>
                        <div class="setting-control">
                            <label class="switch">
                                <input type="checkbox" id="settingShowStatusBar" ${safeSettings.showStatusBarItem !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Status Bar Alignment Position
                                <span class="setting-code">statusBarAlignment</span>
                            </div>
                            <div class="setting-desc">
                                Place the Orbit status bar button on the Left or Right side of the window bar.
                            </div>
                        </div>
                        <div class="setting-control">
                            <select class="custom-select" id="settingStatusBarAlignment">
                                <option value="Left" ${safeSettings.statusBarAlignment !== 'Right' ? 'selected' : ''}>Left Side (Default)</option>
                                <option value="Right" ${safeSettings.statusBarAlignment === 'Right' ? 'selected' : ''}>Right Side</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <div class="section-header">
                <div class="section-title">🛡️ Safety & Synchronization</div>
            </div>
            <div class="card-grid">
                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Confirm Profile Deletion
                                <span class="setting-code">confirmDelete</span>
                            </div>
                            <div class="setting-desc">
                                Display a safety confirmation dialog before permanently removing profile directories and files on disk.
                            </div>
                        </div>
                        <div class="setting-control">
                            <label class="switch">
                                <input type="checkbox" id="settingConfirmDelete" ${safeSettings.confirmDelete !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="setting-row">
                        <div class="setting-info">
                            <div class="setting-name">
                                Auto-Propagate Orbit to Profiles
                                <span class="setting-code">autoSyncExtension</span>
                            </div>
                            <div class="setting-desc">
                                Automatically copies the latest Orbit extension files into every custom profile to maintain controls across all windows.
                            </div>
                        </div>
                        <div class="setting-control">
                            <label class="switch">
                                <input type="checkbox" id="settingAutoSyncExtension" ${safeSettings.autoSyncExtension !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:16px; border-top:1px solid var(--card-border); flex-wrap:wrap; gap:10px;">
            <button class="btn btn-secondary" id="btnResetSettings">↺ Reset All Settings to Defaults</button>
            <button class="btn btn-secondary" id="btnOpenNativeSettings">⚙️ Open in VS Code Settings JSON</button>
        </div>
    </div>

    <!-- Tab 2: Profiles Manager -->
    <div class="tab-content" id="tab-profiles">
        <div class="profiles-top-bar">
            <div class="search-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" class="search-input" id="profileSearchInput" placeholder="Filter profiles by name...">
            </div>
            <button class="btn btn-primary" id="btnCreateProfileModal">➕ Create New Profile</button>
        </div>

        <div class="profile-list" id="profileGridContainer">
            <!-- Dynamically populated profile cards -->
        </div>
    </div>

    <!-- Tab 3: Universal Extensions -->
    <div class="tab-content" id="tab-universal">
        <div class="storage-box" style="border-left: 4px solid var(--accent-color);">
            <div class="section-title" style="margin-bottom:8px;">✨ Universal Extensions Engine</div>
            <p style="color:var(--text-muted); font-size:12px; line-height:1.6;">
                Universal extensions are stored in your central Orbit pool and are <b>automatically cloned into all newly created profiles</b>.
                Selecting an extension as universal from any profile makes it available for future profiles, while leaving existing profiles completely clean and isolated.
            </p>
        </div>

        <div class="settings-section">
            <div class="section-header">
                <div class="section-title">
                    ⭐ Active Universal Extensions Pool (<span id="universalActiveCount">0</span>)
                </div>
            </div>
            <div class="profile-list" id="universalActiveGridContainer">
                <!-- Dynamically populated active universal cards -->
            </div>
        </div>

        <div class="settings-section" style="margin-top: 32px;">
            <div class="section-header">
                <div class="section-title">
                    📦 Extensions in Active Profile (<span id="installedCount">0</span>)
                </div>
            </div>
            <div class="profiles-top-bar">
                <div class="search-wrapper">
                    <span class="search-icon">🔍</span>
                    <input type="text" class="search-input" id="universalSearchInput" placeholder="Filter installed extensions...">
                </div>
            </div>
            <div class="profile-list" id="installedExtensionsGridContainer">
                <!-- Dynamically populated installed extension cards -->
            </div>
        </div>
    </div>

    <!-- Tab 4: Storage & Registry -->
    <div class="tab-content" id="tab-storage">
        <div class="storage-box">
            <div class="section-title" style="margin-bottom:8px;">📁 Central Profiles Directory</div>
            <p style="color:var(--text-muted); font-size:12px;">
                All isolated profiles, dedicated extension stores, and user data folders are centrally organized in your home directory:
            </p>
            <div class="storage-path-display">
                <span class="storage-path-text" id="storagePathText" title="${escapeHtml(profilesRoot)}">${escapeHtml(profilesRoot)}</span>
                <button class="btn btn-secondary btn-sm" id="btnCopyStoragePath" style="flex-shrink:0;">📋 Copy Path</button>
            </div>
            <div style="margin-top:12px; display:flex; gap:10px;">
                <button class="btn btn-secondary" id="btnOpenStorageDir">📂 Open Directory in File Explorer</button>
            </div>
        </div>

        <div class="storage-box">
            <div class="section-title" style="margin-bottom:8px;">📄 Registry Inspector (profiles.json)</div>
            <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">
                View and manage the central profiles registry metadata.
            </p>
            <textarea class="json-editor" id="registryJsonText" readonly></textarea>
            <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <button class="btn btn-secondary" id="btnCopyRegistryJson">📋 Copy JSON</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary" id="btnExportRegistry">💾 Export Registry Backup</button>
                    <button class="btn btn-secondary" id="btnImportRegistry">📥 Import Registry Backup</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Tab 5: Guides & Docs -->
    <div class="tab-content" id="tab-docs">
        <div class="storage-box">
            <div class="section-title" style="margin-bottom:12px;">🪐 How Orbit Isolation Works</div>
            <p style="color:var(--text-muted); font-size:12px; line-height:1.6; margin-bottom:12px;">
                Orbit launches Antigravity IDE instances with dedicated <code>--extensions-dir</code> and <code>--user-data-dir</code> parameters.
                This provides 100% true sandboxed isolation:
            </p>
            <ul style="color:var(--text-muted); font-size:12px; line-height:1.8; margin-left:20px;">
                <li><b>Isolated Extension Stores:</b> Linters, heavy language servers, and formatters installed in one profile will never execute in other profiles.</li>
                <li><b>Isolated Settings & Keymaps:</b> Each profile has its own independent <code>settings.json</code>, keybindings, and theme settings.</li>
                <li><b>Universal Extensions:</b> Extensions marked as Universal are automatically pre-installed for every new profile you initialize.</li>
                <li><b>Seamless Workspace Migration:</b> Switching profiles automatically transfers your active workspace folder and seamlessly restarts the editor.</li>
                <li><b>Resilient Self-Propagation:</b> Orbit copies itself into custom profiles on launch so you always have profile switching controls available.</li>
            </ul>
        </div>

        <div class="faq-item">
            <div class="faq-header">
                <span>⌨️ Available Commands & Shortcuts</span>
                <span class="faq-icon">▼</span>
            </div>
            <div class="faq-content">
                <table style="width:100%; border-collapse:collapse; margin-top:8px;">
                    <thead>
                        <tr style="text-align:left; border-bottom:1px solid var(--card-border);">
                            <th style="padding:6px 8px;">Command Title</th>
                            <th style="padding:6px 8px;">Command ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px 8px;"><b>Orbit: Switch Profile</b></td>
                            <td style="padding:6px 8px;"><code>antigravity-orbit.switch</code></td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px 8px;"><b>Orbit: Create New Profile</b></td>
                            <td style="padding:6px 8px;"><code>antigravity-orbit.create</code></td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px 8px;"><b>Orbit: Open Profiles Folder</b></td>
                            <td style="padding:6px 8px;"><code>antigravity-orbit.openFolder</code></td>
                        </tr>
                        <tr>
                            <td style="padding:6px 8px;"><b>Orbit: Open Settings & Dashboard</b></td>
                            <td style="padding:6px 8px;"><code>antigravity-orbit.openSettings</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="faq-item">
            <div class="faq-header">
                <span>❓ Will marking an extension as Universal modify my existing profiles?</span>
                <span class="faq-icon">▼</span>
            </div>
            <div class="faq-content">
                No! Universal extensions are only injected when a <b>new profile is created</b>. Your older and existing profiles remain completely unchanged.
            </div>
        </div>

        <div class="faq-item">
            <div class="faq-header">
                <span>❓ Can I safely delete profiles without losing project code?</span>
                <span class="faq-icon">▼</span>
            </div>
            <div class="faq-content">
                Yes! Profiles only store extensions and editor configuration. Your project workspace folders reside in their original locations on your disk and are never touched when deleting a profile.
            </div>
        </div>
    </div>

    <!-- Create Profile Modal -->
    <div class="modal-overlay" id="createProfileModal">
        <div class="modal">
            <div class="modal-title">➕ Create New Orbit Profile</div>
            <div class="modal-desc">Create a clean, isolated environment with independent extensions and settings.</div>
            <div class="modal-field">
                <label class="modal-label" for="newProfileInput">Profile Name</label>
                <input type="text" class="modal-input" id="newProfileInput" placeholder="e.g. WebDev, PythonML, RustProject, ClientWork" maxlength="48">
                <div class="modal-hint">Allowed: Letters, numbers, dashes, underscores (max 48 chars).</div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="btnCancelCreateModal">Cancel</button>
                <button class="btn btn-primary" id="btnConfirmCreateProfile">Create & Launch</button>
            </div>
        </div>
    </div>

    <!-- Rename Profile Modal -->
    <div class="modal-overlay" id="renameProfileModal">
        <div class="modal">
            <div class="modal-title">✏️ Rename Profile Display Name</div>
            <div class="modal-desc">Change the friendly display name of this profile in your registry and menus.</div>
            <input type="hidden" id="renameProfileKey">
            <div class="modal-field">
                <label class="modal-label" for="renameProfileInput">Display Name</label>
                <input type="text" class="modal-input" id="renameProfileInput" placeholder="Enter new display name..." maxlength="64">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="btnCancelRenameModal">Cancel</button>
                <button class="btn btn-primary" id="btnConfirmRenameProfile">Save Name</button>
            </div>
        </div>
    </div>

    <!-- Toast Notification -->
    <div class="toast" id="toastNotification">
        <span id="toastIcon">✨</span>
        <span id="toastMessage">Settings updated</span>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            let appData = ${initialDataJson};

            // DOM References
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            const profileGridContainer = document.getElementById('profileGridContainer');
            const tabProfileCount = document.getElementById('tabProfileCount');
            const tabUniversalCount = document.getElementById('tabUniversalCount');
            const universalActiveCount = document.getElementById('universalActiveCount');
            const installedCount = document.getElementById('installedCount');
            const universalActiveGridContainer = document.getElementById('universalActiveGridContainer');
            const installedExtensionsGridContainer = document.getElementById('installedExtensionsGridContainer');
            const profileSearchInput = document.getElementById('profileSearchInput');
            const universalSearchInput = document.getElementById('universalSearchInput');
            const registryJsonText = document.getElementById('registryJsonText');
            const toastNotification = document.getElementById('toastNotification');
            const toastMessage = document.getElementById('toastMessage');
            const toastIcon = document.getElementById('toastIcon');

            // Modals
            const createProfileModal = document.getElementById('createProfileModal');
            const newProfileInput = document.getElementById('newProfileInput');
            const renameProfileModal = document.getElementById('renameProfileModal');
            const renameProfileKey = document.getElementById('renameProfileKey');
            const renameProfileInput = document.getElementById('renameProfileInput');

            // Toast helper
            function showToast(msg, icon = '✨') {
                toastMessage.textContent = msg;
                toastIcon.textContent = icon;
                toastNotification.classList.add('show');
                setTimeout(() => {
                    toastNotification.classList.remove('show');
                }, 3000);
            }

            // Tab Navigation
            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetTab = btn.getAttribute('data-tab');
                    tabButtons.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    const targetEl = document.getElementById(targetTab);
                    if (targetEl) targetEl.classList.add('active');
                });
            });

            // FAQ Accordion
            document.querySelectorAll('.faq-header').forEach(hdr => {
                hdr.addEventListener('click', () => {
                    hdr.parentElement.classList.toggle('open');
                });
            });

            // Settings Change Handlers
            function bindSettingToggle(id, settingKey) {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('change', () => {
                        vscode.postMessage({
                            command: 'updateSetting',
                            key: settingKey,
                            value: el.checked
                        });
                        showToast('Saved ' + settingKey);
                    });
                }
            }

            function bindSettingSelect(id, settingKey) {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('change', () => {
                        vscode.postMessage({
                            command: 'updateSetting',
                            key: settingKey,
                            value: el.value
                        });
                        showToast('Updated ' + settingKey);
                    });
                }
            }

            bindSettingToggle('settingAutoRestore', 'autoRestoreLastProfile');
            bindSettingToggle('settingCloseAfterSwitch', 'closeAfterSwitch');
            bindSettingToggle('settingShowStatusBar', 'showStatusBarItem');
            bindSettingToggle('settingConfirmDelete', 'confirmDelete');
            bindSettingToggle('settingAutoSyncExtension', 'autoSyncExtension');
            bindSettingSelect('settingDefaultLaunchMode', 'defaultLaunchMode');
            bindSettingSelect('settingStatusBarAlignment', 'statusBarAlignment');

            document.getElementById('btnResetSettings').addEventListener('click', () => {
                vscode.postMessage({ command: 'resetSettings' });
            });

            document.getElementById('btnOpenNativeSettings').addEventListener('click', () => {
                vscode.postMessage({ command: 'openNativeSettings' });
            });

            // Header & Storage Actions
            document.getElementById('btnHeaderOpenFolder').addEventListener('click', () => {
                vscode.postMessage({ command: 'openProfilesFolder' });
            });
            document.getElementById('btnOpenStorageDir').addEventListener('click', () => {
                vscode.postMessage({ command: 'openProfilesFolder' });
            });

            document.getElementById('btnCopyStoragePath').addEventListener('click', () => {
                const pathText = document.getElementById('storagePathText').textContent;
                navigator.clipboard.writeText(pathText).then(() => {
                    showToast('Storage path copied to clipboard!', '📋');
                });
            });

            document.getElementById('btnCopyRegistryJson').addEventListener('click', () => {
                if (registryJsonText) {
                    navigator.clipboard.writeText(registryJsonText.value).then(() => {
                        showToast('Registry JSON copied!', '📋');
                    });
                }
            });

            document.getElementById('btnExportRegistry').addEventListener('click', () => {
                vscode.postMessage({ command: 'exportRegistry' });
            });

            document.getElementById('btnImportRegistry').addEventListener('click', () => {
                vscode.postMessage({ command: 'importRegistry' });
            });

            // Create Profile Modal
            function openCreateModal() {
                createProfileModal.classList.add('open');
                newProfileInput.value = '';
                setTimeout(() => newProfileInput.focus(), 50);
            }
            function closeCreateModal() {
                createProfileModal.classList.remove('open');
            }

            document.getElementById('btnHeaderCreateProfile').addEventListener('click', openCreateModal);
            document.getElementById('btnCreateProfileModal').addEventListener('click', openCreateModal);
            document.getElementById('btnCancelCreateModal').addEventListener('click', closeCreateModal);

            document.getElementById('btnConfirmCreateProfile').addEventListener('click', () => {
                const name = newProfileInput.value.trim();
                if (!name) return;
                vscode.postMessage({ command: 'createProfile', name });
                closeCreateModal();
            });

            newProfileInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const name = newProfileInput.value.trim();
                    if (name) {
                        vscode.postMessage({ command: 'createProfile', name });
                        closeCreateModal();
                    }
                } else if (e.key === 'Escape') {
                    closeCreateModal();
                }
            });

            // Rename Profile Modal
            function openRenameModal(key, currentName) {
                renameProfileKey.value = key;
                renameProfileInput.value = currentName || key;
                renameProfileModal.classList.add('open');
                setTimeout(() => renameProfileInput.focus(), 50);
            }
            function closeRenameModal() {
                renameProfileModal.classList.remove('open');
            }

            document.getElementById('btnCancelRenameModal').addEventListener('click', closeRenameModal);
            document.getElementById('btnConfirmRenameProfile').addEventListener('click', () => {
                const key = renameProfileKey.value;
                const newName = renameProfileInput.value.trim();
                if (key && newName) {
                    vscode.postMessage({ command: 'renameProfile', key, name: newName });
                    closeRenameModal();
                }
            });

            // Universal Event Delegation for all dynamic card actions (CSP Nonce Compliant)
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-action');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                if (!action) return;

                switch (action) {
                    case 'launch': {
                        const name = btn.getAttribute('data-name');
                        const mode = btn.getAttribute('data-mode');
                        if (name && mode) {
                            vscode.postMessage({ command: 'launchProfile', name, mode });
                        }
                        break;
                    }
                    case 'open-folder': {
                        const key = btn.getAttribute('data-key');
                        if (key) {
                            vscode.postMessage({ command: 'openProfileFolder', key });
                        }
                        break;
                    }
                    case 'rename': {
                        const key = btn.getAttribute('data-key');
                        const name = btn.getAttribute('data-name');
                        if (key) {
                            openRenameModal(key, name);
                        }
                        break;
                    }
                    case 'delete': {
                        const key = btn.getAttribute('data-key');
                        if (key) {
                            vscode.postMessage({ command: 'deleteProfile', key });
                        }
                        break;
                    }
                    case 'add-universal': {
                        const id = btn.getAttribute('data-id');
                        if (id) {
                            vscode.postMessage({ command: 'addUniversalExtension', id });
                        }
                        break;
                    }
                    case 'remove-universal': {
                        const id = btn.getAttribute('data-id');
                        if (id) {
                            vscode.postMessage({ command: 'removeUniversalExtension', id });
                        }
                        break;
                    }
                }
            });

            // Render Profiles Tab
            function renderProfiles(filterText = '') {
                const reg = appData.registry || { profiles: {} };
                const profiles = reg.profiles || {};
                const currentProfile = appData.currentProfile || 'Default';
                const keys = Object.keys(profiles);
                tabProfileCount.textContent = (keys.length + 1).toString();

                // Format JSON preview
                if (registryJsonText) {
                    registryJsonText.value = JSON.stringify(reg, null, 2);
                }

                let html = '';

                // Default Profile Card
                const isDefaultActive = currentProfile.toLowerCase() === 'default';
                const matchDefault = 'default profile global shared'.toLowerCase().includes(filterText.toLowerCase());

                if (!filterText || matchDefault) {
                    html += \`
                    <div class="profile-card \${isDefaultActive ? 'active-card' : ''}">
                        <div>
                            <div class="profile-card-header">
                                <div class="profile-avatar">🏠</div>
                                <div class="profile-card-title-group">
                                    <div class="profile-name-text">
                                        <span class="profile-name-span">Default Profile</span>
                                        \${isDefaultActive ? '<span class="badge badge-active" style="flex-shrink:0;">Active</span>' : ''}
                                    </div>
                                    <div class="profile-meta">
                                        <div class="profile-meta-row" title="Global shared extensions & user data">
                                            <span class="profile-meta-icon">📦</span>
                                            <span class="profile-meta-value">Global shared extensions & user data</span>
                                        </div>
                                        <div class="profile-meta-row" title="Main Antigravity IDE configuration">
                                            <span class="profile-meta-icon">⚙️</span>
                                            <span class="profile-meta-value">Main Antigravity IDE configuration</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="profile-actions">
                            <button class="btn btn-secondary btn-sm btn-action" data-action="launch" data-name="Default" data-mode="switch">🔄 Switch</button>
                            <button class="btn btn-secondary btn-sm btn-action" data-action="launch" data-name="Default" data-mode="new_window">🪟 New Window</button>
                        </div>
                    </div>
                    \`;
                }

                // Custom Profiles Cards
                for (const key of keys) {
                    const prof = profiles[key] || {};
                    const name = prof.name || key;
                    const isCurrent = currentProfile.toLowerCase() === key.toLowerCase();
                    const isLastActive = (reg.lastActiveProfile && reg.lastActiveProfile.toLowerCase() === key.toLowerCase());

                    if (filterText) {
                        const searchLower = filterText.toLowerCase();
                        if (!key.toLowerCase().includes(searchLower) && !name.toLowerCase().includes(searchLower)) {
                            continue;
                        }
                    }

                    const createdStr = prof.createdAt ? new Date(prof.createdAt).toLocaleDateString() : 'Unknown';
                    const lastUsedStr = prof.lastUsed ? new Date(prof.lastUsed).toLocaleString() : 'Never';
                    const wsStr = prof.lastWorkspacePath ? prof.lastWorkspacePath : 'None recorded';

                    html += \`
                    <div class="profile-card \${isCurrent ? 'active-card' : ''}">
                        <div>
                            <div class="profile-card-header">
                                <div class="profile-avatar">🪐</div>
                                <div class="profile-card-title-group">
                                    <div class="profile-name-text">
                                        <span class="profile-name-span" title="\${escapeHtml(name)}">\${escapeHtml(name)}</span>
                                        \${isCurrent ? '<span class="badge badge-active" style="flex-shrink:0;">Active</span>' : (isLastActive ? '<span class="badge badge-version" style="flex-shrink:0;">Last Active</span>' : '')}
                                    </div>
                                    <div class="profile-meta">
                                        <div class="profile-meta-row" title="Last Used: \${escapeHtml(lastUsedStr)}">
                                            <span class="profile-meta-icon">🕒</span>
                                            <span class="profile-meta-label">Last Used:</span>
                                            <span class="profile-meta-value">\${escapeHtml(lastUsedStr)}</span>
                                        </div>
                                        <div class="profile-meta-row" title="Workspace: \${escapeHtml(wsStr)}">
                                            <span class="profile-meta-icon">📁</span>
                                            <span class="profile-meta-label">Workspace:</span>
                                            <span class="profile-meta-value">\${escapeHtml(wsStr)}</span>
                                        </div>
                                        <div class="profile-meta-row" title="Created: \${escapeHtml(createdStr)}">
                                            <span class="profile-meta-icon">📅</span>
                                            <span class="profile-meta-label">Created:</span>
                                            <span class="profile-meta-value">\${escapeHtml(createdStr)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="profile-actions">
                            <button class="btn btn-secondary btn-sm btn-action" data-action="launch" data-name="\${escapeHtml(key)}" data-mode="switch">🔄 Switch</button>
                            <button class="btn btn-secondary btn-sm btn-action" data-action="launch" data-name="\${escapeHtml(key)}" data-mode="new_window">🪟 New Window</button>
                            <button class="btn btn-secondary btn-sm btn-action" data-action="open-folder" data-key="\${escapeHtml(key)}">📂 Folder</button>
                            <button class="btn btn-secondary btn-sm btn-action" data-action="rename" data-key="\${escapeHtml(key)}" data-name="\${escapeHtml(name)}">✏️</button>
                            <button class="btn btn-danger btn-sm btn-action" data-action="delete" data-key="\${escapeHtml(key)}">🗑️</button>
                        </div>
                    </div>
                    \`;
                }

                if (!html) {
                    html = '<div style="grid-column:1/-1; padding:32px; text-align:center; color:var(--text-muted);">No profiles matched your search query.</div>';
                }

                profileGridContainer.innerHTML = html;
            }

            // Render Universal Extensions Tab
            function renderUniversalExtensions(filterText = '') {
                const reg = appData.registry || {};
                const universalMap = reg.universalExtensions || {};
                const universalKeys = Object.keys(universalMap);
                const installed = appData.installedExtensions || [];

                tabUniversalCount.textContent = universalKeys.length.toString();
                universalActiveCount.textContent = universalKeys.length.toString();
                installedCount.textContent = installed.length.toString();

                // 1. Render Active Universal Pool
                let activeHtml = '';
                if (universalKeys.length === 0) {
                    activeHtml = \`
                    <div style="grid-column:1/-1; padding:28px; text-align:center; background:var(--card-bg); border:1px dashed var(--card-border); border-radius:var(--radius-md); color:var(--text-muted); font-size:12px;">
                        No universal extensions configured yet. Select any installed extension below to automatically include it in all future new profiles!
                    </div>
                    \`;
                } else {
                    for (const id of universalKeys) {
                        const item = universalMap[id] || {};
                        const title = item.name || id;
                        const pub = item.publisher || id.split('.')[0] || '';
                        const ver = item.version || '1.0.0';
                        const desc = item.description || 'No description provided.';

                        activeHtml += \`
                        <div class="profile-card active-card">
                            <div>
                                <div class="profile-card-header">
                                    <div class="profile-avatar">✨</div>
                                    <div class="profile-card-title-group">
                                        <div class="profile-name-text">
                                            <span class="profile-name-span" title="\${escapeHtml(title)}">\${escapeHtml(title)}</span>
                                            <span class="badge badge-active" style="flex-shrink:0;">Universal</span>
                                        </div>
                                        <div class="profile-meta">
                                            <div class="profile-meta-row" title="ID: \${escapeHtml(id)}">
                                                <span class="profile-meta-icon">🆔</span>
                                                <span class="profile-meta-label">ID:</span>
                                                <span class="profile-meta-value">\${escapeHtml(id)}</span>
                                            </div>
                                            <div class="profile-meta-row" title="Publisher: \${escapeHtml(pub)} | Version: \${escapeHtml(ver)}">
                                                <span class="profile-meta-icon">🏷️</span>
                                                <span class="profile-meta-label">Version:</span>
                                                <span class="profile-meta-value">v\${escapeHtml(ver)} by \${escapeHtml(pub)}</span>
                                            </div>
                                            <div class="profile-meta-row" title="\${escapeHtml(desc)}">
                                                <span class="profile-meta-icon">📝</span>
                                                <span class="profile-meta-value">\${escapeHtml(desc)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="profile-actions">
                                <button class="btn btn-danger btn-sm btn-action" data-action="remove-universal" data-id="\${escapeHtml(id)}">
                                    🗑️ Remove from Universal
                                </button>
                            </div>
                        </div>
                        \`;
                    }
                }
                universalActiveGridContainer.innerHTML = activeHtml;

                // 2. Render Installed Extensions in Active Profile
                let instHtml = '';
                const searchLower = filterText.toLowerCase();

                const filteredInstalled = installed.filter(ext => {
                    if (!filterText) return true;
                    return (ext.name && ext.name.toLowerCase().includes(searchLower)) ||
                           (ext.id && ext.id.toLowerCase().includes(searchLower)) ||
                           (ext.publisher && ext.publisher.toLowerCase().includes(searchLower));
                });

                if (filteredInstalled.length === 0) {
                    instHtml = \`
                    <div style="grid-column:1/-1; padding:28px; text-align:center; background:var(--card-bg); border:1px dashed var(--card-border); border-radius:var(--radius-md); color:var(--text-muted); font-size:12px;">
                        \${filterText ? 'No installed extensions matched your search query.' : 'No additional user extensions detected in this profile.'}
                    </div>
                    \`;
                } else {
                    for (const ext of filteredInstalled) {
                        const isUni = Boolean(universalMap[ext.id]);
                        const title = ext.name || ext.id;
                        const pub = ext.publisher || ext.id.split('.')[0] || '';
                        const ver = ext.version || '1.0.0';
                        const desc = ext.description || 'No description provided.';

                        instHtml += \`
                        <div class="profile-card \${isUni ? 'active-card' : ''}">
                            <div>
                                <div class="profile-card-header">
                                    <div class="profile-avatar">\${isUni ? '⭐' : '📦'}</div>
                                    <div class="profile-card-title-group">
                                        <div class="profile-name-text">
                                            <span class="profile-name-span" title="\${escapeHtml(title)}">\${escapeHtml(title)}</span>
                                            \${isUni ? '<span class="badge badge-active" style="flex-shrink:0;">Universal</span>' : '<span class="badge badge-version" style="flex-shrink:0;">Installed</span>'}
                                        </div>
                                        <div class="profile-meta">
                                            <div class="profile-meta-row" title="ID: \${escapeHtml(ext.id)}">
                                                <span class="profile-meta-icon">🆔</span>
                                                <span class="profile-meta-label">ID:</span>
                                                <span class="profile-meta-value">\${escapeHtml(ext.id)}</span>
                                            </div>
                                            <div class="profile-meta-row" title="Publisher: \${escapeHtml(pub)} | Version: \${escapeHtml(ver)}">
                                                <span class="profile-meta-icon">🏷️</span>
                                                <span class="profile-meta-label">Version:</span>
                                                <span class="profile-meta-value">v\${escapeHtml(ver)} by \${escapeHtml(pub)}</span>
                                            </div>
                                            <div class="profile-meta-row" title="\${escapeHtml(desc)}">
                                                <span class="profile-meta-icon">📝</span>
                                                <span class="profile-meta-value">\${escapeHtml(desc)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="profile-actions">
                                \${isUni 
                                    ? \`<button class="btn btn-secondary btn-sm btn-action" data-action="remove-universal" data-id="\${escapeHtml(ext.id)}">✓ Universal (Click to Remove)</button>\`
                                    : \`<button class="btn btn-primary btn-sm btn-action" data-action="add-universal" data-id="\${escapeHtml(ext.id)}">⭐ Set as Universal</button>\`
                                }
                            </div>
                        </div>
                        \`;
                    }
                }
                installedExtensionsGridContainer.innerHTML = instHtml;
            }

            // Search Filters
            profileSearchInput.addEventListener('input', () => {
                renderProfiles(profileSearchInput.value.trim());
            });

            universalSearchInput.addEventListener('input', () => {
                renderUniversalExtensions(universalSearchInput.value.trim());
            });

            // Message receiver from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (!message) return;

                switch (message.type) {
                    case 'stateUpdate':
                        if (message.appData) {
                            appData = message.appData;
                            renderProfiles(profileSearchInput.value.trim());
                            renderUniversalExtensions(universalSearchInput.value.trim());
                            if (appData.currentProfile) {
                                const badge = document.getElementById('heroActiveBadge');
                                if (badge) {
                                    badge.textContent = 'Active: ' + appData.currentProfile;
                                    badge.title = 'Active Profile: ' + appData.currentProfile;
                                }
                            }
                        }
                        break;
                    case 'showToast':
                        showToast(message.text || '', message.icon || '✨');
                        break;
                }
            });

            // Initial render
            renderProfiles();
            renderUniversalExtensions();

            function escapeHtml(str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        })();
    </script>
</body>
</html>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = {
    getSettingsHtml
};
