import { open, Protocol, RecvException } from "node-simconnect";

const CLIENT_NAME = "Flight Events Companion";

/**
 * How long to wait for a SimConnect exception referencing our request
 * before assuming it succeeded. SimConnect_FlightPlanLoad has no positive
 * acknowledgement - only a possible exception event on failure - so silence
 * within this window is the closest thing to a success signal available.
 */
const EXCEPTION_WAIT_MS = 3000;

/**
 * Opens a SimConnect connection, sends SimConnect_FlightPlanLoad for the
 * given file, and closes the connection again. Protocol.SunRise is
 * node-simconnect's label for "MSFS / Asobo, 2024" specifically.
 *
 * UNVERIFIED IN-SIM: this whole module has only been checked for "does it
 * throw a clear error when MSFS isn't running" - the actual
 * SimConnect_FlightPlanLoad call, and whether it silently replaces an
 * in-progress flight or prompts the pilot, is the open question from
 * docs/SDK-FINDINGS.md #2 that this is meant to finally answer.
 */
export async function loadFlightPlanIntoSim(plnFilePath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>>["handle"];
  try {
    ({ handle } = await open(CLIENT_NAME, Protocol.SunRise));
  } catch (err) {
    // node-simconnect throws an AggregateError with an empty top-level
    // .message when it can't reach SimConnect at all (e.g. MSFS isn't
    // running) - the useful detail is buried in .errors[]. Surface
    // something a user can actually act on instead.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ECONNREFUSED") {
      throw new Error("Could not connect to MSFS via SimConnect - make sure the sim is running.");
    }
    throw new Error(`Could not connect to MSFS via SimConnect (${code ?? (err as Error).message ?? "unknown error"}).`);
  }

  try {
    const sendId = handle.flightPlanLoad(plnFilePath);
    console.log(`[simconnect] flightPlanLoad("${plnFilePath}") sendId=${sendId}, waiting ${EXCEPTION_WAIT_MS}ms for a rejection...`);

    await new Promise<void>((resolve, reject) => {
      const onException = (recvException: RecvException): void => {
        if (recvException.sendId === sendId) {
          clearTimeout(timeout);
          handle.removeListener("exception", onException);
          console.log(`[simconnect] rejected: ${recvException.exceptionName} (code ${recvException.exception})`);
          reject(new Error(`SimConnect rejected the flight plan (${recvException.exceptionName}).`));
        }
      };

      const timeout = setTimeout(() => {
        handle.removeListener("exception", onException);
        console.log("[simconnect] no rejection received - assuming success");
        resolve();
      }, EXCEPTION_WAIT_MS);

      handle.on("exception", onException);
    });
  } finally {
    handle.close();
  }
}
