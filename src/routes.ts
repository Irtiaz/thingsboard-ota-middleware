import express from "express";
import { addDevice, deleteDevice, getDevices } from "./device-handler.js";
import { addDeviceSchema, deleteDeviceSchema } from "./schemas.js";
import { validateRequest } from "./middleware/validation.js";
import type { AddDeviceRequest, DeleteDeviceRequest } from "./schemas.js";

export const router = express.Router();

router.get("/health", (_, res) => {
	res.send("Healthy");
});

router.get("/devices", (_, res) => {
	const devices = getDevices();
	res.json(devices);
});

router.post("/add-device", validateRequest(addDeviceSchema), (req, res) => {
	const { deviceIdentifier } = req.body as AddDeviceRequest;
	addDevice(deviceIdentifier);
	res.sendStatus(201);
});

router.delete("/delete-device", validateRequest(deleteDeviceSchema), (req, res) => {
	const { accessToken } = req.body as DeleteDeviceRequest;
	const result = deleteDevice(accessToken);

	if (result.success) {
		res.sendStatus(204);
	} else {
		res.status(404).json({ error: result.error });
	}
});
