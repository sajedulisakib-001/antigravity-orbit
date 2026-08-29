const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const vsixFileName = `${pkg.name}-${pkg.version}.vsix`;
const vsixOutputPath = path.join(rootDir, vsixFileName);

console.log(`Packaging ${pkg.displayName} v${pkg.version} into ${vsixFileName}...`);

// Create temp build staging directory
const buildDir = path.join(os.tmpdir(), `vsix-build-${Date.now()}`);
const extensionDir = path.join(buildDir, 'extension');

fs.mkdirSync(extensionDir, { recursive: true });

// Copy extension files
const filesToCopy = ['package.json', 'extension.js', 'README.md', 'icon.png', 'LICENSE'];
for (const file of filesToCopy) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(extensionDir, file));
    }
}

// Copy src directory
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
copyDir(path.join(rootDir, 'src'), path.join(extensionDir, 'src'));

// 1. Write [Content_Types].xml
const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="xml" ContentType="text/xml" />
</Types>`;
fs.writeFileSync(path.join(buildDir, '[Content_Types].xml'), contentTypesXml, 'utf8');

// 2. Write extension.vsixmanifest
const keywords = (pkg.keywords || []).join(',');
const categories = (pkg.categories || ['Other']).join(',');
const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/>
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${pkg.description}</Description>
    <Tags>${keywords}</Tags>
    <Categories>${categories}</Categories>
    <Icon>extension/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
  </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(buildDir, 'extension.vsixmanifest'), vsixManifestXml, 'utf8');

// Remove existing vsix if present
if (fs.existsSync(vsixOutputPath)) {
    fs.unlinkSync(vsixOutputPath);
}

// Zip archive using zip command
execSync(`cd "${buildDir}" && /usr/bin/zip -q -r "${vsixOutputPath}" .`);

// Cleanup staging directory
fs.rmSync(buildDir, { recursive: true, force: true });

console.log(`✓ Successfully generated VSIX package at: ${vsixOutputPath}`);
