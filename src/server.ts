import mqtt from "mqtt";
import express from "express";
import type { Request } from "express";
import type { MqttClient } from "mqtt";

const app = express();
app.use(express.json());

interface Device {
	accessToken: string,
	client: MqttClient
};

const devices: Device[] = [];

app.listen(3000, () => {
	console.log("Server started listening");
});

app.get("/health", (_, res) => {
	res.send("Healthy");
});

app.get("/devices", (_, res) => {
	res.json(devices);
});

app.post("/add-device", (req: Request<{ accessToken: string }>, res) => {
	const { accessToken } = req.body;
	if (accessToken) {
		const device = createDevice(accessToken);
		devices.push(device);
		res.sendStatus(201);
	}
	else {
		res.status(404).send("accessToken field must be set");
	}
});

app.delete("/delete-device", (req: Request<{ accessToken: string }>, res) => {
	const { accessToken } = req.body;
	if (accessToken) {
		const index = devices.findIndex(device => device.accessToken == accessToken);
		if (index >= 0) {
			const device = devices[index];
			if (device == undefined) {
				throw `Unreachable`;
			}
			closeDevice(device);

			devices.splice(index, 1);
			res.sendStatus(204);
		}
		else {
			res.status(404).send(`No device with access token ${accessToken}`);
		}
	}
	else {
		res.status(404).send("accessToken field must be set");
	}
});

// Connection options


function createDevice(accessToken: string): Device {
	const client = mqtt.connect({
		host: "13.212.83.8",
		port: 55583,
		username: accessToken,
		protocol: "mqtt"
	});

	client.on("connect", () => {
		console.log(`${accessToken} connected to MQTT broker`);

		client.subscribe("v1/devices/me/attributes", (err) => {
			if (err) {
				console.error(`${accessToken} subscribe error:`, err);
			} else {
				console.log(`${accessToken} subscribed to v1/devices/me/attributes`);
			}
		});
	});

	client.on("message", (topic, message) => {
		console.log(`${accessToken} received ${topic}: ${message.toString()}`);
	});

	client.on("error", (err) => console.error(`${accessToken} Connection error:${err}`));
	client.on("close", () => console.log(`${accessToken} connection closed`));
	client.on("reconnect", () => console.log(`${accessToken} reconnecting...`));

	return { accessToken, client };
}

function closeDevice(device: Device) {
	device.client.end();
}
