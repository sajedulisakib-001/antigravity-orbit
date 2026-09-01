#!/usr/bin/env node
/**
 * Dual Marketplace Publisher for Orbit (Antigravity Profiles)
 * Publishes the extension to both:
 * 1. Visual Studio Code Marketplace (via @vscode/vsce)
 * 2. Open VSX Registry (via ovsx)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

// Parse simple .env if present
function loadEnv() {
    const envPath = path.join(rootDir, '.env');
    if (fs.existsSync(envPath)) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            });
        } catch (e) {
            // Ignore error
        }
    }
}
loadEnv();

function printHelp() {
    console.log(`
🚀 Orbit Extension Dual-Publisher (VS Code Marketplace & Open VSX)

Usage:
  node scripts/publish-all.js [options]

Options:
  --vscode <token>, -v <token>    VS Code Marketplace Personal Access Token (PAT)
  --ovsx <token>, -o <token>      Open VSX Personal Access Token (PAT)
  --skip-vscode                   Skip publishing to VS Code Marketplace
  --skip-ovsx                     Skip publishing to Open VSX Registry
  --skip-package                  Use existing .vsix file instead of rebuilding
  --help, -h                      Show this help message

Environment Variables:
  VSCE_PAT or VSCE_TOKEN          VS Code Marketplace Token
  OVSX_PAT or OVSX_TOKEN          Open VSX Token
  (Can also be stored locally in .env)
`);
}

function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, ans => {
            rl.close();
            resolve(ans.trim());
        });
    });
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    let vsceToken = process.env.VSCE_PAT || process.env.VSCE_TOKEN || process.env.VS_MARKETPLACE_TOKEN || '';
    let ovsxToken = process.env.OVSX_PAT || process.env.OVSX_TOKEN || process.env.OPEN_VSX_TOKEN || '';
    let skipVsCode = args.includes('--skip-vscode');
    let skipOvsx = args.includes('--skip-ovsx');
    let skipPackage = args.includes('--skip-package');

    // Parse flags
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--vscode' || args[i] === '-v') && args[i + 1]) {
            vsceToken = args[i + 1];
            i++;
        } else if ((args[i] === '--ovsx' || args[i] === '-o') && args[i + 1]) {
            ovsxToken = args[i + 1];
            i++;
        }
    }

    console.log(`\n======================================================`);
    console.log(`  🚀 Publishing ${pkg.displayName || pkg.name} v${pkg.version}`);
    console.log(`  Publisher: ${pkg.publisher}`);
    console.log(`======================================================\n`);

    // Interactive token prompt if missing and not skipped
    if (!skipVsCode && !vsceToken && process.stdin.isTTY) {
        vsceToken = await prompt('🔑 Enter VS Code Marketplace PAT (or press Enter to skip VS Code): ');
        if (!vsceToken) skipVsCode = true;
    }

    if (!skipOvsx && !ovsxToken && process.stdin.isTTY) {
        ovsxToken = await prompt('🔑 Enter Open VSX PAT (or press Enter to skip Open VSX): ');
        if (!ovsxToken) skipOvsx = true;
    }

    if (skipVsCode && skipOvsx) {
        console.error('❌ Both VS Code and Open VSX were skipped or missing tokens. Nothing to publish.');
        process.exit(1);
    }

    const vsixFileName = `${pkg.name}-${pkg.version}.vsix`;
    const vsixPath = path.join(rootDir, vsixFileName);

    // Step 1: Package VSIX
    if (!skipPackage || !fs.existsSync(vsixPath)) {
        console.log(`📦 Packaging extension into ${vsixFileName}...`);
        try {
            execSync('npx @vscode/vsce package --no-dependencies', { cwd: rootDir, stdio: 'inherit' });
        } catch (err) {
            console.warn('⚠️ vsce package failed, falling back to build-vsix.js...');
            execSync(`node "${path.join(rootDir, 'build-vsix.js')}"`, { cwd: rootDir, stdio: 'inherit' });
        }

        if (!fs.existsSync(vsixPath)) {
            console.error(`❌ Failed to find packaged VSIX at: ${vsixPath}`);
            process.exit(1);
        }
    } else {
        console.log(`📦 Using existing package: ${vsixFileName}`);
    }

    const results = {
        vscode: { attempted: !skipVsCode, success: false, error: null },
        ovsx: { attempted: !skipOvsx, success: false, error: null }
    };

    // Step 2: Publish to VS Code Marketplace
    if (!skipVsCode) {
        console.log(`\n------------------------------------------------------`);
        console.log(`🔵 [1/2] Publishing to Visual Studio Code Marketplace...`);
        console.log(`------------------------------------------------------`);
        try {
            const res = spawnSync('npx', ['@vscode/vsce', 'publish', '--packagePath', vsixPath, '-p', vsceToken], {
                cwd: rootDir,
                stdio: 'inherit'
            });
            if (res.status === 0) {
                results.vscode.success = true;
                console.log(`✅ VS Code Marketplace: Published v${pkg.version} successfully!`);
            } else {
                results.vscode.error = `Exited with code ${res.status}`;
            }
        } catch (err) {
            results.vscode.error = err.message;
            console.error(`❌ VS Code Marketplace Error:`, err.message);
        }
    }

    // Step 3: Publish to Open VSX
    if (!skipOvsx) {
        console.log(`\n------------------------------------------------------`);
        console.log(`🟣 [2/2] Publishing to Open VSX Registry (open-vsx.org)...`);
        console.log(`------------------------------------------------------`);
        try {
            const res = spawnSync('npx', ['ovsx', 'publish', vsixFileName, '-p', ovsxToken], {
                cwd: rootDir,
                stdio: 'inherit'
            });
            if (res.status === 0) {
                results.ovsx.success = true;
                console.log(`✅ Open VSX Registry: Published v${pkg.version} successfully!`);
            } else {
                results.ovsx.error = `Exited with code ${res.status}`;
            }
        } catch (err) {
            results.ovsx.error = err.message;
            console.error(`❌ Open VSX Error:`, err.message);
        }
    }

    // Summary Report
    console.log(`\n======================================================`);
    console.log(`                 PUBLISH SUMMARY                      `);
    console.log(`======================================================`);
    if (results.vscode.attempted) {
        if (results.vscode.success) {
            console.log(`🔵 VS Code Marketplace:  ✅ SUCCESS`);
            console.log(`   🔗 https://marketplace.visualstudio.com/items?itemName=${pkg.publisher}.${pkg.name}`);
        } else {
            console.log(`🔵 VS Code Marketplace:  ❌ FAILED (${results.vscode.error})`);
        }
    } else {
        console.log(`🔵 VS Code Marketplace:  ⏭️  SKIPPED`);
    }

    if (results.ovsx.attempted) {
        if (results.ovsx.success) {
            console.log(`🟣 Open VSX Registry:    ✅ SUCCESS`);
            console.log(`   🔗 https://open-vsx.org/extension/${pkg.publisher}/${pkg.name}`);
        } else {
            console.log(`🟣 Open VSX Registry:    ❌ FAILED (${results.ovsx.error})`);
        }
    } else {
        console.log(`🟣 Open VSX Registry:    ⏭️  SKIPPED`);
    }
    console.log(`======================================================\n`);

    if ((results.vscode.attempted && !results.vscode.success) || (results.ovsx.attempted && !results.ovsx.success)) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
