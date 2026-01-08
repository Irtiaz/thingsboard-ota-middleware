import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import grpc from "@grpc/grpc-js";
import device_grpc from "@chirpstack/chirpstack-api/api/device_grpc_pb.js";
import device_pb from "@chirpstack/chirpstack-api/api/device_pb.js";
import { log, LogLevel } from "./logger.js";
import { matchesMqttTopic } from "./utils.js";
import type { Device, DeviceIdentifier, UplinkFrame } from "./types/types.js";

const devices: Device[] = [];

const chirpstackServer = "16.16.185.152:55555";
const downlinkFport = 15;
const uplinkFport = 105;

const thingsboardSharedAttributeTopic = "v1/devices/me/attributes";
const thingsboardRPCTopic = "v1/devices/me/rpc/request/+";
const chirpstackUplinkTopic = "application/+/device/+/event/up";

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
	item.setFPort(downlinkFport);
	item.setConfirmed(false);
	item.setData(messageBytes);

	const enqueueReq = new device_pb.EnqueueDeviceQueueItemRequest();
	enqueueReq.setQueueItem(item);

	deviceService.enqueue(enqueueReq, metadata, callback);
}

function getDeviceFromDevEUI(devEUI: string) {
	return devices.find(device => device.deviceIdentifier.devEUI == devEUI);
}

function handleClientEvents(thingsboardClient: MqttClient, deviceIdentifier: DeviceIdentifier) {
	const { accessToken, devEUI } = deviceIdentifier;

	thingsboardClient.on("connect", () => {
		log(LogLevel.INFO, accessToken, "Connected to Thingsboard MQTT broker");

		thingsboardClient.subscribe(thingsboardSharedAttributeTopic, (err) => {
			if (err) {
				log(LogLevel.ERROR, accessToken, `Failed to subscribe to ${thingsboardSharedAttributeTopic}: ${err}`);
			} else {
				log(LogLevel.INFO, accessToken, `Subscribed to ${thingsboardSharedAttributeTopic}`);
			}
		});

		thingsboardClient.subscribe(thingsboardRPCTopic, (err) => {
			if (err) {
				log(LogLevel.ERROR, accessToken, `Failed to subscribe to ${thingsboardRPCTopic}: ${err}`);
			} else {
				log(LogLevel.INFO, accessToken, `Subscribed to ${thingsboardRPCTopic}`);
			}
		});

		const deviceUplinkTopic = `application/+/device/${devEUI}/event/up`;
		chirpstackClient.subscribe(deviceUplinkTopic, (err) => {
			if (err) {
				log(LogLevel.ERROR, accessToken, `Failed to subscribe to ${deviceUplinkTopic}: ${err}`);
			}
			else {
				log(LogLevel.INFO, accessToken, `Subscribed to ${deviceUplinkTopic}`);
			}
		});

	});

	thingsboardClient.on("message", (topic, message) => {
		log(LogLevel.DEBUG, accessToken, `Received topic: ${topic}`);

		if (matchesMqttTopic(topic, thingsboardSharedAttributeTopic) || matchesMqttTopic(topic, thingsboardRPCTopic)) {
			log(LogLevel.DEBUG, accessToken, `Received message: ${message}`);
			const jsonData = {
				topic: topic,
				data: JSON.parse(message.toString())
			};
			chirpstackEnqueue(devEUI, JSON.stringify(jsonData), (err, resp) => {
				if (err !== null) {
					log(LogLevel.ERROR, accessToken, `Enqueue error: ${err}`);
					return;
				}

				log(LogLevel.INFO, accessToken, `Downlink enqueued with id: ${resp.getId()}`);
			});
		}

		else {
			log(LogLevel.ERROR, accessToken, `Unknown topic: ${topic}`);
		}

	});

	thingsboardClient.on("error", (err) => log(LogLevel.ERROR, accessToken, `Connection error: ${err}`));
	thingsboardClient.on("close", () => log(LogLevel.INFO, accessToken, "Connection closed"));
	thingsboardClient.on("reconnect", () => log(LogLevel.INFO, accessToken, "Reconnecting..."));
}

// Initialize ChirpStack MQTT client
const chirpstackClient = mqtt.connect({
	host: "16.16.185.152",
	port: 1883,
	protocol: "mqtt"
});

chirpstackClient.on("connect", () => {
	log(LogLevel.INFO, "CHIRPSTACK", "Connected to ChirpStack MQTT broker");
});

chirpstackClient.on("message", (topic, message) => {
	if (matchesMqttTopic(topic, chirpstackUplinkTopic)) {
		const response = JSON.parse(message.toString());

		if (response.fPort != uplinkFport) {
			log(LogLevel.DEBUG, "CHIRPSTACK", `Skipping fPort ${response.fPort}`);
			return;
		}

		const deviceInfo = (response as any).deviceInfo;
		const devEUI = (deviceInfo as any).devEui;
		const device = getDeviceFromDevEUI(devEUI);
		if (!device) return;

		const accessToken = device.deviceIdentifier.accessToken;

		const base64 = (response as any).data;
		const decodedString = Buffer.from(base64, 'base64').toString('utf-8');
		log(LogLevel.INFO, accessToken, "Uplink received from ChirpStack");
		log(LogLevel.DEBUG, accessToken, `Decoded: ${decodedString}`);

		const json: UplinkFrame = JSON.parse(decodedString);
		log(LogLevel.DEBUG, accessToken, `Parsed: ${JSON.stringify(json)}`);
		const { topic, data } = json;

		device.thingsboardClient.publish(topic, data, (err) => {
			if (err) log(LogLevel.ERROR, accessToken, `Publish error: ${err}`);
			else {
				log(LogLevel.INFO, accessToken, `Successfully published to ${topic}`);
			}
		});
	}

	else {
		log(LogLevel.ERROR, "CHIRPSTACK", `Unknown topic: ${topic}`);
	}
});

chirpstackClient.on("error", (err) => log(LogLevel.ERROR, "CHIRPSTACK", `Connection error: ${err}`));
chirpstackClient.on("close", () => log(LogLevel.INFO, "CHIRPSTACK", "Connection closed"));
chirpstackClient.on("reconnect", () => log(LogLevel.INFO, "CHIRPSTACK", "Reconnecting..."));

// Exported functions for API routes

export function getDevices(): Device[] {
	return devices;
}

export function addDevice(deviceIdentifier: DeviceIdentifier): void {
	const thingsboardClient = mqtt.connect({
		host: "16.16.185.152",
		port: 55583,
		username: deviceIdentifier.accessToken,
		protocol: "mqtt"
	});

	handleClientEvents(thingsboardClient, deviceIdentifier);

	const device: Device = { deviceIdentifier, thingsboardClient };
	devices.push(device);
}

export function deleteDevice(accessToken: string): { success: boolean; error?: string } {
	const index = devices.findIndex(device => device.deviceIdentifier.accessToken == accessToken);
	if (index >= 0) {
		const device = devices[index];
		if (device == undefined) {
			throw `Unreachable`;
		}
		device.thingsboardClient.end();
		devices.splice(index, 1);
		return { success: true };
	}
	else {
		return { success: false, error: `No device with access token ${accessToken}` };
	}
}
