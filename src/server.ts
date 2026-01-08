import express from "express";
import dotenv from "dotenv";
import { log, LogLevel } from "./logger.js";
import { router } from "./routes.js";
import "./device-handler.js"; // Initialize MQTT clients

dotenv.config();

const app = express();
app.use(express.json());

// Register routes
app.use(router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	log(LogLevel.INFO, "SERVER", `Server started listening on port ${PORT}`);
});

/////// Sample connection request with curl ////////
// curl -X POST localhost:3000/add-device -H 'Content-Type: application/json' -d '{"deviceIdentifier": {"accessToken": "YqoDSaZF40KbvSQNmSZi", "devEUI": "386237673b0ffb2c"}}'
