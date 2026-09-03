const vscode = require('vscode');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { getProfilesRoot, getUniversalExtensionsDir } = require('./constants');
const { getProfilesRegistry, saveProfilesRegistry } = require('./registry');
const { sanitizeExtensionId } = require('./sanitizer');
const { copyDirRecursiveSync } = require('./fileSync');

/**
 * Searches filesystem roots to find an extension source directory and package.json.
 * @param {string} cleanId
 * @param {vscode.ExtensionContext} [context]
 * @returns {{ sourcePath: string, pkgData: object } | null}
 */
function findExtensionSourceOnDisk(cleanId, context) {
    const candidateRoots = [];
    if (context && context.extensionPath) {
        candidateRoots.push(path.dirname(context.extensionPath));
    }
    const home = os.homedir();
    candidateRoots.push(
        path.join(home, '.antigravity-ide', 'extensions'),
        path.join(home, '.antigravity', 'extensions'),
        path.join(home, '.vscode', 'extensions'),
        path.join(home, '.vscode-insiders', 'extensions'),
        path.join(home, '.cursor', 'extensions')
    );

    const profilesRoot = getProfilesRoot();
    try {
        if (fs.existsSync(profilesRoot)) {
            const profs = fs.readdirSync(profilesRoot, { withFileTypes: true });
            for (const p of profs) {
                if (p.isDirectory() && !p.name.startsWith('.')) {
                    candidateRoots.push(path.join(profilesRoot, p.name, 'extensions'));
                }
            }
        }
    } catch (e) { }

    for (const rootDir of candidateRoots) {
        try {
            if (!fs.existsSync(rootDir)) continue;
            const entries = fs.readdirSync(rootDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const candidate = path.join(rootDir, entry.name);
                    const pkgPath = path.join(candidate, 'package.json');
                    if (fs.existsSync(pkgPath)) {
                        try {
                            const p = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                            if (p && p.name && p.publisher) {
                                const extId = `${p.publisher}.${p.name}`;
                                if (extId.toLowerCase() === cleanId.toLowerCase()) {
                                    return { sourcePath: candidate, pkgData: p };
                                }
                            }
                        } catch (e) { }
                    }
                }
            }
        } catch (e) { }
    }
    return null;
}

/**
 * Discovers and returns a clean list of installed user extensions in the active profile/window.
 * Excludes built-in extensions and the Orbit profile manager extension itself.
 *
 * @param {vscode.ExtensionContext} [context]
 * @returns {Array<{ id: string, name: string, publisher: string, version: string, description: string, extensionPath: string, isUniversal: boolean }>}
 */
function getInstalledUserExtensions(context) {
    const { registry } = getProfilesRegistry();
    const universalMap = (registry && registry.universalExtensions) ? registry.universalExtensions : {};
    const installed = [];
    const seenIds = new Set();

    // 1. Gather from vscode.extensions.all API
    if (vscode.extensions && Array.isArray(vscode.extensions.all)) {
        for (const ext of vscode.extensions.all) {
            if (!ext || !ext.id || typeof ext.id !== 'string') continue;
            const lowerId = ext.id.toLowerCase();

            // Skip Orbit extension itself
            if (lowerId.includes('antigravity-orbit') || lowerId.includes('antigravity-profile-manager')) {
                continue;
            }

            // Skip built-in system extensions
            if (ext.packageJSON && ext.packageJSON.isBuiltin) {
                continue;
            }
            if (ext.extensionPath && (ext.extensionPath.includes('/resources/app/extensions') || ext.extensionPath.includes('\\resources\\app\\extensions'))) {
                continue;
            }

            const cleanId = sanitizeExtensionId(ext.id);
            if (!cleanId || seenIds.has(cleanId.toLowerCase())) continue;
            seenIds.add(cleanId.toLowerCase());

            const pkg = ext.packageJSON || {};
            const name = typeof pkg.displayName === 'string' && pkg.displayName.trim()
                ? pkg.displayName.trim()
                : (typeof pkg.name === 'string' ? pkg.name.trim() : cleanId);
            const publisher = typeof pkg.publisher === 'string' ? pkg.publisher.trim() : cleanId.split('.')[0] || '';
            const version = typeof pkg.version === 'string' ? pkg.version.trim() : '1.0.0';
            const description = typeof pkg.description === 'string' ? pkg.description.trim().slice(0, 250) : '';

            installed.push({
                id: cleanId,
                name,
                publisher,
                version,
                description,
                extensionPath: ext.extensionPath || '',
                isUniversal: Boolean(universalMap[cleanId])
            });
        }
    }

    // 2. Discover from custom profile extensions dirs on disk if not gathered
    const candidateRoots = [];
    if (context && context.extensionPath) {
        candidateRoots.push(path.dirname(context.extensionPath));
    }
    const home = os.homedir();
    candidateRoots.push(
        path.join(home, '.antigravity-ide', 'extensions'),
        path.join(home, '.antigravity', 'extensions')
    );

    for (const currentExtsParent of candidateRoots) {
        try {
            if (fs.existsSync(currentExtsParent)) {
                const entries = fs.readdirSync(currentExtsParent, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                    const folderPath = path.join(currentExtsParent, entry.name);
                    const pkgPath = path.join(folderPath, 'package.json');
                    if (fs.existsSync(pkgPath)) {
                        try {
                            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                            if (pkg && pkg.name && pkg.publisher) {
                                const extId = `${pkg.publisher}.${pkg.name}`;
                                const lowerId = extId.toLowerCase();
                                if (lowerId.includes('antigravity-orbit') || lowerId.includes('antigravity-profile-manager')) {
                                    continue;
                                }
                                const cleanId = sanitizeExtensionId(extId);
                                if (cleanId && !seenIds.has(cleanId.toLowerCase())) {
                                    seenIds.add(cleanId.toLowerCase());
                                    installed.push({
                                        id: cleanId,
                                        name: pkg.displayName || pkg.name || cleanId,
                                        publisher: pkg.publisher || '',
                                        version: pkg.version || '1.0.0',
                                        description: typeof pkg.description === 'string' ? pkg.description.slice(0, 250) : '',
                                        extensionPath: folderPath,
                                        isUniversal: Boolean(universalMap[cleanId])
                                    });
                                }
                            }
                        } catch (e) { }
                    }
                }
            }
        } catch (e) { }
    }

    return installed;
}

/**
 * Adds an installed extension to the central Universal Extensions pool.
 * Copies extension files to ~/.antigravity-custom-profiles/.universal-extensions/
 * and registers metadata in profiles.json.
 *
 * @param {string} extensionId
 * @param {vscode.ExtensionContext} [context]
 * @returns {boolean} Success status
 */
function addUniversalExtension(extensionId, context) {
    const cleanId = sanitizeExtensionId(extensionId);
    if (!cleanId) {
        throw new Error('Invalid extension identifier.');
    }

    const { registryPath, registry } = getProfilesRegistry();
    const universalDir = getUniversalExtensionsDir();

    // 1. Locate source extension directory
    let sourcePath = null;
    let pkgData = null;

    // Check vscode.extensions.getExtension
    if (vscode.extensions) {
        if (typeof vscode.extensions.getExtension === 'function') {
            const ext = vscode.extensions.getExtension(cleanId);
            if (ext && ext.extensionPath && fs.existsSync(ext.extensionPath)) {
                sourcePath = ext.extensionPath;
                pkgData = ext.packageJSON;
            }
        }
        if (!sourcePath && Array.isArray(vscode.extensions.all)) {
            const ext = vscode.extensions.all.find(e => e && e.id && e.id.toLowerCase() === cleanId.toLowerCase());
            if (ext && ext.extensionPath && fs.existsSync(ext.extensionPath)) {
                sourcePath = ext.extensionPath;
                pkgData = ext.packageJSON;
            }
        }
    }

    // Check filesystem discovery if not found via vscode API
    if (!sourcePath) {
        const diskResult = findExtensionSourceOnDisk(cleanId, context);
        if (diskResult) {
            sourcePath = diskResult.sourcePath;
            pkgData = diskResult.pkgData;
        }
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error(`Cannot locate extension files for '${cleanId}'. Make sure it is installed in the active profile.`);
    }

    // Security: Check canonical path to ensure directory is valid
    const realSource = fs.realpathSync(sourcePath);
    const stat = fs.statSync(realSource);
    if (!stat.isDirectory()) {
        throw new Error('Extension path is not a valid directory.');
    }

    if (!pkgData) {
        const pkgFile = path.join(realSource, 'package.json');
        if (fs.existsSync(pkgFile)) {
            try {
                pkgData = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
            } catch (e) { }
        }
    }

    const name = (pkgData && (pkgData.displayName || pkgData.name)) ? (pkgData.displayName || pkgData.name).slice(0, 100) : cleanId;
    const publisher = (pkgData && pkgData.publisher) ? String(pkgData.publisher).slice(0, 100) : cleanId.split('.')[0] || '';
    const version = (pkgData && pkgData.version) ? String(pkgData.version).slice(0, 50) : '1.0.0';
    const description = (pkgData && typeof pkgData.description === 'string') ? pkgData.description.slice(0, 250) : '';

    // Create safe target folder name
    const safeFolderName = `${publisher.replace(/[^a-zA-Z0-9_-]/g, '')}.${(pkgData?.name || cleanId).replace(/[^a-zA-Z0-9_-]/g, '')}-${version.replace(/[^a-zA-Z0-9._-]/g, '')}`;
    const targetFolder = path.join(universalDir, safeFolderName);

    // Copy extension files to central universal store
    copyDirRecursiveSync(realSource, targetFolder);

    // Save in registry
    registry.universalExtensions[cleanId] = {
        id: cleanId,
        name,
        publisher,
        version,
        folderName: safeFolderName,
        description,
        addedAt: new Date().toISOString()
    };

    saveProfilesRegistry(registryPath, registry);
    return true;
}

/**
 * Removes an extension from the central Universal Extensions pool.
 * Deletes its cached directory in ~/.antigravity-custom-profiles/.universal-extensions/
 * and removes its registry entry in profiles.json.
 *
 * @param {string} extensionId
 * @returns {boolean} Success status
 */
function removeUniversalExtension(extensionId) {
    const cleanId = sanitizeExtensionId(extensionId);
    if (!cleanId) return false;

    const { registryPath, registry } = getProfilesRegistry();
    const universalDir = getUniversalExtensionsDir();

    if (registry.universalExtensions && registry.universalExtensions[cleanId]) {
        const folderName = registry.universalExtensions[cleanId].folderName;
        if (folderName) {
            const safeFolder = sanitizeExtensionId(folderName) || folderName;
            const targetFolder = path.resolve(universalDir, safeFolder);
            const resolvedRoot = path.resolve(universalDir);

            // Security: Boundary check
            if (targetFolder.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep.toLowerCase())) {
                if (fs.existsSync(targetFolder)) {
                    try {
                        fs.rmSync(targetFolder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                    } catch (e) { }
                }
            }
        }
        delete registry.universalExtensions[cleanId];
        saveProfilesRegistry(registryPath, registry);
        return true;
    }

    return false;
}

/**
 * Clones all registered Universal Extensions into a brand new profile's extensions directory
 * and registers them in the new profile's extensions.json.
 *
 * NOTE: This function is strictly called ONLY on new profile creation.
 * Older existing profiles are never modified.
 *
 * @param {string} customExtDir Destination profile extensions directory.
 */
function syncUniversalExtensionsToNewProfile(customExtDir) {
    if (!customExtDir || typeof customExtDir !== 'string') return;
    try {
        fs.mkdirSync(customExtDir, { recursive: true, mode: 0o700 });
        const { registry } = getProfilesRegistry();
        const universalMap = registry.universalExtensions || {};
        const universalDir = getUniversalExtensionsDir();

        const extJsonPath = path.join(customExtDir, 'extensions.json');
        let extJson = [];
        if (fs.existsSync(extJsonPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(extJsonPath, 'utf8'));
                if (Array.isArray(parsed)) extJson = parsed;
            } catch (e) { }
        }

        for (const key of Object.keys(universalMap)) {
            const item = universalMap[key];
            if (!item || !item.folderName) continue;

            const safeFolder = sanitizeExtensionId(item.folderName) || item.folderName;
            const sourceFolder = path.join(universalDir, safeFolder);
            const destFolder = path.join(customExtDir, safeFolder);

            if (fs.existsSync(sourceFolder)) {
                // Copy universal extension files into the new profile
                copyDirRecursiveSync(sourceFolder, destFolder);

                // Add to new profile's extensions.json if not already listed
                const existingIndex = extJson.findIndex(e => e?.identifier?.id?.toLowerCase() === item.id.toLowerCase());
                const entry = {
                    identifier: { id: item.id },
                    version: item.version || '1.0.0',
                    location: {
                        $mid: 1,
                        path: destFolder,
                        scheme: 'file'
                    },
                    relativeLocation: safeFolder
                };

                if (existingIndex >= 0) {
                    extJson[existingIndex] = entry;
                } else {
                    extJson.push(entry);
                }
            }
        }

        if (extJson.length > 0) {
            fs.writeFileSync(extJsonPath, JSON.stringify(extJson, null, 2), { encoding: 'utf8', mode: 0o600 });
        }
    } catch (err) { }
}

module.exports = {
    getInstalledUserExtensions,
    addUniversalExtension,
    removeUniversalExtension,
    syncUniversalExtensionsToNewProfile
};
