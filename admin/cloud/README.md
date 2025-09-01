# Coding Meetup Integration - PartnerTools

- **Launch Our Model.earth Meetup:** [https://meet.google.com/pcv-xrdh-bat](https://meet.google.com/pcv-xrdh-bat)
- **Google Sheet ID:** You'll need to create a Google Sheet and get its ID from the URL. The ID is the long string of characters between `/d/` and `/edit`.

## Add Settings for Coding Meetup Integration

To use the Coding Meetup Integration with the PartnerTools backend, you'll need to provide the following credentials in your `.env` file:

- GOOGLE_PRIVATE_KEY_ID
- GOOGLE_PRIVATE_KEY
- GOOGLE_CLIENT_EMAIL
- GOOGLE_CLIENT_ID

## Pulling Participants from a Google Meetup into a Google Sheet

Since there isn't a direct Google Meet API to get a list of participants, the most reliable method is to use a Google Apps Script. This script will run within your Google account and can be triggered to capture the participants of an active meeting.

### Step 1: Create a Google Sheet

Create a new Google Sheet where the participant list will be stored. Name it something descriptive, like "Google Meetup Participants".

### Step 2: Create a Google Apps Script

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. This will open a new script project. Give it a name, like "Meetup Participants Script".

### Step 3: Write the Script

Copy and paste the following code into the script editor, replacing the existing `myFunction` code:

```//javascript
function getMeetupParticipants() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const calendarId = 'primary'; // Or the ID of the calendar with the Meetup event
  const now = new Date();

  // Find the current or most recent event
  const events = CalendarApp.getCalendarById(calendarId).getEvents(now, new Date(now.getTime() + 60 * 1000));

  if (events.length === 0) {
    sheet.appendRow([new Date(), "No active Google Meet found."]);
    return;
  }

  const event = events[0];
  const meetupLink = event.getConferenceId();

  if (!meetupLink) {
    sheet.appendRow([new Date(), "No Google Meet link found for the current event."]);
    return;
  }

  // This is a simplified example. A real implementation would need to use the Google People API
  // to get participant details, which requires advanced services and permissions.
  // For this example, we'll just log the event details.
  sheet.appendRow([new Date(), event.getTitle(), meetupLink]);
}
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Meetup')
      .addItem('Get Participants', 'getMeetupParticipants')
      .addToUi();
}
```

### Step 4: Set Up a Trigger (Optional)

If you want the script to run automatically, you can set up a trigger:

1. In the Apps Script editor, click on the **Triggers** icon (it looks like a clock).
2. Click **Add Trigger**.
3. Configure the trigger as follows:
   - **Choose which function to run:** `getMeetupParticipants`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven`
   - **Select type of time based trigger:** `Minutes timer`
   - **Select minute interval:** `Every 5 minutes`
4. Click **Save**.

### Step 5: Run the Script Manually

You can also run the script manually from the Google Sheet:

1. Go back to your Google Sheet and refresh the page.
2. You should see a new **Meetup** menu item.
3. Click **Meetup > Get Participants** to run the script.



You can get these credentials by creating a service account in the [Google Cloud Console](https://console.cloud.google.com/).

### Setting Up Google Cloud Service Account

1. **Create a new project** or select an existing one.
2. **Enable the Google Sheets API** for your project.
3. **Create a service account:**
   - Go to the [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) page.
   - Click "Create service account".
   - Give the service account a name and description.
   - Grant the service account the "Editor" role.
   - Click "Done".
4. **Create a new key:**
   - Click on the service account you just created.
   - Go to the "Keys" tab.
   - Click "Add key" and then "Create new key".
   - Select "JSON" as the key type and click "Create".
   - A JSON file will be downloaded to your computer. This file contains all the credentials you need.

Once you have the JSON file, copy the values into your `.env` file.

## Frontend Integration - Projects Index Page

The `projects/index.html` page provides a user interface for loading and managing participant data from various sources including Google Sheets, custom uploads, and API endpoints.

### Data Loading Process

**1. File Selection Dropdown (#fileSelect)**
- Populated dynamically with available data sources
- Each option has a `data-url` attribute pointing to the data source
- URL hash parameter `list=modelteam` automatically selects and loads the "Model Team" option
- Supports Google Sheets CSV exports, custom file uploads, and API endpoints

**2. Automatic Data Loading**
- When page loads with a hash parameter (e.g., `#list=modelteam`), data loads automatically
- `getMeetupParticipants()` function handles the data loading process
- Uses `loadUnifiedData()` from `js/list.js` for consistent data processing
- Data flows: File Selection → `getMeetupParticipants()` → `loadUnifiedData()` → `displayParticipantsTable()`

**3. Data Storage and Processing**
- Raw data stored in `originalRawData` variable
- Processed data stored in `allParticipantsData` global variable
- Data preprocessing includes team classification, status normalization, and field mapping
- Supports pagination, filtering, and sorting operations

### Filter and Sort System

**Sort by and Status Buttons**
- Located in the "Filter by Team" panel header
- Use dropdown interfaces positioned absolutely below each button
- **HTML Structure:**
  ```html
  <div class="button-with-dropdown">
      <button id="sort-toggle">Sort by</button>
      <div class="sort-dropdown" id="sort-dropdown">
          <!-- Dynamic content generated by generateSortDropdown() -->
      </div>
  </div>
  ```

**Key Functions:**
- `toggleSortDropdown()`: Shows/hides sort options
- `generateSortDropdown()`: Populates dropdown with available columns from data
- `toggleStatusDropdown()`: Shows/hides status filter options  
- `generateStatusDropdown()`: Populates dropdown with unique status values from data
- Both functions check for `allParticipantsData` availability before generating content

**CSS Positioning:**
- `.button-with-dropdown` containers use `position: relative`
- Dropdown elements use `position: absolute; top: 100%; z-index: 1000`
- Ensures dropdowns appear directly below their respective buttons

### Common Issues and Solutions

**Problem: Dropdowns not appearing**
- **Cause:** Incorrect CSS positioning context or missing data
- **Solution:** Ensure button containers have `position: relative` and data is loaded in `allParticipantsData`

**Problem: FaviconManager making excessive API calls**
- **Cause:** Periodic favicon updates running every 30 seconds
- **Solution:** Disable periodic updates in `localsite/js/nav.js` by commenting out the `setInterval` in `startPeriodicFaviconUpdate()`

**Problem: Buttons triggering multiple event handlers**
- **Cause:** Event bubbling and multiple global click listeners
- **Solution:** Add `e.preventDefault()` and `e.stopPropagation()` to button click handlers

### File Path Handling

**Dynamic vs Hardcoded Paths:**
- System validates file paths to prevent cross-user contamination
- Hardcoded system paths (`C:\`, `/Users/`, `/home/`) are filtered based on current username
- Custom uploaded files are stored with `custom_` prefix in localStorage
- URL hash parameters take precedence over stored file selections

**Path Validation Logic:**
```javascript
// Extract username from system paths for validation
const isHardcodedSystemPath = path.includes('C:\\Users') || path.includes('/Users/') || path.includes('/home/');
if (isHardcodedSystemPath) {
    const currentUserGuessed = extractUsernameFromPath(path);
    // Only allow if matches current user
}
```

### Backend Integration

**Rust API Server (port 8081):**
- `/api/config/current` - Returns server configuration
- Expects file paths relative to repository root
- Frontend converts browser-relative paths to repo-relative paths for API calls

**Data Sources Supported:**
- Google Sheets CSV exports (via CORS proxy if needed)
- Local file uploads (Excel, CSV, JSON)
- API endpoints returning JSON data
- Custom data formats with preprocessing

### Debugging Tips

**Console Logging:**
- Add `console.log` statements in dropdown functions to track data availability
- Monitor network requests to identify data loading issues
- Check `allParticipantsData` variable in browser console to verify data structure

**Common Debug Points:**
- `displayParticipantsTable()` - Where `allParticipantsData` gets populated
- `generateSortDropdown()` / `generateStatusDropdown()` - Where dropdown content is created
- `getMeetupParticipants()` - Main data loading function
- `loadUnifiedData()` - Data processing and format detection