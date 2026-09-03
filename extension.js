const vscode = require('vscode');
const path = require('path');
const { getProfilesRoot } = require('./src/constants');
const { getProfilesRegistry, saveProfilesRegistry, findProfileKey } = require('./src/registry');
const { syncExtensionToAllProfiles, getProfileLastWorkspaceFromStorage } = require('./src/fileSync');
const {
    getCurrentProfile,
    getCurrentWorkspacePath,
    isSwitchingInProgress,
    launchProfile,
    showProfileMenu,
    promptCreateProfile,
    updateActiveProfileWorkspace
} = require('./src/profileManager');
const { validateWorkspacePath } = require('./src/launcher');
const { SettingsPanel } = require('./src/settingsPanel');

let activeProfileName = 'Default';
let profileStatusBarItem = null;

/**
 * Updates or rebuilds the status bar item according to user preferences.
 * @param {vscode.ExtensionContext} context
 * @param {string} currentProfile
 */
function updateStatusBar(context, currentProfile) {
    const orbitConfig = vscode.workspace.getConfiguration('antigravity-orbit');
    const showItem = orbitConfig.get('showStatusBarItem', true);
    const alignment = orbitConfig.get('statusBarAlignment', 'Left');

    if (profileStatusBarItem) {
        profileStatusBarItem.dispose();
        profileStatusBarItem = null;
    }

    if (!showItem) {
        return;
    }

    const alignEnum = (alignment === 'Right')
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left;

    profileStatusBarItem = vscode.window.createStatusBarItem(alignEnum, 99);
    profileStatusBarItem.command = 'antigravity-orbit.switch';
    profileStatusBarItem.text = `$(globe) Orbit: ${currentProfile}`;
    profileStatusBarItem.tooltip = `Orbit: ${currentProfile}\nClick to switch, create, or customize settings`;
    profileStatusBarItem.show();
    context.subscriptions.push(profileStatusBarItem);
}

/**
 * Activates the Antigravity Profile Manager extension.
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const currentProfile = getCurrentProfile(context);
    activeProfileName = currentProfile;
    const { profilesRoot, registryPath, registry } = getProfilesRegistry();

    const orbitConfig = vscode.workspace.getConfiguration('antigravity-orbit');
    const legacyConfig = vscode.workspace.getConfiguration('antigravity-profile-manager');

    // Ensure all custom profile directories have the latest Orbit extension if autoSyncExtension is enabled
    const autoSync = orbitConfig.get('autoSyncExtension', true);
    if (autoSync) {
        const sourceExtPath = (context && context.extensionPath) ? context.extensionPath : path.resolve(__dirname);
        try {
            syncExtensionToAllProfiles(sourceExtPath, profilesRoot);
        } catch (e) { }
    }

    // Check if auto-restore is enabled (default: true)
    const autoRestore = orbitConfig.get('autoRestoreLastProfile', legacyConfig.get('autoRestoreLastProfile', true));

    // If starting in Default profile, check if we should seamlessly restore the last active custom profile
    if (currentProfile.toLowerCase() === 'default') {
        const lastActive = registry.lastActiveProfile;

        // Guard: Prevent auto-restoring/closing window during auth callbacks, URI redirects, or CLI operations
        let isSpecialInvocation = false;
        if (Array.isArray(process.argv)) {
            for (const arg of process.argv) {
                if (typeof arg === 'string') {
                    const lower = arg.toLowerCase();
                    if (lower.startsWith('antigravity://') || lower.startsWith('vscode://') || lower.startsWith('vscode-insiders://') ||
                        lower === '--open-url' || lower === '--status' || lower === '--version' || lower === '-v' ||
                        lower === '--list-extensions' || lower === '--install-extension') {
                        isSpecialInvocation = true;
                        break;
                    }
                }
            }
        }

        if (!isSpecialInvocation && autoRestore && lastActive && lastActive.toLowerCase() !== 'default') {
            const matchedKey = findProfileKey(registry, lastActive);
            if (matchedKey && registry.profiles[matchedKey]) {
                let savedWs = registry.profiles[matchedKey].lastWorkspacePath;
                if (savedWs === undefined || savedWs === null) {
                    savedWs = getProfileLastWorkspaceFromStorage(matchedKey, profilesRoot);
                }
                const validWs = validateWorkspacePath(savedWs);

                await launchProfile(matchedKey, context, {
                    workspacePath: validWs || undefined,
                    closeCurrent: true,
                    silent: true
                });
                return;
            }
        }

        // If not auto-restoring (or disabled / profile missing), ensure registry marks Default as last active
        if (registry.lastActiveProfile !== 'Default') {
            registry.lastActiveProfile = 'Default';
            saveProfilesRegistry(registryPath, registry);
        }
    } else {
        // Record this custom profile and its current workspace
        updateActiveProfileWorkspace(currentProfile, { updateLastActive: true });

        // Listen for workspace folder changes in real-time (e.g. folder opened, changed, or closed)
        const wsWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            updateActiveProfileWorkspace(currentProfile, { updateLastActive: true });
        });
        context.subscriptions.push(wsWatcher);
    }

    // 1. Register contributed commands (with legacy alias support)
    const switchHandler = async () => { await showProfileMenu(context); };
    const createHandler = async () => { await promptCreateProfile(context); };
    const openFolderHandler = () => {
        const root = getProfilesRoot();
        vscode.env.openExternal(vscode.Uri.file(root));
    };
    const openSettingsHandler = () => {
        SettingsPanel.createOrShow(context);
    };

    const switchCmd = vscode.commands.registerCommand('antigravity-orbit.switch', switchHandler);
    const createCmd = vscode.commands.registerCommand('antigravity-orbit.create', createHandler);
    const openFolderCmd = vscode.commands.registerCommand('antigravity-orbit.openFolder', openFolderHandler);
    const openSettingsCmd = vscode.commands.registerCommand('antigravity-orbit.openSettings', openSettingsHandler);

    // Legacy aliases
    const legacySwitchCmd = vscode.commands.registerCommand('antigravity-profile-manager.switch', switchHandler);
    const legacyCreateCmd = vscode.commands.registerCommand('antigravity-profile-manager.create', createHandler);
    const legacyOpenFolderCmd = vscode.commands.registerCommand('antigravity-profile-manager.openFolder', openFolderHandler);
    const legacyOpenSettingsCmd = vscode.commands.registerCommand('antigravity-profile-manager.openSettings', openSettingsHandler);

    context.subscriptions.push(
        switchCmd, createCmd, openFolderCmd, openSettingsCmd,
        legacySwitchCmd, legacyCreateCmd, legacyOpenFolderCmd, legacyOpenSettingsCmd
    );

    // 2. Inject clickable Status Bar item with active Orbit indicator
    updateStatusBar(context, currentProfile);

    // 3. Listen for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e || e.affectsConfiguration('antigravity-orbit') || e.affectsConfiguration('antigravity-profile-manager')) {
            updateStatusBar(context, currentProfile);
            if (SettingsPanel.currentPanel) {
                SettingsPanel.currentPanel.updateWebviewState();
            }
        }
    });
    context.subscriptions.push(configWatcher);
}

function deactivate() {
    if (!isSwitchingInProgress() && activeProfileName && activeProfileName.toLowerCase() !== 'default') {
        try {
            updateActiveProfileWorkspace(activeProfileName, { updateLastActive: false });
        } catch (e) { }
    }
}

module.exports = {
    activate,
    deactivate,
    updateStatusBar
};
