/**
 * Reserved names that must never be used as profile identifiers.
 * Includes prototype pollution properties, OS device names, and system files.
 */
const RESERVED_NAMES = new Set([
    // Prototype properties, methods & variants
    '__proto__',
    'proto',
    'constructor',
    'prototype',
    'tostring',
    'valueof',
    'hasownproperty',
    'isprototypeof',
    'propertyisenumerable',
    'tolocalestring',
    '__definegetter__',
    'definegetter',
    '__definesetter__',
    'definesetter',
    '__lookupgetter__',
    'lookupgetter',
    '__lookupsetter__',
    'lookupsetter',
    'entries',
    'keys',
    'values',
    'assign',
    'freeze',
    'seal',
    // Internal files & system names
    'profiles.json',
    'profiles_json',
    'default',
    '.',
    '..',
    // Windows reserved device names
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9'
]);

/**
 * Maximum safe length for profile folder names (prevents Windows MAX_PATH overflows).
 */
const MAX_PROFILE_NAME_LENGTH = 48;

/**
 * Sanitizes user input into a safe filesystem-friendly profile name.
 * Protects against directory traversal, prototype pollution, command injection, and OS-specific device names.
 *
 * @param {string} input
 * @returns {string|null} Sanitized safe name, or null if invalid.
 */
function sanitizeProfileName(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Enforce length limit
    if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
        return null;
    }

    const rawLower = trimmed.toLowerCase();
    const rawNoUnderscores = rawLower.replace(/[^a-z0-9]/g, '');

    // Check raw input against reserved keywords
    if (RESERVED_NAMES.has(rawLower) || RESERVED_NAMES.has(rawNoUnderscores)) {
        return null;
    }

    // Replace all non-alphanumeric/non-dash/non-underscore characters with '_'
    const safe = trimmed
        .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!safe || safe.length === 0 || safe.length > MAX_PROFILE_NAME_LENGTH) {
        return null;
    }

    const lower = safe.toLowerCase();
    const noUnderscores = lower.replace(/[^a-z0-9]/g, '');

    if (RESERVED_NAMES.has(lower) || RESERVED_NAMES.has(noUnderscores)) {
        return null;
    }

    return safe;
}

module.exports = {
    sanitizeProfileName,
    RESERVED_NAMES,
    MAX_PROFILE_NAME_LENGTH
};
