import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

// No app sign-in in this project: the agent is reachable from the local web chat and the
// eve TUI only. A deployment must add an authenticator here before it accepts browser requests.
export default eveChannel({
  auth: [
    // The eve TUI and the project's own Vercel deployments.
    vercelOidc(),
    // Requests from this machine during local development; ignored in production.
    localDev(),
  ],
});
