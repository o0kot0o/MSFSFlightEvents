# Flight Events — Server Host Setup Guide

The Flight Events server is the one shared piece of infrastructure your whole group connects
through — it's what lets pilots discover and join each other's events. Only **one** person needs
to run this (you), not every pilot.

You need:

- A Windows PC that can stay on and connected to the internet while people are using it
- **Node.js** installed (a free, standard tool for running JavaScript outside a browser —
  download it from nodejs.org, choose the "LTS" version, and run the installer with default
  options)

## Step 1: Copy the server files

Copy the `server` folder (from what you were given) anywhere on your PC, e.g.
`C:\FlightEventsServer`.

## Step 2: Run it

1. Open a Command Prompt (search "cmd" in the Start menu).
2. Type `cd ` (with a trailing space), then drag the `server` folder into the window, then press
   Enter. This changes into that folder.
3. Type:
   ```
   node index.js
   ```
4. You should see:
   ```
   Flight Events backend listening on port 4000 (all interfaces)
   ```
   Leave this window open — closing it stops the server. Minimize it instead.

## Step 3: Make it reachable from outside your network

By default this only works for pilots on your own home network. For pilots elsewhere to connect,
you need to forward port `4000` to this PC on your router (search "port forwarding" plus your
router's brand/model if you're not sure how). Once that's done, pilots connect using your public
IP address (search "what is my IP" to find it) and port 4000, e.g.:

```
123.45.67.89:4000
```

Give that address to your pilots — they'll enter it in the add-on's Settings screen.

> **Important:** if your internet provider uses "CGNAT" (common on some home/mobile
> connections), port forwarding won't work at all, because your router doesn't actually have a
> public IP of its own. If forwarding doesn't seem to work no matter what you try, this is the
> most likely reason — in that case you'd need to host the server somewhere else instead (a
> cheap cloud/VPS provider), which is beyond the scope of this guide.

## Optional: cleaning up old/abandoned events

The server already auto-deletes events older than 24 hours on its own — you usually don't need
to do anything. If you ever want to delete a specific event yourself (not just old ones):

1. Close the server (Ctrl+C in its window) if it's running.
2. Set an admin password before starting it. In the same Command Prompt, instead of step 2
   above, type:
   ```
   set ADMIN_TOKEN=choose-a-password-here
   node index.js
   ```
   (Do this every time you start the server if you want this feature available.)
3. To delete a specific event, you'll need its ID (visible via `http://<your-address>:4000/events`
   in a browser) and a tool that can send a DELETE request with a custom header (e.g. `curl`, or
   ask someone technical for help) — this isn't something you can do from a regular web browser
   alone.

## Changing the port

If port 4000 is already used by something else on your PC, set a different one before starting:

```
set PORT=5000
node index.js
```

Remember to forward whatever port you choose instead, and tell pilots to use that port number.

## Troubleshooting

**Pilots get "this site can't provide a secure connection"**
They (or their browser) are trying `https://` — this server only speaks plain `http://`. Make
sure the address they use starts with `http://`, not `https://`.

**Nothing happens when you double-click into the server folder / "node" isn't recognized**
Node.js isn't installed, or you need to restart your Command Prompt (or PC) after installing it
so Windows picks up the change.
