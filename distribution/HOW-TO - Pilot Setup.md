# Flight Events — Pilot Setup Guide

Flight Events lets a host create a flight event from their current flight plan, and other pilots
discover and join it in-sim, receiving the flight plan to load into their own copy of MSFS 2024.

You need two things installed:

1. The **Flight Events** add-on (an EFB app inside MSFS)
2. The **Flight Events Companion** app (a small helper program that runs alongside MSFS)

You'll also need a **server address** from whoever is hosting your group's events (ask them for
it — it looks like an IP address and a port number, e.g. `123.45.67.89:4000`).

## Step 1: Install the add-on

1. Find your MSFS 2024 Community folder. It's usually at:
   ```
   %APPDATA%\Microsoft Flight Simulator 2024\Packages\Community
   ```
   (Copy that line into the Windows File Explorer address bar and press Enter.)
2. Copy the `flight-events-efb-app` folder (inside the `addon` folder you were given) into that
   Community folder.
3. Start (or restart) MSFS 2024.

## Step 2: Install and run the Companion app

1. Copy the `companion` folder (from what you were given) anywhere convenient on your PC, e.g.
   your Desktop or Documents. Keep everything inside that folder together — don't move
   individual files out of it, or it won't find its icon/helper files.
2. Double-click **`Start Flight Events Companion.vbs`** inside that folder.
3. Look in the bottom-right of your screen (the system tray, near the clock) for its icon — that
   means it's running. You may need to click the small up-arrow ("Show hidden icons") to see it.
4. Do this every time before you fly. It closes itself automatically once you close MSFS, so you
   don't need to remember to stop it.

**Tray icon menu** (right-click it):

- **Show Log** — opens a log file if something isn't working and you need to check what happened
- **Exit** — stops the Companion app manually

## Step 3: Set up your name and server address in MSFS

1. In MSFS, open the EFB (tablet) and find the **Flight Events** app.
2. Tap the gear icon (top-right) to open Settings.
3. Enter:
   - **Server Address**: the address your host gave you (e.g. `123.45.67.89:4000`)
   - **Your Name**: whatever you want other pilots to see
4. Tap **Save**.

## Step 4: Create or Join a flight

### To host a flight

1. Load or fly your route in MSFS as normal (or have a `.pln` file ready).
2. In the Flight Events app, tap **Create Flight Event**.
3. Fill in a Title (required) and anything else you want (Description, Password, Date, Time).
4. Under "Flight Plan Source", tap either:
   - **Load Current Plan** — grabs whatever's active in MSFS right now
   - **Load .PLN File** — lets you browse and pick a saved `.pln` file
5. Tap **Post Event**. Other pilots can now find it.

### To join a flight

1. In the Flight Events app, tap **Join Flight Event**.
2. Find the event (search or scroll the list) and tap **Join**. Enter the password if it's
   locked.
3. Tap **Save File** — this saves the host's flight plan to your PC (in your
   `Documents\Flight Events` folder).
4. In MSFS's own Flight Planner, tap the Import icon, choose **Load PLN File**, then **Load from
   PC**, and pick the file you just saved.

## Troubleshooting

**"Could not reach the companion app"**
The Companion app isn't running. Double-click `Start Flight Events Companion.vbs` again and
check for the tray icon.

**"Could not read the active flight plan"**
You haven't actually started a flight yet in MSFS (loading the World Map isn't enough — you
need to have spawned in).

**The flight plan you loaded looks wrong / out of date**
MSFS only saves your route to disk when you spawn into the flight. If you changed the route
afterward without restarting, "Load Current Plan" may grab the old one. Restart the flight after
editing the route, or use "Load .PLN File" with a manually saved file instead.

**Can't connect to the server / events aren't showing up**
Double check the Server Address in Settings matches exactly what your host gave you, and ask
your host to confirm the server is running.
