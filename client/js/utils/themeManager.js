/**
 * ThemeManager
 * Handles Light/Dark mode transitions by toggling classes and icons.
 */
export const ThemeManager = {
    // Force dark-only theme. Light mode removed.
    theme: 'dark',

    init() {
        this.applyTheme();
        this.updateIcons();
    },

    // Toggle disabled to prevent switching to light mode
    toggle() {
        return; // no-op
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', 'dark');
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: 'dark' } }));
    },

    updateIcons() {
        const themeIcon = document.getElementById('themeIcon');
        if (!themeIcon) return;
        // Keep a static sun icon to indicate dark mode (no switching)
        themeIcon.innerHTML = `
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        `;
    }
};
