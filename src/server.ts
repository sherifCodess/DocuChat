import app from "./app";
import { config } from "./lib/config";
import { logger } from "./lib/logger";

const PORT = config.PORT;

app.listen(PORT, () => {
  logger.info("server:started", {
    port: PORT,
    environment: config.NODE_ENV,
  });
});
