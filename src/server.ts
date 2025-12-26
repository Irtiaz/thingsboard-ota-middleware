import mqtt from "mqtt";
import express from "express";
import type { Request } from "express";
import type { MqttClient } from "mqtt";
import dotenv from "dotenv";
import grpc from "@grpc/grpc-js";
import device_grpc from "@chirpstack/chirpstack-api/api/device_grpc_pb.js";
import device_pb from "@chirpstack/chirpstack-api/api/device_pb.js";

dotenv.config();

const app = express();
app.use(express.json());

interface DeviceIdentifier {
	accessToken: string,
	devEUI: string,
}

interface Device {
	deviceIdentifier: DeviceIdentifier,
	client: MqttClient
};

const devices: Device[] = [];

const chirpstackServer = "16.16.185.152:55555";

// The API token (can be obtained through the ChirpStack web-interface).
const apiToken = process.env.CHIRPSTACK_API_KEY;

const deviceService = new device_grpc.DeviceServiceClient(
	chirpstackServer,
	grpc.credentials.createInsecure(),
);

const metadata = new grpc.Metadata();
metadata.set("authorization", "Bearer " + apiToken);

function chirpstackEnqueue(devEUI: string, message: string, callback: (err: any, resp: any) => void) {

	const messageBytes: Uint8Array = new TextEncoder().encode(message);

	// Enqueue downlink.
	const item = new device_pb.DeviceQueueItem();
	item.setDevEui(devEUI);
	item.setFPort(15);
	item.setConfirmed(false);
	item.setData(messageBytes);

	const enqueueReq = new device_pb.EnqueueDeviceQueueItemRequest();
	enqueueReq.setQueueItem(item);

	deviceService.enqueue(enqueueReq, metadata, callback);
}


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
	if (deviceIdentifier && deviceIdentifier.accessToken && deviceIdentifier.devEUI) {
		const device = createDevice(deviceIdentifier);
		devices.push(device);
		res.sendStatus(201);
	}
	else {
		res.status(404).send("deviceIdentifier: { accessToken, devEUI } must be set");
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

function createDevice(deviceIdentifier: DeviceIdentifier): Device {
	const client = mqtt.connect({
		host: "16.16.185.152",
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
	const { accessToken, devEUI } = deviceIdentifier;

	client.on("connect", () => {
		console.log(`${accessToken} connected to Thingsboard MQTT broker`);

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

		// const chirpstackMessage = buildChirpstackMessage(message.toString(), devEUI);

		chirpstackEnqueue(devEUI, message.toString(), (err, resp) => {
			if (err !== null) {
				console.log(err);
				return;
			}

			console.log("Downlink has been enqueued with id: " + resp.getId());
		});


	});

	client.on("error", (err) => console.error(`${accessToken} Connection error:${err}`));
	client.on("close", () => console.log(`${accessToken} connection closed`));
	client.on("reconnect", () => console.log(`${accessToken} reconnecting...`));
}
