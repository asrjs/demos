import React, { memo } from 'react';

export const LanguageSelector = memo(function LanguageSelector({ language, setLanguage, disabled }) {
    const languages = [
        { code: 'en', name: 'English' },
        { code: 'tr', name: 'Turkish' },
        // ... other languages
    ];

    return (
        <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={disabled}
            className="px-2 py-1 text-sm bg-white dark:bg-gray-700 border rounded"
        >
            {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                    {lang.name}
                </option>
            ))}
        </select>
    );
});