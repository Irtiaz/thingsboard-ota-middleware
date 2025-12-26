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
const thingsboardSharedAttributeTopic = "v1/devices/me/attributes";


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
	const thingsboardClient = mqtt.connect({
		host: "16.16.185.152",
		port: 55583,
		username: deviceIdentifier.accessToken,
		protocol: "mqtt"
	});

	handleClientEvents(thingsboardClient, deviceIdentifier);

	return { deviceIdentifier, client: thingsboardClient };
}

function closeDevice(device: Device) {
	device.client.end();
}

function handleClientEvents(thingsboardClient: MqttClient, deviceIdentifier: DeviceIdentifier) {
	const { accessToken, devEUI } = deviceIdentifier;

	thingsboardClient.on("connect", () => {
		console.log(`${accessToken} connected to Thingsboard MQTT broker`);

		const chirpstackUplinkTopic = `application/+/device/${devEUI}/event/up`;

		thingsboardClient.subscribe(thingsboardSharedAttributeTopic, (err) => {
			if (err) {
				console.error(`${accessToken} faced error trying to subscribe to ${thingsboardSharedAttributeTopic}`);
				console.error(`${accessToken} subscribe to thingsboard shared attribute error: `, err);
			} else {
				console.log(`${accessToken} subscribed to ${thingsboardSharedAttributeTopic}`);
			}
		});

		chirpstackClient.subscribe(chirpstackUplinkTopic, (err) => {
			if (err) {
				console.error(`${accessToken} faced error trying to subscribe to ${chirpstackUplinkTopic}`);
				console.error(`${accessToken} subscribe to chirpstack uplink error: `, err);
			}
			else {
				console.log(`${accessToken} subscribed to ${chirpstackUplinkTopic}`);
			}
		});

	});

	thingsboardClient.on("message", (topic, message) => {
		console.log(`${accessToken} received topic ${topic}`);

		if (topic == thingsboardSharedAttributeTopic) {
			console.log(`${accessToken} received message ${message}`)
			chirpstackEnqueue(devEUI, message.toString(), (err, resp) => {
				if (err !== null) {
					console.log(err);
					return;
				}

				console.log("Downlink has been enqueued with id: " + resp.getId());
			});
		}

		else if (topic.startsWith("application") && topic.endsWith("up")) {
			console.log(`${accessToken} uplink`);
			const response = JSON.parse(message.toString());
			const base64 = (response as any).data;
			const decodedString = Buffer.from(base64, 'base64').toString('utf-8');

			console.log(decodedString);
		}

		else {
			console.error(`${accessToken} encountered unknown topic: ${topic}`);
		}

	});

	thingsboardClient.on("error", (err) => console.error(`${accessToken} Connection error:${err}`));
	thingsboardClient.on("close", () => console.log(`${accessToken} connection closed`));
	thingsboardClient.on("reconnect", () => console.log(`${accessToken} reconnecting...`));
}

const chirpstackClient = mqtt.connect({
	host: "16.16.185.152",
	port: 1883,
	protocol: "mqtt"
});

chirpstackClient.on("connect", () => {
	console.log("Connected to chirpstack client");
});

chirpstackClient.on("message", (topic, message) => {
	if (topic.startsWith("application") && topic.endsWith("up")) {
		const response = JSON.parse(message.toString());

		const deviceInfo = (response as any).deviceInfo;
		const devEUI = (deviceInfo as any).devEui;
		const accessToken = getAccessTokenFromDevEUI(devEUI);
		if (!accessToken) return;
		
		const base64 = (response as any).data;
		const decodedString = Buffer.from(base64, 'base64').toString('utf-8');
		console.log(`${accessToken} uplink`);
		console.log(decodedString);
	}

	else {
		console.error(`Encountered unknown topic: ${topic}`);
	}
});

chirpstackClient.on("error", (err) => console.error(`Chirpstack Client Connection error:${err}`));
chirpstackClient.on("close", () => console.log(`Chirpstack Client connection closed`));
chirpstackClient.on("reconnect", () => console.log(`Chirpstack Client reconnecting...`));


function getAccessTokenFromDevEUI(devEUI: string) {
	for (const device of devices) {
		const { deviceIdentifier } = device;
		if (deviceIdentifier.devEUI == devEUI) return deviceIdentifier.accessToken;
	}

	return null;
}


/////// Sample connection request with curl ////////
// curl -X POST localhost:3000/add-device -H 'Content-Type: application/json' -d '{"deviceIdentifier": {"accessToken": "YqoDSaZF40KbvSQNmSZi", "devEUI": "386237673b0ffb2c"}}'
