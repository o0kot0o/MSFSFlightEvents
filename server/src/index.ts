import { startServer } from "./server";

const port = process.env.PORT ? Number(process.env.PORT) : undefined;
startServer(port);
