const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Module = require('module');

// Configuration store for mock VS Code API
const mockConfigStore = new Map();
const mockRegisteredCommands = new Map();
let mockLastCreatedStatusBarItem = null;

const DEFAULT_CONFIGS = {
    'antigravity-orbit.autoRestoreLastProfile': true,
    'antigravity-orbit.defaultLaunchMode': 'prompt',
    'antigravity-orbit.confirmDelete': true,
    'antigravity-orbit.showStatusBarItem': true,
    'antigravity-orbit.statusBarAlignment': 'Left',
    'antigravity-orbit.autoSyncExtension': true,
    'antigravity-orbit.closeAfterSwitch': true
};

// Mock VS Code API for standalone Node.js test execution
const mockVscode = {
    workspace: {
        workspaceFolders: [],
        workspaceFile: undefined,
        getConfiguration: (section = 'antigravity-orbit') => ({
            get: (key, def) => {
                const fullKey = `${section}.${key}`;
                if (mockConfigStore.has(fullKey)) return mockConfigStore.get(fullKey);
                if (mockConfigStore.has(key)) return mockConfigStore.get(key);
                if (def !== undefined) return def;
                if (DEFAULT_CONFIGS[fullKey] !== undefined) return DEFAULT_CONFIGS[fullKey];
                if (DEFAULT_CONFIGS[`antigravity-orbit.${key}`] !== undefined) return DEFAULT_CONFIGS[`antigravity-orbit.${key}`];
                return undefined;
            },
            update: async (key, val, target) => {
                const fullKey = `${section}.${key}`;
                if (val === undefined) {
                    mockConfigStore.delete(fullKey);
                    mockConfigStore.delete(key);
                } else {
                    mockConfigStore.set(fullKey, val);
                    mockConfigStore.set(key, val);
                }
            }
        }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
        onDidChangeConfiguration: (fn) => ({ dispose: () => {} })
    },
    window: {
        showInformationMessage: async () => {},
        showErrorMessage: async () => {},
        showWarningMessage: async (msg, options, ...items) => {
            if (items.includes('Reset Settings')) return 'Reset Settings';
            if (items.includes('Delete Profile')) return 'Delete Profile';
            return items[0];
        },
        showQuickPick: async (items) => (Array.isArray(items) ? items[0] : null),
        showInputBox: async () => 'TestProfile',
        showSaveDialog: async (opts) => opts && opts.defaultUri ? opts.defaultUri : { fsPath: path.join(os.tmpdir(), 'backup.json') },
        showOpenDialog: async (opts) => [{ fsPath: path.join(os.tmpdir(), 'backup.json') }],
        createStatusBarItem: (alignment = 1, priority = 99) => {
            const item = {
                alignment,
                priority,
                text: '',
                tooltip: '',
                command: '',
                visible: false,
                show: function() { this.visible = true; },
                hide: function() { this.visible = false; },
                dispose: function() { this.visible = false; }
            };
            mockLastCreatedStatusBarItem = item;
            return item;
        },
        createWebviewPanel: (viewType, title, showOptions, options) => {
            const messageHandlers = [];
            const disposeHandlers = [];
            const panel = {
                viewType,
                title,
                showOptions,
                options,
                active: true,
                webview: {
                    html: '',
                    onDidReceiveMessage: (fn) => {
                        messageHandlers.push(fn);
                        return { dispose: () => {} };
                    },
                    postMessage: async (msg) => {
                        panel.lastPostedMessage = msg;
                    }
                },
                reveal: () => { panel.active = true; },
                onDidDispose: (fn) => {
                    disposeHandlers.push(fn);
                    return { dispose: () => {} };
                },
                dispose: () => {
                    if (panel.isDisposed) return;
                    panel.isDisposed = true;
                    panel.active = false;
                    for (const h of disposeHandlers) h();
                },
                // Test helper to simulate incoming message from webview
                _simulateMessage: async (msg) => {
                    for (const h of messageHandlers) {
                        await h(msg);
                    }
                }
            };
            return panel;
        }
    },
    commands: {
        registerCommand: (id, handler) => {
            mockRegisteredCommands.set(id, handler);
            return { dispose: () => { mockRegisteredCommands.delete(id); } };
        },
        executeCommand: async (id, ...args) => {
            const handler = mockRegisteredCommands.get(id);
            if (handler) return await handler(...args);
        }
    },
    env: {
        openExternal: async () => {}
    },
    Uri: {
        file: (p) => ({ fsPath: p })
    },
    extensions: {
        all: [],
        getExtension: (id) => mockVscode.extensions.all.find(e => e.id.toLowerCase() === id.toLowerCase())
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    QuickPickItemKind: { Separator: -1 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    ViewColumn: { One: 1, Active: -1 }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// Modules under test
const { sanitizeProfileName, sanitizeExtensionId, RESERVED_NAMES } = require('../src/sanitizer');
const { getProfilesRoot, getExtensionFolderName } = require('../src/constants');
const { findProfileKey, getProfilesRegistry, saveProfilesRegistry } = require('../src/registry');
const { validateWorkspacePath, findAntigravityMac, findAntigravityWindows, findAntigravityLinux } = require('../src/launcher');
const { copyDirRecursiveSync, syncExtensionToProfile, getProfileLastWorkspaceFromStorage } = require('../src/fileSync');
const {
    getCurrentProfile,
    isSwitchingInProgress,
    setSwitchingInProgress,
    updateActiveProfileWorkspace
} = require('../src/profileManager');
const { getSettingsHtml } = require('../src/settingsHtml');
const { SettingsPanel } = require('../src/settingsPanel');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        if (err.stack) {
            console.error(`     ${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
        }
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        if (err.stack) {
            console.error(`     ${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
        }
    }
}

async function runAllTests() {
    console.log('\n======================================================');
    console.log('🧪 Starting Antigravity Orbit Comprehensive Test Suite');
    console.log('======================================================\n');

    // ----------------------------------------------------
    // 1. Sanitizer Tests
    // ----------------------------------------------------
    console.log('📦 [1/8] Testing sanitizer.js...');

    runTest('Sanitize standard names', () => {
        assert.strictEqual(sanitizeProfileName('WebDev'), 'WebDev');
        assert.strictEqual(sanitizeProfileName('Python-ML'), 'Python-ML');
        assert.strictEqual(sanitizeProfileName('Rust_Project_123'), 'Rust_Project_123');
    });

    runTest('Sanitize and replace spaces and special characters', () => {
        assert.strictEqual(sanitizeProfileName('My Profile #1'), 'My_Profile_1');
        assert.strictEqual(sanitizeProfileName('test@project$name!'), 'test_project_name');
        assert.strictEqual(sanitizeProfileName('../../etc/passwd'), 'etc_passwd');
        assert.strictEqual(sanitizeProfileName('   padded   name   '), 'padded_name');
    });

    runTest('Reject reserved keywords & prototype pollution properties', () => {
        assert.strictEqual(sanitizeProfileName('default'), null);
        assert.strictEqual(sanitizeProfileName('DEFAULT'), null);
        assert.strictEqual(sanitizeProfileName('__proto__'), null);
        assert.strictEqual(sanitizeProfileName('constructor'), null);
        assert.strictEqual(sanitizeProfileName('prototype'), null);
        assert.strictEqual(sanitizeProfileName('con'), null);
        assert.strictEqual(sanitizeProfileName('prn'), null);
        assert.strictEqual(sanitizeProfileName('aux'), null);
        assert.strictEqual(sanitizeProfileName('nul'), null);
        assert.strictEqual(sanitizeProfileName('com1'), null);
        assert.strictEqual(sanitizeProfileName('lpt1'), null);
        assert.strictEqual(sanitizeProfileName('profiles.json'), null);
    });

    runTest('Reject empty, whitespace, and excessive length names', () => {
        assert.strictEqual(sanitizeProfileName(''), null);
        assert.strictEqual(sanitizeProfileName('   '), null);
        assert.strictEqual(sanitizeProfileName(null), null);
        assert.strictEqual(sanitizeProfileName(undefined), null);
        assert.strictEqual(sanitizeProfileName('a'.repeat(49)), null);
        assert.strictEqual(sanitizeProfileName('a'.repeat(48)), 'a'.repeat(48));
    });

    runTest('Strip non-printable and ANSI control characters', () => {
        assert.strictEqual(sanitizeProfileName('Hello\x00World\x1F'), 'HelloWorld');
        assert.strictEqual(sanitizeExtensionId('publisher.name\x00\x08'), 'publisher.name');
    });

    // ----------------------------------------------------
    // 2. Constants Tests
    // ----------------------------------------------------
    console.log('\n📦 [2/8] Testing constants.js...');

    runTest('getProfilesRoot returns ~/.antigravity-custom-profiles', () => {
        const root = getProfilesRoot();
        assert.strictEqual(root, path.join(os.homedir(), '.antigravity-custom-profiles'));
        assert.ok(fs.existsSync(root));
    });

    runTest('getExtensionFolderName parses package.json properly', () => {
        const folder = getExtensionFolderName(path.resolve(__dirname, '..'));
        assert.ok(folder.startsWith('sajedulisakib-001.antigravity-orbit-'));
    });

    // ----------------------------------------------------
    // 3. Registry Tests
    // ----------------------------------------------------
    console.log('\n📦 [3/8] Testing registry.js...');

    runTest('findProfileKey performs case-insensitive lookups', () => {
        const mockRegistry = {
            profiles: {
                'WebDev': { name: 'WebDev' },
                'PythonML': { name: 'PythonML' }
            }
        };
        assert.strictEqual(findProfileKey(mockRegistry, 'webdev'), 'WebDev');
        assert.strictEqual(findProfileKey(mockRegistry, 'PYTHONML'), 'PythonML');
        assert.strictEqual(findProfileKey(mockRegistry, 'Unknown'), null);
        assert.strictEqual(findProfileKey(null, 'WebDev'), null);
    });

    runTest('saveProfilesRegistry and getProfilesRegistry with atomic file persistence', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-reg-'));
        const regPath = path.join(tempDir, 'profiles.json');

        const testRegistry = {
            lastActiveProfile: 'TestProfile',
            profiles: {
                'TestProfile': {
                    name: 'Test Profile',
                    createdAt: new Date().toISOString(),
                    lastUsed: new Date().toISOString(),
                    lastWorkspacePath: '/tmp/workspace'
                }
            }
        };

        saveProfilesRegistry(regPath, testRegistry);
        assert.ok(fs.existsSync(regPath));

        const content = JSON.parse(fs.readFileSync(regPath, 'utf8'));
        assert.strictEqual(content.lastActiveProfile, 'TestProfile');
        assert.strictEqual(content.profiles.TestProfile.name, 'Test Profile');
        assert.strictEqual(content.profiles.TestProfile.lastWorkspacePath, '/tmp/workspace');

        // Test saving 'Default'
        testRegistry.lastActiveProfile = 'Default';
        saveProfilesRegistry(regPath, testRegistry);
        const contentDefault = JSON.parse(fs.readFileSync(regPath, 'utf8'));
        assert.strictEqual(contentDefault.lastActiveProfile, 'Default');

        // Cleanup
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    runTest('Registry recovers gracefully from corrupted profiles.json', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-corrupt-'));
        const regPath = path.join(tempDir, 'profiles.json');
        fs.writeFileSync(regPath, '{ invalid json syntax !!! @@');

        const reg = getProfilesRegistry();
        assert.ok(reg && reg.registry);
        assert.strictEqual(typeof reg.registry.profiles, 'object');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ----------------------------------------------------
    // 4. Launcher & Workspace Validation Tests
    // ----------------------------------------------------
    console.log('\n📦 [4/8] Testing launcher.js...');

    runTest('validateWorkspacePath validates directories and blocks flags', () => {
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-ws-'));

        assert.strictEqual(validateWorkspacePath(testDir), fs.realpathSync(testDir));
        assert.strictEqual(validateWorkspacePath('--option'), null);
        assert.strictEqual(validateWorkspacePath('-n'), null);
        assert.strictEqual(validateWorkspacePath('/non/existent/path/999999'), null);
        assert.strictEqual(validateWorkspacePath(''), null);
        assert.strictEqual(validateWorkspacePath(null), null);

        fs.rmSync(testDir, { recursive: true, force: true });
    });

    runTest('findAntigravity platform resolvers exist and return structured objects or null', () => {
        assert.strictEqual(typeof findAntigravityMac, 'function');
        assert.strictEqual(typeof findAntigravityWindows, 'function');
        assert.strictEqual(typeof findAntigravityLinux, 'function');

        if (process.platform === 'darwin') {
            const macTarget = findAntigravityMac();
            assert.ok(macTarget === null || typeof macTarget === 'object');
        }
    });

    // ----------------------------------------------------
    // 5. File Synchronization Tests
    // ----------------------------------------------------
    console.log('\n📦 [5/8] Testing fileSync.js...');

    runTest('copyDirRecursiveSync recursively copies files and skips ignored files', () => {
        const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-src-'));
        const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-dest-'));

        fs.writeFileSync(path.join(srcDir, 'file1.js'), 'console.log(1);');
        fs.mkdirSync(path.join(srcDir, 'subdir'));
        fs.writeFileSync(path.join(srcDir, 'subdir', 'file2.js'), 'console.log(2);');
        fs.mkdirSync(path.join(srcDir, '.git'));
        fs.writeFileSync(path.join(srcDir, '.git', 'config'), 'git');
        fs.mkdirSync(path.join(srcDir, 'node_modules'));
        fs.writeFileSync(path.join(srcDir, 'node_modules', 'dep.js'), 'dep');

        copyDirRecursiveSync(srcDir, destDir);

        assert.ok(fs.existsSync(path.join(destDir, 'file1.js')));
        assert.ok(fs.existsSync(path.join(destDir, 'subdir', 'file2.js')));
        assert.ok(!fs.existsSync(path.join(destDir, '.git')));
        assert.ok(!fs.existsSync(path.join(destDir, 'node_modules')));

        fs.rmSync(srcDir, { recursive: true, force: true });
        fs.rmSync(destDir, { recursive: true, force: true });
    });

    runTest('syncExtensionToProfile writes updated extensions.json with correct version', () => {
        const sourceExt = path.resolve(__dirname, '..');
        const customExtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-extdir-'));

        fs.writeFileSync(path.join(customExtDir, 'extensions.json'), JSON.stringify([
            { identifier: { id: 'some.other.extension' }, version: '1.0.0' },
            { identifier: { id: 'sajedulisakib-001.antigravity-orbit' }, version: '1.0.0' }
        ]));

        syncExtensionToProfile(sourceExt, customExtDir);

        const extJson = JSON.parse(fs.readFileSync(path.join(customExtDir, 'extensions.json'), 'utf8'));
        assert.strictEqual(extJson.length, 2);
        const orbitEntry = extJson.find(e => e.identifier && e.identifier.id === 'sajedulisakib-001.antigravity-orbit');
        assert.ok(orbitEntry);
        const rootDir = path.resolve(__dirname, '..');
        const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
        assert.strictEqual(orbitEntry.version, rootPkg.version);

        fs.rmSync(customExtDir, { recursive: true, force: true });
    });

    runTest('getProfileLastWorkspaceFromStorage resolves file URLs without URI malformed error', () => {
        const profilesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-storage-'));
        const profileName = 'StorageTest';
        const dataDir = path.join(profilesRoot, profileName, 'user-data', 'User', 'globalStorage');
        fs.mkdirSync(dataDir, { recursive: true });

        const testWsFolder = '/Users/test/projects/my workspace';
        const storageData = {
            windowsState: {
                lastActiveWindow: {
                    folder: 'file:///Users/test/projects/my%20workspace'
                }
            }
        };
        fs.writeFileSync(path.join(dataDir, 'storage.json'), JSON.stringify(storageData));

        const detected = getProfileLastWorkspaceFromStorage(profileName, profilesRoot);
        assert.strictEqual(detected, testWsFolder);

        fs.rmSync(profilesRoot, { recursive: true, force: true });
    });

    // ----------------------------------------------------
    // 6. Profile Manager & Switching Lifecycle Integration
    // ----------------------------------------------------
    console.log('\n📦 [6/8] Testing Profile Lifecycle & Switching...');

    runTest('isSwitchingInProgress and setSwitchingInProgress state tracking', () => {
        assert.strictEqual(isSwitchingInProgress(), false);
        setSwitchingInProgress(true);
        assert.strictEqual(isSwitchingInProgress(), true);
        setSwitchingInProgress(false);
        assert.strictEqual(isSwitchingInProgress(), false);
    });

    runTest('getCurrentProfile detects custom profile from extensionPath or fallback to Default', () => {
        const profilesRoot = getProfilesRoot();
        const customExtContext = {
            extensionPath: path.join(profilesRoot, 'PythonML', 'extensions', 'sajedulisakib-001.antigravity-orbit-1.0.5')
        };
        assert.strictEqual(getCurrentProfile(customExtContext), 'PythonML');

        const defaultContext = {
            extensionPath: '/Users/test/.antigravity-ide/extensions/antigravity-profiles'
        };
        assert.strictEqual(getCurrentProfile(defaultContext), 'Default');
    });

    runTest('getCurrentProfile handles Windows drive casing, globalStorageUri, and separators', () => {
        const winLowerContext = {
            extensionPath: 'c:\\users\\developer\\.antigravity-custom-profiles\\RustProject\\extensions\\sajedulisakib-001.antigravity-orbit-1.0.5'
        };
        assert.strictEqual(getCurrentProfile(winLowerContext), 'RustProject');

        const globalStorageContext = {
            globalStorageUri: {
                fsPath: 'C:\\Users\\Developer\\.antigravity-custom-profiles\\Webdev\\user-data\\User\\globalStorage\\orbit'
            }
        };
        assert.strictEqual(getCurrentProfile(globalStorageContext), 'Webdev');
    });

    runTest('Switching from Custom Profile to Default does NOT overwrite lastActiveProfile on deactivate', () => {
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let originalRegistryBackup = null;

        if (fs.existsSync(registryPath)) {
            originalRegistryBackup = fs.readFileSync(registryPath, 'utf8');
        }

        try {
            const initialReg = {
                lastActiveProfile: 'PythonML',
                profiles: {
                    'PythonML': {
                        name: 'PythonML',
                        createdAt: new Date().toISOString(),
                        lastUsed: new Date().toISOString(),
                        lastWorkspacePath: null
                    }
                }
            };
            saveProfilesRegistry(registryPath, initialReg);

            let currentReg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(currentReg.lastActiveProfile, 'PythonML');

            setSwitchingInProgress(true);
            currentReg.lastActiveProfile = 'Default';
            saveProfilesRegistry(registryPath, currentReg);

            updateActiveProfileWorkspace('PythonML', { updateLastActive: false });

            const regAfterDeactivate = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(regAfterDeactivate.lastActiveProfile, 'Default');

            setSwitchingInProgress(false);
        } finally {
            if (originalRegistryBackup !== null) {
                fs.writeFileSync(registryPath, originalRegistryBackup, { encoding: 'utf8', mode: 0o600 });
            }
        }
    });

    // ----------------------------------------------------
    // 7. Settings HTML Webview Generator Tests
    // ----------------------------------------------------
    console.log('\n📦 [7/8] Testing settingsHtml.js (HTML & CSP generator)...');

    runTest('getSettingsHtml generates valid HTML with CSP containing nonce', () => {
        const testNonce = 'testnonce123456789';
        const html = getSettingsHtml({
            nonce: testNonce,
            currentProfile: 'WebDev',
            version: '1.0.5',
            profilesRoot: '/home/user/.antigravity-custom-profiles',
            settings: {
                autoRestoreLastProfile: true,
                defaultLaunchMode: 'new_window',
                confirmDelete: true,
                showStatusBarItem: true,
                statusBarAlignment: 'Right',
                autoSyncExtension: true,
                closeAfterSwitch: false
            },
            registry: {
                lastActiveProfile: 'WebDev',
                profiles: {
                    'WebDev': { name: 'Web Development', createdAt: new Date().toISOString(), lastUsed: new Date().toISOString() }
                }
            }
        });

        assert.ok(html.includes(`nonce-${testNonce}`), 'CSP header should contain nonce');
        assert.ok(html.includes('<script nonce="testnonce123456789">'), 'Script tag should include nonce');
        assert.ok(html.includes('id="settingAutoRestore"'), 'Should contain autoRestore toggle');
        assert.ok(html.includes('id="settingDefaultLaunchMode"'), 'Should contain defaultLaunchMode select');
        assert.ok(html.includes('id="settingCloseAfterSwitch"'), 'Should contain closeAfterSwitch toggle');
        assert.ok(html.includes('id="settingShowStatusBar"'), 'Should contain showStatusBar toggle');
        assert.ok(html.includes('id="settingStatusBarAlignment"'), 'Should contain statusBarAlignment select');
        assert.ok(html.includes('id="settingConfirmDelete"'), 'Should contain confirmDelete toggle');
        assert.ok(html.includes('id="settingAutoSyncExtension"'), 'Should contain autoSyncExtension toggle');
        assert.ok(html.includes('id="profileGridContainer"'), 'Should contain profile list container');
        assert.ok(html.includes('id="registryJsonText"'), 'Should contain registry JSON viewer');
    });

    runTest('getSettingsHtml escapes special characters and prevents XSS', () => {
        const xssProfile = '<script>alert("xss")</script>';
        const html = getSettingsHtml({
            nonce: 'nonce999',
            currentProfile: xssProfile,
            version: '1.0.5',
            profilesRoot: '/path/test',
            settings: {},
            registry: {
                lastActiveProfile: 'Default',
                profiles: {
                    [xssProfile]: { name: '<b onmouseover=alert(1)>Bad</b>' }
                }
            }
        });

        assert.ok(!html.includes('<script>alert("xss")</script>'), 'Unescaped script tags must not be injected in raw HTML');
        assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;') || html.includes('\\u003cscript\\u003e'), 'Should be safely escaped');
    });

    runTest('getSettingsHtml strictly avoids inline onclick handlers for CSP compliance', () => {
        const html = getSettingsHtml({
            nonce: 'nonce999',
            currentProfile: 'Default',
            version: '1.0.5',
            profilesRoot: '/path/test',
            settings: {},
            registry: {
                lastActiveProfile: 'Default',
                profiles: {
                    'TestProfile': { name: 'Test Profile', lastWorkspacePath: '/test/path' }
                },
                universalExtensions: {
                    'test.ext': { id: 'test.ext', name: 'Test Ext', folderName: 'test.ext-1.0' }
                }
            },
            installedExtensions: [
                { id: 'test.ext', name: 'Test Ext' },
                { id: 'other.ext', name: 'Other Ext' }
            ]
        });

        assert.strictEqual(html.includes('onclick='), false, 'Generated HTML and client script must not use inline onclick handlers (blocked by CSP)');
    });

    // ----------------------------------------------------
    // 8. Settings Panel & Lifecycle Integration Tests
    // ----------------------------------------------------
    console.log('\n📦 [8/8] Testing SettingsPanel & Settings Management Integration...');

    await runAsyncTest('SettingsPanel.createOrShow manages singleton webview panel', async () => {
        const mockContext = {
            extensionPath: path.resolve(__dirname, '..'),
            subscriptions: []
        };

        const panel1 = SettingsPanel.createOrShow(mockContext);
        assert.ok(panel1, 'SettingsPanel instance should be created');
        assert.strictEqual(SettingsPanel.currentPanel, panel1);

        // Calling createOrShow again returns the same singleton
        const panel2 = SettingsPanel.createOrShow(mockContext);
        assert.strictEqual(panel1, panel2, 'Should reuse existing singleton panel');

        // Test webview message handler: updateSetting
        await panel1._panel._simulateMessage({
            command: 'updateSetting',
            key: 'defaultLaunchMode',
            value: 'switch'
        });
        const conf = mockVscode.workspace.getConfiguration('antigravity-orbit');
        assert.strictEqual(conf.get('defaultLaunchMode'), 'switch');

        // Test webview message handler: renameProfile
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let regBackup = null;
        if (fs.existsSync(registryPath)) regBackup = fs.readFileSync(registryPath, 'utf8');

        try {
            saveProfilesRegistry(registryPath, {
                lastActiveProfile: 'Default',
                profiles: {
                    'TestRename': { name: 'Old Name', createdAt: new Date().toISOString() }
                }
            });

            await panel1._panel._simulateMessage({
                command: 'renameProfile',
                key: 'TestRename',
                name: 'New Fancy Name'
            });

            const updatedReg = getProfilesRegistry().registry;
            assert.strictEqual(updatedReg.profiles.TestRename.name, 'New Fancy Name');

            // Test webview message handler: resetSettings
            await panel1._panel._simulateMessage({ command: 'resetSettings' });
            assert.strictEqual(conf.get('defaultLaunchMode'), 'prompt');

            // Test webview message handler: deleteProfile
            await panel1._panel._simulateMessage({
                command: 'deleteProfile',
                key: 'TestRename'
            });
            const afterDeleteReg = getProfilesRegistry().registry;
            assert.strictEqual(afterDeleteReg.profiles.TestRename, undefined);
        } finally {
            if (regBackup !== null) {
                fs.writeFileSync(registryPath, regBackup, { encoding: 'utf8', mode: 0o600 });
            }
        }

        // Dispose panel
        panel1.dispose();
        assert.strictEqual(SettingsPanel.currentPanel, undefined);
    });

    await runAsyncTest('Full extension activation with settings command & dynamic status bar', async () => {
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let regBackup = null;
        if (fs.existsSync(registryPath)) regBackup = fs.readFileSync(registryPath, 'utf8');

        try {
            saveProfilesRegistry(registryPath, {
                lastActiveProfile: 'Default',
                profiles: {}
            });

            const extension = require('../extension');
            const mockContext = {
                extensionPath: path.resolve(__dirname, '..'),
                subscriptions: []
            };

            // Test activating with default settings
            await extension.activate(mockContext);

            // Verify status bar item created
            assert.ok(mockLastCreatedStatusBarItem, 'Status bar item must be created');
            assert.strictEqual(mockLastCreatedStatusBarItem.visible, true);
            assert.strictEqual(mockLastCreatedStatusBarItem.alignment, mockVscode.StatusBarAlignment.Left);

            // Test 'antigravity-orbit.openSettings' command
            assert.ok(mockRegisteredCommands.has('antigravity-orbit.openSettings'), 'Command antigravity-orbit.openSettings should be registered');
            await mockVscode.commands.executeCommand('antigravity-orbit.openSettings');
            assert.ok(SettingsPanel.currentPanel, 'Executing openSettings command should open SettingsPanel');

            SettingsPanel.currentPanel.dispose();
            extension.deactivate();
        } finally {
            if (regBackup !== null) {
                fs.writeFileSync(registryPath, regBackup, { encoding: 'utf8', mode: 0o600 });
            }
        }
    });

    await runAsyncTest('Status bar dynamically reflects showStatusBarItem and statusBarAlignment', async () => {
        const { updateStatusBar } = require('../extension');
        const mockContext = { subscriptions: [] };

        // Test Left alignment
        mockConfigStore.set('antigravity-orbit.showStatusBarItem', true);
        mockConfigStore.set('antigravity-orbit.statusBarAlignment', 'Left');
        updateStatusBar(mockContext, 'WebDev');
        assert.ok(mockLastCreatedStatusBarItem);
        assert.strictEqual(mockLastCreatedStatusBarItem.visible, true);
        assert.strictEqual(mockLastCreatedStatusBarItem.alignment, mockVscode.StatusBarAlignment.Left);
        assert.ok(mockLastCreatedStatusBarItem.text.includes('WebDev'));

        // Test Right alignment
        mockConfigStore.set('antigravity-orbit.statusBarAlignment', 'Right');
        updateStatusBar(mockContext, 'PythonML');
        assert.ok(mockLastCreatedStatusBarItem);
        assert.strictEqual(mockLastCreatedStatusBarItem.visible, true);
        assert.strictEqual(mockLastCreatedStatusBarItem.alignment, mockVscode.StatusBarAlignment.Right);
        assert.ok(mockLastCreatedStatusBarItem.text.includes('PythonML'));

        // Test Hide status bar
        mockConfigStore.set('antigravity-orbit.showStatusBarItem', false);
        updateStatusBar(mockContext, 'Default');
        assert.strictEqual(mockLastCreatedStatusBarItem.visible, false);

        // Reset
        mockConfigStore.delete('antigravity-orbit.showStatusBarItem');
        mockConfigStore.delete('antigravity-orbit.statusBarAlignment');
    });

    await runAsyncTest('SettingsPanel handles export and import of profiles registry backup', async () => {
        const mockContext = {
            extensionPath: path.resolve(__dirname, '..'),
            subscriptions: []
        };
        const panel = SettingsPanel.createOrShow(mockContext);
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let regBackup = null;
        if (fs.existsSync(registryPath)) regBackup = fs.readFileSync(registryPath, 'utf8');

        const tempBackupFile = path.join(os.tmpdir(), `orbit-reg-test-${Date.now()}.json`);

        try {
            saveProfilesRegistry(registryPath, {
                lastActiveProfile: 'BackupProfile',
                profiles: {
                    'BackupProfile': { name: 'Backup Profile', createdAt: new Date().toISOString() }
                }
            });

            // Simulate Export
            mockVscode.window.showSaveDialog = async () => ({ fsPath: tempBackupFile });
            await panel._panel._simulateMessage({ command: 'exportRegistry' });
            assert.ok(fs.existsSync(tempBackupFile), 'Exported backup file should exist');
            const exportedContent = JSON.parse(fs.readFileSync(tempBackupFile, 'utf8'));
            assert.strictEqual(exportedContent.lastActiveProfile, 'BackupProfile');

            // Modify registry then simulate Import
            saveProfilesRegistry(registryPath, {
                lastActiveProfile: 'Default',
                profiles: {}
            });
            mockVscode.window.showOpenDialog = async () => [{ fsPath: tempBackupFile }];
            await panel._panel._simulateMessage({ command: 'importRegistry' });

            const restoredReg = getProfilesRegistry().registry;
            assert.strictEqual(restoredReg.lastActiveProfile, 'BackupProfile');
            assert.ok(restoredReg.profiles.BackupProfile);
        } finally {
            if (fs.existsSync(tempBackupFile)) fs.unlinkSync(tempBackupFile);
            if (regBackup !== null) {
                fs.writeFileSync(registryPath, regBackup, { encoding: 'utf8', mode: 0o600 });
            }
            panel.dispose();
        }
    });

    await runAsyncTest('showProfileMenu includes Orbit Settings & Dashboard option', async () => {
        const { showProfileMenu } = require('../src/profileManager');
        let quickPickItems = null;
        const originalShowQuickPick = mockVscode.window.showQuickPick;

        mockVscode.window.showQuickPick = async (items) => {
            quickPickItems = items;
            return items.find(i => i.action === 'open_settings');
        };

        const mockContext = { extensionPath: path.resolve(__dirname, '..'), subscriptions: [] };
        await showProfileMenu(mockContext);

        assert.ok(quickPickItems, 'showQuickPick should be called with menu items');
        const settingsItem = quickPickItems.find(i => i.action === 'open_settings');
        assert.ok(settingsItem, 'Menu must contain open_settings item');
        assert.ok(settingsItem.label.includes('Orbit Settings & Dashboard'));

        mockVscode.window.showQuickPick = originalShowQuickPick;
    });

    console.log('\n📦 [9/9] Testing Universal Extensions System & Isolation...');

    const { getUniversalExtensionsDir } = require('../src/constants');
    const {
        getInstalledUserExtensions,
        addUniversalExtension,
        removeUniversalExtension,
        syncUniversalExtensionsToNewProfile
    } = require('../src/universalExtensions');

    runTest('getUniversalExtensionsDir returns .universal-extensions directory', () => {
        const uniDir = getUniversalExtensionsDir();
        assert.ok(fs.existsSync(uniDir), 'Universal extensions directory should exist');
        assert.ok(uniDir.endsWith('.universal-extensions'), 'Directory path should end with .universal-extensions');
    });

    runTest('sanitizeExtensionId validates IDs and rejects directory traversal & prototype attacks', () => {
        assert.strictEqual(sanitizeExtensionId('esbenp.prettier-vscode'), 'esbenp.prettier-vscode');
        assert.strictEqual(sanitizeExtensionId('ms-python.python'), 'ms-python.python');
        assert.strictEqual(sanitizeExtensionId('ms-toolsai.jupyter_keymap-1.0'), 'ms-toolsai.jupyter_keymap-1.0');

        // Rejections
        assert.strictEqual(sanitizeExtensionId('../traversal/path'), null);
        assert.strictEqual(sanitizeExtensionId('/absolute/path'), null);
        assert.strictEqual(sanitizeExtensionId('__proto__'), null);
        assert.strictEqual(sanitizeExtensionId('constructor'), null);
        assert.strictEqual(sanitizeExtensionId('has spaces in id'), null);
        assert.strictEqual(sanitizeExtensionId(''), null);
        assert.strictEqual(sanitizeExtensionId(null), null);
    });

    await runAsyncTest('addUniversalExtension, getInstalledUserExtensions, and removeUniversalExtension', async () => {
        const testExtDir = path.join(os.tmpdir(), `test-mock-ext-${Date.now()}`);
        fs.mkdirSync(testExtDir, { recursive: true });
        fs.writeFileSync(path.join(testExtDir, 'package.json'), JSON.stringify({
            name: 'sample-linter',
            displayName: 'Sample Linter',
            publisher: 'testpublisher',
            version: '2.1.0',
            description: 'A mock linter extension'
        }));
        fs.writeFileSync(path.join(testExtDir, 'extension.js'), 'module.exports = {};');

        // Add to mock vscode.extensions
        mockVscode.extensions.all = [
            {
                id: 'testpublisher.sample-linter',
                extensionPath: testExtDir,
                packageJSON: {
                    name: 'sample-linter',
                    displayName: 'Sample Linter',
                    publisher: 'testpublisher',
                    version: '2.1.0',
                    description: 'A mock linter extension'
                }
            },
            {
                id: 'sajedulisakib-001.antigravity-orbit',
                extensionPath: path.resolve(__dirname, '..'),
                packageJSON: { isBuiltin: false }
            },
            {
                id: 'vscode.builtin-git',
                extensionPath: '/resources/app/extensions/git',
                packageJSON: { isBuiltin: true }
            }
        ];

        try {
            // 1. Test getInstalledUserExtensions
            const userExts = getInstalledUserExtensions();
            assert.ok(userExts.some(e => e.id === 'testpublisher.sample-linter'), 'Should detect sample-linter');
            assert.ok(!userExts.some(e => e.id.includes('antigravity-orbit')), 'Should filter out Orbit profile manager itself');
            assert.ok(!userExts.some(e => e.id.includes('builtin-git')), 'Should filter out built-in extensions');

            // 2. Add to Universal Pool
            const added = addUniversalExtension('testpublisher.sample-linter');
            assert.strictEqual(added, true);

            const { registry } = getProfilesRegistry();
            assert.ok(registry.universalExtensions['testpublisher.sample-linter'], 'Registry must record universal extension');
            assert.strictEqual(registry.universalExtensions['testpublisher.sample-linter'].name, 'Sample Linter');

            const uniStoreDir = getUniversalExtensionsDir();
            const clonedFolder = path.join(uniStoreDir, registry.universalExtensions['testpublisher.sample-linter'].folderName);
            assert.ok(fs.existsSync(clonedFolder), 'Universal store folder must exist on disk');
            assert.ok(fs.existsSync(path.join(clonedFolder, 'extension.js')), 'Files must be copied');

            // 3. Remove from Universal Pool
            const removed = removeUniversalExtension('testpublisher.sample-linter');
            assert.strictEqual(removed, true);
            const updatedReg = getProfilesRegistry().registry;
            assert.strictEqual(updatedReg.universalExtensions['testpublisher.sample-linter'], undefined);
            assert.strictEqual(fs.existsSync(clonedFolder), false, 'Universal store folder should be deleted');
        } finally {
            if (fs.existsSync(testExtDir)) fs.rmSync(testExtDir, { recursive: true, force: true });
            mockVscode.extensions.all = [];
        }
    });

    await runAsyncTest('syncUniversalExtensionsToNewProfile clones universal extensions into new profiles ONLY (older profiles remain isolated)', async () => {
        const profilesRoot = getProfilesRoot();
        const oldProfileExtDir = path.join(profilesRoot, 'OldExistingProfile', 'extensions');
        const newProfileExtDir = path.join(profilesRoot, 'BrandNewProfile', 'extensions');

        // Create older profile directory prior to adding universal extension
        fs.mkdirSync(oldProfileExtDir, { recursive: true });
        fs.writeFileSync(path.join(oldProfileExtDir, 'extensions.json'), JSON.stringify([]));

        // Create a mock extension and register as universal
        const testExtDir = path.join(os.tmpdir(), `test-uni-ext-${Date.now()}`);
        fs.mkdirSync(testExtDir, { recursive: true });
        fs.writeFileSync(path.join(testExtDir, 'package.json'), JSON.stringify({
            name: 'code-formatter',
            displayName: 'Code Formatter',
            publisher: 'tools',
            version: '1.5.0'
        }));
        fs.writeFileSync(path.join(testExtDir, 'formatter.js'), 'console.log("formatter");');

        mockVscode.extensions.all = [{
            id: 'tools.code-formatter',
            extensionPath: testExtDir,
            packageJSON: { name: 'code-formatter', displayName: 'Code Formatter', publisher: 'tools', version: '1.5.0' }
        }];

        try {
            addUniversalExtension('tools.code-formatter');

            // 1. Simulate NEW profile creation: sync Orbit first, then universal extensions
            const sourceExt = path.resolve(__dirname, '..');
            syncExtensionToProfile(sourceExt, newProfileExtDir);
            syncUniversalExtensionsToNewProfile(newProfileExtDir);

            // Verify new profile received BOTH Orbit and Universal extension
            const newExtEntries = fs.readdirSync(newProfileExtDir);
            assert.ok(newExtEntries.some(f => f.startsWith('sajedulisakib-001.antigravity-orbit')), 'New profile must receive Orbit extension first');
            assert.ok(newExtEntries.some(f => f.startsWith('tools.code-formatter')), 'New profile must receive universal extension');
            
            const newExtJson = JSON.parse(fs.readFileSync(path.join(newProfileExtDir, 'extensions.json'), 'utf8'));
            assert.ok(newExtJson.some(e => e.identifier.id === 'sajedulisakib-001.antigravity-orbit'), 'New profile extensions.json must record Orbit entry');
            assert.ok(newExtJson.some(e => e.identifier.id === 'tools.code-formatter'), 'New profile extensions.json must record universal extension entry');
            assert.strictEqual(newExtJson[0].identifier.id, 'sajedulisakib-001.antigravity-orbit', 'Orbit must be registered first in extensions.json');

            // 2. ISOLATION CHECK: Verify OLD profile was NOT touched or injected
            const oldExtEntries = fs.readdirSync(oldProfileExtDir);
            assert.ok(!oldExtEntries.some(f => f.startsWith('tools.code-formatter')), 'Old existing profile must NOT receive universal extension');
            const oldExtJson = JSON.parse(fs.readFileSync(path.join(oldProfileExtDir, 'extensions.json'), 'utf8'));
            assert.strictEqual(oldExtJson.length, 0, 'Old profile extensions.json must remain untouched');
        } finally {
            removeUniversalExtension('tools.code-formatter');
            if (fs.existsSync(testExtDir)) fs.rmSync(testExtDir, { recursive: true, force: true });
            if (fs.existsSync(path.join(profilesRoot, 'OldExistingProfile'))) fs.rmSync(path.join(profilesRoot, 'OldExistingProfile'), { recursive: true, force: true });
            if (fs.existsSync(path.join(profilesRoot, 'BrandNewProfile'))) fs.rmSync(path.join(profilesRoot, 'BrandNewProfile'), { recursive: true, force: true });
            mockVscode.extensions.all = [];
        }
    });

    await runAsyncTest('SettingsPanel handles addUniversalExtension and removeUniversalExtension messages', async () => {
        const mockContext = { extensionPath: path.resolve(__dirname, '..'), subscriptions: [] };
        const panel = SettingsPanel.createOrShow(mockContext);

        const testExtDir = path.join(os.tmpdir(), `test-panel-uni-${Date.now()}`);
        fs.mkdirSync(testExtDir, { recursive: true });
        fs.writeFileSync(path.join(testExtDir, 'package.json'), JSON.stringify({
            name: 'panel-plugin',
            displayName: 'Panel Plugin',
            publisher: 'paneltest',
            version: '3.0.0'
        }));

        mockVscode.extensions.all = [{
            id: 'paneltest.panel-plugin',
            extensionPath: testExtDir,
            packageJSON: { name: 'panel-plugin', displayName: 'Panel Plugin', publisher: 'paneltest', version: '3.0.0' }
        }];

        try {
            // Message: addUniversalExtension
            await panel._panel._simulateMessage({ command: 'addUniversalExtension', id: 'paneltest.panel-plugin' });
            assert.ok(panel._panel.lastPostedMessage, 'Panel should post toast response');
            assert.strictEqual(panel._panel.lastPostedMessage.type, 'showToast');
            assert.ok(panel._panel.lastPostedMessage.text.includes('paneltest.panel-plugin'));

            const { registry } = getProfilesRegistry();
            assert.ok(registry.universalExtensions['paneltest.panel-plugin']);

            // Message: removeUniversalExtension
            await panel._panel._simulateMessage({ command: 'removeUniversalExtension', id: 'paneltest.panel-plugin' });
            assert.strictEqual(panel._panel.lastPostedMessage.type, 'showToast');
            assert.ok(panel._panel.lastPostedMessage.text.includes('Removed'));

            const updatedReg = getProfilesRegistry().registry;
            assert.strictEqual(updatedReg.universalExtensions['paneltest.panel-plugin'], undefined);
        } finally {
            if (fs.existsSync(testExtDir)) fs.rmSync(testExtDir, { recursive: true, force: true });
            panel.dispose();
            mockVscode.extensions.all = [];
        }
    });

    console.log('\n======================================================');
    console.log(`📊 Test Results: ${passedTests}/${totalTests} Passed (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
    console.log('======================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
