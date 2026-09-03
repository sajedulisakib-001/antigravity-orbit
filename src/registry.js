const path = require('path');
const fs = require('fs');
const { getProfilesRoot } = require('./constants');
const { sanitizeProfileName, sanitizeExtensionId } = require('./sanitizer');
const { getProfileLastWorkspaceFromStorage } = require('./fileSync');

/**
 * Finds the matching profile key in the registry in a case-insensitive manner.
 * @param {object} registry
 * @param {string} profileName
 * @returns {string|null}
 */
function findProfileKey(registry, profileName) {
    if (!registry || !registry.profiles || typeof profileName !== 'string') return null;
    if (registry.profiles[profileName]) return profileName;
    const lower = profileName.toLowerCase();
    for (const key of Object.keys(registry.profiles)) {
        if (key.toLowerCase() === lower) return key;
    }
    return null;
}

/**
 * Reads the central profiles registry safely, guarding against prototype pollution
 * and auto-discovering valid profile directories.
 */
function getProfilesRegistry() {
    const profilesRoot = getProfilesRoot();
    const registryPath = path.join(profilesRoot, 'profiles.json');

    // Create dictionary objects with null prototype to avoid prototype pollution
    const cleanProfiles = Object.create(null);
    const cleanUniversal = Object.create(null);
    let lastActiveProfile = 'Default';

    if (fs.existsSync(registryPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            if (raw && typeof raw.lastActiveProfile === 'string') {
                const trimmed = raw.lastActiveProfile.trim();
                if (trimmed.toLowerCase() === 'default') {
                    lastActiveProfile = 'Default';
                } else {
                    const safeLast = sanitizeProfileName(trimmed);
                    if (safeLast) {
                        lastActiveProfile = safeLast;
                    }
                }
            }

            if (raw && typeof raw.profiles === 'object' && raw.profiles !== null && !Array.isArray(raw.profiles)) {
                for (const key of Object.keys(raw.profiles)) {
                    const safeKey = sanitizeProfileName(key);
                    if (safeKey && Object.prototype.hasOwnProperty.call(raw.profiles, key)) {
                        const entry = raw.profiles[key];
                        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                            const rawName = typeof entry.name === 'string' ? entry.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey;
                            let lastWorkspace = null;
                            if (typeof entry.lastWorkspacePath === 'string') {
                                const trimmedWs = entry.lastWorkspacePath.trim().replace(/[\x00-\x1F\x7F]/g, '');
                                if (trimmedWs && !trimmedWs.startsWith('-') && trimmedWs.length <= 4096) {
                                    lastWorkspace = trimmedWs;
                                }
                            } else if (entry.lastWorkspacePath === undefined) {
                                // Fallback: detect workspace from profile user-data storage if not previously recorded
                                lastWorkspace = getProfileLastWorkspaceFromStorage(safeKey, profilesRoot);
                            }
                            cleanProfiles[safeKey] = {
                                name: rawName.trim() || safeKey,
                                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
                                lastUsed: typeof entry.lastUsed === 'string' ? entry.lastUsed : new Date().toISOString(),
                                lastWorkspacePath: lastWorkspace
                            };
                        }
                    }
                }
            }

            if (raw && typeof raw.universalExtensions === 'object' && raw.universalExtensions !== null && !Array.isArray(raw.universalExtensions)) {
                for (const key of Object.keys(raw.universalExtensions)) {
                    const safeKey = sanitizeExtensionId(key);
                    if (safeKey && Object.prototype.hasOwnProperty.call(raw.universalExtensions, key)) {
                        const entry = raw.universalExtensions[key];
                        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                            cleanUniversal[safeKey] = {
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
        } catch (e) {
            // Ignore parse errors on corrupted files
        }
    }

    // Auto-discover valid profile folders in ~/.antigravity-custom-profiles (skipping hidden or symlinked folders)
    try {
        const entries = fs.readdirSync(profilesRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                const safeName = sanitizeProfileName(entry.name);
                if (safeName && !cleanProfiles[safeName]) {
                    const detectedWs = getProfileLastWorkspaceFromStorage(safeName, profilesRoot);
                    cleanProfiles[safeName] = {
                        name: safeName,
                        createdAt: new Date().toISOString(),
                        lastUsed: new Date().toISOString(),
                        lastWorkspacePath: detectedWs
                    };
                }
            }
        }
    } catch (e) { }

    // If lastActiveProfile is not Default and does not exist in discovered profiles, match case-insensitively or fall back to Default
    if (lastActiveProfile !== 'Default') {
        const matchedKey = findProfileKey({ profiles: cleanProfiles }, lastActiveProfile);
        if (matchedKey) {
            lastActiveProfile = matchedKey;
        } else {
            lastActiveProfile = 'Default';
        }
    }

    return {
        registryPath,
        registry: {
            lastActiveProfile,
            profiles: cleanProfiles,
            universalExtensions: cleanUniversal
        },
        profilesRoot
    };
}

/**
 * Persists the profile registry to profiles.json using an atomic write pattern
 * to prevent file corruption during crashes or partial writes, with restricted file permissions (0600).
 */
function saveProfilesRegistry(registryPath, registry) {
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
        return;
    }

    const cleanObject = {};
    const profilesSrc = (registry.profiles && typeof registry.profiles === 'object' && !Array.isArray(registry.profiles))
        ? registry.profiles
        : {};

    for (const key of Object.keys(profilesSrc)) {
        const safeKey = sanitizeProfileName(key);
        if (safeKey && Object.prototype.hasOwnProperty.call(profilesSrc, key)) {
            const item = profilesSrc[key];
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const rawName = typeof item.name === 'string' ? item.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey;
                let lastWorkspace = null;
                if (typeof item.lastWorkspacePath === 'string') {
                    const trimmedWs = item.lastWorkspacePath.trim().replace(/[\x00-\x1F\x7F]/g, '');
                    if (trimmedWs && !trimmedWs.startsWith('-') && trimmedWs.length <= 4096) {
                        lastWorkspace = trimmedWs;
                    }
                }
                cleanObject[safeKey] = {
                    name: rawName.trim() || safeKey,
                    createdAt: item.createdAt || new Date().toISOString(),
                    lastUsed: item.lastUsed || new Date().toISOString(),
                    lastWorkspacePath: lastWorkspace
                };
            }
        }
    }

    const cleanUniversal = {};
    const universalSrc = (registry.universalExtensions && typeof registry.universalExtensions === 'object' && !Array.isArray(registry.universalExtensions))
        ? registry.universalExtensions
        : {};

    for (const key of Object.keys(universalSrc)) {
        const safeKey = sanitizeExtensionId(key);
        if (safeKey && Object.prototype.hasOwnProperty.call(universalSrc, key)) {
            const item = universalSrc[key];
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                cleanUniversal[safeKey] = {
                    id: safeKey,
                    name: typeof item.name === 'string' ? item.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey,
                    publisher: typeof item.publisher === 'string' ? item.publisher.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : '',
                    version: typeof item.version === 'string' ? item.version.slice(0, 50).replace(/[\x00-\x1F\x7F]/g, '') : '1.0.0',
                    folderName: typeof item.folderName === 'string' ? sanitizeExtensionId(item.folderName) || safeKey : safeKey,
                    description: typeof item.description === 'string' ? item.description.slice(0, 250).replace(/[\x00-\x1F\x7F]/g, '') : '',
                    addedAt: item.addedAt || new Date().toISOString()
                };
            }
        }
    }

    let lastActive = 'Default';
    if (typeof registry.lastActiveProfile === 'string' && registry.lastActiveProfile.trim()) {
        const trimmed = registry.lastActiveProfile.trim();
        if (trimmed.toLowerCase() === 'default') {
            lastActive = 'Default';
        } else {
            const matchedKey = findProfileKey({ profiles: cleanObject }, trimmed);
            lastActive = matchedKey || sanitizeProfileName(trimmed) || 'Default';
        }
    }

    const payload = JSON.stringify({
        lastActiveProfile: lastActive,
        profiles: cleanObject,
        universalExtensions: cleanUniversal
    }, null, 2);

    const dir = path.dirname(registryPath);
    const tempFile = path.join(dir, `.profiles.json.tmp.${process.pid}.${Date.now()}`);

    try {
        fs.writeFileSync(tempFile, payload, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tempFile, registryPath);
        try {
            fs.chmodSync(registryPath, 0o600);
        } catch (e) { }
    } catch (e) {
        // Cleanup temp file if rename failed
        try {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        } catch (ignored) { }
    }
}

module.exports = {
    getProfilesRegistry,
    saveProfilesRegistry,
    findProfileKey
};
