const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');
const { getExtensionFolderName } = require('./constants');
const { sanitizeProfileName } = require('./sanitizer');

/**
 * Recursively copies all extension files from source directory to target directory.
 * - Skips version control metadata and temporary caches (.git, .DS_Store, node_modules).
 * - Explicitly ignores symbolic links to prevent directory traversal or loop attacks.
 *
 * @param {string} source Source extension directory.
 * @param {string} target Destination directory inside target profile.
 */
function copyDirRecursiveSync(source, target) {
    if (!source || !target || typeof source !== 'string' || typeof target !== 'string') {
        return;
    }

    let resolvedSource;
    try {
        if (!fs.existsSync(source)) return;
        resolvedSource = fs.realpathSync(source);
    } catch (e) {
        return;
    }

    const resolvedTarget = path.resolve(target);

    // Prevent recursive loop if target is located inside source
    const lowerTarget = resolvedTarget.toLowerCase();
    const lowerSource = resolvedSource.toLowerCase();
    if (lowerTarget.startsWith(lowerSource + path.sep.toLowerCase()) || lowerTarget.startsWith(lowerSource + '/')) {
        return;
    }

    if (!fs.existsSync(resolvedTarget)) {
        fs.mkdirSync(resolvedTarget, { recursive: true, mode: 0o700 });
    }

    if (typeof fs.cpSync === 'function') {
        try {
            fs.cpSync(resolvedSource, resolvedTarget, {
                recursive: true,
                force: true,
                dereference: false,
                filter: (src) => {
                    const base = path.basename(src);
                    if (base === '.git' || base === '.DS_Store' || base === 'node_modules' || base === 'test' || base === '.vscode-test' || base === 'coverage' || base.endsWith('.test.js')) {
                        return false;
                    }
                    try {
                        const stat = fs.lstatSync(src);
                        if (stat.isSymbolicLink()) {
                            return false; // Security: completely ignore symbolic links
                        }
                    } catch (e) {
                        return false;
                    }
                    return true;
                }
            });
            return;
        } catch (e) {
            // Fallback to manual copy if cpSync encounters an issue
        }
    }

    // Fallback implementation for Node environments without fs.cpSync
    try {
        const files = fs.readdirSync(resolvedSource);
        for (const file of files) {
            if (file === '.git' || file === '.DS_Store' || file === 'node_modules' || file === 'test' || file === '.vscode-test' || file === 'coverage' || file.endsWith('.test.js')) continue;

            const curSource = path.join(resolvedSource, file);
            const curTarget = path.join(resolvedTarget, file);

            let stat;
            try {
                stat = fs.lstatSync(curSource);
            } catch (e) {
                continue;
            }

            // Security: skip symbolic links to avoid traversal loops
            if (stat.isSymbolicLink()) {
                continue;
            }

            if (stat.isDirectory()) {
                copyDirRecursiveSync(curSource, curTarget);
            } else if (stat.isFile()) {
                try {
                    fs.copyFileSync(curSource, curTarget);
                } catch (e) { }
            }
        }
    } catch (e) { }
}

/**
 * Synchronizes the current extension into a profile's extensions directory,
 * cleans up any obsolete/legacy extension versions, and updates extensions.json.
 *
 * @param {string} sourceExtPath
 * @param {string} customExtDir
 */
function syncExtensionToProfile(sourceExtPath, customExtDir) {
    if (!sourceExtPath || !customExtDir) return;
    try {
        fs.mkdirSync(customExtDir, { recursive: true, mode: 0o700 });
        const targetFolderName = getExtensionFolderName(sourceExtPath);
        const targetExtFolder = path.join(customExtDir, targetFolderName);

        // 1. Copy latest extension files
        copyDirRecursiveSync(sourceExtPath, targetExtFolder);

        // 2. Clean up legacy/obsolete extension directories
        try {
            const entries = fs.readdirSync(customExtDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const name = entry.name;
                const isLegacy = name.startsWith('sakib.antigravity-profile-manager');
                const isOldOrbit = name.startsWith('sajedulisakib-001.antigravity-orbit') && name !== targetFolderName;
                if (isLegacy || isOldOrbit) {
                    const obsoletePath = path.join(customExtDir, name);
                    try {
                        fs.rmSync(obsoletePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                    } catch (err) { }
                }
            }
        } catch (e) { }

        // 3. Create or update extensions.json with Orbit registered first
        const extJsonPath = path.join(customExtDir, 'extensions.json');
        let extJson = [];
        if (fs.existsSync(extJsonPath)) {
            try {
                const raw = JSON.parse(fs.readFileSync(extJsonPath, 'utf8'));
                if (Array.isArray(raw)) extJson = raw;
            } catch (e) { }
        }

        try {
            let extVersion = '1.0.5';
            try {
                const pkgPath = path.join(sourceExtPath, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
                        extVersion = pkg.version.trim();
                    }
                }
            } catch (e) { }

            const filtered = extJson.filter(item => {
                const id = item?.identifier?.id;
                return id !== 'sakib.antigravity-profile-manager' && id !== 'sajedulisakib-001.antigravity-orbit';
            });

            filtered.unshift({
                identifier: { id: 'sajedulisakib-001.antigravity-orbit' },
                version: extVersion,
                location: {
                    $mid: 1,
                    path: targetExtFolder,
                    scheme: 'file'
                },
                relativeLocation: targetFolderName
            });

            fs.writeFileSync(extJsonPath, JSON.stringify(filtered, null, 2), { encoding: 'utf8', mode: 0o600 });
        } catch (e) { }
    } catch (e) { }
}

/**
 * Automatically syncs the latest extension code to ALL custom profiles on disk.
 *
 * @param {string} sourceExtPath
 * @param {string} profilesRoot
 */
function syncExtensionToAllProfiles(sourceExtPath, profilesRoot) {
    if (!sourceExtPath || !profilesRoot || !fs.existsSync(profilesRoot)) return;
    try {
        const entries = fs.readdirSync(profilesRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                const safeName = sanitizeProfileName(entry.name);
                if (safeName) {
                    const customExtDir = path.join(profilesRoot, safeName, 'extensions');
                    syncExtensionToProfile(sourceExtPath, customExtDir);
                }
            }
        }
    } catch (e) { }
}

/**
 * Fallback detector: Reads the last active window workspace directly from a profile's user-data.
 * Used when profiles.json has not yet recorded the workspace for a profile.
 *
 * @param {string} profileName
 * @param {string} profilesRoot
 * @returns {string|null}
 */
function getProfileLastWorkspaceFromStorage(profileName, profilesRoot) {
    if (!profileName || typeof profileName !== 'string') return null;
    const safeName = sanitizeProfileName(profileName);
    if (!safeName) return null;

    const customDataDir = path.join(profilesRoot, safeName, 'user-data');
    const storageJsonPath = path.join(customDataDir, 'User', 'globalStorage', 'storage.json');
    if (!fs.existsSync(storageJsonPath)) return null;

    try {
        const storage = JSON.parse(fs.readFileSync(storageJsonPath, 'utf8'));
        const lastActiveWindow = storage?.windowsState?.lastActiveWindow;
        if (!lastActiveWindow) return null;

        if (typeof lastActiveWindow.folder === 'string') {
            const fUri = lastActiveWindow.folder;
            if (fUri.startsWith('file://')) {
                return fileURLToPath(fUri);
            }
            return fUri;
        }

        if (lastActiveWindow.workspace && typeof lastActiveWindow.workspace.configPath === 'string') {
            const cUri = lastActiveWindow.workspace.configPath;
            if (cUri.startsWith('file://')) {
                return fileURLToPath(cUri);
            }
            return cUri;
        }

        if (typeof lastActiveWindow.backupPath === 'string') {
            const backupId = path.basename(lastActiveWindow.backupPath);
            const wsJsonPath = path.join(customDataDir, 'User', 'workspaceStorage', backupId, 'workspace.json');
            if (fs.existsSync(wsJsonPath)) {
                const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
                if (typeof wsData.folder === 'string') {
                    const fUri = wsData.folder;
                    if (fUri.startsWith('file://')) {
                        return fileURLToPath(fUri);
                    }
                    return fUri;
                }
                if (typeof wsData.workspace === 'string') {
                    const wUri = wsData.workspace;
                    if (wUri.startsWith('file://')) {
                        return fileURLToPath(wUri);
                    }
                    return wUri;
                }
            }
            // If backupPath exists with NO workspace.json, it was an empty window
            return null;
        }
    } catch (e) { }
    return null;
}

module.exports = {
    copyDirRecursiveSync,
    syncExtensionToProfile,
    syncExtensionToAllProfiles,
    getProfileLastWorkspaceFromStorage
};
