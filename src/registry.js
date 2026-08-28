const path = require('path');
const fs = require('fs');
const { getProfilesRoot } = require('./constants');
const { sanitizeProfileName } = require('./sanitizer');

/**
 * Reads the central profiles registry safely, guarding against prototype pollution
 * and auto-discovering valid profile directories.
 */
function getProfilesRegistry() {
    const profilesRoot = getProfilesRoot();
    const registryPath = path.join(profilesRoot, 'profiles.json');

    // Create a dictionary object with null prototype to avoid prototype pollution
    const cleanProfiles = Object.create(null);
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
                            cleanProfiles[safeKey] = {
                                name: rawName.trim() || safeKey,
                                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
                                lastUsed: typeof entry.lastUsed === 'string' ? entry.lastUsed : new Date().toISOString()
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
                    cleanProfiles[safeName] = {
                        name: safeName,
                        createdAt: new Date().toISOString(),
                        lastUsed: new Date().toISOString()
                    };
                }
            }
        }
    } catch (e) { }

    // If lastActiveProfile is not Default and does not exist in discovered profiles, fall back to Default
    if (lastActiveProfile !== 'Default' && !cleanProfiles[lastActiveProfile]) {
        lastActiveProfile = 'Default';
    }

    return {
        registryPath,
        registry: {
            lastActiveProfile,
            profiles: cleanProfiles
        },
        profilesRoot
    };
}

/**
 * Persists the profile registry to profiles.json using an atomic write pattern
 * to prevent file corruption during crashes or partial writes, with restricted file permissions (0600).
 */
function saveProfilesRegistry(registryPath, registry) {
    if (!registry || !registry.profiles || typeof registry.profiles !== 'object' || Array.isArray(registry.profiles)) {
        return;
    }

    const cleanObject = {};
    for (const key of Object.keys(registry.profiles)) {
        const safeKey = sanitizeProfileName(key);
        if (safeKey && Object.prototype.hasOwnProperty.call(registry.profiles, key)) {
            const item = registry.profiles[key];
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const rawName = typeof item.name === 'string' ? item.name.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : safeKey;
                cleanObject[safeKey] = {
                    name: rawName.trim() || safeKey,
                    createdAt: item.createdAt || new Date().toISOString(),
                    lastUsed: item.lastUsed || new Date().toISOString()
                };
            }
        }
    }

    const lastActive = (typeof registry.lastActiveProfile === 'string' && registry.lastActiveProfile.trim())
        ? (registry.lastActiveProfile.toLowerCase() === 'default' ? 'Default' : (sanitizeProfileName(registry.lastActiveProfile) || 'Default'))
        : 'Default';

    const payload = JSON.stringify({
        lastActiveProfile: lastActive,
        profiles: cleanObject
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
    saveProfilesRegistry
};
