const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { getProfilesRoot, getExtensionFolderName } = require('./constants');
const { sanitizeProfileName } = require('./sanitizer');
const { getProfilesRegistry, saveProfilesRegistry, findProfileKey } = require('./registry');
const { copyDirRecursiveSync, syncExtensionToProfile } = require('./fileSync');
const { launchAntigravityInstance, validateWorkspacePath } = require('./launcher');

/**
 * Detects the active profile name of the currently running Antigravity IDE window.
 */
function getCurrentProfile(context) {
    const profilesRoot = getProfilesRoot();

    // 1. Check process command-line arguments for custom directory flags
    if (Array.isArray(process.argv)) {
        for (const arg of process.argv) {
            if (typeof arg === 'string' && arg.includes('.antigravity-custom-profiles')) {
                const match = arg.match(/[/\\]\.antigravity-custom-profiles[/\\]([^/\\]+)/);
                if (match && match[1]) {
                    const safe = sanitizeProfileName(match[1]);
                    if (safe) return safe;
                }
            }
        }
    }

    // 2. Check extension path location
    const extPath = (context && context.extensionPath) ? context.extensionPath : path.resolve(__dirname, '..');
    const normalizedExtPath = path.normalize(extPath);
    const normalizedProfilesRoot = path.normalize(profilesRoot);

    if (normalizedExtPath.startsWith(normalizedProfilesRoot)) {
        const rel = path.relative(normalizedProfilesRoot, normalizedExtPath);
        const parts = rel.split(path.sep);
        if (parts.length > 0 && parts[0]) {
            const safe = sanitizeProfileName(parts[0]);
            if (safe) return safe;
        }
    }

    return 'Default';
}

/**
 * Resolves the path of the currently active workspace or project folder, if any.
 */
function getCurrentWorkspacePath() {
    if (vscode.workspace.workspaceFile && !vscode.workspace.workspaceFile.scheme.startsWith('untitled')) {
        return vscode.workspace.workspaceFile.fsPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return folders[0].uri.fsPath;
    }
    return undefined;
}

/**
 * Updates and persists the current workspace path for the active custom profile.
 * If no workspace folder is open, sets lastWorkspacePath to null.
 *
 * @param {string} profileName
 */
function updateActiveProfileWorkspace(profileName) {
    if (!profileName || typeof profileName !== 'string' || profileName.toLowerCase() === 'default') {
        return;
    }
    try {
        const { registryPath, registry } = getProfilesRegistry();
        const matchedKey = findProfileKey(registry, profileName) || sanitizeProfileName(profileName);
        if (!matchedKey) return;

        const currentWs = getCurrentWorkspacePath();
        const safeWs = validateWorkspacePath(currentWs);

        if (registry.profiles[matchedKey]) {
            const previousWs = registry.profiles[matchedKey].lastWorkspacePath;
            const newWs = safeWs || null;
            if (previousWs !== newWs || registry.lastActiveProfile !== matchedKey) {
                registry.profiles[matchedKey].lastWorkspacePath = newWs;
                registry.profiles[matchedKey].lastUsed = new Date().toISOString();
                registry.lastActiveProfile = matchedKey;
                saveProfilesRegistry(registryPath, registry);
            }
        }
    } catch (e) { }
}

/**
 * Prepares environment, synchronizes this extension, and launches the target profile.
 * Supports transferring workspace and closing the current window.
 */
async function launchProfile(profileName, context, { workspacePath, closeCurrent = false, silent = false } = {}) {
    const { profilesRoot, registryPath, registry } = getProfilesRegistry();
    const isDefault = !profileName || profileName.toLowerCase() === 'default';

    if (isDefault) {
        try {
            registry.lastActiveProfile = 'Default';
            saveProfilesRegistry(registryPath, registry);

            await launchAntigravityInstance({ workspacePath });
            if (closeCurrent) {
                if (silent) {
                    vscode.commands.executeCommand('workbench.action.closeWindow');
                } else {
                    vscode.window.showInformationMessage('Switching to Default profile...');
                    setTimeout(() => {
                        vscode.commands.executeCommand('workbench.action.closeWindow');
                    }, 400);
                }
            } else if (!silent) {
                const current = getCurrentProfile(context);
                if (current.toLowerCase() !== 'default') {
                    const choice = await vscode.window.showInformationMessage(
                        `Opened Default profile in a new window. (This window is '${current}')`,
                        'Close This Window'
                    );
                    if (choice === 'Close This Window') {
                        vscode.commands.executeCommand('workbench.action.closeWindow');
                    }
                } else {
                    vscode.window.showInformationMessage('Opened a new Default profile window.');
                }
            }
        } catch (err) {
            if (!silent) {
                vscode.window.showErrorMessage(`Failed to launch Default profile: ${err.message}`);
            }
        }
        return;
    }

    const safeName = sanitizeProfileName(profileName);
    if (!safeName) {
        if (!silent) {
            vscode.window.showErrorMessage('Invalid profile name. Please use alphanumeric characters, dashes, or underscores (max 48 characters).');
        }
        return;
    }

    const customExtDir = path.join(profilesRoot, safeName, 'extensions');
    const customDataDir = path.join(profilesRoot, safeName, 'user-data');

    try {
        fs.mkdirSync(customExtDir, { recursive: true, mode: 0o700 });
        fs.mkdirSync(customDataDir, { recursive: true, mode: 0o700 });

        // Copy and synchronize extension into target profile, cleaning obsolete versions and updating extensions.json
        const sourceExtPath = (context && context.extensionPath) ? context.extensionPath : path.resolve(__dirname, '..');
        syncExtensionToProfile(sourceExtPath, customExtDir);

        // Update central registry
        const validatedWs = validateWorkspacePath(workspacePath);
        if (!registry.profiles[safeName]) {
            registry.profiles[safeName] = {
                name: profileName.trim().slice(0, 100),
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
                lastWorkspacePath: validatedWs || null
            };
        } else {
            registry.profiles[safeName].lastUsed = new Date().toISOString();
            if (workspacePath !== undefined) {
                registry.profiles[safeName].lastWorkspacePath = validatedWs || null;
            }
        }
        registry.lastActiveProfile = safeName;
        saveProfilesRegistry(registryPath, registry);
    } catch (err) {
        if (!silent) {
            vscode.window.showErrorMessage(`Failed to prepare profile '${profileName}': ${err.message}`);
        }
        return;
    }

    try {
        await launchAntigravityInstance({ customExtDir, customDataDir, workspacePath });
        if (closeCurrent) {
            if (silent) {
                vscode.commands.executeCommand('workbench.action.closeWindow');
            } else {
                vscode.window.showInformationMessage(`Switching to profile '${profileName}'...`);
                setTimeout(() => {
                    vscode.commands.executeCommand('workbench.action.closeWindow');
                }, 400);
            }
        } else if (!silent) {
            const current = getCurrentProfile(context);
            const choice = await vscode.window.showInformationMessage(
                `Opened profile '${profileName}' in a new window. (This window remains on '${current}')`,
                'Close This Window'
            );
            if (choice === 'Close This Window') {
                vscode.commands.executeCommand('workbench.action.closeWindow');
            }
        }
    } catch (err) {
        if (!silent) {
            vscode.window.showErrorMessage(`Failed to launch Antigravity profile '${profileName}': ${err.message}`);
        }
    }
}

/**
 * Prompts user to choose between switching in-place (transfer workspace & close current)
 * or opening the profile in a standalone new window.
 */
async function promptProfileActions(profileName, context) {
    const currentProfile = getCurrentProfile(context);
    const isCurrent = (currentProfile.toLowerCase() === profileName.toLowerCase());
    const wsPath = getCurrentWorkspacePath();
    const wsLabel = wsPath ? path.basename(wsPath) : 'current workspace';

    if (isCurrent) {
        const selected = await vscode.window.showQuickPick([
            {
                label: '$(window) Open New Window',
                description: `Launch another instance of '${profileName}'`,
                detail: 'Opens an empty standalone window in this profile',
                mode: 'new_window'
            }
        ], {
            placeHolder: `'${profileName}' is already active in this window`
        });

        if (selected && selected.mode === 'new_window') {
            await launchProfile(profileName, context, { workspacePath: undefined, closeCurrent: false });
        }
        return;
    }

    const actionItems = [
        {
            label: `$(arrow-swap) Switch to '${profileName}'`,
            description: wsPath ? `Transfer '${wsLabel}' & close this window` : `Switch profile & close this window`,
            detail: wsPath
                ? `Reopens workspace '${wsLabel}' inside '${profileName}' and closes this window`
                : `Switches to '${profileName}' and closes this window`,
            mode: 'switch'
        },
        {
            label: `$(window) Open in New Window`,
            description: `Keep this window open and launch '${profileName}' separately`,
            detail: 'Starts an isolated Antigravity IDE window alongside your current session',
            mode: 'new_window'
        }
    ];

    const selectedAction = await vscode.window.showQuickPick(actionItems, {
        placeHolder: `Select how to open profile '${profileName}'`
    });

    if (!selectedAction) return;

    if (selectedAction.mode === 'switch') {
        await launchProfile(profileName, context, {
            workspacePath: wsPath,
            closeCurrent: true
        });
    } else {
        await launchProfile(profileName, context, {
            workspacePath: undefined,
            closeCurrent: false
        });
    }
}

/**
 * Prompts user to create a new isolated profile, then choose switch or new window.
 */
async function promptCreateProfile(context) {
    const newProfileName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new isolated profile',
        placeHolder: 'e.g., Webdev, PythonML, RustProject, Testing, Work'
    });

    if (!newProfileName || !newProfileName.trim()) return;
    const cleanName = sanitizeProfileName(newProfileName);
    if (!cleanName) {
        vscode.window.showErrorMessage('Invalid profile name. Please use alphanumeric characters, dashes, or underscores (max 48 characters).');
        return;
    }

    const wsPath = getCurrentWorkspacePath();
    const wsLabel = wsPath ? path.basename(wsPath) : 'current workspace';

    const actionItems = [
        {
            label: `$(arrow-swap) Switch to '${cleanName}'`,
            description: wsPath ? `Transfer '${wsLabel}' & close this window` : `Switch profile & close this window`,
            detail: `Reopens workspace in new '${cleanName}' profile and closes this window`,
            mode: 'switch'
        },
        {
            label: `$(window) Open in New Window`,
            description: `Keep this window open and launch '${cleanName}' separately`,
            detail: 'Starts a clean isolated window alongside this one',
            mode: 'new_window'
        }
    ];

    const selectedAction = await vscode.window.showQuickPick(actionItems, {
        placeHolder: `Profile '${cleanName}' created. How would you like to open it?`
    });

    if (!selectedAction) return;

    if (selectedAction.mode === 'switch') {
        await launchProfile(cleanName, context, {
            workspacePath: wsPath,
            closeCurrent: true
        });
    } else {
        await launchProfile(cleanName, context, {
            workspacePath: undefined,
            closeCurrent: false
        });
    }
}

/**
 * Prompts user to delete an existing custom profile with strict path traversal & safety checks.
 */
async function showDeleteProfileMenu(context) {
    const { profilesRoot, registryPath, registry } = getProfilesRegistry();
    const currentProfile = getCurrentProfile(context);
    const profileKeys = Object.keys(registry.profiles || {}).filter(k => Object.prototype.hasOwnProperty.call(registry.profiles, k));

    if (profileKeys.length === 0) {
        vscode.window.showInformationMessage('No custom profiles found to delete.');
        return;
    }

    const deleteItems = profileKeys.map(key => ({
        label: `$(trash) ${registry.profiles[key].name || key}`,
        description: currentProfile.toLowerCase() === key.toLowerCase() ? '(Currently active in this window)' : '',
        profileKey: key
    }));

    const selected = await vscode.window.showQuickPick(deleteItems, {
        placeHolder: 'Select a profile to permanently delete'
    });

    if (!selected || !selected.profileKey) return;

    const safeKey = sanitizeProfileName(selected.profileKey);
    if (!safeKey) {
        vscode.window.showErrorMessage('Invalid profile identifier.');
        return;
    }

    const isCurrentActive = (currentProfile.toLowerCase() === safeKey.toLowerCase());
    const warningMsg = isCurrentActive
        ? `You are currently using profile '${safeKey}'. Deleting it will remove its files on disk, though this window will remain open until closed. Are you sure?`
        : `Are you sure you want to delete profile '${safeKey}' and all its isolated extensions & data?`;

    const confirm = await vscode.window.showWarningMessage(
        warningMsg,
        { modal: true },
        'Delete Profile'
    );

    if (confirm === 'Delete Profile') {
        try {
            const resolvedRoot = path.resolve(profilesRoot);
            const profileDir = path.resolve(profilesRoot, safeKey);

            // Security: Strict path boundary check to prevent deleting parent directories or root
            if (!profileDir.startsWith(resolvedRoot + path.sep) || profileDir === resolvedRoot) {
                throw new Error('Access denied: Profile path is outside authorized storage root.');
            }

            if (fs.existsSync(profileDir)) {
                const stat = fs.lstatSync(profileDir);
                if (stat.isSymbolicLink()) {
                    fs.unlinkSync(profileDir); // Remove the link only, do not traverse
                } else {
                    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                }
            }

            delete registry.profiles[safeKey];
            if (registry.lastActiveProfile && registry.lastActiveProfile.toLowerCase() === safeKey.toLowerCase()) {
                registry.lastActiveProfile = 'Default';
            }
            saveProfilesRegistry(registryPath, registry);
            vscode.window.showInformationMessage(`Deleted profile '${safeKey}'.`);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to delete profile: ${err.message}`);
        }
    }
}

/**
 * Displays the organized, clean main Profile QuickPick menu.
 */
async function showProfileMenu(context) {
    const currentProfile = getCurrentProfile(context);
    const { profilesRoot, registry } = getProfilesRegistry();
    const profileKeys = Object.keys(registry.profiles || {}).filter(k => Object.prototype.hasOwnProperty.call(registry.profiles, k));
    const count = profileKeys.length;
    const countStr = count === 1 ? '1 custom profile' : `${count} custom profiles`;

    const items = [];

    // --- PROFILES SECTION ---
    items.push({
        label: 'Profiles',
        kind: vscode.QuickPickItemKind.Separator
    });

    // Default Profile
    const isDefaultActive = currentProfile.toLowerCase() === 'default';
    items.push({
        label: isDefaultActive ? `$(check) Default Profile` : `$(home) Default Profile`,
        description: isDefaultActive ? '(Active)' : 'Main Antigravity configuration',
        detail: 'Global shared extensions and default user data',
        action: 'select_profile',
        profileName: 'Default'
    });

    // Custom Profiles
    if (profileKeys.length > 0) {
        for (const key of profileKeys) {
            const prof = registry.profiles[key];
            const isCurrent = (currentProfile.toLowerCase() === key.toLowerCase());
            const lastUsedStr = prof.lastUsed ? new Date(prof.lastUsed).toLocaleDateString() : 'Never';
            items.push({
                label: isCurrent ? `$(check) ${prof.name || key}` : `$(folder) ${prof.name || key}`,
                description: isCurrent ? '(Active)' : `Last active: ${lastUsedStr}`,
                detail: path.join(profilesRoot, key),
                action: 'select_profile',
                profileName: prof.name || key
            });
        }
    }

    // --- MANAGE SECTION ---
    items.push({
        label: 'Manage Profiles',
        kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
        label: '$(plus) Create New Profile...',
        description: 'Set up a new isolated environment',
        detail: 'Creates independent extensions and user data folders',
        action: 'create'
    });

    items.push({
        label: '$(folder-opened) Open Profiles Folder',
        description: profilesRoot,
        detail: 'Open the centralized storage folder in your file manager',
        action: 'open_folder'
    });

    if (profileKeys.length > 0) {
        items.push({
            label: '$(trash) Delete a Profile...',
            description: 'Permanently remove a profile and its isolated data',
            action: 'delete'
        });
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Current: ${currentProfile} • ${countStr} available`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected || !selected.action) return;

    if (selected.action === 'select_profile') {
        await promptProfileActions(selected.profileName, context);
    } else if (selected.action === 'create') {
        await promptCreateProfile(context);
    } else if (selected.action === 'open_folder') {
        vscode.env.openExternal(vscode.Uri.file(profilesRoot));
    } else if (selected.action === 'delete') {
        await showDeleteProfileMenu(context);
    }
}

module.exports = {
    getCurrentProfile,
    getCurrentWorkspacePath,
    launchProfile,
    promptCreateProfile,
    promptProfileActions,
    showDeleteProfileMenu,
    showProfileMenu,
    updateActiveProfileWorkspace
};
