import type { MqttClient } from "mqtt";

export interface DeviceIdentifier {
	accessToken: string;
	devEUI: string;
}

export interface Device {
	deviceIdentifier: DeviceIdentifier;
	thingsboardClient: MqttClient;
}

export interface UplinkFrame {
	topic: string;
	data: string;
}