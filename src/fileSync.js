const path = require('path');
const fs = require('fs');

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
    if (resolvedTarget.startsWith(resolvedSource + path.sep)) {
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
                    if (base === '.git' || base === '.DS_Store' || base === 'node_modules') {
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
            if (file === '.git' || file === '.DS_Store' || file === 'node_modules') continue;

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

module.exports = {
    copyDirRecursiveSync
};
