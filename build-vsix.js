#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function escapeXml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function buildVsix() {
    console.log('📦 Building Antigravity Orbit .vsix package...');
    const projectDir = __dirname;
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));

    const safeName = (pkg.name || 'antigravity-orbit').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeVer = (pkg.version || '1.0.0').replace(/[^a-zA-Z0-9._-]/g, '');
    const vsixName = `${safeName}-${safeVer}.vsix`;

    const tempBuildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-build-'));
    const extensionDir = path.join(tempBuildDir, 'extension');

    // 1. Create temporary directory structure
    fs.mkdirSync(extensionDir, { recursive: true, mode: 0o700 });

    // 2. Copy source files into extension/
    const filesToCopy = ['package.json', 'extension.js', 'README.md', 'icon.png', 'LICENSE'];
    for (const file of filesToCopy) {
        const src = path.join(projectDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(extensionDir, file));
        }
    }

    // Copy src directory
    const srcDir = path.join(projectDir, 'src');
    const targetSrcDir = path.join(extensionDir, 'src');
    fs.mkdirSync(targetSrcDir, { recursive: true, mode: 0o700 });
    for (const file of fs.readdirSync(srcDir)) {
        if (!file.startsWith('.')) {
            fs.copyFileSync(path.join(srcDir, file), path.join(targetSrcDir, file));
        }
    }

    // 3. Create [Content_Types].xml
    const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="txt" ContentType="text/plain"/>
</Types>`;
    fs.writeFileSync(path.join(tempBuildDir, '[Content_Types].xml'), contentTypesXml, { encoding: 'utf8', mode: 0o600 });

    // 4. Create extension.vsixmanifest (with strict XML escaping)
    const tags = Array.isArray(pkg.keywords) ? pkg.keywords.map(k => escapeXml(String(k))).join(',') : 'antigravity,orbit,profile';
    const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(safeName)}" Version="${escapeXml(safeVer)}" Publisher="${escapeXml(pkg.publisher || 'sajedulisakib-001')}"/>
    <DisplayName>${escapeXml(pkg.displayName || safeName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description || '')}</Description>
    <Tags>${tags}</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Icon>extension/icon.png</Icon>
    <License>extension/LICENSE</License>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
  </Assets>
</PackageManifest>`;
    fs.writeFileSync(path.join(tempBuildDir, 'extension.vsixmanifest'), vsixManifestXml, { encoding: 'utf8', mode: 0o600 });

    // 5. Zip into .vsix without shell execution
    const finalVsixPath = path.join(projectDir, vsixName);
    if (fs.existsSync(finalVsixPath)) {
        fs.unlinkSync(finalVsixPath);
    }

    try {
        execFileSync('/usr/bin/zip', ['-q', '-r', finalVsixPath, '.'], { cwd: tempBuildDir });
        console.log(`\n🎉 SUCCESS! Generated official package: ${vsixName}`);
        console.log(`📍 Path: ${finalVsixPath}`);
        console.log(`📦 Size: ${(fs.statSync(finalVsixPath).size / 1024).toFixed(1)} KB\n`);
    } finally {
        // Cleanup temp build dir
        try {
            fs.rmSync(tempBuildDir, { recursive: true, force: true });
        } catch (e) { }
    }
}

buildVsix();
