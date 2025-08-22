# Projects Page Browser Cache Documentation

This document describes the browser cache parameters and data structures used to store user preferences and filter selections on the projects page.

## Cache Storage Keys

The page uses localStorage to persist user preferences across sessions. All storage keys are prefixed with the current list ID to support multiple data sources.

### Storage Key Format
```javascript
const getListStorageKey = (baseKey) => {
    const listId = getURLHashParam('list') || 'default';
    return `${listId}_1_${baseKey}`;
}

const getSnapshotsStorageKey = () => {
    const listId = getURLHashParam('list') || 'default';
    return `${listId}_1_snapshots`;
}
```

## Browser Cache Parameters

### Filter and Sort Settings

| Cache Key | Storage Key | Type | Description | Default Value |
|-----------|-------------|------|-------------|---------------|
| `participantsTeamFilter` | `{listId}_1_participantsTeamFilter` | string | Currently selected team filter | `null` |
| `participantsSortColumn` | `{listId}_1_participantsSortColumn` | string | Current sort column | `'Rows'` |
| `participantsSortOrder` | `{listId}_1_participantsSortOrder` | string | Sort order (asc/desc) | `'asc'` |
| `participantsStatusFilter` | `{listId}_1_participantsStatusFilter` | JSON array | Selected status filters | `["All"]` |
| `showOnlyGroup` | `{listId}_1_showOnlyGroup` | JSON boolean | Show only group participants | `false` |
| `groupParticipants` | `{listId}_1_groupParticipants` | string | Comma-separated list of group participant names | `''` |

### Group Toggle Settings

| Cache Key | Storage Key | Type | Description | Default Value |
|-----------|-------------|------|-------------|---------------|
| `groupToggleActiveText` | `{listId}_1_groupToggleActiveText` | string | Text shown when group filter is active | `'All'` |
| `groupToggleInactiveText` | `{listId}_1_groupToggleInactiveText` | string | Text shown when group filter is inactive | `'Present'` |

### View Mode Settings

| Cache Key | Storage Key | Type | Description | Default Value |
|-----------|-------------|------|-------------|---------------|
| `participantsViewMode` | `participantsViewMode` | string | Current view mode (grid/list) | Not prefixed with list ID |
| `isFullscreen` | `isFullscreen` | JSON boolean | Fullscreen mode toggle | `false` |
| `isCondensed` | `isCondensed` | JSON boolean | Condensed view toggle | `false` |

### AI Insights Cache

| Cache Key | Storage Key | Type | Description |
|-----------|-------------|------|-------------|
| `aiInsightsCache` | `aiInsightsCache` | JSON object | Cached Gemini AI insights by data source | 
| `claudeInsightsCache` | `claudeInsightsCache` | JSON object | Cached Claude AI insights by data source |

## Snapshot System

### Snapshot Storage Structure

Snapshots are stored using the `getSnapshotsStorageKey()` function and contain complete filter states that can be restored later.

```javascript
// Snapshot object structure
{
    "snapshotName": {
        sortColumn: string,           // Current sort column
        sortOrder: string,            // Sort order (asc/desc)
        teamFilter: string|null,      // Selected team filter
        statusFilter: string[],       // Array of selected statuses
        groupParticipants: string[],  // Array of group participant names
        showOnlyGroup: boolean,       // Group filter toggle state
        displayMode: string,          // Current display mode
        timestamp: number            // When snapshot was created
    }
}
```

### Snapshot Functions

```javascript
// Load all snapshots for current list
function loadSnapshots() {
    const snapshots = JSON.parse(localStorage.getItem(getSnapshotsStorageKey()) || '{}');
    return snapshots;
}

// Save snapshots object
function saveSnapshots(snapshots) {
    localStorage.setItem(getSnapshotsStorageKey(), JSON.stringify(snapshots));
}

// Get current filter state for snapshotting
function getCurrentFilterState() {
    return {
        sortColumn: currentSortColumn,
        sortOrder: currentSortOrder,
        teamFilter: currentTeamFilter,
        statusFilter: Array.from(selectedStatuses),
        groupParticipants: Array.from(groupParticipants),
        showOnlyGroup: showOnlyGroup,
        displayMode: currentView,
        timestamp: Date.now()
    };
}
```

## Cache Update Patterns

### Automatic Cache Updates
- Filter changes automatically update localStorage
- Sort changes update cache immediately
- Group participant changes save on input modification
- View mode toggles save state instantly

### URL Hash Integration
- URL hash parameters take precedence over cached values on page load
- Cache values are used when no hash parameters are present
- Some settings (like view mode) don't affect URL hash

### Cache Clearing
- Clear filters function removes all filter-related cache entries
- Individual filter removals update specific cache keys
- Snapshots persist independently of current filter cache

## Data Flow

1. **Page Load**: Check URL hash → fallback to localStorage → use defaults
2. **User Interaction**: Update UI → save to localStorage → optionally update URL hash
3. **Filter Application**: Read current state → apply filters → update display
4. **Snapshot Creation**: Capture current state → save to snapshots cache
5. **Snapshot Restoration**: Load snapshot → apply all settings → update cache and UI

## Debug Information

To inspect current cache state, use browser developer tools:

```javascript
// View all cache keys for current list
const listId = getURLHashParam('list') || 'default';
Object.keys(localStorage).filter(key => key.startsWith(listId + '_1_'));

// View specific cache value
localStorage.getItem(getListStorageKey('participantsTeamFilter'));

// View all snapshots
JSON.parse(localStorage.getItem(getSnapshotsStorageKey()) || '{}');
```