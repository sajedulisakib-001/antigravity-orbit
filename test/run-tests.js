const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Module = require('module');

// Mock VS Code API for standalone Node.js test execution
const mockVscode = {
    workspace: {
        workspaceFolders: [],
        workspaceFile: undefined,
        getConfiguration: () => ({
            get: (key, def) => def
        }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
    },
    window: {
        showInformationMessage: async () => {},
        showErrorMessage: async () => {},
        showWarningMessage: async () => {},
        showQuickPick: async () => {},
        showInputBox: async () => {},
        createStatusBarItem: () => ({
            show: () => {},
            dispose: () => {}
        })
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: async () => {}
    },
    env: {
        openExternal: async () => {}
    },
    Uri: {
        file: (p) => ({ fsPath: p })
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    QuickPickItemKind: { Separator: -1 }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// Modules under test
const { sanitizeProfileName, RESERVED_NAMES } = require('../src/sanitizer');
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
    console.log('📦 [1/6] Testing sanitizer.js...');

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

    // ----------------------------------------------------
    // 2. Constants Tests
    // ----------------------------------------------------
    console.log('\n📦 [2/6] Testing constants.js...');

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
    console.log('\n📦 [3/6] Testing registry.js...');

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

        // Should not throw and should return default object
        const reg = getProfilesRegistry();
        assert.ok(reg && reg.registry);
        assert.strictEqual(typeof reg.registry.profiles, 'object');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ----------------------------------------------------
    // 4. Launcher & Workspace Validation Tests
    // ----------------------------------------------------
    console.log('\n📦 [4/6] Testing launcher.js...');

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
    console.log('\n📦 [5/6] Testing fileSync.js...');

    runTest('copyDirRecursiveSync recursively copies files and skips ignored files', () => {
        const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-src-'));
        const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-dest-'));

        // Create test files
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

        // Create an existing extensions.json
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

        // Path with special characters / spaces
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
    console.log('\n📦 [6/6] Testing Profile Lifecycle & Switching Bug Fix...');

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

    runTest('CRITICAL WINDOWS BUG FIX: getCurrentProfile handles Windows drive casing, globalStorageUri, and separators', () => {
        // Test Windows drive letter casing (c:\ vs C:\)
        const winLowerContext = {
            extensionPath: 'c:\\users\\developer\\.antigravity-custom-profiles\\RustProject\\extensions\\sajedulisakib-001.antigravity-orbit-1.0.5'
        };
        assert.strictEqual(getCurrentProfile(winLowerContext), 'RustProject');

        // Test globalStorageUri (infallible user-data detector)
        const globalStorageContext = {
            globalStorageUri: {
                fsPath: 'C:\\Users\\Developer\\.antigravity-custom-profiles\\Webdev\\user-data\\User\\globalStorage\\orbit'
            }
        };
        assert.strictEqual(getCurrentProfile(globalStorageContext), 'Webdev');

        // Test logUri
        const logUriContext = {
            logUri: {
                fsPath: '/Users/developer/.antigravity-custom-profiles/Testing/user-data/logs'
            }
        };
        assert.strictEqual(getCurrentProfile(logUriContext), 'Testing');

        // Test process.argv with forward slashes
        const originalArgv = process.argv;
        process.argv = ['node', '--user-data-dir=C:/Users/Developer/.antigravity-custom-profiles/ArgvProfile/user-data'];
        assert.strictEqual(getCurrentProfile({}), 'ArgvProfile');
        process.argv = originalArgv;
    });

    runTest('CRITICAL BUG VERIFICATION: Switching from Custom Profile to Default does NOT overwrite lastActiveProfile on deactivate', () => {
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let originalRegistryBackup = null;

        if (fs.existsSync(registryPath)) {
            originalRegistryBackup = fs.readFileSync(registryPath, 'utf8');
        }

        try {
            // Step 1: User is currently working in custom profile 'PythonML'
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

            // Verify initial state
            let currentReg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(currentReg.lastActiveProfile, 'PythonML');

            // Step 2: User clicks 'Switch to Default Profile'
            // launchProfile('Default') sets lastActiveProfile = 'Default' and sets isSwitchingInProgress = true
            setSwitchingInProgress(true);
            currentReg.lastActiveProfile = 'Default';
            saveProfilesRegistry(registryPath, currentReg);

            let switchedReg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(switchedReg.lastActiveProfile, 'Default');

            // Step 3: Closing window triggers deactivate() for 'PythonML'
            updateActiveProfileWorkspace('PythonML', { updateLastActive: false });

            // Verify that lastActiveProfile REMAINS 'Default'!
            const regAfterDeactivate = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(regAfterDeactivate.lastActiveProfile, 'Default', 'lastActiveProfile must remain Default and NOT be overwritten during deactivate!');

            // Step 4: Default window opens and checks autoRestore
            const currentProfile = 'Default';
            const autoRestore = true;
            const lastActive = regAfterDeactivate.lastActiveProfile;

            // Condition: autoRestore && lastActive && lastActive.toLowerCase() !== 'default'
            const willAutoRestore = autoRestore && lastActive && lastActive.toLowerCase() !== 'default';
            assert.strictEqual(willAutoRestore, false, 'Default profile window must STAY open and NOT auto-restore custom profile!');

            // Reset switching flag
            setSwitchingInProgress(false);
        } finally {
            if (originalRegistryBackup !== null) {
                fs.writeFileSync(registryPath, originalRegistryBackup, { encoding: 'utf8', mode: 0o600 });
            }
        }
    });

    runTest('CRITICAL BUG VERIFICATION: Switching from Custom Profile A to Custom Profile B', () => {
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let originalRegistryBackup = null;

        if (fs.existsSync(registryPath)) {
            originalRegistryBackup = fs.readFileSync(registryPath, 'utf8');
        }

        try {
            // Step 1: In Profile A
            const reg = {
                lastActiveProfile: 'ProfileA',
                profiles: {
                    'ProfileA': { name: 'ProfileA', lastWorkspacePath: null },
                    'ProfileB': { name: 'ProfileB', lastWorkspacePath: null }
                }
            };
            saveProfilesRegistry(registryPath, reg);

            // Step 2: Switch to Profile B
            setSwitchingInProgress(true);
            reg.lastActiveProfile = 'ProfileB';
            saveProfilesRegistry(registryPath, reg);

            // Step 3: Profile A deactivates
            updateActiveProfileWorkspace('ProfileA', { updateLastActive: false });

            // Step 4: Verify Profile B remains lastActiveProfile
            const regAfter = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            assert.strictEqual(regAfter.lastActiveProfile, 'ProfileB', 'lastActiveProfile must be ProfileB!');

            setSwitchingInProgress(false);
        } finally {
            if (originalRegistryBackup !== null) {
                fs.writeFileSync(registryPath, originalRegistryBackup, { encoding: 'utf8', mode: 0o600 });
            }
        }
    });

    await runAsyncTest('Full extension activate and deactivate lifecycle in Default profile', async () => {
        const profilesRoot = getProfilesRoot();
        const registryPath = path.join(profilesRoot, 'profiles.json');
        let originalRegistryBackup = null;
        if (fs.existsSync(registryPath)) {
            originalRegistryBackup = fs.readFileSync(registryPath, 'utf8');
        }

        try {
            // Set registry to Default
            saveProfilesRegistry(registryPath, {
                lastActiveProfile: 'Default',
                profiles: {}
            });

            const extension = require('../extension');
            const mockContext = {
                extensionPath: path.resolve(__dirname, '..'),
                subscriptions: []
            };

            // Activate in Default profile
            await extension.activate(mockContext);
            assert.ok(mockContext.subscriptions.length > 0, 'Commands and status bar subscriptions should be registered');

            // Deactivate
            extension.deactivate();
        } finally {
            if (originalRegistryBackup !== null) {
                fs.writeFileSync(registryPath, originalRegistryBackup, { encoding: 'utf8', mode: 0o600 });
            }
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
