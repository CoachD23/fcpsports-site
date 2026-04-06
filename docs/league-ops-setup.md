# FCP Sports League Operations - Airtable Setup Guide

This guide walks you through setting up the Airtable base for managing FCP Sports League operations, including seasons, teams, games, and player statistics.

## Prerequisites

- An Airtable account (sign up at airtable.com if needed)
- Access to Netlify dashboard for environment variables
- League admin credentials (RECAP_ACCESS_CODE)

---

## 1. Create the Airtable Base

### Step 1: Log in to Airtable
1. Go to [airtable.com](https://airtable.com)
2. Sign in with your account
3. Click "Create" or "+ Add a base"

### Step 2: Create New Base
1. Click "Create a new base"
2. Enter the name: **"FCP Sports League Operations"**
3. Click "Create"

You now have an empty base. The base ID (starts with "app") is visible in the URL and will be needed for environment variables.

---

## 2. Create Tables and Fields

Follow the schema below to create each table. For each table:
1. Click "+" to add a new table
2. Enter the table name
3. Add fields according to the schema

### Seasons Table

**Purpose**: Track league seasons (e.g., Fall 2026, Summer 2026)

| Field Name | Field Type | Configuration | Notes |
|------------|-----------|----------------|-------|
| Name | Single line text | Required | e.g., "Fall 2026", "Summer 2026" |
| StartDate | Date | - | Season start date |
| EndDate | Date | - | Season end date |
| Divisions | Single line text | - | Comma-separated: "Mini,Junior,Intermediate,Senior" |
| Status | Single select | Options: registration, active, complete | Current season status |

**Sample Data**:
```
Name: Fall 2026
StartDate: 2026-09-01
EndDate: 2026-11-30
Divisions: Mini,Junior,Intermediate,Senior
Status: registration
```

### Teams Table

**Purpose**: Track all teams across seasons and divisions

| Field Name | Field Type | Configuration | Notes |
|------------|-----------|----------------|-------|
| Name | Single line text | Required | Team name |
| Division | Single select | Options: Mini, Junior, Intermediate, Senior | Team division |
| Season | Single line text | - | Season reference (e.g., "Fall 2026") |
| Coach | Single line text | - | Head coach name |
| W | Number | Precision: 0 (integer), Default: 0 | Season wins |
| L | Number | Precision: 0 (integer), Default: 0 | Season losses |
| PF | Number | Precision: 0 (integer), Default: 0 | Points For (total points scored) |
| PA | Number | Precision: 0 (integer), Default: 0 | Points Against (total points allowed) |
| Streak | Single line text | - | Current streak (e.g., "W3", "L1") |
| SeasonId | Link to Seasons | Link to Seasons table | Reference to season record |

**Important**: Add a **Formula field** named "WinPct" to calculate win percentage:
- Formula: `IF({W} + {L} = 0, 0, ROUND({W} / ({W} + {L}) * 1000) / 1000)`
- This shows 3-decimal win percentage (e.g., 0.667)

### Games Table

**Purpose**: Track all games, scores, and status

| Field Name | Field Type | Configuration | Notes |
|------------|-----------|----------------|-------|
| Date | Date | Required | Game date |
| Time | Single line text | - | Game time (e.g., "9:00 AM", "10:30 AM") |
| HomeTeam | Single line text | - | Home team name |
| AwayTeam | Single line text | - | Away team name |
| HomeTeamId | Link to Teams | Link to Teams table | Link to home team record |
| AwayTeamId | Link to Teams | Link to Teams table | Link to away team record |
| HomeScore | Number | Precision: 0 (integer) | Home team final score |
| AwayScore | Number | Precision: 0 (integer) | Away team final score |
| Status | Single select | Options: scheduled, final, cancelled | Game status |
| Division | Single select | Options: Mini, Junior, Intermediate, Senior | Division of the game |
| Season | Single line text | - | Season reference (e.g., "Fall 2026") |
| Location | Single line text | Default: "FCP Sports - Fort Walton Beach" | Game location |

**Important**: Add a **Formula field** named "Winner" to determine winner:
- Formula: `IF({Status} = "final", IF({HomeScore} > {AwayScore}, {HomeTeam}, IF({AwayScore} > {HomeScore}, {AwayTeam}, "Tie")), "")`
- Shows the winning team name, empty if game not final

### Players Table (Optional - For Future Stats Tracking)

**Purpose**: Track individual player statistics

| Field Name | Field Type | Configuration | Notes |
|------------|-----------|----------------|-------|
| Name | Single line text | Required | Player full name |
| Team | Link to Teams | Link to Teams table | Which team the player is on |
| Grade | Single line text | - | Grade level (e.g., "3rd", "5th", "8th") |
| Number | Number | Precision: 0 (integer) | Jersey number |
| Points | Number | Precision: 0 (integer), Default: 0 | Total season points scored |
| Rebounds | Number | Precision: 0 (integer), Default: 0 | Total season rebounds |
| Assists | Number | Precision: 0 (integer), Default: 0 | Total season assists |

---

## 3. Environment Variables Setup

### Get Your Airtable Credentials

#### Step 1: Find Base ID
1. Open your "FCP Sports League Operations" base in Airtable
2. Look at the URL: `airtable.com/app<BASE_ID>/tbl<TABLE_ID>`
3. Copy the part after "app" up to the first "/": this is your `AIRTABLE_BASE_ID`
4. Example: `appXxXxXxXxXxXxX`

#### Step 2: Create Personal Access Token
1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Give it a name: "FCP Sports League Ops"
4. Under "Scopes", grant these permissions:
   - `data.records:read` (read game/team/season data)
   - `data.records:write` (update scores, standings)
5. Under "Access", select your "FCP Sports League Operations" base
6. Click "Create token"
7. Copy the token immediately (you won't see it again)

### Add to Netlify Environment Variables

1. Log in to [Netlify Dashboard](https://app.netlify.com)
2. Select your site (fcpsports.org)
3. Go to **Site settings** → **Environment variables**
4. Add two variables:

```
AIRTABLE_PAT = <your-personal-access-token>
AIRTABLE_LEAGUE_BASE_ID = <your-base-id>
```

5. Click "Save" and redeploy your site

---

## 4. Sample Data for "Fall 2026" Season

### Create Season Record

```
Name: Fall 2026
StartDate: 2026-09-01
EndDate: 2026-11-30
Divisions: Mini,Junior,Intermediate,Senior
Status: registration
```

### Create Sample Teams (6 per division = 24 teams total)

#### Mini Division (grades K-2)
1. Emerald Coast Eagles | Coach: Sarah Mitchell
2. Panhandle Panthers | Coach: Mike Johnson
3. Gulf Coast Gators | Coach: Jennifer Lee
4. Beach Breeze Bears | Coach: David Chen
5. Suncoast Sharks | Coach: Amanda Martinez
6. Bay Breakers | Coach: Robert Williams

#### Junior Division (grades 3-4)
1. Coastal Clippers | Coach: Lisa Anderson
2. Dunes Dragons | Coach: James Roberts
3. Tide Turners | Coach: Michelle Moore
4. Sand Strikers | Coach: Kevin Brown
5. Wave Warriors | Coach: Jennifer Taylor
6. Marina Mavericks | Coach: Paul Davis

#### Intermediate Division (grades 5-6)
1. Atlantic Aces | Coach: Thomas Wilson
2. Current Crushers | Coach: Rachel Green
3. Cove Champions | Coach: Mark Thompson
4. Reef Riders | Coach: Susan Jackson
5. Lagoon Lions | Coach: Christopher Martin
6. Inlet Invaders | Coach: Lauren White

#### Senior Division (grades 7-8)
1. Ocean Outliers | Coach: Andrew Jackson
2. Surge Supreme | Coach: Elizabeth Harris
3. Storm Strikers | Coach: Nicholas Walker
4. Swell Squad | Coach: Karen Hall
5. Torrent Titans | Coach: Justin Young
6. Deep Divers | Coach: Nicole King

### Create Sample Games (3 per division = 12 games)

#### Mini Division Games
```
Game 1:
Date: 2026-09-05
Time: 9:00 AM
HomeTeam: Emerald Coast Eagles
AwayTeam: Panhandle Panthers
Status: scheduled
Division: Mini
Season: Fall 2026

Game 2:
Date: 2026-09-12
Time: 10:30 AM
HomeTeam: Gulf Coast Gators
AwayTeam: Beach Breeze Bears
Status: final
HomeScore: 32
AwayScore: 28
Division: Mini
Season: Fall 2026

Game 3:
Date: 2026-09-19
Time: 9:00 AM
HomeTeam: Suncoast Sharks
AwayTeam: Bay Breakers
Status: scheduled
Division: Mini
Season: Fall 2026
```

#### Junior Division Games
```
Game 1:
Date: 2026-09-06
Time: 9:00 AM
HomeTeam: Coastal Clippers
AwayTeam: Dunes Dragons
Status: scheduled
Division: Junior
Season: Fall 2026

Game 2:
Date: 2026-09-13
Time: 10:30 AM
HomeTeam: Tide Turners
AwayTeam: Sand Strikers
Status: final
HomeScore: 45
AwayScore: 38
Division: Junior
Season: Fall 2026

Game 3:
Date: 2026-09-20
Time: 9:00 AM
HomeTeam: Wave Warriors
AwayTeam: Marina Mavericks
Status: scheduled
Division: Junior
Season: Fall 2026
```

Repeat similar pattern for Intermediate and Senior divisions.

---

## 5. Admin Access & Management

### League Admin Dashboard

**URL**: `floridacoastalprep.com/league-admin/`

**Authentication**: Uses the same admin secret as the existing FCP Sports portal
- Environment variable: `RECAP_ACCESS_CODE`
- Access via: `?admin_secret=<RECAP_ACCESS_CODE>`

**Admin Functions**:
- Create/edit seasons
- Create/edit teams and assignments
- Add games and update scores
- View standings and statistics
- Export data for reports

### API Endpoints for Testing

All endpoints return JSON data from Airtable. Use the base URL:
```
https://fcpsports.netlify.app/.netlify/functions
```

#### Get All Seasons
```bash
curl https://fcpsports.netlify.app/.netlify/functions/get-seasons
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "rec...",
      "name": "Fall 2026",
      "startDate": "2026-09-01",
      "endDate": "2026-11-30",
      "divisions": "Mini,Junior,Intermediate,Senior",
      "status": "registration"
    }
  ]
}
```

#### Get Teams for a Season & Division
```bash
curl "https://fcpsports.netlify.app/.netlify/functions/get-teams?season=Fall%202026&division=Mini"
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "rec...",
      "name": "Emerald Coast Eagles",
      "division": "Mini",
      "coach": "Sarah Mitchell",
      "wins": 2,
      "losses": 1,
      "pointsFor": 95,
      "pointsAgainst": 88,
      "winPercentage": 0.667,
      "streak": "W1"
    }
  ]
}
```

#### Get Games for a Division
```bash
curl "https://fcpsports.netlify.app/.netlify/functions/get-games?season=Fall%202026&division=Mini"
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "rec...",
      "date": "2026-09-05",
      "time": "9:00 AM",
      "homeTeam": "Emerald Coast Eagles",
      "awayTeam": "Panhandle Panthers",
      "homeScore": null,
      "awayScore": null,
      "status": "scheduled",
      "division": "Mini",
      "location": "FCP Sports - Fort Walton Beach"
    },
    {
      "id": "rec...",
      "date": "2026-09-12",
      "time": "10:30 AM",
      "homeTeam": "Gulf Coast Gators",
      "awayTeam": "Beach Breeze Bears",
      "homeScore": 32,
      "awayScore": 28,
      "status": "final",
      "division": "Mini",
      "location": "FCP Sports - Fort Walton Beach",
      "winner": "Gulf Coast Gators"
    }
  ]
}
```

#### Update Game Score (Requires Admin)
```bash
curl -X POST https://fcpsports.netlify.app/.netlify/functions/update-game \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "rec...",
    "homeScore": 32,
    "awayScore": 28,
    "status": "final",
    "adminSecret": "'$RECAP_ACCESS_CODE'"
  }'
```

---

## 6. Public Pages

### Standings Page
**URL**: `fcpsports.org/leagues/standings/`

Features:
- Select season (dropdown)
- Select division (dropdown)
- Display standings table with:
  - Team name
  - Wins-Losses record
  - Win percentage
  - Points For / Points Against
  - Current streak
- Data fetched live from `get-teams` API
- Updates in real-time as scores are submitted

### Schedule Page
**URL**: `fcpsports.org/leagues/schedule/`

Features:
- Select season (dropdown)
- Select division (dropdown)
- List all games chronologically
- Display each game as a card showing:
  - Date and time
  - Home vs Away teams
  - Score (if final) or "Scheduled" status
  - Location
- Color-coded status: green (final), blue (scheduled), gray (cancelled)
- Data fetched live from `get-games` API
- Upcoming games appear at the top

---

## 7. Maintenance & Updates

### Weekly Checklist

- [ ] Review all scheduled games for accuracy
- [ ] Update final game scores within 24 hours of completion
- [ ] Verify team standings are calculating correctly
- [ ] Check for any scheduling conflicts
- [ ] Confirm coach contact information is current

### Season Transitions

At the end of a season:
1. Set season status to "complete" in Seasons table
2. Archive all team and game records (create backup view)
3. Create new season record for next season
4. Reset team records (W=0, L=0, PF=0, PA=0)
5. Create new team roster for new season

### Troubleshooting

**Games not appearing on public page?**
- Verify games are in the correct Season
- Check that Division is set correctly
- Ensure game Date is in the future (or current date)

**Scores not updating?**
- Confirm AIRTABLE_PAT has `data.records:write` scope
- Verify admin secret is correct when using update endpoint
- Check Netlify function logs for errors

**Teams not showing standings?**
- Verify teams have valid SeasonId link
- Check that Division matches a valid option
- Ensure Season name matches exactly (case-sensitive)

---

## 8. Security Considerations

- Keep `AIRTABLE_PAT` and `RECAP_ACCESS_CODE` secure
- Never commit tokens to version control
- Use Netlify's encrypted environment variables
- Restrict admin dashboard access to authorized personnel
- Review Airtable API logs monthly
- Rotate tokens annually or after staff changes

---

## Glossary

- **Base**: Airtable project (database equivalent)
- **Table**: Collection of records (table equivalent)
- **Record**: Single row with fields
- **Field**: Single column/attribute
- **Link**: Relationship between records in different tables
- **Formula**: Computed field based on other fields
- **API**: Programmatic interface to access data
- **Environment Variable**: Secure configuration value stored in Netlify

---

**Last Updated**: April 5, 2026
**Next Review**: July 5, 2026
