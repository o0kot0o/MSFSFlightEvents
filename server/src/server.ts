import * as http from "http";
import { createEvent, deleteEvent, deleteEventAsAdmin, joinEvent, listEvents, pruneStaleEvents, toSummary } from "./store";

const DEFAULT_PORT = 4000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

// Operator-only override for deleting events they don't own (abandoned
// posts a pilot never cleaned up). Unset by default - deletion then stays
// restricted to whichever companion app created each event, as before.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// Events older than this get pruned automatically (see startServer's timer
// below) regardless of whether an operator ever steps in. 0 or unset
// disables auto-pruning entirely.
const MAX_EVENT_AGE_MS = process.env.MAX_EVENT_AGE_HOURS
  ? Number(process.env.MAX_EVENT_AGE_HOURS) * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Host-Token, X-Admin-Token",
};

function sendJson(res: http.ServerResponse, status: number, body?: unknown): void {
  const headers: http.OutgoingHttpHeaders = { ...CORS_HEADERS };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  res.writeHead(status, headers);
  res.end(body !== undefined ? JSON.stringify(body) : undefined);
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
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && segments.length === 0) {
    sendJson(res, 200, { status: "ok", eventCount: listEvents().length });
    return;
  }

  if (req.method === "POST" && segments.length === 1 && segments[0] === "events") {
    const body = await readJsonBody(req);
    if (typeof body.name !== "string" || typeof body.hostName !== "string" || !body.flightPlan) {
      sendJson(res, 400, { error: "name, hostName, and flightPlan are required." });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = createEvent({
      name: body.name,
      description: typeof body.description === "string" ? body.description : undefined,
      hostName: body.hostName,
      password: typeof body.password === "string" && body.password.length > 0 ? body.password : undefined,
      maxPlayers: typeof body.maxPlayers === "number" ? body.maxPlayers : undefined,
      flightPlan: body.flightPlan as any,
      scheduledDate: typeof body.scheduledDate === "string" && body.scheduledDate.length > 0 ? body.scheduledDate : undefined,
      scheduledTime: typeof body.scheduledTime === "string" && body.scheduledTime.length > 0 ? body.scheduledTime : undefined,
    });
    sendJson(res, 201, { id: record.id, hostToken: record.hostToken, event: toSummary(record) });
    return;
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "events") {
    sendJson(res, 200, { events: listEvents() });
    return;
  }

  if (req.method === "POST" && segments.length === 3 && segments[0] === "events" && segments[2] === "join") {
    const id = segments[1];
    const body = await readJsonBody(req);
    if (typeof body.playerName !== "string" || body.playerName.length === 0) {
      sendJson(res, 400, { error: "playerName is required." });
      return;
    }
    const result = joinEvent(id, body.playerName, typeof body.password === "string" ? body.password : undefined);
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    sendJson(res, 200, { flightPlan: result.record.flightPlan, event: toSummary(result.record) });
    return;
  }

  if (req.method === "DELETE" && segments.length === 2 && segments[0] === "events") {
    const id = segments[1];
    const adminToken = req.headers["x-admin-token"];
    if (ADMIN_TOKEN && typeof adminToken === "string" && adminToken === ADMIN_TOKEN) {
      if (!deleteEventAsAdmin(id)) {
        sendJson(res, 404, { error: "Event not found." });
        return;
      }
      sendJson(res, 204);
      return;
    }
    const hostToken = req.headers["x-host-token"];
    if (typeof hostToken !== "string" || !deleteEvent(id, hostToken)) {
      sendJson(res, 403, { error: "Invalid host token or event not found." });
      return;
    }
    sendJson(res, 204);
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

  server.listen(port, () => {
    console.log(`Flight Events backend listening on port ${port} (all interfaces)`);
    console.log(
      ADMIN_TOKEN
        ? "Admin delete enabled - DELETE /events/:id with header X-Admin-Token will remove any event."
        : "Admin delete disabled - set the ADMIN_TOKEN environment variable to enable it (see server/README.md)."
    );
    if (MAX_EVENT_AGE_MS > 0) {
      console.log(`Auto-pruning events older than ${MAX_EVENT_AGE_MS / (60 * 60 * 1000)}h every 15 minutes.`);
      pruneStaleEvents(MAX_EVENT_AGE_MS);
      setInterval(() => pruneStaleEvents(MAX_EVENT_AGE_MS), PRUNE_INTERVAL_MS);
    }
  });

  return server;
}
