const vscode = require('vscode');
const { getProfilesRoot } = require('./src/constants');
const { getProfilesRegistry, saveProfilesRegistry } = require('./src/registry');
const {
    getCurrentProfile,
    getCurrentWorkspacePath,
    launchProfile,
    showProfileMenu,
    promptCreateProfile
} = require('./src/profileManager');

/**
 * Activates the Antigravity Profile Manager extension.
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const currentProfile = getCurrentProfile(context);
    const { registryPath, registry } = getProfilesRegistry();

    // Check if auto-restore is enabled (default: true)
    const orbitConfig = vscode.workspace.getConfiguration('antigravity-orbit');
    const legacyConfig = vscode.workspace.getConfiguration('antigravity-profile-manager');
    const autoRestore = orbitConfig.get('autoRestoreLastProfile', legacyConfig.get('autoRestoreLastProfile', true));

    // If starting in Default profile, check if we should seamlessly restore the last active custom profile
    if (currentProfile.toLowerCase() === 'default') {
        const lastActive = registry.lastActiveProfile;
        if (autoRestore && lastActive && lastActive.toLowerCase() !== 'default' && registry.profiles[lastActive]) {
            const wsPath = getCurrentWorkspacePath();
            await launchProfile(lastActive, context, {
                workspacePath: wsPath,
                closeCurrent: true,
                silent: true
            });
            return;
        }
    } else {
        // Record this custom profile as the most recently active profile
        if (registry.lastActiveProfile !== currentProfile) {
            registry.lastActiveProfile = currentProfile;
            if (registry.profiles[currentProfile]) {
                registry.profiles[currentProfile].lastUsed = new Date().toISOString();
            }
            saveProfilesRegistry(registryPath, registry);
        }
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

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
