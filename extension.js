const vscode = require('vscode');
const path = require('path');
const { getProfilesRoot } = require('./src/constants');
const { getProfilesRegistry, saveProfilesRegistry, findProfileKey } = require('./src/registry');
const { syncExtensionToAllProfiles, getProfileLastWorkspaceFromStorage } = require('./src/fileSync');
const {
    getCurrentProfile,
    getCurrentWorkspacePath,
    launchProfile,
    showProfileMenu,
    promptCreateProfile,
    updateActiveProfileWorkspace
} = require('./src/profileManager');
const { validateWorkspacePath } = require('./src/launcher');

let activeProfileName = 'Default';

/**
 * Activates the Antigravity Profile Manager extension.
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const currentProfile = getCurrentProfile(context);
    activeProfileName = currentProfile;
    const { profilesRoot, registryPath, registry } = getProfilesRegistry();

    // Ensure all custom profile directories have the latest Orbit extension and cleaned obsolete versions
    const sourceExtPath = (context && context.extensionPath) ? context.extensionPath : path.resolve(__dirname);
    try {
        syncExtensionToAllProfiles(sourceExtPath, profilesRoot);
    } catch (e) { }

    // Check if auto-restore is enabled (default: true)
    const orbitConfig = vscode.workspace.getConfiguration('antigravity-orbit');
    const legacyConfig = vscode.workspace.getConfiguration('antigravity-profile-manager');
    const autoRestore = orbitConfig.get('autoRestoreLastProfile', legacyConfig.get('autoRestoreLastProfile', true));

    // If starting in Default profile, check if we should seamlessly restore the last active custom profile
    if (currentProfile.toLowerCase() === 'default') {
        const lastActive = registry.lastActiveProfile;
        if (autoRestore && lastActive && lastActive.toLowerCase() !== 'default') {
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
    } else {
        // Record this custom profile and its current workspace
        updateActiveProfileWorkspace(currentProfile);

        // Listen for workspace folder changes in real-time (e.g. folder opened, changed, or closed)
        const wsWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            updateActiveProfileWorkspace(currentProfile);
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

    const switchCmd = vscode.commands.registerCommand('antigravity-orbit.switch', switchHandler);
    const createCmd = vscode.commands.registerCommand('antigravity-orbit.create', createHandler);
    const openFolderCmd = vscode.commands.registerCommand('antigravity-orbit.openFolder', openFolderHandler);

    // Legacy aliases
    const legacySwitchCmd = vscode.commands.registerCommand('antigravity-profile-manager.switch', switchHandler);
    const legacyCreateCmd = vscode.commands.registerCommand('antigravity-profile-manager.create', createHandler);
    const legacyOpenFolderCmd = vscode.commands.registerCommand('antigravity-profile-manager.openFolder', openFolderHandler);

    context.subscriptions.push(
        switchCmd, createCmd, openFolderCmd,
        legacySwitchCmd, legacyCreateCmd, legacyOpenFolderCmd
    );

    // 2. Inject clickable Status Bar item with active Orbit indicator
    const profileStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    profileStatusBarItem.command = 'antigravity-orbit.switch';
    profileStatusBarItem.text = `$(globe) Orbit: ${currentProfile}`;
    profileStatusBarItem.tooltip = `Orbit: ${currentProfile}\nClick to switch, create, or manage profiles`;
    profileStatusBarItem.show();
    context.subscriptions.push(profileStatusBarItem);
}

function deactivate() {
    if (activeProfileName && activeProfileName.toLowerCase() !== 'default') {
        try {
            updateActiveProfileWorkspace(activeProfileName);
        } catch (e) { }
    }
}

module.exports = {
    activate,
    deactivate
};
