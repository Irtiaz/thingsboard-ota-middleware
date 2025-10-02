import mqtt from "mqtt";
import express from "express";
import type { Request } from "express";
import type { MqttClient } from "mqtt";

const app = express();
app.use(express.json());

interface DeviceIdentifier {
	accessToken: string,
	devEUI: string,
	appId: string
}

interface Device {
	deviceIdentifier: DeviceIdentifier,
	client: MqttClient
};

const devices: Device[] = [];

const chirpstackClient = mqtt.connect({
  host: "13.212.83.8",
  port: 1883,
  protocol: "mqtt"
});

chirpstackClient.on("connect", () => {
	console.log("Connected to chirpstack client\n");
});

app.listen(3000, () => {
	console.log("Server started listening");
});

app.get("/health", (_, res) => {
	res.send("Healthy");
});

app.get("/devices", (_, res) => {
	res.json(devices);
});

app.post("/add-device", (req: Request<DeviceIdentifier>, res) => {
	const { deviceIdentifier } = req.body;
	if (deviceIdentifier && deviceIdentifier.accessToken && deviceIdentifier.devEUI && deviceIdentifier.appId) {
		const device = createDevice(deviceIdentifier);
		devices.push(device);
		res.sendStatus(201);
	}
	else {
		res.status(404).send("deviceIdentifier: { accessToken, devEUI and appId } must be set");
	}
});

app.delete("/delete-device", (req: Request<{ accessToken: string }>, res) => {
	const { accessToken } = req.body;
	if (accessToken) {
		const index = devices.findIndex(device => device.deviceIdentifier.accessToken == accessToken);
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


function createDevice(deviceIdentifier: DeviceIdentifier): Device {
	const client = mqtt.connect({
		host: "13.212.83.8",
		port: 55583,
		username: deviceIdentifier.accessToken,
		protocol: "mqtt"
	});

	handleClientEvents(client, deviceIdentifier);

	return { deviceIdentifier, client };
}

function closeDevice(device: Device) {
	device.client.end();
}

function handleClientEvents(client: MqttClient, deviceIdentifier: DeviceIdentifier) {
	const { accessToken, devEUI, appId } = deviceIdentifier;

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

		// forwarding the message to chirpstack
		const chirpstackTopic = `application/${appId}/device/${devEUI}/command/down`;
		const chirpstackMessage = buildChirpstackMessage(message.toString(), devEUI);
		chirpstackClient.publish(chirpstackTopic, chirpstackMessage, { qos: 1, retain: false }, err => {
			if (err) {
				console.error('Error publishing message:', err);
			} else {
				console.log(`Message "${chirpstackMessage}" published to topic "${chirpstackTopic}"`);
			}
		});

	});

	client.on("error", (err) => console.error(`${accessToken} Connection error:${err}`));
	client.on("close", () => console.log(`${accessToken} connection closed`));
	client.on("reconnect", () => console.log(`${accessToken} reconnecting...`));
}

function buildChirpstackMessage(messageStr: string, devEUI: string): string {
	return JSON.stringify({
		dev_eui: devEUI,
		confirmed: false,
		fPort: 15,
		data: btoa(messageStr)
	});
}
