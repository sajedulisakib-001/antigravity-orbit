const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Returns the central profiles root directory (~/.antigravity-custom-profiles).
 */
function getProfilesRoot() {
    const root = path.join(os.homedir(), '.antigravity-custom-profiles');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    }
    return root;
}

/**
 * Resolves the destination folder name for copying this extension (e.g. sajedulisakib-001.antigravity-orbit-1.0.2).
 * Sanitizes input to prevent directory traversal or malformed paths.
 */
function getExtensionFolderName(sourceExtPath) {
    try {
        const pkgPath = path.join(sourceExtPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg && typeof pkg.publisher === 'string' && typeof pkg.name === 'string' && typeof pkg.version === 'string') {
                const safePub = pkg.publisher.replace(/[^a-zA-Z0-9_-]/g, '');
                const safeName = pkg.name.replace(/[^a-zA-Z0-9_-]/g, '');
                const safeVer = pkg.version.replace(/[^a-zA-Z0-9._-]/g, '');
                if (safePub && safeName && safeVer) {
                    return `${safePub}.${safeName}-${safeVer}`;
                }
            }
        }
    } catch (e) { }
    return 'sajedulisakib-001.antigravity-orbit-1.0.5';
}

module.exports = {
    getProfilesRoot,
    getExtensionFolderName
};
