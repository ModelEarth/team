// Team page tabs, loaded by the team pages that link to each other (CodeChat panels).
// Kept separate from common.js so pages that can't load common.js still get the tabs.

// Rendered into any element with data-team-tabs.
// Paths are relative to the team folder, found from this script's own URL.
const TEAM_ROOT_URL = (document.currentScript && document.currentScript.src)
    ? new URL('../', document.currentScript.src).href
    : null;

const TEAM_TABS = [
    { name: 'CodeChat', path: '../codechat/', match: '/codechat/' },
    { name: 'Mashup', path: 'projects/#list=all', match: '/projects/' },
    { name: 'Webroot', path: 'setup/', match: '/setup/' },
    { name: 'Database', path: 'admin/sql/panel/', match: '/admin/sql/panel/' },
    { name: 'Insights', path: 'admin/import-data.html', match: '/admin/import-data' },
    { name: 'Logs', path: 'admin/log-output/', match: '/admin/log-output/' }
];

function renderTeamTabs() {
    const holders = document.querySelectorAll('[data-team-tabs]');
    if (!holders.length || !TEAM_ROOT_URL) return;
    const currentPath = window.location.pathname;
    holders.forEach(holder => {
        holder.innerHTML = '';
        TEAM_TABS.forEach(tab => {
            const link = document.createElement('a');
            link.className = 'team-tab';
            link.href = new URL(tab.path, TEAM_ROOT_URL).href;
            link.textContent = tab.name;
            if (currentPath.includes(tab.match)) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            }
            holder.appendChild(link);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTeamTabs);
} else {
    renderTeamTabs();
}
