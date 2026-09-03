const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { getProfilesRoot } = require('./constants');
const { getProfilesRegistry, saveProfilesRegistry, findProfileKey } = require('./registry');
const { sanitizeProfileName, sanitizeExtensionId } = require('./sanitizer');
const {
    getCurrentProfile,
    getCurrentWorkspacePath,
    launchProfile
} = require('./profileManager');
const { syncExtensionToProfile } = require('./fileSync');
const {
    getInstalledUserExtensions,
    addUniversalExtension,
    removeUniversalExtension,
    syncUniversalExtensionsToNewProfile
} = require('./universalExtensions');
const { getSettingsHtml } = require('./settingsHtml');

const ALLOWED_SETTING_KEYS = new Set([
    'autoRestoreLastProfile',
    'defaultLaunchMode',
    'confirmDelete',
    'showStatusBarItem',
    'statusBarAlignment',
    'autoSyncExtension',
    'closeAfterSwitch'
]);

class SettingsPanel {
    static viewType = 'antigravity-orbit.settings';

    /**
     * @param {vscode.WebviewPanel} panel
     * @param {vscode.ExtensionContext} context
     */
    constructor(panel, context) {
        this._panel = panel;
        this._context = context;
        this._disposables = [];

        // Set initial HTML content
        this._update();

        // Listen for panel close
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Listen for messages from webview
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    /**
     * Creates or shows the settings panel singleton.
     * @param {vscode.ExtensionContext} context
     * @returns {SettingsPanel}
     */
    static createOrShow(context) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            SettingsPanel.currentPanel._update();
            return SettingsPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            SettingsPanel.viewType,
            'Orbit Settings & Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(context.extensionPath || __dirname)
                ]
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, context);
        return SettingsPanel.currentPanel;
    }

    /**
     * Updates the HTML contents of the webview.
     */
    _update() {
        const currentProfile = getCurrentProfile(this._context);
        const { profilesRoot, registry } = getProfilesRegistry();
        const settings = this._getOrbitSettings();
        const version = this._getExtensionVersion();
        const iconDataUri = this._getIconDataUri();
        const installedExtensions = getInstalledUserExtensions(this._context);
        const nonce = crypto.randomBytes(16).toString('hex');

        this._panel.webview.html = getSettingsHtml({
            nonce,
            currentProfile,
            version,
            profilesRoot,
            settings,
            registry,
            iconDataUri,
            installedExtensions
        });
    }

    /**
     * Reads and converts icon.png to a base64 Data URI.
     */
    _getIconDataUri() {
        try {
            const extPath = (this._context && this._context.extensionPath) ? this._context.extensionPath : path.resolve(__dirname, '..');
            const iconPath = path.join(extPath, 'icon.png');
            if (fs.existsSync(iconPath)) {
                const iconBuf = fs.readFileSync(iconPath);
                return `data:image/png;base64,${iconBuf.toString('base64')}`;
            }
        } catch (e) { }
        return null;
    }

    /**
     * Retrieves current extension settings object.
     */
    _getOrbitSettings() {
        const config = vscode.workspace.getConfiguration('antigravity-orbit');
        return {
            autoRestoreLastProfile: config.get('autoRestoreLastProfile', true),
            defaultLaunchMode: config.get('defaultLaunchMode', 'prompt'),
            confirmDelete: config.get('confirmDelete', true),
            showStatusBarItem: config.get('showStatusBarItem', true),
            statusBarAlignment: config.get('statusBarAlignment', 'Left'),
            autoSyncExtension: config.get('autoSyncExtension', true),
            closeAfterSwitch: config.get('closeAfterSwitch', true)
        };
    }

    /**
     * Resolves the extension version from package.json.
     */
    _getExtensionVersion() {
        try {
            const extPath = (this._context && this._context.extensionPath) ? this._context.extensionPath : path.resolve(__dirname, '..');
            const pkgPath = path.join(extPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg && pkg.version) return pkg.version;
            }
        } catch (e) { }
        return '1.0.5';
    }

    /**
     * Posts updated state to the webview.
     */
    updateWebviewState() {
        if (!this._panel) return;
        const currentProfile = getCurrentProfile(this._context);
        const { profilesRoot, registry } = getProfilesRegistry();
        const settings = this._getOrbitSettings();
        const version = this._getExtensionVersion();
        const installedExtensions = getInstalledUserExtensions(this._context);

        this._panel.webview.postMessage({
            type: 'stateUpdate',
            appData: {
                currentProfile,
                version,
                profilesRoot,
                settings,
                registry,
                installedExtensions
            }
        });
    }

    /**
     * Handles incoming messages from the webview UI.
     * @param {object} message
     */
    async _handleMessage(message) {
        if (!message || !message.command || typeof message.command !== 'string') return;

        const { profilesRoot, registryPath, registry } = getProfilesRegistry();

        switch (message.command) {
            case 'updateSetting': {
                try {
                    if (ALLOWED_SETTING_KEYS.has(message.key)) {
                        const config = vscode.workspace.getConfiguration('antigravity-orbit');
                        await config.update(message.key, message.value, vscode.ConfigurationTarget.Global);
                        this.updateWebviewState();
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to update setting '${message.key}': ${err.message}`);
                }
                break;
            }

            case 'resetSettings': {
                const confirm = await vscode.window.showWarningMessage(
                    'Reset all Orbit configuration settings to their default values?',
                    { modal: true },
                    'Reset Settings'
                );
                if (confirm === 'Reset Settings') {
                    try {
                        const config = vscode.workspace.getConfiguration('antigravity-orbit');
                        for (const key of ALLOWED_SETTING_KEYS) {
                            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
                        }
                        this.updateWebviewState();
                        this._panel.webview.postMessage({ type: 'showToast', text: 'All settings reset to defaults', icon: '↺' });
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to reset settings: ${err.message}`);
                    }
                }
                break;
            }

            case 'openNativeSettings': {
                vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sajedulisakib-001.antigravity-orbit');
                break;
            }

            case 'openProfilesFolder': {
                vscode.env.openExternal(vscode.Uri.file(profilesRoot));
                break;
            }

            case 'openProfileFolder': {
                if (message.key && typeof message.key === 'string') {
                    const safeKey = sanitizeProfileName(message.key);
                    if (safeKey) {
                        const resolvedRoot = path.resolve(profilesRoot);
                        const targetPath = path.resolve(profilesRoot, safeKey);
                        if (targetPath.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep.toLowerCase())) {
                            if (fs.existsSync(targetPath)) {
                                vscode.env.openExternal(vscode.Uri.file(targetPath));
                            } else {
                                vscode.window.showErrorMessage(`Profile folder does not exist: ${targetPath}`);
                            }
                        } else {
                            vscode.window.showErrorMessage('Unauthorized directory access.');
                        }
                    }
                }
                break;
            }

            case 'launchProfile': {
                const { name, mode } = message;
                const config = vscode.workspace.getConfiguration('antigravity-orbit');
                const closeAfterSwitch = config.get('closeAfterSwitch', true);
                const wsPath = getCurrentWorkspacePath();

                let shouldClose = false;
                let launchWs = undefined;

                if (mode === 'switch') {
                    shouldClose = closeAfterSwitch;
                    launchWs = wsPath;
                } else if (mode === 'new_window') {
                    shouldClose = false;
                    launchWs = undefined;
                }

                await launchProfile(name, this._context, {
                    workspacePath: launchWs,
                    closeCurrent: shouldClose
                });
                break;
            }

            case 'createProfile': {
                const rawName = message.name;
                const cleanName = sanitizeProfileName(rawName);
                if (!cleanName) {
                    vscode.window.showErrorMessage('Invalid profile name. Please use alphanumeric characters, dashes, or underscores (max 48 characters).');
                    return;
                }

                const customExtDir = path.join(profilesRoot, cleanName, 'extensions');
                const customDataDir = path.join(profilesRoot, cleanName, 'user-data');

                try {
                    fs.mkdirSync(customExtDir, { recursive: true, mode: 0o700 });
                    fs.mkdirSync(customDataDir, { recursive: true, mode: 0o700 });

                    const sourceExt = (this._context && this._context.extensionPath) ? this._context.extensionPath : path.resolve(__dirname, '..');
                    syncExtensionToProfile(sourceExt, customExtDir);
                    syncUniversalExtensionsToNewProfile(customExtDir);

                    const wsPath = getCurrentWorkspacePath();
                    registry.profiles[cleanName] = {
                        name: rawName.trim().slice(0, 100),
                        createdAt: new Date().toISOString(),
                        lastUsed: new Date().toISOString(),
                        lastWorkspacePath: wsPath || null
                    };
                    saveProfilesRegistry(registryPath, registry);

                    this.updateWebviewState();
                    this._panel.webview.postMessage({ type: 'showToast', text: `Profile '${cleanName}' created successfully!`, icon: '✨' });

                    // Automatically launch based on user preference
                    const config = vscode.workspace.getConfiguration('antigravity-orbit');
                    const launchMode = config.get('defaultLaunchMode', 'prompt');

                    if (launchMode === 'switch') {
                        const closeAfter = config.get('closeAfterSwitch', true);
                        await launchProfile(cleanName, this._context, { workspacePath: wsPath, closeCurrent: closeAfter });
                    } else if (launchMode === 'new_window') {
                        await launchProfile(cleanName, this._context, { workspacePath: undefined, closeCurrent: false });
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to create profile: ${err.message}`);
                }
                break;
            }

            case 'renameProfile': {
                const { key, name } = message;
                const safeKey = sanitizeProfileName(key);
                if (!safeKey || !registry.profiles[safeKey]) {
                    vscode.window.showErrorMessage('Profile not found in registry.');
                    return;
                }
                const newDisplayName = (name && typeof name === 'string') ? name.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey;
                registry.profiles[safeKey].name = newDisplayName || safeKey;
                saveProfilesRegistry(registryPath, registry);
                this.updateWebviewState();
                this._panel.webview.postMessage({ type: 'showToast', text: `Renamed to '${newDisplayName}'`, icon: '✏️' });
                break;
            }

            case 'deleteProfile': {
                const { key } = message;
                const safeKey = sanitizeProfileName(key);
                if (!safeKey || !registry.profiles[safeKey]) {
                    vscode.window.showErrorMessage('Profile not found.');
                    return;
                }

                const config = vscode.workspace.getConfiguration('antigravity-orbit');
                const confirmRequired = config.get('confirmDelete', true);
                const currentProfile = getCurrentProfile(this._context);
                const isCurrent = currentProfile.toLowerCase() === safeKey.toLowerCase();

                if (confirmRequired) {
                    const warningMsg = isCurrent
                        ? `You are currently using profile '${safeKey}'. Deleting it will remove its files on disk. Continue?`
                        : `Are you sure you want to permanently delete profile '${safeKey}' and all its isolated data?`;

                    const confirm = await vscode.window.showWarningMessage(
                        warningMsg,
                        { modal: true },
                        'Delete Profile'
                    );
                    if (confirm !== 'Delete Profile') {
                        return;
                    }
                }

                try {
                    const resolvedRoot = path.resolve(profilesRoot);
                    const profileDir = path.resolve(profilesRoot, safeKey);

                    // Security: Strict path boundary check
                    const lowerDir = profileDir.toLowerCase();
                    const lowerRoot = resolvedRoot.toLowerCase();
                    if (!lowerDir.startsWith(lowerRoot + path.sep.toLowerCase()) || lowerDir === lowerRoot) {
                        throw new Error('Access denied: Profile path is outside authorized storage root.');
                    }

                    if (fs.existsSync(profileDir)) {
                        const stat = fs.lstatSync(profileDir);
                        if (stat.isSymbolicLink()) {
                            fs.unlinkSync(profileDir);
                        } else {
                            fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                        }
                    }

                    delete registry.profiles[safeKey];
                    if (registry.lastActiveProfile && registry.lastActiveProfile.toLowerCase() === safeKey.toLowerCase()) {
                        registry.lastActiveProfile = 'Default';
                    }
                    saveProfilesRegistry(registryPath, registry);

                    this.updateWebviewState();
                    this._panel.webview.postMessage({ type: 'showToast', text: `Deleted profile '${safeKey}'`, icon: '🗑️' });
                } catch (err) {
                    vscode.window.showErrorMessage(`Failed to delete profile: ${err.message}`);
                }
                break;
            }

            case 'exportRegistry': {
                try {
                    const defaultUri = vscode.Uri.file(path.join(profilesRoot, `orbit-profiles-backup-${new Date().toISOString().slice(0, 10)}.json`));
                    const fileUri = await vscode.window.showSaveDialog({
                        defaultUri,
                        filters: { 'JSON Files': ['json'] },
                        saveLabel: 'Export Registry Backup'
                    });
                    if (fileUri) {
                        const content = JSON.stringify(registry, null, 2);
                        fs.writeFileSync(fileUri.fsPath, content, { encoding: 'utf8', mode: 0o600 });
                        vscode.window.showInformationMessage(`Registry exported to ${fileUri.fsPath}`);
                        this._panel.webview.postMessage({ type: 'showToast', text: 'Backup exported successfully!', icon: '💾' });
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Export failed: ${err.message}`);
                }
                break;
            }

            case 'importRegistry': {
                try {
                    const fileUris = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: { 'JSON Files': ['json'] },
                        openLabel: 'Import Registry Backup'
                    });
                    if (fileUris && fileUris.length > 0) {
                        const filePath = fileUris[0].fsPath;
                        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                            if (raw.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles)) {
                                for (const key of Object.keys(raw.profiles)) {
                                    const safeKey = sanitizeProfileName(key);
                                    if (safeKey && Object.prototype.hasOwnProperty.call(raw.profiles, key)) {
                                        const entry = raw.profiles[key];
                                        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                                            const rawName = typeof entry.name === 'string' ? entry.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey;
                                            let lastWs = null;
                                            if (typeof entry.lastWorkspacePath === 'string') {
                                                const trimmedWs = entry.lastWorkspacePath.trim().replace(/[\x00-\x1F\x7F]/g, '');
                                                if (trimmedWs && !trimmedWs.startsWith('-') && trimmedWs.length <= 4096) {
                                                    lastWs = trimmedWs;
                                                }
                                            }
                                            registry.profiles[safeKey] = {
                                                name: rawName.trim() || safeKey,
                                                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
                                                lastUsed: typeof entry.lastUsed === 'string' ? entry.lastUsed : new Date().toISOString(),
                                                lastWorkspacePath: lastWs
                                            };
                                        }
                                    }
                                }
                            }
                            if (raw.universalExtensions && typeof raw.universalExtensions === 'object' && !Array.isArray(raw.universalExtensions)) {
                                for (const key of Object.keys(raw.universalExtensions)) {
                                    const safeKey = sanitizeExtensionId(key);
                                    if (safeKey && Object.prototype.hasOwnProperty.call(raw.universalExtensions, key)) {
                                        const entry = raw.universalExtensions[key];
                                        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                                            registry.universalExtensions[safeKey] = {
                                                id: safeKey,
                                                name: typeof entry.name === 'string' ? entry.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey,
                                                publisher: typeof entry.publisher === 'string' ? entry.publisher.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : '',
                                                version: typeof entry.version === 'string' ? entry.version.slice(0, 50).replace(/[\x00-\x1F\x7F]/g, '') : '1.0.0',
                                                folderName: typeof entry.folderName === 'string' ? sanitizeExtensionId(entry.folderName) || safeKey : safeKey,
                                                description: typeof entry.description === 'string' ? entry.description.slice(0, 250).replace(/[\x00-\x1F\x7F]/g, '') : '',
                                                addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : new Date().toISOString()
                                            };
                                        }
                                    }
                                }
                            }
                            if (typeof raw.lastActiveProfile === 'string') {
                                const safeLast = sanitizeProfileName(raw.lastActiveProfile.trim());
                                if (safeLast && (safeLast.toLowerCase() === 'default' || registry.profiles[safeLast])) {
                                    registry.lastActiveProfile = safeLast;
                                }
                            }
                            saveProfilesRegistry(registryPath, registry);
                            this.updateWebviewState();
                            vscode.window.showInformationMessage('Registry backup imported successfully!');
                            this._panel.webview.postMessage({ type: 'showToast', text: 'Registry backup imported!', icon: '📥' });
                        } else {
                            vscode.window.showErrorMessage('Invalid registry backup file format.');
                        }
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`Import failed: ${err.message}`);
                }
                break;
            }

            case 'addUniversalExtension': {
                try {
                    const extId = message.id;
                    addUniversalExtension(extId, this._context);
                    this.updateWebviewState();
                    this._panel.webview.postMessage({
                        type: 'showToast',
                        text: `⭐ Added '${extId}' to Universal Extensions!`,
                        icon: '✨'
                    });
                } catch (err) {
                    vscode.window.showErrorMessage(err.message || 'Failed to add universal extension.');
                }
                break;
            }

            case 'removeUniversalExtension': {
                try {
                    const extId = message.id;
                    removeUniversalExtension(extId);
                    this.updateWebviewState();
                    this._panel.webview.postMessage({
                        type: 'showToast',
                        text: `Removed '${extId}' from Universal Extensions`,
                        icon: '🗑️'
                    });
                } catch (err) {
                    vscode.window.showErrorMessage(err.message || 'Failed to remove universal extension.');
                }
                break;
            }

            case 'refresh': {
                this.updateWebviewState();
                break;
            }
        }
    }

    dispose() {
        if (this._isDisposed) return;
        this._isDisposed = true;
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}

SettingsPanel.currentPanel = undefined;

module.exports = {
    SettingsPanel
};
