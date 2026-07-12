import * as http from "http";
import { createRemoteEvent, deleteRemoteEvent, joinRemoteEvent, listRemoteEvents } from "./backend/client";
import { pickPlnFile } from "./flightplan/filePicker";
import { findActiveFlightPlanPath } from "./flightplan/paths";
import { parsePlnFile } from "./flightplan/pln";
import { writeSharedPlnFile } from "./flightplan/writePln";
import { forgetHostedEvent, getHostToken, isHostedByMe, rememberHostedEvent } from "./hostedEvents";
import { getSettings, normalizeBackendUrl, updateSettings } from "./settings";

const DEFAULT_PORT = 48219;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => {
      if (data.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== "OPTIONS") {
    console.log(`[companion] ${req.method} ${req.url}`);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && segments.length === 0) {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "settings") {
    sendJson(res, 200, getSettings());
    return;
  }

  if (req.method === "POST" && segments.length === 1 && segments[0] === "settings") {
    try {
      const body = await readJsonBody(req);
      const patch: { backendUrl?: string; pilotName?: string } = {};
      if (typeof body.backendUrl === "string") {
        patch.backendUrl = normalizeBackendUrl(body.backendUrl);
      }
      if (typeof body.pilotName === "string") {
        patch.pilotName = body.pilotName.trim();
      }
      sendJson(res, 200, updateSettings(patch));
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
    return;
  }

  if (req.method === "GET" && segments.length === 2 && segments[0] === "flightplan" && segments[1] === "current") {
    const plnPath = findActiveFlightPlanPath();
    if (!plnPath) {
      sendJson(res, 404, {
        error:
          "No active flight plan found. MSFS only writes this file once you've spawned into a flight - " +
          "loading the World Map / EFB isn't enough on its own.",
      });
      return;
    }
    try {
      sendJson(res, 200, parsePlnFile(plnPath));
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  if (
    req.method === "POST" &&
    segments.length === 2 &&
    segments[0] === "flightplan" &&
    segments[1] === "pick-file"
  ) {
    try {
      const filePath = await pickPlnFile();
      if (!filePath) {
        sendJson(res, 200, { cancelled: true });
        return;
      }
      sendJson(res, 200, parsePlnFile(filePath));
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  if (req.method === "POST" && segments.length === 2 && segments[0] === "flightplan" && segments[1] === "save") {
    // Not SimConnect_FlightPlanLoad: confirmed (Asobo/Working Title staff, see
    // docs/SDK-FINDINGS.md #2) that it only updates the legacy ATC flight
    // plan, not the EFB's own display, and MSFS 2024 currently has no
    // programmatic way to load a .PLN into the EFB - only manual button
    // interaction. The WASM-based Planned Route API and a route-string
    // clipboard shortcut were both investigated and ruled out (see
    // docs/SDK-FINDINGS.md #2) - so instead: save somewhere discoverable and
    // tell the pilot where to load it from via Import -> Load PLN File.
    try {
      const body = await readJsonBody(req);
      if (!body.flightPlan || typeof body.flightPlan !== "object") {
        sendJson(res, 400, { error: "flightPlan is required." });
        return;
      }
      const eventName = typeof body.eventName === "string" ? body.eventName : "Flight Event";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filePath = writeSharedPlnFile(body.flightPlan as any, eventName);
      console.log(`[companion] saved flight plan to ${filePath}`);
      sendJson(res, 200, { success: true, filePath });
    } catch (err) {
      console.log(`[companion] flight plan save failed: ${(err as Error).message}`);
      sendJson(res, 500, { error: `Could not save the flight plan: ${(err as Error).message}` });
    }
    return;
  }

  if (req.method === "POST" && segments.length === 1 && segments[0] === "events") {
    try {
      const body = await readJsonBody(req);
      const { pilotName } = getSettings();
      if (!pilotName) {
        sendJson(res, 400, { error: "Set your name in Settings before posting an event." });
        return;
      }
      const { status, body: responseBody } = await createRemoteEvent({
        name: body.name,
        description: body.description,
        password: body.password,
        hostName: pilotName,
        flightPlan: body.flightPlan,
        scheduledDate: body.scheduledDate,
        scheduledTime: body.scheduledTime,
        scheduledAtUtc: body.scheduledAtUtc,
      });
      if (status === 201 && responseBody.id && responseBody.hostToken) {
        rememberHostedEvent(responseBody.id, responseBody.hostToken);
      }
      sendJson(res, status, responseBody);
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return;
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "events") {
    try {
      const { status, body } = await listRemoteEvents();
      if (Array.isArray(body?.events)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body.events = body.events.map((event: any) => ({ ...event, isMine: isHostedByMe(event.id) }));
      }
      sendJson(res, status, body);
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return;
  }

  if (req.method === "DELETE" && segments.length === 2 && segments[0] === "events") {
    const id = segments[1];
    const hostToken = getHostToken(id);
    if (!hostToken) {
      sendJson(res, 403, { error: "This companion app didn't create that event, so it can't delete it." });
      return;
    }
    try {
      const { status, body } = await deleteRemoteEvent(id, hostToken);
      if (status === 204 || status === 200) {
        forgetHostedEvent(id);
      }
      sendJson(res, status, body);
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return;
  }

  if (req.method === "POST" && segments.length === 3 && segments[0] === "events" && segments[2] === "join") {
    try {
      const { pilotName } = getSettings();
      if (!pilotName) {
        sendJson(res, 400, { error: "Set your name in Settings before joining an event." });
        return;
      }
      const body = await readJsonBody(req);
      const { status, body: responseBody } = await joinRemoteEvent(segments[1], {
        playerName: pilotName,
        password: body.password,
      });
      sendJson(res, status, responseBody);
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function startServer(port: number = DEFAULT_PORT): http.Server {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err: Error) => {
      sendJson(res, 500, { error: err.message });
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Flight Events companion app listening on http://127.0.0.1:${port}`);
  });

  return server;
}
