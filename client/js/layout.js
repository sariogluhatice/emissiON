import { getCurrentUser, logout } from './utils/uiUtils.js';

const SVG = (body) =>
    `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${body}</svg>`;

const NAV_ITEMS = [
    {
        id:    'nav-dashboard',
        href:  'dashboard.html',
        label: 'Özet Panel',
        icon:  SVG('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
    },
    {
        id:    'nav-household',
        href:  'household.html',
        label: 'Hanem',
        icon:  SVG('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    },
    {
        id:    'nav-company',
        href:  'company.html',
        label: 'Şirket Paneli',
        icon:  SVG('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>'),
        subItems: [
            { href: 'company-cbam.html',       label: 'CBAM / Vergi Hesabı' },
            { href: 'company-tasks.html',      label: 'Şirket Görevleri' },
            { href: 'company-simulation.html', label: 'Simülasyon' },
            { href: 'company-profile.html',    label: 'Profili Düzenle' },
        ],
    },
    {
        id:    'nav-emissions',
        href:  'emissions.html',
        label: 'Emisyon Takibi',
        icon:  SVG('<path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    },
    {
        id:    'nav-add',
        href:  'add-entry.html',
        label: 'Yeni Kayıt Ekle',
        icon:  SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
    },
    {
        id:    'nav-insights',
        href:  'smart-insights.html',
        label: 'Karbon Zekası',
        icon:  SVG('<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'),
    },
    {
        id:    'nav-whatif',
        href:  'what-if-simulation.html',
        label: 'Gelecek Ay Planlayıcısı',
        icon:  SVG('<path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>'),
    },
    {
        id:    'nav-profile',
        href:  'profile.html',
        label: 'Profilim',
        icon:  SVG('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'),
    },
    {
        id:    'nav-settings',
        href:  'settings.html',
        label: 'Sistem Ayarları',
        icon:  SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    },
];

/**
 * Renders the shared sidebar + topbar and enforces authentication.
 *
 * @param {{ activeNav: string, title: string }} config
 *   activeNav — the id of the currently active nav item (e.g. 'nav-dashboard')
 *   title     — topbar page title text
 * @returns {object|null} the current user object, or null (redirect already triggered)
 */
export function renderLayout({ activeNav, title }) {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }

    // ── Sidebar ───────────────────────────────────────────────────────────────
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
        const visibleItems = NAV_ITEMS.filter(item => {
            if (item.id === 'nav-household') return user.role === 'household';
            if (item.id === 'nav-company')   return user.role === 'company';
            return true;
        });

        const currentPage = window.location.pathname.split('/').pop() || '';

        const renderNavItem = (item) => {
            const { id, href, label, icon, subItems } = item;
            const isActive = id === activeNav;
            const itemHtml = `
                <a href="${href}" class="nav-item${isActive ? ' active' : ''}" id="${id}">
                    ${icon}
                    ${label}
                </a>`;
            if (subItems && isActive && user.role === 'company') {
                const subHtml = subItems.map(sub => {
                    const isSubActive = currentPage === sub.href;
                    return `<a href="${sub.href}" class="nav-subitem${isSubActive ? ' nav-subitem--active' : ''}">${sub.label}</a>`;
                }).join('');
                return itemHtml + `<div class="nav-subitems">${subHtml}</div>`;
            }
            return itemHtml;
        };

        sidebarEl.innerHTML = `
            <div class="sidebar-brand">emissiON</div>
            <nav class="sidebar-nav">
                ${visibleItems.map(renderNavItem).join('')}
            </nav>
            <div class="sidebar-footer">
                <button class="btn-logout" id="logoutBtn">Oturumu Kapat</button>
            </div>`;

        document.getElementById('logoutBtn').addEventListener('click', logout);
    }

    // ── Topbar ────────────────────────────────────────────────────────────────
    const topbarEl = document.getElementById('topbar');
    if (topbarEl) {
        const initials    = (user.name || user.email || '?').charAt(0).toUpperCase();
        const displayName = user.name || user.email || '—';
        topbarEl.innerHTML = `
            <span class="topbar-title">${title}</span>
            <div class="topbar-user">
                <div class="user-avatar" id="userInitials">${initials}</div>
                <span id="userName" class="userName">${displayName}</span>
            </div>`;
    }

    return user;
}
