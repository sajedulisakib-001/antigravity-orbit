const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

/**
 * Validates that an optional workspace path is a safe, existing directory.
 * @param {string|undefined} wsPath
 * @returns {string|null}
 */
/**
 * Validates that an optional workspace path is a safe, existing directory or file.
 * Strictly rejects paths starting with '-' to prevent CLI flag injection.
 *
 * @param {string|undefined} wsPath
 * @returns {string|null} Canonical validated path, or null if invalid.
 */
function validateWorkspacePath(wsPath) {
    if (!wsPath || typeof wsPath !== 'string') return null;
    const trimmed = wsPath.trim();
    if (!trimmed || trimmed.startsWith('-')) return null;

    const normalized = path.normalize(trimmed);
    try {
        if (fs.existsSync(normalized)) {
            const real = fs.realpathSync(normalized);
            if (path.basename(real).startsWith('-')) return null;
            const stat = fs.statSync(real);
            if (stat.isDirectory() || stat.isFile()) {
                return real;
            }
        }
    } catch (e) { }
    return null;
}

/**
 * Resolves Antigravity IDE executable and CLI entrypoints on macOS.
 */
function findAntigravityMac() {
    const candidateApps = [];

    // 1. Check from process.execPath (current running process inside IDE)
    if (process.execPath && process.execPath.includes('.app')) {
        const appPath = process.execPath.split('.app')[0] + '.app';
        candidateApps.push(appPath);
    }

    // 2. Standard system locations
    candidateApps.push(
        '/Applications/Tools/Antigravity IDE.app',
        '/Applications/Antigravity IDE.app',
        path.join(os.homedir(), 'Applications', 'Antigravity IDE.app')
    );

    for (const appPath of candidateApps) {
        if (fs.existsSync(appPath)) {
            const electron = path.join(appPath, 'Contents', 'MacOS', 'Electron');
            const cliJs = path.join(appPath, 'Contents', 'Resources', 'app', 'out', 'cli.js');
            const cliScript = path.join(appPath, 'Contents', 'Resources', 'app', 'bin', 'antigravity-ide');

            if (fs.existsSync(electron) && fs.existsSync(cliJs)) {
                return { type: 'electron-cli', electron, cliJs };
            }
            if (fs.existsSync(cliScript)) {
                return { type: 'script', script: cliScript };
            }
            return { type: 'app', appPath };
        }
    }

    return null;
}

/**
 * Resolves Antigravity IDE executable and CLI entrypoints on Windows.
 */
function findAntigravityWindows() {
    let baseDir = null;

    if (process.execPath && (process.execPath.toLowerCase().includes('antigravity') || process.execPath.toLowerCase().includes('code'))) {
        baseDir = path.dirname(process.execPath);
    }

    const candidateDirs = [];
    if (baseDir) candidateDirs.push(baseDir);

    candidateDirs.push(
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Antigravity IDE'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Antigravity IDE')
    );

    for (const dir of candidateDirs) {
        if (fs.existsSync(dir)) {
            const exeNames = ['Antigravity.exe', 'Antigravity IDE.exe', 'Code.exe'];
            const exe = exeNames.map(name => path.join(dir, name)).find(p => fs.existsSync(p));
            const cliJs = path.join(dir, 'resources', 'app', 'out', 'cli.js');
            const cmdScript = path.join(dir, 'bin', 'antigravity-ide.cmd');

            if (exe && fs.existsSync(cliJs)) {
                return { type: 'electron-cli', electron: exe, cliJs };
            }
            if (fs.existsSync(cmdScript)) {
                return { type: 'script', script: cmdScript };
            }
            if (exe) {
                return { type: 'binary', exe };
            }
        }
    }

    return null;
}

/**
 * Resolves Antigravity IDE executable and CLI entrypoints on Linux.
 */
function findAntigravityLinux() {
    if (process.execPath && fs.existsSync(process.execPath)) {
        const baseDir = path.dirname(process.execPath);
        const cliJs = path.join(baseDir, 'resources', 'app', 'out', 'cli.js');
        if (fs.existsSync(cliJs)) {
            return { type: 'electron-cli', electron: process.execPath, cliJs };
        }
    }

    const candidateBins = [
        '/usr/bin/antigravity-ide',
        '/usr/bin/antigravity',
        '/usr/local/bin/antigravity',
        '/opt/antigravity/antigravity',
        '/snap/bin/antigravity'
    ];

    for (const bin of candidateBins) {
        if (fs.existsSync(bin)) {
            return { type: 'binary', exe: bin };
        }
    }

    return null;
}

/**
 * Spawns a detached process securely, handling error events to prevent crashing host extension.
 */
function spawnDetached(bin, args, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn(bin, args, {
                ...options,
                detached: true,
                stdio: 'ignore',
                shell: false // Security: strictly disable shell interpolation
            });

            // Prevent unhandled 'error' event crash if executable cannot be spawned
            child.on('error', (err) => {
                reject(err);
            });

            child.unref();
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Launches an Antigravity IDE instance with isolated directories.
 * Cleans environment variables and prevents argument injection.
 */
async function launchAntigravityInstance({ customExtDir, customDataDir, workspacePath } = {}) {
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';
    const hasCustomDirs = Boolean(customExtDir && customDataDir);
    const validWorkspace = validateWorkspacePath(workspacePath);

    const cleanEnv = { ...process.env };
    delete cleanEnv.VSCODE_IPC_HOOK_CLI;
    delete cleanEnv.VSCODE_IPC_HOOK;
    delete cleanEnv.VSCODE_NLS_CONFIG;
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    delete cleanEnv.NODE_OPTIONS;

    // 1. macOS Launch
    if (isMac) {
        const target = findAntigravityMac();

        if (target && target.type === 'electron-cli') {
            const env = { ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' };
            const args = [target.cliJs, '-n'];
            if (hasCustomDirs) {
                args.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
            }
            if (validWorkspace) {
                args.push(validWorkspace);
            }

            try {
                await spawnDetached(target.electron, args, { env });
                return;
            } catch (e) {
                // Fallback to script or open below
            }
        }

        if (target && target.type === 'script') {
            const args = ['-n'];
            if (hasCustomDirs) {
                args.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
            }
            if (validWorkspace) {
                args.push(validWorkspace);
            }
            try {
                await spawnDetached(target.script, args, { env: cleanEnv });
                return;
            } catch (e) {
                // Fallback to open below
            }
        }

        // Fallback: /usr/bin/open
        const openArgs = ['-n', '-b', 'com.google.antigravity-ide'];
        if (hasCustomDirs || validWorkspace) {
            openArgs.push('--args');
            if (hasCustomDirs) {
                openArgs.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
            }
            if (validWorkspace) {
                openArgs.push(validWorkspace);
            }
        }
        await spawnDetached('/usr/bin/open', openArgs);
        return;
    }

    // 2. Windows Launch
    if (isWin) {
        const target = findAntigravityWindows();

        if (target && target.type === 'electron-cli') {
            const env = { ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' };
            const args = [target.cliJs, '-n'];
            if (hasCustomDirs) {
                args.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
            }
            if (validWorkspace) {
                args.push(validWorkspace);
            }
            await spawnDetached(target.electron, args, { env, windowsHide: true });
            return;
        }

        const winExe = (target && (target.script || target.exe)) || 'antigravity';
        const winArgs = ['-n'];
        if (hasCustomDirs) {
            winArgs.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
        }
        if (validWorkspace) {
            winArgs.push(validWorkspace);
        }
        await spawnDetached(winExe, winArgs, { env: cleanEnv, windowsHide: true });
        return;
    }

    // 3. Linux Launch
    const target = findAntigravityLinux();
    if (target && target.type === 'electron-cli') {
        const env = { ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' };
        const args = [target.cliJs, '-n'];
        if (hasCustomDirs) {
            args.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
        }
        if (validWorkspace) {
            args.push(validWorkspace);
        }
        await spawnDetached(target.electron, args, { env });
        return;
    }

    const linuxExe = (target && target.exe) || 'antigravity';
    const linuxArgs = ['-n'];
    if (hasCustomDirs) {
        linuxArgs.push('--extensions-dir', customExtDir, '--user-data-dir', customDataDir);
    }
    if (validWorkspace) {
        linuxArgs.push(validWorkspace);
    }
    await spawnDetached(linuxExe, linuxArgs, { env: cleanEnv });
}

module.exports = {
    validateWorkspacePath,
    findAntigravityMac,
    findAntigravityWindows,
    findAntigravityLinux,
    launchAntigravityInstance
};
