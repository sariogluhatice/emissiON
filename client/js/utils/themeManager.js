/**
 * ThemeManager
 * Handles Light/Dark mode transitions by toggling classes and icons.
 */
export const ThemeManager = {
    theme: localStorage.getItem('theme') || 'dark',

    init() {
        this.applyTheme();
        this.updateIcons();
    },

    toggle() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
        this.updateIcons();
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        // Dispatch event for components that might need to react
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: this.theme } }));
    },

    updateIcons() {
        const themeIcon = document.getElementById('themeIcon');
        if (!themeIcon) return;

        if (this.theme === 'dark') {
            // Sun icon for dark mode (click to go light)
            themeIcon.innerHTML = `
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            `;
        } else {
            // Moon icon for light mode (click to go dark)
            themeIcon.innerHTML = `
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            `;
        }
    }
};
